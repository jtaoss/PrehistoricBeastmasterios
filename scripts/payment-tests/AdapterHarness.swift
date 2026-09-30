import Foundation

enum ShellConfig { static let sdkApiEndpoint = "https://example.invalid/" }

@MainActor final class MiniGameAuthService {
    struct PaymentIdentity { let playerId: String; let accessToken: String }
    enum AuthError: LocalizedError { case missing; var code: String { "LOGIN_REQUIRED" } }
    var currentPlayerID: String? = "player-a"
    func paymentIdentity() async throws -> PaymentIdentity {
        guard let player = currentPlayerID else { throw AuthError.missing }
        return PaymentIdentity(playerId: player, accessToken: "test-only")
    }
}

@MainActor final class BackendGateway {
    enum GatewayError: LocalizedError {
        case message(code: String, message: String)
        var code: String { switch self { case .message(let code, _): return code } }
    }
    static var calls = 0
    static let shared = BackendGateway()
    static var hook: (() async -> Void)?
    static var failure: Error?
    func createMiniGameOrder(offerId: String, clientRequestId: String,
                             identity: MiniGameAuthService.PaymentIdentity) async throws -> PayRequest {
        Self.calls += 1
        await Self.hook?()
        if let failure = Self.failure { throw failure }
        let offer = MiniGameProductCatalog.offer(offerId)!
        return try PayRequest(json: JSONObject([
            "cpOrder": "order-" + clientRequestId, "clientRequestId": clientRequestId,
            "productId": offer.productId, "goodsId": offer.goodsId, "price": "0.99",
            "username": "sdk-" + identity.playerId
        ]).jsonString())
    }
}

typealias BillingService = BackendGateway
typealias BillingError = BackendGateway.GatewayError

@MainActor protocol WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage)
}
enum WKUserScriptTiming { case atDocumentStart }
struct WKUserScript {
    init(source: String, injectionTime: WKUserScriptTiming, forMainFrameOnly: Bool) {}
}
@MainActor final class WKUserContentController {
    func add(_ handler: WKScriptMessageHandler, name: String) {}
    func addUserScript(_ script: WKUserScript) {}
}
@MainActor final class WKWebViewConfiguration { let userContentController = WKUserContentController() }
@MainActor final class WKWebView {
    let configuration = WKWebViewConfiguration()
    var url: URL? = URL(fileURLWithPath: "/signed/game/index.html")
    var scripts: [String] = []
    func evaluateJavaScript(_ script: String, completionHandler: Any?) { scripts.append(script) }
}
struct WKFrameInfo { let isMainFrame: Bool; let request: URLRequest }
@MainActor struct WKScriptMessage {
    let name = "actionSync"
    let webView: WKWebView?
    let frameInfo: WKFrameInfo
    let body: Any
}

@MainActor final class AdapterFixture {
    let auth = MiniGameAuthService()
    lazy var orders = AssetOrderCoordinator(auth: auth)
    let notices = NotificationCenter()
    let view = WKWebView()
    var submitted: [PayRequest] = []
    var busy = false
    lazy var local = LocalAssetSyncManager(orders: orders, notifications: notices,
        canStart: { [weak self] in self?.busy == false }, submit: { [weak self] in self?.submitted.append($0) })
    lazy var web = WebActionSyncHandler(orders: orders,
        isTrustedURL: { $0?.absoluteString == "file:///signed/game/index.html" },
        canStart: { [weak self] in self?.busy == false }, submit: { [weak self] in self?.submitted.append($0) })
    let document = UUID().uuidString
    init() { web.attach(to: view); send(["action": "ready", "documentId": document]) }
    func send(_ body: [String: Any], mainFrame: Bool = true, url: URL? = nil, view: WKWebView? = nil) {
        web.userContentController(self.view.configuration.userContentController, didReceive: WKScriptMessage(
            webView: view ?? self.view,
            frameInfo: WKFrameInfo(isMainFrame: mainFrame, request: URLRequest(url: url ?? self.view.url!)), body: body
        ))
    }
}

@MainActor final class NoticeList { var values: [Notification] = [] }

@main struct AdapterTests {
    @MainActor static var count = 0
    @MainActor static func check(_ condition: @autoclosure () -> Bool, _ label: String) {
        precondition(condition(), label); count += 1
    }
    @MainActor static func settle() async { for _ in 0..<40 { await Task.yield() } }

    @MainActor static func main() async throws {
        let raw = JSONObject(["cpOrder": "x", "price": "0.99", "username": "a",
                              "nativePaymentDestination": "webActions", "nativePaymentAccount": "forged"])
        let original = try PayRequest(json: raw.jsonString())
        let local = try original.routed(to: .localAssets, accountId: "player-a", requestId: UUID().uuidString)
        let restored = try PayRequest(json: local.rawJSON)
        check(restored.destination == .localAssets && restored.resultAccountId == "player-a", "Persist native ownership")
        check(restored.paymentCallback == .legacy, "Local callback remains separate")
        let historical = try PayRequest(json: JSONObject(["cpOrder": "old", "clientRequestId": UUID().uuidString,
            "goodsId": 910001, "productId": "pbm_tier_099"]).jsonString())
        check(historical.destination == .localAssets, "Recognize old local journal")
        let unknown = try PayRequest(json: JSONObject(["cpOrder": "old", "clientRequestId": UUID().uuidString,
            "goodsId": 1, "productId": "pbm_tier_099"]).jsonString())
        check(unknown.destination == .webActions, "UUID alone cannot claim local ownership")
        do {
            _ = try PayRequest(json: "{\"cpOrder\":\"x\",\"nativePaymentDestination\":\"unknown\"}")
            preconditionFailure("Invalid destination accepted")
        } catch { count += 1 }
        for bad in ["http://example.com/", "https://user:pass@example.com/", "https://example.com:444/", "https://example.com/#x", ""] {
            check(Config.validatedReceiptURL(bad) == nil, "Reject invalid validation URL")
        }
        check(Config.validatedReceiptURL("https://example.com/receipts") != nil, "Accept configured HTTPS endpoint")

        let a = AdapterFixture()
        let delivered = NoticeList(), status = NoticeList()
        let deliveryObserver = a.notices.addObserver(forName: .localAssetUpdated, object: a.local, queue: nil) {
            note in MainActor.assumeIsolated { delivered.values.append(note) }
        }
        let statusObserver = a.notices.addObserver(forName: .localAssetSyncStatusChanged, object: a.local, queue: nil) {
            note in MainActor.assumeIsolated { status.values.append(note) }
        }
        defer { a.notices.removeObserver(deliveryObserver); a.notices.removeObserver(statusObserver) }
        let localID = UUID().uuidString
        a.local.syncLocalAsset(assetId: "pack-fortify", requestId: localID)
        a.local.syncLocalAsset(assetId: "pack-fortify", requestId: localID)
        await settle()
        check(a.submitted.count == 1 && a.submitted[0].destination == .localAssets, "Local entry creates native-owned order")
        check(delivered.values.isEmpty, "Order creation is not delivery")
        let localRequest = a.submitted[0]
        a.local.receive("onPayPending", request: localRequest, fields: JSONObject(["clientRequestId": localID]))
        check(status.values.count == 1 && delivered.values.isEmpty, "Pending is not a grant")
        a.local.receive("onPayResult", request: localRequest, fields: JSONObject(["clientRequestId": localID, "transactionId": "1"]))
        check(delivered.values.count == 1, "Server delivery notifies local observers")
        a.local.receive("onPayResult", request: localRequest, fields: JSONObject(["clientRequestId": localID, "transactionId": "1"]))
        check(delivered.values.count == 1, "Repeated delivery does not repeat the local notification")
        check(a.view.scripts.isEmpty, "Local result never invokes web callback")

        let id = UUID().uuidString
        let action = ["action": "upgrade", "id": "tier1", "requestId": id]
        let before = BackendGateway.calls
        a.send(action, mainFrame: false)
        a.send(action, url: URL(string: "https://other.example/"))
        a.send(action, view: WKWebView())
        a.send(["action": "upgrade", "id": "unknown"])
        await settle()
        check(BackendGateway.calls == before, "Reject iframe, origin, view and product violations before orders")
        a.view.scripts.removeAll()
        a.send(action); a.send(action)
        await settle()
        check(BackendGateway.calls == before + 1, "Duplicate message creates one order")
        check(a.view.scripts.isEmpty, "Duplicate cannot fail the original callback")
        let webRequest = a.submitted.last!
        check(webRequest.destination == .webActions && webRequest.paymentCallback == .actionSync, "Web entry has separate callback")
        a.local.receive("onPayResult", request: webRequest, fields: JSONObject())
        check(delivered.values.count == 1, "Web result cannot grant local notification")
        a.web.receive("onPayResult", request: localRequest, fields: JSONObject())
        check(a.view.scripts.isEmpty, "Local result cannot complete a web request")
        a.web.receive("onPayPending", request: webRequest, fields: JSONObject(["code": "DELIVERY_PENDING"]))
        check(a.view.scripts.last?.contains("onSyncCompleted(false") == true, "Pending callback is never successful")
        a.web.receive("onPayResult", request: webRequest, fields: JSONObject(["transactionId": "2"]))
        check(a.view.scripts.last?.contains("onSyncCompleted(true") == true, "Verified web delivery completes its request")
        check(a.view.scripts.last?.contains(a.document) == true, "Callback checks original document at execution")
        let scriptCount = a.view.scripts.count
        a.web.receive("onPayResult", request: webRequest, fields: JSONObject())
        a.send(action); await settle()
        check(a.view.scripts.count == scriptCount && BackendGateway.calls == before + 1, "Completed request ID is not reused")

        let b = AdapterFixture()
        b.send(["action": "upgrade", "id": "tier1"]); await settle()
        let oldPageRequest = b.submitted[0]
        b.web.navigationStarted()
        b.send(["action": "ready", "documentId": UUID().uuidString])
        b.web.receive("onPayResult", request: oldPageRequest, fields: JSONObject())
        check(b.view.scripts.isEmpty, "Reloaded page never receives another document's completion")
        b.send(["action": "upgrade", "id": "tier1"]); await settle()
        let oldAccountRequest = b.submitted.last!
        b.auth.currentPlayerID = "player-b"
        b.web.receive("onPayResult", request: oldAccountRequest, fields: JSONObject())
        check(b.view.scripts.isEmpty, "Account mismatch suppresses late result")

        let c = AdapterFixture()
        var held: CheckedContinuation<Void, Never>?
        BackendGateway.hook = { await withCheckedContinuation { held = $0 } }
        c.local.syncLocalAsset(assetId: "pack-fortify")
        await settle()
        check(held != nil && c.orders.isPreparing, "Order lock covers network wait")
        let lockedCount = BackendGateway.calls
        c.send(["action": "upgrade", "id": "tier1"]); await settle()
        check(BackendGateway.calls == lockedCount, "Other adapter cannot create a concurrent order")
        c.orders.accountDidChange(); c.auth.currentPlayerID = "player-b"
        held?.resume(); BackendGateway.hook = nil
        await settle()
        check(c.submitted.isEmpty && !c.orders.isPreparing, "Account switch during network wait never opens Apple UI")

        let d = AdapterFixture()
        BackendGateway.failure = URLError(.notConnectedToInternet)
        d.send(["action": "upgrade", "id": "tier1"]); await settle()
        check(d.submitted.isEmpty && d.view.scripts.last?.contains("onSyncCompleted(false") == true, "Network error stays in the owning adapter")
        BackendGateway.failure = nil
        print("\(count) payment adapter behavioral checks passed (no network or purchase).")
    }
}
