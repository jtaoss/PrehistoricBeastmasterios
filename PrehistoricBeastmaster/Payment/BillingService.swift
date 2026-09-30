import Foundation
import StoreKit

enum BillingError: LocalizedError, Sendable {
    case message(code: String, message: String)

    var code: String {
        switch self {
        case .message(let code, _):
            return code
        }
    }

    var errorDescription: String? {
        switch self {
        case .message(_, let message):
            return message
        }
    }
}

struct PreOrderRequest: Encodable, Sendable {
    let productId: String
    let clientRequestId: UUID
    let appAccountToken: UUID
    let nonce: String
}

struct PreOrderResponse: Decodable, Sendable {
    let orderId: String
    let productId: String
    let appAccountToken: UUID
}

struct OrderVerificationRequest: Encodable, Sendable {
    let orderId: String
    let productId: String
    let transactionId: UInt64
    let signedTransactionJWS: String
    let nonce: String
}

struct OrderVerificationResponse: Decodable, Sendable {
    let isConsumed: Bool
    let status: String
    let message: String
}

struct OrderStatus: Sendable {
    let orderId: String
    let cpOrder: String
    let productId: String
    let state: String
    let store: String
    let transactionId: String

    var isDelivered: Bool {
        state == "CONSUMED" && store == "app_store" && UInt64(transactionId).map { $0 > 0 } == true
    }

    init(orderId: String, cpOrder: String, productId: String, state: String, store: String, transactionId: String) {
        self.orderId = orderId
        self.cpOrder = cpOrder
        self.productId = productId
        self.state = state
        self.store = store
        self.transactionId = transactionId
    }
}

struct PlayOrder: Sendable {
    let orderId: String
    let productId: String
    let appAccountToken: UUID

    init(orderId: String, productId: String, appAccountToken: UUID) {
        self.orderId = orderId
        self.productId = productId
        self.appAccountToken = appAccountToken
    }
}

protocol BillingServiceProtocol: AnyObject, Sendable {
    func initiatePurchase(productId: String, accountToken: UUID) async throws -> (transaction: Transaction, signedTransaction: String)
    func verifyAndDeliver(orderId: String, transaction: Transaction, signedTransaction: String) async throws -> Bool
    func orderStatus(sdkOrderId: String) async throws -> OrderStatus
    func createMiniGameOrder(offerId: String, clientRequestId: String, identity: MiniGameAuthService.PaymentIdentity) async throws -> PayRequest
    func createPlayOrder(_ request: PayRequest) async throws -> PlayOrder
    func confirmPurchase(sdkOrderId: String, signedTransaction: String, productId: String, transactionId: String) async throws -> (consume: Bool, message: String)
    func prepareConnection() async
}

final class BillingService: BillingServiceProtocol {
    static let shared = BillingService()

    private let transport: NetworkTransportProtocol
    private let billingBaseURL: URL?
    private let paymentAuthorizationProvider: @Sendable () async throws -> String

    init(
        transport: NetworkTransportProtocol? = nil,
        billingBaseURL: URL? = nil,
        paymentAuthorizationProvider: (@Sendable () async throws -> String)? = nil
    ) {
        let endpoint = billingBaseURL ?? URL(string: ShellConfig.sdkApiEndpoint)
        let interceptor = SecurityRequestInterceptor(
            bundleId: ShellConfig.bundleId,
            appVersion: ShellConfig.versionName
        )
        self.transport = transport ?? SecureNetworkTransport(session: .shared, interceptors: [interceptor])
        self.billingBaseURL = endpoint
        self.paymentAuthorizationProvider = paymentAuthorizationProvider ?? {
            try await MiniGameAuthService().paymentIdentity().accessToken
        }
    }

    var isPurchaseConfirmationConfigured: Bool {
        Config.receiptValidationURL != nil
    }

    private let occupancyLock = NSLock()
    private var occupancyCount = 0

    /// True while a purchase, receipt confirmation, or delivery verification is in flight.
    var isOccupied: Bool {
        occupancyLock.lock()
        defer { occupancyLock.unlock() }
        return occupancyCount > 0
    }

    private func beginOccupancy() {
        occupancyLock.lock()
        occupancyCount += 1
        occupancyLock.unlock()
    }

    private func endOccupancy() {
        occupancyLock.lock()
        occupancyCount = max(0, occupancyCount - 1)
        occupancyLock.unlock()
    }

    func initiatePurchase(productId: String, accountToken: UUID) async throws -> (transaction: Transaction, signedTransaction: String) {
        beginOccupancy()
        defer { endOccupancy() }
        guard let product = try await Product.products(for: [productId]).first else {
            throw BillingError.message(code: "PRODUCT_NOT_FOUND", message: "App Store did not return this product")
        }

        var options: Set<Product.PurchaseOption> = []
        options.insert(.appAccountToken(accountToken))

        let purchaseResult = try await product.purchase(options: options)
        switch purchaseResult {
        case .success(let verification):
            let transaction = try verifyTransaction(verification)
            return (transaction, verification.jwsRepresentation)
        case .userCancelled:
            throw CancellationError()
        case .pending:
            throw BillingError.message(code: "PAYMENT_PENDING", message: "Payment requires authorization")
        @unknown default:
            throw BillingError.message(code: "STOREKIT_UNKNOWN", message: "Unrecognized purchase state")
        }
    }

    func verifyAndDeliver(orderId: String, transaction: Transaction, signedTransaction: String) async throws -> Bool {
        beginOccupancy()
        defer { endOccupancy() }
        let confirmation = try await confirmPurchase(
            sdkOrderId: orderId,
            signedTransaction: signedTransaction,
            productId: transaction.productID,
            transactionId: String(transaction.id)
        )
        return confirmation.consume
    }

    func orderStatus(sdkOrderId: String) async throws -> OrderStatus {
        let authorization = try await paymentAuthorization()
        let endpoint = try readOnlyURL(path: "/v1/orders/").appendingPathComponent(sdkOrderId)
        var request = URLRequest(url: endpoint, timeoutInterval: 6)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(authorization)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await SecureAPIURLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
            throw BillingError.message(code: "ORDER_STATUS_UNAVAILABLE", message: "Order status is temporarily unavailable")
        }
        return try Self.parseOrderStatus(JSONObject(json: String(decoding: data, as: UTF8.self)))
    }

    private static func parseOrderStatus(_ response: JSONObject) throws -> OrderStatus {
        guard response.string("code") == "OK", let data = response.jsonObject("data") else {
            throw BillingError.message(code: "INVALID_ORDER_STATUS", message: "Order status response is invalid")
        }
        let result = OrderStatus(
            orderId: data.string("order_id"),
            cpOrder: data.string("cp_order"),
            productId: data.string("product_id"),
            state: data.string("state"),
            store: data.string("store"),
            transactionId: data.string("transaction_id")
        )
        guard !result.orderId.isEmpty, !result.cpOrder.isEmpty, !result.productId.isEmpty, !result.state.isEmpty else {
            throw BillingError.message(code: "INVALID_ORDER_STATUS", message: "Order identity is incomplete")
        }
        return result
    }

    func createMiniGameOrder(
        offerId: String,
        clientRequestId: String,
        identity: MiniGameAuthService.PaymentIdentity
    ) async throws -> PayRequest {
        guard let offer = MiniGameProductCatalog.offer(offerId),
              UUID(uuidString: clientRequestId) != nil else {
            throw BillingError.message(code: "INVALID_MINI_GAME_OFFER", message: "Mini-game product is not approved")
        }
        guard isApprovedHTTPS(ShellConfig.miniGameOrderEndpoint) else {
            throw BillingError.message(code: "MINI_GAME_PAYMENT_NOT_CONFIGURED", message: "Mini-game payment service is not configured")
        }
        var payload = JSONObject()
        payload.put("offer_id", offer.id)
        payload.put("client_request_id", clientRequestId)
        payload.put("player_id", identity.playerId)
        payload.put("bundle_id", ShellConfig.bundleId)
        payload.put("version", ShellConfig.versionName)
        payload.put("build", ShellConfig.versionCode)
        let response = try await post(
            endpoint: ShellConfig.miniGameOrderEndpoint,
            contentType: "application/json; charset=utf-8",
            body: Data(payload.jsonString().utf8),
            authorization: identity.accessToken
        )
        guard response.string("code") == "OK",
              let data = response.jsonObject("data"),
              let payment = data.jsonObject("payment_request") else {
            throw BillingError.message(code: "MINI_GAME_ORDER_REJECTED", message: ShellText.firstNonBlank(response.string("message"), "Mini-game order was rejected"))
        }
        let request = try PayRequest(json: payment.jsonString())
        guard request.clientRequestId == clientRequestId,
              request.goodsId == offer.goodsId,
              request.resolvedProductId() == offer.productId,
              ProductCatalog.productId(forPrice: request.price) == offer.productId else {
            throw BillingError.message(code: "MINI_GAME_ORDER_MISMATCH", message: "Mini-game order identity does not match the selected product")
        }
        return request
    }

    func createPlayOrder(_ request: PayRequest) async throws -> PlayOrder {
        guard isPurchaseConfirmationConfigured else {
            throw BillingError.message(code: "PURCHASE_SERVER_CONTRACT_MISSING", message: "SDK payment endpoint is not configured")
        }
        guard !request.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw BillingError.message(code: "USERNAME_REQUIRED", message: "The web login session did not provide a username")
        }

        var data = JSONObject()
        data.put("uid", request.uid)
        data.put("username", request.username)
        data.put("price", request.price)
        data.put("cpOrder", request.cpOrder)
        data.put("channel", request.channel.isEmpty ? ShellConfig.webSdkChannel : request.channel)
        data.put("serverId", request.serverId)
        data.put("serverName", request.serverName)
        data.put("goodsID", request.goodsId)
        data.put("goodsName", request.goodsName)
        if !request.payTypeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            data.put("payType_id", request.payTypeId)
        }
        data.put("roleID", request.roleId)
        data.put("roleName", request.roleName)
        data.put("roleLevel", request.roleLevel)
        data.put("notifyURL", request.notifyUrl)
        data.put("extends", request.legacyExtension())
        data.put("payChannel", ShellConfig.payChannel)
        data.put("type", ShellConfig.payType)
        data.put("packageName", ShellConfig.bundleId)

        let response = try await postLegacy(
            service: "sdk.pay.fororder",
            data: data,
            authorization: try await paymentAuthorization()
        )
        return try Self.parsePlayOrder(response)
    }

    private static func parsePlayOrder(_ response: JSONObject) throws -> PlayOrder {
        let responseData = try Self.requireSuccessObject(response)
        let orderId = responseData.string("order_id").trimmingCharacters(in: .whitespacesAndNewlines)
        let productId = ShellText.firstNonBlank(
            responseData.string("applesku"),
            responseData.string("iossku"),
            responseData.string("product_id"),
            responseData.string("googlesku")
        )
        if orderId.isEmpty {
            throw BillingError.message(code: "INVALID_ORDER_RESPONSE", message: "SDK order response is missing order_id")
        }
        if productId.isEmpty {
            throw BillingError.message(code: "PRODUCT_MAPPING_MISSING", message: "SDK backend has no App Store product configured for this price tier")
        }
        let token = try requireAppAccountToken(responseData)
        return PlayOrder(orderId: orderId, productId: productId, appAccountToken: token)
    }

    private static func requireAppAccountToken(_ data: JSONObject) throws -> UUID {
        let keys = ["appAccountToken", "app_account_token"].filter { data.has($0) }
        var parsed: UUID?
        for key in keys {
            let raw = data.string(key).trimmingCharacters(in: .whitespacesAndNewlines)
            guard raw.count == 36, let token = UUID(uuidString: raw),
                  token.uuidString != "00000000-0000-0000-0000-000000000000",
                  parsed == nil || parsed == token else {
                throw BillingError.message(code: "INVALID_APP_ACCOUNT_TOKEN", message: "SDK backend returned an invalid account binding token")
            }
            parsed = token
        }
        guard let token = parsed else {
            throw BillingError.message(code: "APP_ACCOUNT_TOKEN_MISSING", message: "SDK backend did not return an account binding token")
        }
        return token
    }

    func confirmPurchase(
        sdkOrderId: String,
        signedTransaction: String,
        productId: String,
        transactionId: String
    ) async throws -> (consume: Bool, message: String) {
        beginOccupancy()
        defer { endOccupancy() }
        guard let endpoint = Config.receiptValidationURL else {
            throw BillingError.message(code: "PURCHASE_SERVER_CONTRACT_MISSING", message: "SDK payment endpoint is not configured")
        }
        var payload = JSONObject()
        payload.put("store", "app_store")
        payload.put("bundleId", ShellConfig.bundleId)
        payload.put("productId", productId)
        payload.put("transactionId", transactionId)
        payload.put("signedTransaction", signedTransaction)

        var data = JSONObject()
        data.put("order_id", sdkOrderId)
        data.put("data", payload.jsonString())
        data.put("sign", signedTransaction)
        let response = try await postLegacy(
            service: "sdk.pay.notification",
            data: data,
            endpoint: endpoint.absoluteString,
            authorization: try await paymentAuthorization()
        )
        return try Self.parseConfirmation(response)
    }

    private static func parseConfirmation(_ response: JSONObject) throws -> (consume: Bool, message: String) {
        try Self.requireSuccess(response)
        let responseData = response.jsonObject("data")
        let consume = responseData?.bool("consume", false) ?? false
        let message = ShellText.firstNonBlank(
            responseData?.string("message"),
            response.string("message"),
            "ok"
        )
        return (consume, message)
    }

    func prepareConnection() async {
        guard let url = try? readOnlyURL(path: "/healthz") else { return }
        var request = URLRequest(url: url, timeoutInterval: 3)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        _ = try? await URLSession.shared.data(for: request)
    }

    private func readOnlyURL(path: String) throws -> URL {
        guard isApprovedHTTPS(ShellConfig.sdkApiEndpoint),
              var components = URLComponents(string: ShellConfig.sdkApiEndpoint) else {
            throw BillingError.message(code: "INVALID_REQUEST", message: "SDK endpoint is invalid")
        }
        components.path = path
        components.query = nil
        components.fragment = nil
        guard let url = components.url else { throw URLError(.badURL) }
        return url
    }

    private func postLegacy(
        service: String,
        data: JSONObject,
        endpoint: String? = nil,
        authorization: String
    ) async throws -> JSONObject {
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "appid", value: ShellConfig.backendAppId),
            URLQueryItem(name: "service", value: service),
            URLQueryItem(name: "data", value: data.jsonString()),
            URLQueryItem(name: "sign", value: "")
        ]
        let body = form.percentEncodedQuery?.data(using: .utf8) ?? Data()
        return try await post(
            endpoint: endpoint ?? ShellConfig.sdkApiEndpoint,
            contentType: "application/x-www-form-urlencoded; charset=utf-8",
            body: body,
            authorization: authorization
        )
    }

    private func post(endpoint: String, contentType: String, body: Data, authorization: String? = nil) async throws -> JSONObject {
        guard let url = URL(string: endpoint) else {
            throw BillingError.message(code: "INVALID_REQUEST", message: "SDK payment endpoint is invalid")
        }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("zh-Hant", forHTTPHeaderField: "language")
        if let authorization, !authorization.isEmpty {
            request.setValue("Bearer \(authorization)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await SecureAPIURLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status < 200 || status >= 300 {
            throw BillingError.message(code: "HTTP_\(status)", message: "SDK backend returned HTTP \(status)")
        }
        guard let json = try? JSONObject(json: String(data: data, encoding: .utf8) ?? "") else {
            throw BillingError.message(code: "INVALID_SERVER_RESPONSE", message: "SDK backend returned invalid JSON")
        }
        return json
    }

    private func paymentAuthorization() async throws -> String {
        do {
            return try await paymentAuthorizationProvider()
        } catch let error as MiniGameAuthService.AuthError {
            throw BillingError.message(
                code: error.code,
                message: error.errorDescription ?? "The player session is not available for payment"
            )
        }
    }

    private static func requireSuccessObject(_ response: JSONObject) throws -> JSONObject {
        try requireSuccess(response)
        guard let data = response.jsonObject("data") else {
            throw BillingError.message(code: "INVALID_SERVER_RESPONSE", message: "SDK backend response is missing data")
        }
        return data
    }

    private static func requireSuccess(_ response: JSONObject) throws {
        let stateCode = response.has("stateCode") ? response.int("stateCode", Int.min) : Int.min
        let state = response.jsonObject("state")
        let legacyMessage = response.jsonObject("message")
        let alreadyCompleted = legacyMessage?.string("status").caseInsensitiveCompare("success") == .orderedSame
        let success = stateCode == 1 || alreadyCompleted || (state?.int("code") == 1)
        if !success {
            let message = ShellText.firstNonBlank(response.string("message"), state?.string("msg"), "SDK backend rejected the request")
            throw BillingError.message(code: "SERVER_REJECTED", message: message)
        }
    }

    private func verifyTransaction<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw BillingError.message(code: "JWS_UNVERIFIED", message: error.localizedDescription)
        case .verified(let safe):
            return safe
        }
    }

    private func isApprovedHTTPS(_ endpoint: String) -> Bool {
        let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let host = url.host, !host.isEmpty else { return false }
        return url.scheme?.caseInsensitiveCompare("https") == .orderedSame
    }
}
