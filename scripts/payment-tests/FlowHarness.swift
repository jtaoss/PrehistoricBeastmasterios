import Foundation

// Test-only stand-ins. This file is not part of the iOS target. In particular,
// UserDefaults and PaymentDebugLog below never touch the user's preferences/logs.
final class UserDefaults {
    static let standard = UserDefaults()
    var values: [String: String] = [:]
    var rejectWrites = false
    func string(forKey key: String) -> String? { values[key] }
    func set(_ value: String, forKey key: String) { if !rejectWrites { values[key] = value } }
    func removeObject(forKey key: String) { values.removeValue(forKey: key) }
}
enum PaymentDebugLog {
    static var lines: [String] = []
    static func record(_ message: String) { lines.append(message) }
}
enum StoreKitError: Error { case userCancelled, networkError(URLError), systemError(Error), unknown }
let SKErrorDomain = "SKErrorDomain"
enum SKError: Int { case paymentCancelled = 2 }
@MainActor struct ProcessInfo {
    static let processInfo = ProcessInfo()
    var systemUptime: TimeInterval { Harness.monotonicTime }
}
@MainActor enum AnalyticsEventCoordinator {
    static func hasLegacyVerifiedPurchase(transactionId: String) -> Bool { Harness.legacySuccessIds.contains(transactionId) }
}
enum ShellConfig {
    static let storeKitEnabled = true
    static let backendAppId = "unit-test"
}
enum ShellText {
    static func firstNonBlank(_ values: String...) -> String { values.first(where: { !$0.isEmpty }) ?? "" }
    static func sha256Hex(_ value: String) -> String { String(repeating: "0", count: 64) }
}
struct PayRequest {
    let rawJSON: String
    let cpOrder: String
    var price: String { resolvedProductId() == "pbm_tier_499" ? "4.99" : "0.99" }
    let username: String
    let uid = ""
    let roleId: String
    let serverId: String
    let channel = "channel-test"
    let goodsId: Int
    let productId: String
    init(json: String) throws {
        rawJSON = json
        let parts = json.components(separatedBy: "|")
        cpOrder = parts[0]
        username = parts.count > 1 ? parts[1] : "unit-test"
        roleId = parts.count > 2 ? parts[2] : "role-test"
        goodsId = parts.count > 3 ? Int(parts[3]) ?? 0 : 1
        productId = parts.count > 4 ? parts[4] : "pbm_tier_099"
        serverId = parts.count > 5 ? parts[5] : "server-test"
    }
    func resolvedProductId() -> String { productId }
}
enum ProductCatalog {
    static let allProductIds = ["pbm_tier_099", "pbm_tier_499", "pbm_tier_4999"]
    static func contains(_ value: String) -> Bool { allProductIds.contains(value) }
}
@MainActor enum PaymentDiagnosticsViewController { static var authenticationInProgress = false }
@MainActor struct SKStorefront { let identifier: String }
@MainActor final class SKPaymentQueue {
    static let shared = SKPaymentQueue()
    static func `default`() -> SKPaymentQueue { shared }
    var storefront: SKStorefront? { Harness.storefront.map { SKStorefront(identifier: $0) } }
}
@MainActor struct Storefront {
    static var updates: AsyncStream<Storefront> { AsyncStream { $0.finish() } }
}
enum VerificationResult<T> {
    case verified(T), unverified(T, Error)
    var jwsRepresentation: String { "test-only-not-a-receipt" }
}
@MainActor struct Transaction {
    let id: UInt64
    let productID: String
    let appAccountToken: UUID?
    init(productID: String, id: UInt64 = 1) {
        self.productID = productID; self.id = id; self.appAccountToken = Harness.transactionAccountToken
    }
    init(productID: String, id: UInt64, token: UUID?) {
        self.productID = productID; self.id = id; self.appAccountToken = token
    }
    static var updates: AsyncStream<VerificationResult<Transaction>> { AsyncStream { $0.finish() } }
    static var unfinished: AsyncStream<VerificationResult<Transaction>> {
        Harness.unfinishedReads += 1
        let values = Harness.unfinished
        return AsyncStream { continuation in
            if Harness.holdUnfinished { Harness.unfinishedContinuations.append(continuation); return }
            for value in values { continuation.yield(value) }
            continuation.finish()
        }
    }
    func finish() async {
        Harness.events.append("finish")
        await Harness.finishHook?()
        if Harness.finishRemovesTransaction {
            Harness.unfinished.removeAll {
                switch $0 {
                case .verified(let value), .unverified(let value, _): return value.id == id
                }
            }
        }
    }
}
@MainActor struct Product {
    let id: String
    let price: Decimal = 30
    let displayPrice = "NT$30"
    struct PriceFormatStyle { let locale = Locale(identifier: "zh_TW") }
    let priceFormatStyle = PriceFormatStyle()
    enum PurchaseOption: Hashable { case appAccountToken(UUID) }
    enum PurchaseResult { case success(VerificationResult<Transaction>), userCancelled, pending }
    static func products(for ids: [String]) async throws -> [Product] {
        Harness.events.append("query")
        Harness.queryCount += 1
        Harness.queryHook?()
        await Harness.asyncQueryHook?()
        switch Harness.queryMode {
        case "empty": return []
        case "wrong-product": return [Product(id: "pbm_tier_499")]
        case "cancel": throw CancellationError()
        case "error": throw URLError(.notConnectedToInternet)
        case "retry" where Harness.queryCount == 1: throw URLError(.timedOut)
        default: return ids.map { Product(id: $0) }
        }
    }
    func purchase(options: Set<PurchaseOption>) async throws -> PurchaseResult {
        precondition(options == [.appAccountToken(Harness.expectedPurchaseToken ?? Harness.serverToken)], "Checkout did not use the expected order's server token")
        Harness.events.append("purchase")
        await Harness.purchaseHook?()
        if let error = Harness.purchaseError { throw error }
        switch Harness.purchaseMode {
        case "success": return .success(.verified(Transaction(productID: id, id: Harness.transactionId)))
        case "unverified": return .success(.unverified(Transaction(productID: id), URLError(.badServerResponse)))
        case "pending": return .pending
        default: return .userCancelled
        }
    }
}
@MainActor final class BackendGateway {
    struct OrderStatus {
        let orderId: String
        let cpOrder: String
        let productId: String
        let state: String
        let store: String
        let transactionId: String
        var isDelivered: Bool { state == "CONSUMED" && store == "app_store" && UInt64(transactionId).map { $0 > 0 } == true }
    }
    func prepareConnection() async { Harness.connectionPreparations += 1 }
    func orderStatus(sdkOrderId: String) async throws -> OrderStatus {
        Harness.statusQueries += 1
        await Harness.statusHook?()
        if let error = Harness.statusError { throw error }
        guard let value = Harness.orderStatus else { throw URLError(.cannotConnectToHost) }
        return value
    }
    enum GatewayError: Error {
        case message(code: String, message: String)
        var code: String { switch self { case .message(let code, _): return code } }
    }
    struct Order { let orderId: String; let productId: String; let appAccountToken: UUID }
    var isPurchaseConfirmationConfigured: Bool { true }
    func createPlayOrder(_ request: PayRequest) async throws -> Order {
        Harness.events.append("order")
        Harness.orderHook?()
        if Harness.backendMode == "error" { throw GatewayError.message(code: "SERVER_REJECTED", message: "rejected") }
        if Harness.backendMode == "missing-token" { throw GatewayError.message(code: "APP_ACCOUNT_TOKEN_MISSING", message: "missing token") }
        return Order(orderId: Harness.distinctOrders ? request.cpOrder : "test-order",
            productId: Harness.backendMode == "mismatch" ? "pbm_tier_499" : request.resolvedProductId(),
            appAccountToken: Harness.expectedPurchaseToken ?? Harness.serverToken)
    }
    func confirmPurchase(sdkOrderId: String, signedTransaction: String, productId: String, transactionId: String) async throws -> (consume: Bool, message: String) {
        Harness.events.append("confirm")
        Harness.confirmedOrder = sdkOrderId
        Harness.confirmedPairs.append(sdkOrderId + ":" + transactionId)
        await Harness.confirmHook?()
        precondition(signedTransaction == "test-only-not-a-receipt", "Original JWS was changed")
        if Harness.confirmFails { throw GatewayError.message(code: "SERVER_REJECTED", message: "rejected") }
        if let error = Harness.confirmError, Harness.confirmFailuresRemaining > 0 {
            Harness.confirmFailuresRemaining -= 1
            throw error
        }
        return (Harness.consume, "test result")
    }
}
@MainActor final class Listener: StoreKitManager.Listener {
    func onPaymentProgress(_ request: PayRequest?, message: String) { Harness.progress.append(message) }
    func onCheckoutStarted(_ request: PayRequest, _ productInfo: StoreKitManager.ProductInfo) { Harness.events.append("checkout") }
    func onCheckoutReleased(_ request: PayRequest) { Harness.releasedCheckouts.append(request.cpOrder) }
    func onSuccess(_ request: PayRequest?, orderId: String, transactionId: String, productInfo: StoreKitManager.ProductInfo) {
        Harness.paymentGate.finish(request?.cpOrder ?? "")
        Harness.events.append("success")
        Harness.successOrders.append(request?.cpOrder ?? "nil")
    }
    func onPending(_ request: PayRequest?) { Harness.paymentGate.finish(request?.cpOrder ?? ""); Harness.events.append("pending") }
    func onCancel(_ request: PayRequest?) { Harness.paymentGate.finish(request?.cpOrder ?? ""); Harness.events.append("cancel") }
    func onError(_ request: PayRequest?, code: String, message: String) {
        Harness.paymentGate.finish(request?.cpOrder ?? "")
        Harness.events.append(code)
    }
}
@main @MainActor enum Harness {
    static var events: [String] = []
    static var queryCount = 0
    static var queryMode = "valid"
    static var backendMode = "valid"
    static var purchaseMode = "cancel"
    static var confirmFails = false
    static var queryHook: (() -> Void)?
    static var orderHook: (() -> Void)?
    static var unfinished: [VerificationResult<Transaction>] = []
    static var holdUnfinished = false
    static var unfinishedReads = 0
    static var unfinishedContinuations: [AsyncStream<VerificationResult<Transaction>>.Continuation] = []
    static let serverToken = UUID(uuidString: "00112233-4455-8677-8899-AABBCCDDEEFF")!
    static var transactionAccountToken: UUID? = serverToken
    static var consume = true
    static var confirmedOrder = ""
    static var progress: [String] = []
    static var storefront: String? = "143470"
    static var transactionId: UInt64 = 1
    static var purchaseHook: (() async -> Void)?
    static var confirmHook: (() async -> Void)?
    static var finishHook: (() async -> Void)?
    static var asyncQueryHook: (() async -> Void)?
    static var monotonicTime: TimeInterval = 2000
    static var legacySuccessIds = Set<String>()
    static var purchaseError: Error?
    static var testCount = 0
    static var confirmError: Error?
    static var confirmFailuresRemaining = 0
    static var confirmedPairs: [String] = []
    static var recoveryTime: TimeInterval = 1000
    static var recoveryWaits: [TimeInterval] = []
    static var paymentGate = PaymentRequestGate()
    static var finishRemovesTransaction = false
    static var orderStatus: BackendGateway.OrderStatus?
    static var statusQueries = 0
    static var connectionPreparations = 0
    static var statusHook: (() async -> Void)?
    static var statusError: Error?
    static var expectedPurchaseToken: UUID?
    static var distinctOrders = false
    static var successOrders: [String] = []
    static var releasedCheckouts: [String] = []

    static func run(_ name: String, requestJSON: String = "test-cp-order", expected: [String], fastRecovery: Bool = false, preflightTimeout: TimeInterval = 8, after: (StoreKitManager) async throws -> Void = { _ in }, configure: (StoreKitManager) -> Void = { _ in }) async throws {
        events = []; queryCount = 0; queryMode = "valid"; backendMode = "valid"
        purchaseMode = "cancel"; confirmFails = false; queryHook = nil; orderHook = nil
        unfinished = []; UserDefaults.standard.values = [:]; UserDefaults.standard.rejectWrites = false
        for continuation in unfinishedContinuations { continuation.finish() }
        unfinishedContinuations = []; holdUnfinished = false; unfinishedReads = 0
        transactionAccountToken = serverToken; consume = true; confirmedOrder = ""
        progress = []; storefront = "143470"; transactionId = 1
        monotonicTime = 2000
        legacySuccessIds = []
        purchaseError = nil
        confirmError = nil; confirmFailuresRemaining = 0; confirmedPairs = []
        recoveryTime = 1000; recoveryWaits = []
        paymentGate = PaymentRequestGate()
        finishRemovesTransaction = false
        orderStatus = nil; statusQueries = 0; connectionPreparations = 0; statusHook = nil
        statusError = nil
        PaymentDebugLog.lines = []
        expectedPurchaseToken = nil; distinctOrders = false; successOrders = []; releasedCheckouts = []
        purchaseHook = nil; confirmHook = nil; finishHook = nil; asyncQueryHook = nil
        PaymentDiagnosticsViewController.authenticationInProgress = false
        let manager = makeManager(fastRecovery: fastRecovery, preflightTimeout: preflightTimeout)
        let listener = Listener()
        manager.listener = listener
        configure(manager)
        let initial = try PayRequest(json: requestJSON)
        precondition(paymentGate.tryStart(initial.cpOrder))
        manager.launch(initial)
        let deadline = Date().addingTimeInterval(5)
        // Give a cancelled in-flight call a chance to return even if destroy()
        // has already cleared the manager's public processing state.
        repeat { try await Task.sleep(nanoseconds: 10_000_000) }
        while manager.isProcessingPayment && Date() < deadline
        precondition(!manager.isProcessingPayment, "Timed out: \(name)")
        try await after(manager)
        try await waitForAppleFinish(manager)
        precondition(events == expected, "\(name): expected \(expected), got \(events)")
        manager.destroy()
        queryHook = nil; orderHook = nil
        purchaseHook = nil; confirmHook = nil; finishHook = nil; asyncQueryHook = nil
        print("PASS \(name)")
        testCount += 1
    }

    static func waitForIdle(_ manager: StoreKitManager) async throws {
        let deadline = Date().addingTimeInterval(5)
        repeat { try await Task.sleep(nanoseconds: 10_000_000) }
        while manager.isProcessingPayment && Date() < deadline
        precondition(!manager.isProcessingPayment, "Manager did not become idle")
    }

    static func waitForAppleFinish(_ manager: StoreKitManager) async throws {
        let deadline = Date().addingTimeInterval(5)
        while manager.hasPendingAppleFinish && Date() < deadline {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        precondition(!manager.hasPendingAppleFinish, "Apple cleanup did not stop")
    }

    static func makeManager(fastRecovery: Bool, preflightTimeout: TimeInterval = 8) -> StoreKitManager {
        guard fastRecovery else { return StoreKitManager(preflightTimeout: preflightTimeout) }
        return StoreKitManager(recoveryNow: { recoveryTime }, recoveryWait: { seconds in
            recoveryWaits.append(seconds)
            try await Task.sleep(nanoseconds: 40_000_000)
            recoveryTime += seconds
        }, preflightTimeout: preflightTimeout)
    }

    static func waitForRecovery(_ manager: StoreKitManager) async throws {
        let deadline = Date().addingTimeInterval(4)
        while (manager.hasScheduledDeliveryRecovery || manager.isProcessingPayment) && Date() < deadline {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        precondition(!manager.hasScheduledDeliveryRecovery && !manager.isProcessingPayment)
    }

    static func savedContext() -> [String: Any] {
        guard let text = UserDefaults.standard.values["ios_purchase_contexts_v2"],
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return (object["test-order"] ?? object.values.first) as? [String: Any] ?? [:]
    }

    static func replaceSavedContext(_ saved: [String: Any]) {
        // Explicit fault/race injection into the new order-keyed journal.
        let order = saved["sdkOrderId"] as! String
        let data = try! JSONSerialization.data(withJSONObject: [order: saved])
        UserDefaults.standard.values["ios_purchase_contexts_v2"] = String(decoding: data, as: UTF8.self)
    }

    static func deliveredStatus(order: String = "test-order", cp: String = "test-cp-order",
                                product: String = "pbm_tier_099", state: String = "CONSUMED",
                                store: String = "app_store", transaction: String = "1") -> BackendGateway.OrderStatus {
        BackendGateway.OrderStatus(orderId: order, cpOrder: cp, productId: product,
                                   state: state, store: store, transactionId: transaction)
    }

    static func createdStatus(order: String = "test-order", cp: String = "test-cp-order", product: String = "pbm_tier_099") -> BackendGateway.OrderStatus {
        deliveredStatus(order: order, cp: cp, product: product, state: "CREATED", transaction: "")
    }

    static func reconciliationAndWarmupTests() async throws {
        let uncertain = ["query", "order", "checkout", "purchase", "STOREKIT_ERROR"]
        try await run("backend-delivered orphan clears without Apple purchase or fabricated finish", expected: uncertain + ["success"], after: { manager in
            orderStatus = deliveredStatus()
            let message = await manager.checkPendingPayments()
            precondition(message?.contains("補發 1 筆") == true && !manager.hasRetainedOrders)
            _ = await manager.checkPendingPayments()
            precondition(statusQueries == 1 && !manager.hasRetainedOrders)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("retry preflight reconciles delivered original instead of opening Apple again", expected: uncertain + ["success"], after: { manager in
            orderStatus = deliveredStatus()
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
            precondition(!manager.hasRetainedOrders)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("backend reconciliation journal safely finishes later verified replay once", expected: uncertain + ["success", "finish"], after: { manager in
            orderStatus = deliveredStatus()
            _ = await manager.checkPendingPayments()
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await manager.resumePurchases()
            try await waitForAppleFinish(manager)
            precondition(confirmedPairs.isEmpty)
        }) { _ in purchaseError = StoreKitError.unknown }
        for (name, status) in [
            ("created", deliveredStatus(state: "CREATED")),
            ("pending", deliveredStatus(state: "PENDING")),
            ("verify-failed", deliveredStatus(state: "VERIFY_FAILED")),
            ("wrong-order", deliveredStatus(order: "another-order")),
            ("wrong-cp", deliveredStatus(cp: "another-cp")),
            ("wrong-sku", deliveredStatus(product: "pbm_tier_499")),
            ("wrong-store", deliveredStatus(store: "google_play")),
            ("missing-transaction", deliveredStatus(transaction: ""))
        ] {
            try await run("server status \(name) cannot erase or grant uncertain purchase", expected: uncertain, after: { manager in
                orderStatus = status
                _ = await manager.checkPendingPayments()
                precondition(manager.hasRetainedOrders && statusQueries == 1)
                precondition(UserDefaults.standard.values["ios_completed_transactions_v1"] == nil)
            }) { _ in purchaseError = StoreKitError.unknown }
        }
        try await run("late backend status cannot clear a replacement context", expected: uncertain, after: { manager in
            orderStatus = deliveredStatus()
            statusHook = {
                var saved = savedContext(); saved["sdkOrderId"] = "replacement-order"
                let data = try! JSONSerialization.data(withJSONObject: saved)
                replaceSavedContext(saved)
            }
            _ = await manager.checkPendingPayments()
            precondition(manager.hasRetainedOrders && savedContext()["sdkOrderId"] as? String == "replacement-order")
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("stopping during server lookup preserves the original", expected: uncertain, after: { manager in
            orderStatus = deliveredStatus(); statusHook = { manager.destroy() }
            _ = await manager.checkPendingPayments()
            precondition(manager.hasRetainedOrders)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("background lookup and repeat tap coalesce; recovered order does not start another payment", expected: uncertain + ["success", "PURCHASE_ALREADY_PROCESSED", "order", "checkout", "purchase", "cancel"], after: { manager in
            orderStatus = deliveredStatus()
            statusHook = { try? await Task.sleep(nanoseconds: 30_000_000) }
            let background = Task { await manager.resumePurchases() }
            try await Task.sleep(nanoseconds: 5_000_000)
            purchaseError = nil
            precondition(paymentGate.tryStart("second-cp-order"))
            manager.launch(try PayRequest(json: "second-cp-order"))
            await background.value
            try await waitForIdle(manager)
            precondition(statusQueries == 1 && !manager.hasRetainedOrders)
            precondition(events.filter { $0 == "purchase" }.count == 1)
            manager.launch(try PayRequest(json: "fresh-later-intent"))
            try await waitForIdle(manager)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("server status cannot replace a different bound Apple transaction", expected: uncertain, after: { manager in
            var saved = savedContext(); saved["transactionId"] = "2"
            let data = try JSONSerialization.data(withJSONObject: saved)
            replaceSavedContext(saved)
            orderStatus = deliveredStatus(transaction: "1")
            _ = await manager.checkPendingPayments()
            precondition(manager.hasRetainedOrders && savedContext()["transactionId"] as? String == "2")
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("read-only recovery never probes or finishes a live Apple payment", expected: ["query", "order", "checkout", "purchase", "cancel"]) { manager in
            orderStatus = deliveredStatus()
            purchaseHook = { await manager.resumePurchases(); precondition(statusQueries == 0) }
        }
        try await run("warmup before repeated entry is throttled and never creates orders", expected: ["query", "order", "checkout", "purchase", "cancel"], after: { manager in
            manager.prepareForCheckout(); manager.prepareForCheckout()
            try await Task.sleep(nanoseconds: 20_000_000)
            precondition(queryCount == 1 && connectionPreparations == 1)
        })
        try await run("foreground prepares expired catalog before the next explicit tap", expected: ["query", "order", "checkout", "purchase", "cancel", "query", "order", "checkout", "purchase", "cancel"], after: { manager in
            monotonicTime += 301
            manager.prepareForCheckout()
            try await Task.sleep(nanoseconds: 20_000_000)
            precondition(queryCount == 2 && events.filter { $0 == "order" }.count == 1)
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
            precondition(queryCount == 2 && statusQueries == 0)
        })
    }

    static func main() async throws {
        try await orderIsolationTests()
        try await checkoutResilienceTests()
        try await preflightDeadlineTests()
        try await sharedRecoverySafetyTests()
        try await reconciliationAndWarmupTests()
        try await run("missing product creates no order", expected: ["query", "PRODUCT_NOT_FOUND"]) { _ in queryMode = "empty" }
        try await run("wrong product cannot be used", expected: ["query", "PRODUCT_NOT_FOUND"]) { _ in queryMode = "wrong-product" }
        try await run("valid product queried once before order", expected: ["query", "order", "checkout", "purchase", "cancel"])
        try await run("backend failure never purchases", expected: ["query", "order", "SERVER_REJECTED"]) { _ in backendMode = "error" }
        try await run("backend SKU mismatch never purchases", expected: ["query", "order", "PRODUCT_ID_MISMATCH"]) { _ in backendMode = "mismatch" }
        try await run("query error retries once without ordering", expected: ["query", "query", "NETWORK_ERROR"]) { _ in queryMode = "error" }
        try await run("transient query error recovers", expected: ["query", "query", "order", "checkout", "purchase", "cancel"]) { _ in queryMode = "retry" }
        try await run("cancellation is not retried", expected: ["query"]) { _ in queryMode = "cancel" }
        try await run("cancelled query cannot create order", expected: ["query"]) { manager in queryHook = { manager.destroy() } }
        try await run("cancelled order cannot open checkout", expected: ["query", "order"]) { manager in orderHook = { manager.destroy() } }
        try await run("outstanding diagnostic auth blocks checkout", expected: ["STORE_AUTHENTICATION_IN_PROGRESS"]) { _ in PaymentDiagnosticsViewController.authenticationInProgress = true }
        try await run("delivery succeeds before transaction finish", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]) { _ in purchaseMode = "success" }
        try await run("delivery failure leaves transaction unfinished", expected: ["query", "order", "checkout", "purchase", "confirm", "SERVER_REJECTED"]) { _ in purchaseMode = "success"; confirmFails = true }
        try await run("unverified transaction never delivers", expected: ["query", "order", "checkout", "purchase", "STOREKIT_UNVERIFIED"]) { _ in purchaseMode = "unverified" }
        try await run("unfinished transaction recovery precedes catalog", expected: ["PURCHASE_CONTEXT_MISSING"]) { _ in
            queryMode = "empty"
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
        }
        try await run("missing server token never purchases", expected: ["query", "order", "APP_ACCOUNT_TOKEN_MISSING"]) { _ in backendMode = "missing-token" }
        try await run("wrong signed account never confirms or finishes", expected: ["query", "order", "checkout", "purchase", "ACCOUNT_MISMATCH"]) { _ in
            purchaseMode = "success"; transactionAccountToken = UUID(uuidString: "11223344-5566-8778-899A-BBCCDDEEFF00")
        }
        precondition(!savedContext().isEmpty, "Account mismatch removed the order context")
        try await run("consume false never finishes", expected: ["query", "order", "checkout", "purchase", "confirm", "DELIVERY_RETRY_SCHEDULED"]) { _ in purchaseMode = "success"; consume = false }
        precondition(!savedContext().isEmpty, "Pending delivery removed the order context")
        try await run("old context without token retries original order", expected: ["confirm", "success", "finish"]) { _ in
            UserDefaults.standard.values["ios_purchase_context_pbm_tier_099"] = """
            {"requestJSON":"test-cp-order","sdkOrderId":"original-old-order","productId":"pbm_tier_099","priceAmountMicros":990000,"currencyCode":"USD"}
            """
            transactionAccountToken = UUID(uuidString: "00112233-4455-6677-8899-AABBCCDDEEFF")
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
        }
        precondition(confirmedOrder == "original-old-order", "Recovery substituted another order")
        try await run("update succeeds before purchase result: one delivery, no false error", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]) { manager in
            purchaseMode = "success"
            purchaseHook = {
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases()
                unfinished = []
            }
        }
        try await run("duplicate during server confirmation is coalesced", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]) { manager in
            purchaseMode = "success"
            confirmHook = {
                confirmHook = nil
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases()
                unfinished = []
            }
        }
        try await run("duplicate during Apple finish is coalesced", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]) { manager in
            purchaseMode = "success"
            finishHook = {
                finishHook = nil
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases()
                unfinished = []
            }
        }
        try await run("completed transaction remains deduplicated after manager recreation", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "finish"], after: { manager in
            manager.destroy()
            let next = StoreKitManager(), listener = Listener()
            next.listener = listener
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await next.resumePurchases()
            try await waitForAppleFinish(next)
        }) { _ in purchaseMode = "success" }
        try await run("same product with a new transaction still verifies", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "order", "checkout", "purchase", "confirm", "success", "finish"], after: { manager in
            transactionId = 2
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseMode = "success" }
        try await run("late old callback cannot erase a newer order", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "order", "checkout", "purchase", "confirm", "success", "finish"], after: { manager in
            transactionId = 2
            purchaseHook = {
                unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 1))]
                await manager.resumePurchases()
                precondition(!savedContext().isEmpty)
                unfinished = []
            }
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseMode = "success" }
        try await run("storefront change invalidates product cache", expected: ["query", "order", "checkout", "purchase", "cancel", "query", "order", "checkout", "purchase", "cancel"], after: { manager in
            storefront = "143441"
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
        })
        try await run("storefront change mid-query discards stale result", expected: ["query", "query", "order", "checkout", "purchase", "cancel"]) { _ in
            queryHook = { storefront = "143441"; queryHook = nil }
        }
        try await run("unknown storefront is not cached", expected: ["query", "order", "checkout", "purchase", "cancel", "query", "order", "checkout", "purchase", "cancel"], after: { manager in
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
        }) { _ in storefront = nil }
        try await run("failed delivery is retried, not marked completed", expected: ["query", "order", "checkout", "purchase", "confirm", "SERVER_REJECTED", "confirm", "success", "finish"], after: { manager in
            precondition(UserDefaults.standard.values["ios_completed_transactions_v1"] == nil)
            confirmFails = false
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            _ = await manager.checkPendingPayments()
        }) { _ in purchaseMode = "success"; confirmFails = true }
        try await run("unrelated unknown transaction is not hidden by completed journal", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "PURCHASE_CONTEXT_MISSING"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 99))]
            await manager.resumePurchases()
        }) { _ in purchaseMode = "success" }
        try await run("expired catalog is fetched again", expected: ["query", "order", "checkout", "purchase", "cancel", "query", "order", "checkout", "purchase", "cancel"], after: { manager in
            monotonicTime += 301
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
        })
        try await run("warmup and checkout share one catalog request", expected: ["query", "order", "checkout", "purchase", "cancel"]) { manager in
            asyncQueryHook = { try? await Task.sleep(nanoseconds: 50_000_000) }
            manager.start()
        }
        try await run("storefront changing during order creation cannot open payment", expected: ["query", "order", "STOREFRONT_CHANGED"]) { _ in
            orderHook = { storefront = "143441" }
        }
        try await run("empty product response is not cached", expected: ["query", "PRODUCT_NOT_FOUND", "query", "order", "checkout", "purchase", "cancel"], after: { manager in
            queryMode = "valid"
            manager.launch(try PayRequest(json: "second-cp-order"))
            try await waitForIdle(manager)
        }) { _ in queryMode = "empty" }
        try await run("completed journal cannot hide a different signed account", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "PURCHASE_CONTEXT_MISSING"], after: { manager in
            transactionAccountToken = UUID(uuidString: "11223344-5566-8778-899A-BBCCDDEEFF00")
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await manager.resumePurchases()
        }) { _ in purchaseMode = "success" }
        try await run("legacy verified success is migrated once without a second delivery", expected: ["query", "order", "checkout", "purchase", "cancel", "finish"], after: { manager in
            legacySuccessIds = ["1"]
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await manager.resumePurchases()
            await manager.resumePurchases()
            precondition(UserDefaults.standard.values["ios_completed_transactions_v1"] != nil)
        })
        try await run("legacy migration cannot erase a newer same-product order", expected: ["query", "order", "checkout", "purchase", "finish", "confirm", "success", "finish"]) { manager in
            purchaseMode = "success"; transactionId = 2; legacySuccessIds = ["1"]
            purchaseHook = {
                unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 1))]
                await manager.resumePurchases()
                precondition(!savedContext().isEmpty)
                unfinished = []
            }
        }
        try await run("legacy marker never bypasses StoreKit signature verification", expected: ["query", "order", "checkout", "purchase", "STOREKIT_UNVERIFIED"]) { _ in
            purchaseMode = "unverified"; legacySuccessIds = ["1"]
        }
        try await run("legacy marker cannot finish an unknown product", expected: ["query", "order", "checkout", "purchase", "cancel", "PURCHASE_CONTEXT_MISSING"], after: { manager in
            legacySuccessIds = ["1"]
            unfinished = [.verified(Transaction(productID: "unknown-product"))]
            await manager.resumePurchases()
        })
        try await failureAndRecoveryTests()
        try await deliveryFallbackTests()
        try await replayedCheckoutTests()
        try await completedCleanupTests()
        try await paymentExperienceTests()
        print("\(testCount) payment-flow behavioral tests passed (SDK/backend doubles, no real purchase).")
    }

    static func completedCleanupTests() async throws {
        let success = ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]
        try await run("old-only manual check reports pending Apple synchronization", expected: success + ["finish"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            let result = await manager.checkPendingPayments()
            precondition(result?.contains("仍待同步") == true, "Old-only check had no accurate terminal result")
            precondition(result?.contains("未發起付款") == true)
            precondition(PaymentDebugLog.lines.contains { $0.contains("payment-recovery-check-result") && $0.contains("historicalRemaining=1") })
        }) { _ in purchaseMode = "success" }

        try await run("old-only manual check confirms removal without redelivery", expected: success + ["finish"], after: { manager in
            finishRemovesTransaction = true
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            let result = await manager.checkPendingPayments()
            precondition(result?.contains("舊交易已收尾") == true)
            precondition(unfinished.isEmpty)
            precondition(events.filter { $0 == "success" }.count == 1)
            precondition(PaymentDebugLog.lines.contains { $0.contains("payment-recovery-check-result") && $0.contains("historicalRemaining=0") })
        }) { _ in purchaseMode = "success" }

        try await run("old cleanup preserves an unconfirmed newer order of the same SKU",
            expected: success + ["order", "checkout", "purchase", "STOREKIT_ERROR", "finish"], after: { manager in
                purchaseError = StoreKitError.unknown
                manager.launch(try PayRequest(json: "second-cp-order"))
                try await waitForIdle(manager)
                let saved = UserDefaults.standard.values["ios_purchase_contexts_v2"]
                finishRemovesTransaction = true
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                orderStatus = createdStatus(cp: "second-cp-order")
                let result = await manager.checkPendingPayments()
                precondition(result?.contains("暫未查到付款結果") == true)
                precondition(UserDefaults.standard.values["ios_purchase_contexts_v2"] == saved)
                precondition(manager.hasRetainedOrders)
            }) { _ in purchaseMode = "success" }

        try await run("background replay cleanup is rate limited but becomes eligible again",
            expected: success + ["finish", "finish"], after: { manager in
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases()
                try await waitForAppleFinish(manager)
                monotonicTime += 31
                await manager.resumePurchases()
                try await waitForAppleFinish(manager)
                await manager.resumePurchases()
                await manager.resumePurchases()
                try await waitForAppleFinish(manager)
                monotonicTime += 31
                await manager.resumePurchases()
            }) { _ in purchaseMode = "success" }

        try await run("manual cleanup owns scan until Apple finish returns", expected: success + ["finish"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            finishHook = {
                finishHook = nil
                await manager.resumePurchases()
                let busy = await manager.checkPendingPayments()
                precondition(busy?.contains("查單正在進行") == true)
            }
            let result = await manager.checkPendingPayments()
            precondition(result?.contains("仍待同步") == true)
        }) { _ in purchaseMode = "success" }

        try await run("checkout receiving old transaction during cleanup coalesces finish and releases its own gate",
            expected: success + ["finish", "order", "checkout", "purchase", "STOREKIT_PREVIOUS_TRANSACTION"], after: { manager in
                monotonicTime += 31
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                finishHook = {
                    finishHook = nil
                    precondition(paymentGate.tryStart("second-cp-order"))
                    manager.launch(try! PayRequest(json: "second-cp-order"))
                    try? await Task.sleep(nanoseconds: 30_000_000)
                    precondition(!paymentGate.tryStart("probe-cp-order"))
                }
                await manager.resumePurchases()
                try await waitForIdle(manager)
                precondition(paymentGate.tryStart("probe-cp-order"))
                paymentGate.finish("probe-cp-order")
                precondition(savedContext()["requestJSON"] as? String == "second-cp-order")
                precondition(savedContext()["transactionId"] == nil)
            }) { _ in purchaseMode = "success" }

        try await run("empty scan with retained order never claims that order succeeded",
            expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR"], after: { manager in
                let result = await manager.checkPendingPayments()
                precondition(result?.contains("暫時無法核對") == true)
                precondition(!result!.contains("成功"))
            }) { _ in purchaseError = StoreKitError.unknown }

        try await run("mixed old and failed transactions do not display all-complete",
            expected: success + ["finish", "PURCHASE_CONTEXT_MISSING"], after: { manager in
                unfinished = [.verified(Transaction(productID: "pbm_tier_099")), .verified(Transaction(productID: "pbm_tier_499", id: 2))]
                let result = await manager.checkPendingPayments()
                precondition(result?.contains("1 筆交易需核對") == true)
                precondition(!result!.contains("舊交易已收尾"))
            }) { _ in purchaseMode = "success" }

        try await run("unverified old transaction is never finished despite journal match",
            expected: success + ["STOREKIT_UNVERIFIED"], after: { manager in
                unfinished = [.unverified(Transaction(productID: "pbm_tier_099"), StoreKitError.unknown)]
                let result = await manager.checkPendingPayments()
                precondition(result?.contains("1 筆交易需核對") == true)
            }) { _ in purchaseMode = "success" }

        try await run("mismatched signed account cannot trigger completed cleanup",
            expected: success + ["PURCHASE_CONTEXT_MISSING"], after: { manager in
                transactionAccountToken = UUID(uuidString: "11223344-5566-8778-899A-BBCCDDEEFF00")
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                let result = await manager.checkPendingPayments()
                precondition(result?.contains("1 筆交易需核對") == true)
            }) { _ in purchaseMode = "success" }

        try await run("stopping during old cleanup reports interrupted instead of success",
            expected: success + ["finish"], after: { manager in
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                finishHook = { manager.destroy() }
                let result = await manager.checkPendingPayments()
                precondition(result?.contains("查單已中斷") == true)
            }) { _ in purchaseMode = "success" }
    }

    static func paymentExperienceTests() async throws {
        let success = ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]
        var releaseFinish: CheckedContinuation<Void, Never>?
        try await run("server delivery reaches game while Apple finish is still waiting", expected: success, after: { manager in
            precondition(events.contains("success"))
            precondition(!manager.isProcessingPayment && manager.hasPendingAppleFinish)
            precondition(UserDefaults.standard.values["ios_completed_transactions_v1"] != nil)
            precondition(!manager.hasRetainedOrders)
            precondition(paymentGate.tryStart("next-cp-order"), "Apple acknowledgement held the H5 gate")
            paymentGate.finish("next-cp-order")
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            let replay = Task { await manager.resumePurchases() }
            try await Task.sleep(nanoseconds: 10_000_000)
            precondition(events.filter { $0 == "confirm" }.count == 1)
            precondition(events.filter { $0 == "success" }.count == 1)
            precondition(releaseFinish != nil)
            releaseFinish?.resume()
            releaseFinish = nil
            await replay.value
        }) { _ in
            purchaseMode = "success"
            finishHook = { await withCheckedContinuation { releaseFinish = $0 } }
        }

        try await run("interrupted Apple cleanup recovers after restart without redelivery", expected: success + ["finish"], after: { manager in
            precondition(manager.hasPendingAppleFinish && !manager.hasRetainedOrders)
            manager.destroy()
            precondition(releaseFinish != nil)
            releaseFinish?.resume()
            releaseFinish = nil
            try await waitForAppleFinish(manager)
            finishHook = nil
            let next = StoreKitManager(), listener = Listener()
            next.listener = listener
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await next.resumePurchases()
            try await waitForAppleFinish(next)
            next.destroy()
            precondition(events.filter { $0 == "confirm" }.count == 1)
            precondition(events.filter { $0 == "success" }.count == 1)
        }) { _ in
            purchaseMode = "success"
            finishHook = { await withCheckedContinuation { releaseFinish = $0 } }
        }

        try await run("next checkout waits for same-product cleanup without making an extra order early",
            expected: success + Array(success.dropFirst()), after: { manager in
                unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 1))]
                finishRemovesTransaction = true
                transactionId = 2
                manager.launch(try PayRequest(json: "second-cp-order"))
                try await Task.sleep(nanoseconds: 30_000_000)
                precondition(events.filter { $0 == "order" }.count == 1, "New checkout overtook unfinished Apple cleanup")
                finishHook = nil
                releaseFinish?.resume()
                releaseFinish = nil
                try await waitForIdle(manager)
            }) { _ in
                purchaseMode = "success"
                finishHook = { await withCheckedContinuation { releaseFinish = $0 } }
            }

        let gate = PaymentRequestGate()
        precondition(gate.tryStart(" current-order "))
        precondition(gate.canPresent("current-order"))
        precondition(!gate.canPresent("old-order") && !gate.canPresent(nil))
        gate.finish("old-order")
        precondition(!gate.tryStart("next-order"))
        gate.finish("current-order")
        precondition(gate.canPresent("old-order"))
        precondition(gate.tryStart("next-order"))
        print("PASS old-order UI feedback cannot override an active checkout")
        testCount += 1
    }

    static func replayedCheckoutTests() async throws {
        let success = ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]
        let replay = ["order", "checkout", "purchase", "STOREKIT_PREVIOUS_TRANSACTION"]
        try await run("old checkout reply releases both locks and explicit retry keeps original order",
            expected: success + replay + ["checkout", "purchase", "confirm", "success", "finish"], after: { manager in
                precondition(paymentGate.tryStart("second-cp-order"))
                manager.launch(try PayRequest(json: "second-cp-order"))
                try await waitForIdle(manager)
                precondition(savedContext()["requestJSON"] as? String == "second-cp-order")
                precondition(savedContext()["recoveryState"] as? String == "interrupted")
                precondition(savedContext()["transactionId"] == nil)
                let original = try PayRequest(json: "second-cp-order")
                precondition(manager.retryRequest(for: original) != nil)
                precondition(!manager.hasScheduledDeliveryRecovery)
                precondition(paymentGate.tryStart("second-cp-order"), "Old reply left the H5 gate locked")
                transactionId = 2
                orderStatus = createdStatus(cp: "second-cp-order")
                manager.retryOriginal(try PayRequest(json: "second-cp-order"))
                try await waitForIdle(manager)
                precondition(events.filter { $0 == "order" }.count == 2, "Explicit retry created another SDK order")
                precondition(!manager.hasRetainedOrders)
                precondition(paymentGate.tryStart("third-cp-order"))
                paymentGate.finish("third-cp-order")
            }) { _ in purchaseMode = "success" }

        try await run("persisted completed transaction returned by checkout cannot lock new order",
            expected: ["finish", "query", "order", "checkout", "purchase", "STOREKIT_PREVIOUS_TRANSACTION"], after: { manager in
                precondition(paymentGate.tryStart("another-cp-order"))
                paymentGate.finish("another-cp-order")
                precondition(manager.hasRetainedOrders && savedContext()["transactionId"] == nil)
                precondition(!events.contains("confirm") && !events.contains("success"))
            }) { _ in
                purchaseMode = "success"
                UserDefaults.standard.values["ios_completed_transactions_v1"] = """
                [{"transactionId":"1","productId":"pbm_tier_099","appAccountToken":"\(serverToken.uuidString)","cpOrder":"previous-cp-order"}]
                """
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            }

        try await run("background old callback does not unlock an active new checkout",
            expected: success + Array(success.dropFirst()), after: { manager in
                precondition(paymentGate.tryStart("second-cp-order"))
                transactionId = 2
                purchaseHook = {
                    unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 1))]
                    await manager.resumePurchases()
                    unfinished = []
                    precondition(!paymentGate.tryStart("third-cp-order"), "Background replay unlocked an active checkout")
                    precondition(manager.isProcessingPayment)
                    precondition(savedContext()["requestJSON"] as? String == "second-cp-order")
                }
                manager.launch(try PayRequest(json: "second-cp-order"))
                try await waitForIdle(manager)
                precondition(paymentGate.tryStart("third-cp-order"))
                paymentGate.finish("third-cp-order")
            }) { _ in purchaseMode = "success" }

        try await run("legacy completed checkout reply also releases the new order gate",
            expected: ["query", "order", "checkout", "purchase", "finish", "STOREKIT_PREVIOUS_TRANSACTION"], after: { manager in
                precondition(paymentGate.tryStart("next-cp-order"))
                paymentGate.finish("next-cp-order")
                precondition(manager.hasRetainedOrders && savedContext()["transactionId"] == nil)
            }) { _ in purchaseMode = "success"; legacySuccessIds = ["1"] }

        try await run("late old purchase reply cannot regress a new transaction already delivered",
            expected: success + Array(success.dropFirst()), after: { manager in
                precondition(paymentGate.tryStart("second-cp-order"))
                purchaseHook = {
                    unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 2))]
                    await manager.resumePurchases()
                    unfinished = []
                }
                manager.launch(try PayRequest(json: "second-cp-order"))
                try await waitForIdle(manager)
                precondition(!manager.hasRetainedOrders)
                precondition(paymentGate.tryStart("third-cp-order"))
                paymentGate.finish("third-cp-order")
            }) { _ in purchaseMode = "success" }
    }

    static func failureAndRecoveryTests() async throws {
        let gateway = NSError(domain: "AMSErrorDomain", code: 301, userInfo: ["AMSStatusCode": 502,
            "AMSURL": "https://private.invalid/?token=secret", NSLocalizedDescriptionKey: "private@example.invalid"])
        let auth = NSError(domain: "AMSErrorDomain", code: 100, userInfo: ["NSMultipleUnderlyingErrorsKey": [gateway]])
        let failure = StoreKitManager.paymentFailure(for: StoreKitError.systemError(auth))
        precondition(failure.code == "APP_STORE_TEMPORARILY_UNAVAILABLE" && !failure.isUserCancellation)
        precondition(failure.diagnostic.contains("http:502"))
        precondition(!failure.diagnostic.contains("secret") && !failure.diagnostic.contains("private"))
        precondition(StoreKitManager.paymentFailure(for: StoreKitError.userCancelled).isUserCancellation)
        precondition(StoreKitManager.paymentFailure(for: NSError(domain: SKErrorDomain, code: 2)).isUserCancellation)
        precondition(StoreKitManager.paymentFailure(for: StoreKitError.networkError(URLError(.timedOut))).code == "NETWORK_ERROR")
        precondition(StoreKitManager.paymentFailure(for: NSError(domain: "unknown", code: 2,
            userInfo: [NSLocalizedDescriptionKey: "已取消要求"])).code == "STOREKIT_ERROR")
        let mixed = NSError(domain: SKErrorDomain, code: 2, userInfo: [NSUnderlyingErrorKey: auth])
        precondition(StoreKitManager.paymentFailure(for: mixed).code == "APP_STORE_TEMPORARILY_UNAVAILABLE")
        print("PASS error classification and private-metadata redaction")
        testCount += 1

        try await run("502 retains original without automatic purchase retry", expected: ["query", "order", "checkout", "purchase", "APP_STORE_TEMPORARILY_UNAVAILABLE"], after: { manager in
            let request = try PayRequest(json: "new-web-order")
            precondition(manager.retryRequest(for: request)?.cpOrder == "test-cp-order")
            precondition(!savedContext().isEmpty)
        }) { _ in purchaseError = StoreKitError.systemError(auth) }
        try await run("unknown localized cancelled text is not user cancellation", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR"]) { _ in
            purchaseError = NSError(domain: "unknown", code: 2, userInfo: [NSLocalizedDescriptionKey: "已取消要求"])
        }
        try await run("documented thrown cancellation removes first attempt context", expected: ["query", "order", "checkout", "purchase", "cancel"], after: { _ in
            precondition(savedContext().isEmpty)
        }) { _ in purchaseError = StoreKitError.userCancelled }
        try await run("manual retry uses original SDK order without creating another", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "checkout", "purchase", "confirm", "success", "finish"], after: { manager in
            orderStatus = createdStatus()
            purchaseError = nil; purchaseMode = "success"
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
            precondition(confirmedOrder == "test-order")
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("ordinary H5 retry cannot overwrite unresolved order", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "PURCHASE_RECOVERY_REQUIRED"], after: { manager in
            orderStatus = createdStatus()
            manager.launch(try PayRequest(json: "new-web-order"))
            try await waitForIdle(manager)
            let request = try PayRequest(json: "new-web-order")
            precondition(manager.retryRequest(for: request)?.cpOrder == "test-cp-order")
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("late transaction recovers before manual retry opens Apple UI", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "confirm", "success", "finish"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("retained context recovers after process recreation", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "confirm", "success", "finish"], after: { manager in
            manager.destroy()
            let next = StoreKitManager(), listener = Listener()
            next.listener = listener
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await next.resumePurchases()
            try await waitForAppleFinish(next)
            precondition(confirmedOrder == "test-order")
            next.destroy()
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("successful update suppresses later thrown purchase error", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]) { manager in
            purchaseError = StoreKitError.unknown
            purchaseHook = {
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases(); unfinished = []
            }
        }
        try await run("canceling retry does not discard original uncertain order", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "checkout", "purchase", "cancel", "confirm", "success", "finish"], after: { manager in
            orderStatus = createdStatus()
            purchaseError = nil
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
            precondition(!savedContext().isEmpty)
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await manager.resumePurchases()
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("retry with changed storefront preserves original but cannot purchase", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "query", "STOREFRONT_CHANGED"], after: { manager in
            orderStatus = createdStatus()
            storefront = "143441"; purchaseError = nil
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
            precondition(!savedContext().isEmpty)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("stale retry button never makes new order after success", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "PURCHASE_ALREADY_PROCESSED"], after: { manager in
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseMode = "success" }
        try await run("verification failure offers no new purchase retry", expected: ["query", "order", "checkout", "purchase", "STOREKIT_UNVERIFIED", "PURCHASE_RECOVERY_REQUIRED"], after: { manager in
            let request = try PayRequest(json: "test-cp-order")
            precondition(manager.retryRequest(for: request) == nil)
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseMode = "unverified" }
        try await run("account or role switch cannot retry original order", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "PURCHASE_RECOVERY_REQUIRED"], after: { manager in
            let otherAccount = try PayRequest(json: "test-cp-order|other-user")
            let otherRole = try PayRequest(json: "test-cp-order|unit-test|other-role")
            precondition(manager.retryRequest(for: otherAccount) == nil)
            precondition(manager.retryRequest(for: otherRole) == nil)
            manager.retryOriginal(otherAccount)
            try await waitForIdle(manager)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("late transaction during retry catalog lookup prevents another purchase", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "query", "confirm", "success", "finish", "PURCHASE_ALREADY_PROCESSED"], after: { manager in
            orderStatus = createdStatus()
            monotonicTime += 301
            asyncQueryHook = {
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases(); unfinished = []
            }
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("query failure during manual retry retains original context", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "query", "query", "NETWORK_ERROR"], after: { manager in
            orderStatus = createdStatus()
            monotonicTime += 301; queryMode = "error"
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
            precondition(!savedContext().isEmpty)
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("purchase task cancellation preserves uncertain response", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "confirm", "success", "finish"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await manager.resumePurchases()
        }) { _ in purchaseError = CancellationError() }
        try await run("delivery awaiting backend never re-enters purchase UI", expected: ["query", "order", "checkout", "purchase", "confirm", "DELIVERY_RETRY_SCHEDULED", "PURCHASE_RECOVERY_REQUIRED"], after: { manager in
            let request = try PayRequest(json: "test-cp-order")
            precondition(manager.retryRequest(for: request) == nil)
            manager.retryOriginal(request)
            try await waitForIdle(manager)
        }) { _ in purchaseMode = "success"; consume = false }
        try await run("another transaction cannot be attached to the same SDK order", expected: ["query", "order", "checkout", "purchase", "confirm", "DELIVERY_RETRY_SCHEDULED", "TRANSACTION_MISMATCH"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 2))]
            await manager.resumePurchases()
            precondition(!savedContext().isEmpty)
        }) { _ in purchaseMode = "success"; consume = false }
        try await run("original successful update suppresses later cancel result", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"]) { manager in
            purchaseHook = {
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                await manager.resumePurchases(); unfinished = []
            }
        }
        try await run("retry completion failure keeps transaction binding for recovery", expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "checkout", "purchase", "confirm", "SERVER_REJECTED", "confirm", "success", "finish"], after: { manager in
            orderStatus = createdStatus()
            purchaseError = nil; purchaseMode = "success"; confirmFails = true
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
            confirmFails = false
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            _ = await manager.checkPendingPayments()
        }) { _ in purchaseError = StoreKitError.unknown }
        try await run("already-finished replay releases the explicit retry UI gate", expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "PURCHASE_ALREADY_PROCESSED"], after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            manager.retryOriginal(try PayRequest(json: "test-cp-order"))
            try await waitForIdle(manager)
        }) { _ in purchaseMode = "success" }
    }

    static func deliveryFallbackTests() async throws {
        let initial = ["query", "order", "checkout", "purchase", "confirm", "DELIVERY_RETRY_SCHEDULED"]
        try await run("transient confirmation automatically retries same signed transaction", expected: initial + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
            try await waitForRecovery(manager)
            precondition(confirmedPairs == ["test-order:1", "test-order:1"])
            precondition(!manager.hasRetainedOrders)
            precondition(recoveryWaits == [2])
        }) { _ in purchaseMode = "success"; confirmError = URLError(.timedOut); confirmFailuresRemaining = 1 }
        try await run("consume false is retried and only consumes after delivery", expected: initial + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
            precondition(!events.contains("finish"))
            consume = true
            try await waitForRecovery(manager)
        }) { _ in purchaseMode = "success"; consume = false }
        try await run("HTTP 503 uses bounded backoff and then recovers", expected: initial + ["confirm", "confirm", "success", "finish"], fastRecovery: true, after: { manager in
            try await waitForRecovery(manager)
            precondition(recoveryWaits == [2, 5])
        }) { _ in
            purchaseMode = "success"
            confirmError = BackendGateway.GatewayError.message(code: "HTTP_503", message: "temporary")
            confirmFailuresRemaining = 2
        }
        try await run("automatic recovery stops after five retries without finishing", expected: initial + Array(repeating: "confirm", count: 5) + ["DELIVERY_RETRY_EXHAUSTED"], fastRecovery: true, after: { manager in
            try await waitForRecovery(manager)
            precondition(recoveryWaits == [2, 5, 15, 30, 60])
            precondition(savedContext()["deliveryRetryCount"] as? Int == 5)
            precondition(savedContext()["deliveryNeedsReview"] as? Bool == true)
            precondition(!events.contains("finish") && manager.hasRetainedOrders)
        }) { _ in purchaseMode = "success"; confirmError = URLError(.timedOut); confirmFailuresRemaining = 99 }
        try await run("resume storms cannot bypass backoff", expected: initial + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            for _ in 0..<10 { await manager.resumePurchases() }
            precondition(confirmedPairs.count == 1)
            try await waitForRecovery(manager)
        }) { _ in purchaseMode = "success"; confirmError = URLError(.networkConnectionLost); confirmFailuresRemaining = 1 }
        try await run("process recreation resumes retained delivery with same budget", expected: initial + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
            manager.destroy()
            let next = makeManager(fastRecovery: true), listener = Listener()
            next.listener = listener
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await next.resumePurchases()
            try await waitForRecovery(next)
            try await waitForAppleFinish(next)
            next.destroy()
            precondition(confirmedPairs == ["test-order:1", "test-order:1"])
        }) { _ in purchaseMode = "success"; confirmError = URLError(.timedOut); confirmFailuresRemaining = 1 }
        try await run("permanent rejection never automatically retries; manual check can recover", expected: ["query", "order", "checkout", "purchase", "confirm", "SERVER_REJECTED", "DELIVERY_REVIEW_REQUIRED", "confirm", "success", "finish"], fastRecovery: true, after: { manager in
            precondition(!manager.hasScheduledDeliveryRecovery)
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            confirmFails = false
            await manager.resumePurchases()
            _ = await manager.checkPendingPayments()
        }) { _ in purchaseMode = "success"; confirmFails = true }
        try await run("manual recovery replaces timer without overlapping verification", expected: initial + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            _ = await manager.checkPendingPayments()
            try await Task.sleep(nanoseconds: 70_000_000)
            precondition(!manager.hasScheduledDeliveryRecovery)
        }) { _ in purchaseMode = "success"; confirmError = URLError(.timedOut); confirmFailuresRemaining = 1 }
        try await run("empty manual check never creates an order or calls purchase", expected: ["query", "order", "checkout", "purchase", "cancel"], after: { manager in
            let result = await manager.checkPendingPayments()
            precondition(result?.contains("未發起付款") == true)
        })
        for code in ["HTTP_401", "HTTP_403", "HTTP_404", "INVALID_SERVER_RESPONSE", "ACCOUNT_MISMATCH"] {
            try await run("no automatic bypass for \(code)", expected: ["query", "order", "checkout", "purchase", "confirm", code], fastRecovery: true, after: { manager in
                precondition(!manager.hasScheduledDeliveryRecovery && manager.hasRetainedOrders)
            }) { _ in
                purchaseMode = "success"; confirmError = BackendGateway.GatewayError.message(code: code, message: "rejected"); confirmFailuresRemaining = 1
            }
        }
        try await run("exhaustion persists across restart until explicit manual recovery", expected: initial + Array(repeating: "confirm", count: 5) + ["DELIVERY_RETRY_EXHAUSTED", "DELIVERY_RETRY_EXHAUSTED", "confirm", "success", "finish"], fastRecovery: true, after: { manager in
            try await waitForRecovery(manager)
            manager.destroy()
            let next = makeManager(fastRecovery: true), listener = Listener()
            next.listener = listener
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await next.resumePurchases()
            precondition(confirmedPairs.count == 6 && !next.hasScheduledDeliveryRecovery)
            confirmFailuresRemaining = 0
            _ = await next.checkPendingPayments()
            try await waitForAppleFinish(next)
            next.destroy()
            precondition(events.filter { $0 == "order" }.count == 1)
        }) { _ in purchaseMode = "success"; confirmError = URLError(.timedOut); confirmFailuresRemaining = 99 }
        try await run("persisted in-flight retry cannot restart the five-attempt budget", expected: initial + ["confirm", "DELIVERY_RETRY_EXHAUSTED"], fastRecovery: true, after: { manager in
            manager.destroy()
            var saved = savedContext()
            // Simulate a crash after the fourth retry counter was persisted,
            // while its HTTP request had not returned to the application.
            saved["deliveryRetryCount"] = 4
            saved["deliveryRetryAt"] = recoveryTime
            let data = try JSONSerialization.data(withJSONObject: saved)
            replaceSavedContext(saved)
            let next = makeManager(fastRecovery: true), listener = Listener()
            next.listener = listener
            unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
            await next.resumePurchases()
            try await waitForRecovery(next)
            precondition(savedContext()["deliveryRetryCount"] as? Int == 5)
            next.destroy()
        }) { _ in purchaseMode = "success"; confirmError = URLError(.timedOut); confirmFailuresRemaining = 99 }
        try await run("stopping manager cancels scheduled retry but retains the transaction", expected: initial, fastRecovery: true, after: { manager in
            manager.destroy()
            try await Task.sleep(nanoseconds: 70_000_000)
            precondition(!manager.hasScheduledDeliveryRecovery && manager.hasRetainedOrders)
        }) { _ in purchaseMode = "success"; consume = false }
        try await run("interrupted confirmation resumes without another purchase", expected: initial + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
            try await waitForRecovery(manager)
        }) { _ in purchaseMode = "success"; confirmError = CancellationError(); confirmFailuresRemaining = 1 }
        try await run("TLS certificate failures never automatically retry", expected: ["query", "order", "checkout", "purchase", "confirm", "DELIVERY_REVIEW_REQUIRED"], fastRecovery: true, after: { manager in
            precondition(!manager.hasScheduledDeliveryRecovery)
        }) { _ in purchaseMode = "success"; confirmError = URLError(.serverCertificateUntrusted); confirmFailuresRemaining = 1 }
    }
}
