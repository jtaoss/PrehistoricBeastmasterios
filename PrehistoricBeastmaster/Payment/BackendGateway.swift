import Foundation

final class BackendGateway {
    struct PlayOrder {
        let orderId: String
        let productId: String
        let appAccountToken: UUID
    }

    struct OrderStatus {
        let orderId: String
        let cpOrder: String
        let productId: String
        let state: String
        let store: String
        let transactionId: String

        var isDelivered: Bool { state == "CONSUMED" && store == "app_store" && UInt64(transactionId).map { $0 > 0 } == true }
    }

    // This deployed read-only endpoint is the delivery authority when Apple's
    // unfinished queue is empty but a local checkout record survived a restart.
    func orderStatus(sdkOrderId: String) async throws -> OrderStatus {
        let endpoint = try readOnlyURL(path: "/v1/orders/").appendingPathComponent(sdkOrderId)
        var request = URLRequest(url: endpoint, timeoutInterval: 6)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !ShellConfig.paymentApiToken.isEmpty {
            request.setValue("Bearer \(ShellConfig.paymentApiToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await SecureAPIURLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
            throw GatewayError.message(code: "ORDER_STATUS_UNAVAILABLE", message: "Order status is temporarily unavailable")
        }
        return try Self.parseOrderStatus(JSONObject(json: String(decoding: data, as: UTF8.self)))
    }

    static func parseOrderStatus(_ response: JSONObject) throws -> OrderStatus {
        guard response.string("code") == "OK", let data = response.jsonObject("data") else {
            throw GatewayError.message(code: "INVALID_ORDER_STATUS", message: "Order status response is invalid")
        }
        let result = OrderStatus(orderId: data.string("order_id"), cpOrder: data.string("cp_order"),
                                 productId: data.string("product_id"), state: data.string("state"),
                                 store: data.string("store"), transactionId: data.string("transaction_id"))
        guard !result.orderId.isEmpty, !result.cpOrder.isEmpty, !result.productId.isEmpty, !result.state.isEmpty else {
            throw GatewayError.message(code: "INVALID_ORDER_STATUS", message: "Order identity is incomplete")
        }
        return result
    }

    /// Best-effort DNS/TLS connection preparation. Never creates an order,
    /// authenticates with Apple, or blocks a checkout on health-check success.
    func prepareConnection() async {
        guard let url = try? readOnlyURL(path: "/healthz") else { return }
        var request = URLRequest(url: url, timeoutInterval: 3)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        _ = try? await SecureAPIURLSession.shared.data(for: request)
    }

    private func readOnlyURL(path: String) throws -> URL {
        guard Self.isApprovedHTTPS(ShellConfig.sdkApiEndpoint),
              var components = URLComponents(string: ShellConfig.sdkApiEndpoint) else {
            throw GatewayError.message(code: "INVALID_REQUEST", message: "SDK endpoint is invalid")
        }
        components.path = path
        components.query = nil
        components.fragment = nil
        guard let url = components.url else { throw URLError(.badURL) }
        return url
    }

    enum GatewayError: LocalizedError {
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

    var isPurchaseConfirmationConfigured: Bool {
        Self.isApprovedHTTPS(ShellConfig.sdkApiEndpoint)
    }

    /// Creates the game-side order for one of the bundled mini-game packs.
    /// The server returns the same canonical PayRequest consumed by the proven
    /// StoreKit flow; the client never invents cpOrder, notifyURL or account data.
    func createMiniGameOrder(offerId: String, clientRequestId: String,
                             identity: MiniGameAuthService.PaymentIdentity) async throws -> PayRequest {
        guard let offer = MiniGameProductCatalog.offer(offerId),
              UUID(uuidString: clientRequestId) != nil else {
            throw GatewayError.message(code: "INVALID_MINI_GAME_OFFER", message: "Mini-game product is not approved")
        }
        guard Self.isApprovedHTTPS(ShellConfig.miniGameOrderEndpoint) else {
            throw GatewayError.message(code: "MINI_GAME_PAYMENT_NOT_CONFIGURED", message: "Mini-game payment service is not configured")
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
            throw GatewayError.message(code: "MINI_GAME_ORDER_REJECTED", message: ShellText.firstNonBlank(response.string("message"), "Mini-game order was rejected"))
        }
        let request = try PayRequest(json: payment.jsonString())
        guard request.clientRequestId == clientRequestId,
              request.goodsId == offer.goodsId,
              request.resolvedProductId() == offer.productId,
              ProductCatalog.productId(forPrice: request.price) == offer.productId else {
            throw GatewayError.message(code: "MINI_GAME_ORDER_MISMATCH", message: "Mini-game order identity does not match the selected product")
        }
        return request
    }

    func createPlayOrder(_ request: PayRequest) async throws -> PlayOrder {
        guard isPurchaseConfirmationConfigured else {
            throw GatewayError.message(
                code: "PURCHASE_SERVER_CONTRACT_MISSING",
                message: "SDK payment endpoint is not configured"
            )
        }
        guard !request.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw GatewayError.message(
                code: "USERNAME_REQUIRED",
                message: "The web login session did not provide a username"
            )
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

        let response = try await postLegacy(service: "sdk.pay.fororder", data: data)
        return try Self.parsePlayOrder(response)
    }

    static func parsePlayOrder(_ response: JSONObject) throws -> PlayOrder {
        let responseData = try Self.requireSuccessObject(response)
        let orderId = responseData.string("order_id").trimmingCharacters(in: .whitespacesAndNewlines)
        let productId = ShellText.firstNonBlank(
            responseData.string("applesku"),
            responseData.string("iossku"),
            responseData.string("product_id"),
            responseData.string("googlesku")
        )
        if orderId.isEmpty {
            throw GatewayError.message(code: "INVALID_ORDER_RESPONSE", message: "SDK order response is missing order_id")
        }
        if productId.isEmpty {
            throw GatewayError.message(
                code: "PRODUCT_MAPPING_MISSING",
                message: "SDK backend has no App Store product configured for this price tier"
            )
        }
        // The backend owns the account-token protocol. Do not derive a replacement
        // from uid/username or continue checkout with an absent/invalid token.
        let token = try requireAppAccountToken(responseData)
        return PlayOrder(orderId: orderId, productId: productId, appAccountToken: token)
    }

    static func requireAppAccountToken(_ data: JSONObject) throws -> UUID {
        let keys = ["appAccountToken", "app_account_token"].filter { data.has($0) }
        var parsed: UUID?
        for key in keys {
            let raw = data.string(key).trimmingCharacters(in: .whitespacesAndNewlines)
            guard raw.count == 36, let token = UUID(uuidString: raw),
                  token.uuidString != "00000000-0000-0000-0000-000000000000",
                  parsed == nil || parsed == token else {
                throw GatewayError.message(code: "INVALID_APP_ACCOUNT_TOKEN", message: "SDK backend returned an invalid account binding token")
            }
            parsed = token
        }
        guard let token = parsed else {
            throw GatewayError.message(code: "APP_ACCOUNT_TOKEN_MISSING", message: "SDK backend did not return an account binding token")
        }
        return token
    }

    func confirmPurchase(sdkOrderId: String, signedTransaction: String, productId: String, transactionId: String) async throws -> (consume: Bool, message: String) {
        guard isPurchaseConfirmationConfigured else {
            throw GatewayError.message(
                code: "PURCHASE_SERVER_CONTRACT_MISSING",
                message: "SDK payment endpoint is not configured"
            )
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
        let response = try await postLegacy(service: "sdk.pay.notification", data: data)
        return try Self.parseConfirmation(response)
    }

    static func parseConfirmation(_ response: JSONObject) throws -> (consume: Bool, message: String) {
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

    private func postLegacy(service: String, data: JSONObject) async throws -> JSONObject {
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "appid", value: ShellConfig.backendAppId),
            URLQueryItem(name: "service", value: service),
            URLQueryItem(name: "data", value: data.jsonString()),
            URLQueryItem(name: "sign", value: "")
        ]
        let body = form.percentEncodedQuery?.data(using: .utf8) ?? Data()
        return try await post(
            endpoint: ShellConfig.sdkApiEndpoint,
            contentType: "application/x-www-form-urlencoded; charset=utf-8",
            body: body
        )
    }

    private func post(endpoint: String, contentType: String, body: Data,
                      authorization: String? = nil) async throws -> JSONObject {
        guard let url = URL(string: endpoint) else {
            throw GatewayError.message(code: "INVALID_REQUEST", message: "SDK payment endpoint is invalid")
        }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("zh-Hant", forHTTPHeaderField: "language")
        let token = authorization ?? ShellConfig.paymentApiToken
        if !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await SecureAPIURLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status < 200 || status >= 300 {
            throw GatewayError.message(code: "HTTP_\(status)", message: "SDK backend returned HTTP \(status)")
        }
        guard let json = try? JSONObject(json: String(data: data, encoding: .utf8) ?? "") else {
            throw GatewayError.message(code: "INVALID_SERVER_RESPONSE", message: "SDK backend returned invalid JSON")
        }
        return json
    }

    private static func requireSuccessObject(_ response: JSONObject) throws -> JSONObject {
        try requireSuccess(response)
        guard let data = response.jsonObject("data") else {
            throw GatewayError.message(code: "INVALID_SERVER_RESPONSE", message: "SDK backend response is missing data")
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
            throw GatewayError.message(code: "SERVER_REJECTED", message: message)
        }
    }

    static func isApprovedHTTPS(_ endpoint: String) -> Bool {
        let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let host = url.host, !host.isEmpty else {
            return false
        }
        return url.scheme?.caseInsensitiveCompare("https") == .orderedSame
    }
}
