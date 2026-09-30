import Foundation

@MainActor final class MainQueueDouble {
    var jobs: [() -> Void] = []
    func async(execute: @escaping () -> Void) { jobs.append(execute) }
    func drain() {
        let ready = jobs
        jobs.removeAll()
        ready.forEach { $0() }
    }
}
@MainActor enum DispatchQueue { static let main = MainQueueDouble() }
@MainActor final class UIApplication {
    enum State { case active, background }
    static let shared = UIApplication()
    var applicationState = State.active
}
final class ViewDouble { var window: Int? = 1 }
struct TransitionContextDouble { var isCancelled: Bool }
@MainActor final class TransitionDouble {
    var completion: ((TransitionContextDouble) -> Void)?
    @discardableResult func animate(alongsideTransition: ((TransitionContextDouble) -> Void)?,
                                   completion: ((TransitionContextDouble) -> Void)?) -> Bool {
        self.completion = completion
        return true
    }
}
@MainActor class ControllerDouble {
    weak var presenter: GameViewController?
    var isBeingDismissed = false
    var dismissalCompletion: (() -> Void)?
    var transitionCoordinator: TransitionDouble?
    func dismiss(animated: Bool, completion: (() -> Void)? = nil) {
        isBeingDismissed = true
        dismissalCompletion = completion
    }
    func completeDismissal() {
        if presenter?.presentedViewController === self { presenter?.presentedViewController = nil }
        isBeingDismissed = false
        let completion = dismissalCompletion
        dismissalCompletion = nil
        completion?()
        let transition = transitionCoordinator
        transitionCoordinator = nil
        transition?.completion?(TransitionContextDouble(isCancelled: false))
    }
}
@MainActor final class UIAlertAction {
    enum Style { case cancel, `default` }
    let title: String
    let handler: ((UIAlertAction) -> Void)?
    init(title: String, style: Style, handler: ((UIAlertAction) -> Void)? = nil) {
        self.title = title
        self.handler = handler
    }
    func invoke() { handler?(self) }
}
@MainActor final class UIAlertController: ControllerDouble {
    enum Style { case alert }
    let message: String
    var actions: [UIAlertAction] = []
    init(title: String, message: String, preferredStyle: Style) { self.message = message }
    func addAction(_ action: UIAlertAction) { actions.append(action) }
    func select(_ title: String) {
        guard let action = actions.first(where: { $0.title == title }) else { fatalError("Missing action: \(title)") }
        action.invoke()
        if !isBeingDismissed { dismiss(animated: true) }
    }
}
enum PaymentDestination { case localAssets, webActions, remoteTicket }
struct PayRequest {
    let cpOrder: String
    let destination: PaymentDestination
    var price = "49.99"
    init(cpOrder: String, destination: PaymentDestination = .webActions) {
        self.cpOrder = cpOrder
        self.destination = destination
    }
    func resolvedProductId() -> String { "pbm_tier_099" }
}
@MainActor final class EconomyDouble {
    func recordCheckoutResult(productId: String, orderId: String, success: Bool) {}
}
@MainActor final class BillingDouble {
    var originals: [String: PayRequest] = [:]
    var retained: Set<String> = []
    var checkoutBlockingMessage: String?
    var isProcessingPayment = false
    var retries: [String] = []
    func retryRequest(for request: PayRequest?) -> PayRequest? { originals[request?.cpOrder ?? ""] }
    func hasUnresolvedOrder(for request: PayRequest?) -> Bool { retained.contains(request?.cpOrder ?? "") }
    func retryOriginal(_ request: PayRequest) { retries.append(request.cpOrder) }
}
enum PaymentDebugLog { static func record(_ message: String) {} }

@MainActor final class GameViewController {
    let billing = BillingDouble()
    let economy = EconomyDouble()
    let paymentGate = PaymentRequestGate()
    var viewIfLoaded: ViewDouble? = ViewDouble()
    var presentedViewController: ControllerDouble?
    weak var paymentRetryAlert: UIAlertController?
    var paymentRetryOrder = ""
    var paymentSessionRevision = 1
    var lastWebUsername = "test-player"
    var finishingCheckoutOrder: String?
    var toasts: [String] = []
    var callbacks: [(String, String)] = []
    var progress: [String] = []
    var presentations = 0
    func present(_ controller: ControllerDouble, animated: Bool) {
        precondition(presentedViewController == nil)
        controller.presenter = self
        presentedViewController = controller
        presentations += 1
    }
    func showToast(_ message: String, duration: Double = 0) { toasts.append(message) }
    func dismissToast() {}
    func showPaymentProgress(_ request: PayRequest, message: String) { progress.append(request.cpOrder) }
    func showCurrentPaymentProgress() { progress.append("current") }
    func refreshPaymentWaitControl() {}
    func reconcileContentRouteWhenAvailable() {}
    func paymentSubject(_ request: PayRequest?) -> String { request.map { "「\($0.cpOrder)」：" } ?? "" }
    func paymentFields(_ request: PayRequest?, code: String, message: String) -> String { code }
    func callH5(_ method: String, fields: String) { callbacks.append((method, fields)) }
    func sendPaymentResult(_ method: String, request: PayRequest?, fields: String) { callbacks.append((method, fields)) }
    func canPresentPaymentResult(_ request: PayRequest?) -> Bool { paymentGate.canPresent(request?.cpOrder) }
    func pearlOffer(for request: PayRequest?) -> Int? { nil }
    func offer(_ request: PayRequest) { offerOriginalOrderRetry(for: request) }
    func display(_ code: String, retained: Bool) -> String {
        paymentDisplayMessage(code: code, fallback: "fallback", hasRetainedOrder: retained)
    }
    
}

@main struct PresentationTests {
    @MainActor static var count = 0
    @MainActor static func check(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { fatalError(message) }
    }
    @MainActor static func run(_ name: String, _ body: (GameViewController, PayRequest) -> Void) {
        DispatchQueue.main.jobs.removeAll()
        UIApplication.shared.applicationState = .active
        let game = GameViewController()
        let original = PayRequest(cpOrder: "original-A")
        game.billing.originals[original.cpOrder] = original
        game.billing.retained.insert(original.cpOrder)
        body(game, original)
        count += 1
        print("PASS \(name)")
    }
    @MainActor static func presented(_ game: GameViewController, _ original: PayRequest) -> UIAlertController {
        game.offer(original)
        DispatchQueue.main.drain()
        guard let alert = game.presentedViewController as? UIAlertController else { fatalError("Expected retry confirmation") }
        return alert
    }
    @MainActor static func assertNoRetry(_ game: GameViewController) {
        check(game.billing.retries.isEmpty, "A stale or canceled intent must never retry Apple purchase")
    }
    @MainActor static func main() {
        run("wait for dismissal, then retry original exactly once") { game, original in
            let alert = presented(game, original)
            check(alert.message.contains("US$49.99"), "Retain original price tier")
            alert.select("繼續這筆付款")
            assertNoRetry(game)
            check(game.presentedViewController === alert, "Modal still present before completion")
            alert.select("繼續這筆付款")
            assertNoRetry(game)
            let duplicateCompletion = alert.dismissalCompletion
            alert.completeDismissal()
            duplicateCompletion?()
            check(game.billing.retries == [original.cpOrder], "Only one original-order retry")
            check(!game.paymentGate.tryStart("new-B"), "Original retry owns the shared checkout gate")
            check(game.paymentRetryOrder.isEmpty && game.paymentRetryAlert == nil, "Consume dialog intent")
            check(game.billing.retained.contains(original.cpOrder), "UI must not erase original")
        }
        run("return to game does not retry, delete, or reopen") { game, original in
            let alert = presented(game, original)
            alert.select("返回遊戲")
            alert.completeDismissal()
            DispatchQueue.main.drain()
            assertNoRetry(game)
            check(game.billing.retained.contains(original.cpOrder), "Retain unresolved original")
            check(game.paymentRetryOrder.isEmpty && game.paymentRetryAlert == nil, "Clear only dialog state")
            check(game.presentedViewController == nil && game.presentations == 1, "No automatic re-presentation")
        }
        run("UIKit already dismissing: join real completion instead of dropping the action") { game, original in
            let alert = presented(game, original)
            alert.isBeingDismissed = true
            alert.transitionCoordinator = TransitionDouble()
            alert.select("繼續這筆付款")
            assertNoRetry(game)
            alert.select("繼續這筆付款")
            alert.completeDismissal()
            check(game.billing.retries == [original.cpOrder], "Continue exactly once after automatic dismissal")
        }
        run("UIKit already finished dismissal before action callback") { game, original in
            let alert = presented(game, original)
            alert.dismiss(animated: true)
            alert.completeDismissal()
            alert.select("繼續這筆付款")
            check(game.billing.retries == [original.cpOrder], "Already-closed alert must not require a second dismissal")
        }
        run("canceled UIKit dismissal cannot begin a purchase") { game, original in
            let alert = presented(game, original)
            alert.isBeingDismissed = true
            let transition = TransitionDouble()
            alert.transitionCoordinator = transition
            alert.select("繼續這筆付款")
            transition.completion?(TransitionContextDouble(isCancelled: true))
            assertNoRetry(game)
        }
        run("unknown dismissal lifetime fails closed without a guessed timer") { game, original in
            let alert = presented(game, original)
            alert.isBeingDismissed = true
            alert.transitionCoordinator = nil
            alert.select("繼續這筆付款")
            DispatchQueue.main.drain()
            assertNoRetry(game)
            check(game.billing.retained.contains(original.cpOrder), "Missing UI completion must not erase the order")
        }

        let changedWhileDismissing: [(String, (GameViewController, PayRequest) -> Void)] = [
            ("username changed", { game, _ in game.lastWebUsername = "other-player" }),
            ("same username re-login", { game, _ in game.paymentSessionRevision += 1 }),
            ("backgrounded", { _, _ in UIApplication.shared.applicationState = .background }),
            ("view detached", { game, _ in game.viewIfLoaded?.window = nil }),
            ("view unloaded", { game, _ in game.viewIfLoaded = nil }),
            ("another modal", { game, _ in game.presentedViewController = ControllerDouble() }),
            ("original delivered", { game, original in
                game.billing.originals.removeValue(forKey: original.cpOrder)
                game.billing.retained.remove(original.cpOrder)
            }),
            ("success callback cleared intent", { game, _ in game.paymentRetryOrder = "" }),
            ("original replaced", { game, original in
                game.billing.originals[original.cpOrder] = PayRequest(cpOrder: "other-order")
            }),
            ("Apple checkout busy", { game, _ in game.billing.checkoutBlockingMessage = "busy" }),
            ("verification busy", { game, _ in game.billing.isProcessingPayment = true }),
            ("another native checkout", { game, _ in _ = game.paymentGate.tryStart("new-B") }),
        ]
        for (name, change) in changedWhileDismissing {
            run("abort dismissal continuation: \(name)") { game, original in
                let alert = presented(game, original)
                alert.select("繼續這筆付款")
                change(game, original)
                alert.completeDismissal()
                assertNoRetry(game)
            }
        }
        run("another adapter checkout remains locked to its owner") { game, original in
            let alert = presented(game, original)
            alert.select("繼續這筆付款")
            _ = game.paymentGate.tryStart("new-B")
            alert.completeDismissal()
            assertNoRetry(game)
            check(game.paymentGate.canPresent("new-B"), "Keep the other adapter as checkout owner")
            check(!game.paymentGate.tryStart("new-C"), "Do not release another adapter checkout")
        }
        run("stale completion cannot clear a newer retry dialog") { game, original in
            let old = presented(game, original)
            old.select("繼續這筆付款")
            let newer = UIAlertController(title: "new", message: "new", preferredStyle: .alert)
            game.paymentRetryAlert = newer
            game.paymentRetryOrder = "new-B"
            old.completeDismissal()
            assertNoRetry(game)
            check(game.paymentRetryAlert === newer && game.paymentRetryOrder == "new-B", "Preserve newer intent")
        }

        let changedWhileQueued: [(String, (GameViewController, PayRequest) -> Void)] = [
            ("username", { game, _ in game.lastWebUsername = "other-player" }),
            ("session", { game, _ in game.paymentSessionRevision += 1 }),
            ("background", { _, _ in UIApplication.shared.applicationState = .background }),
            ("view", { game, _ in game.viewIfLoaded?.window = nil }),
            ("modal", { game, _ in game.presentedViewController = ControllerDouble() }),
            ("Apple checkout", { game, _ in game.billing.checkoutBlockingMessage = "busy" }),
            ("verification", { game, _ in game.billing.isProcessingPayment = true }),
            ("native checkout", { game, _ in _ = game.paymentGate.tryStart("new-B") }),
            ("original resolved", { game, original in game.billing.originals.removeValue(forKey: original.cpOrder) }),
        ]
        for (name, change) in changedWhileQueued {
            run("suppress queued confirmation after changed \(name)") { game, original in
                game.offer(original)
                change(game, original)
                DispatchQueue.main.drain()
                check(game.presentations == 0, "Stale confirmation must not cover new UI")
                assertNoRetry(game)
            }
        }
        run("two queued retry requests present just one alert") { game, original in
            game.offer(original)
            game.offer(original)
            DispatchQueue.main.drain()
            check(game.presentations == 1, "Duplicate queued requests must not stack modals")
            assertNoRetry(game)
        }
        run("sheet interruption preserves pending callback without purchase or modal") { game, original in
            _ = game.paymentGate.tryStart(original.cpOrder)
            game.onError(original, code: "APP_STORE_SHEET_INTERRUPTED", message: "sheet unknown")
            DispatchQueue.main.drain()
            check(game.callbacks.first?.0 == "onPayPending", "Uncertain original is pending, not canceled/failed")
            check(game.presentations == 0, "Interruption must not auto-offer another purchase")
            check(game.toasts.last?.contains("不會自動重新付款") == true, "State recovery clearly")
            check(game.paymentGate.tryStart("new-B"), "Release native checkout for another product")
            check(game.billing.retained.contains(original.cpOrder), "Release is not deleting original")
            assertNoRetry(game)
        }
        run("error cannot release still-active Apple sheet") { game, original in
            game.billing.checkoutBlockingMessage = "busy"
            game.onError(original, code: "APP_STORE_SHEET_INTERRUPTED", message: "unknown")
            check(game.billing.checkoutBlockingMessage == "busy", "UI error cannot release the Apple checkout lock")
            game.billing.checkoutBlockingMessage = nil
            game.onCheckoutReleased(original)
            check(game.billing.retained.contains(original.cpOrder), "Checkout completion keeps the undelivered order")
            check(!game.toasts.contains(where: { $0.contains("已到帳") }), "Release is not delivery")
        }
        run("old callback cannot overwrite or unlock a new product checkout") { game, original in
            _ = game.paymentGate.tryStart("new-B")
            _ = game.paymentGate.tryStart("new-B")
            game.onError(original, code: "APP_STORE_SHEET_INTERRUPTED", message: "old result")
            game.onCheckoutReleased(original)
            check(game.toasts.isEmpty, "No old toast covering current progress")
            check(game.paymentGate.canPresent("new-B"), "Preserve current adapter owner")
            check(!game.paymentGate.tryStart("new-C"), "Preserve current native order")
        }
        run("public cancellation with no original clears result without recovery warning") { game, original in
            game.billing.retained.removeAll()
            _ = game.paymentGate.tryStart(original.cpOrder)
            game.onCancel(original)
            game.onCheckoutReleased(original)
            DispatchQueue.main.drain()
            check(game.callbacks.first?.0 == "onPayCancel", "Keep H5 cancellation contract")
            check(game.toasts.last?.contains("付款視窗已關閉") == true, "Use a neutral closed-sheet result")
            check(game.toasts.last?.contains("已保留") == false, "Do not invent retained orders")
            check(game.toasts.last?.contains("未扣款") == false, "Do not assert bank state")
            check(game.paymentGate.tryStart("new-B"), "Next product can proceed")
            check(game.presentations == 0, "No cancellation retry loop")
            assertNoRetry(game)
        }
        run("canceling retry does not cancel the earlier uncertain original") { game, original in
            game.onCancel(original)
            check(game.callbacks.first?.0 == "onPayPending", "Earlier uncertain payment remains pending")
            check(game.billing.retained.contains(original.cpOrder), "Earlier journal entry remains")
            check(game.toasts.last?.contains("先前訂單仍待核對") == true, "Distinguish this canceled attempt from earlier original")
            assertNoRetry(game)
        }
        run("pre-order service failure does not invent a saved original") { game, original in
            game.billing.retained.removeAll()
            game.onError(original, code: "APP_STORE_TEMPORARILY_UNAVAILABLE", message: "query unavailable")
            check(game.callbacks.first?.0 == "onPayFail", "No retained order recovery callback")
            check(game.toasts.last?.contains("原訂單") == false, "No false retained-order warning")
            assertNoRetry(game)
        }
        for code in ["APP_STORE_TEMPORARILY_UNAVAILABLE", "APP_STORE_AUTHENTICATION_FAILED",
                     "APP_STORE_CONNECTION_INTERRUPTED", "APP_STORE_SHEET_INTERRUPTED",
                     "STOREKIT_ERROR", "STOREKIT_UNKNOWN", "NETWORK_ERROR", "HTTP_0"] {
            run("message reflects actual retained context: \(code)") { game, _ in
                let retained = game.display(code, retained: true)
                let noOrder = game.display(code, retained: false)
                check(retained.contains("原訂單"), "Retained uncertainty must preserve original guidance")
                check(!noOrder.contains("原訂單") && !noOrder.contains("已保留"), "Do not invent an order")
                for message in [retained, noOrder] {
                    check(!message.contains("已到帳") && !message.contains("未扣款"), "Unknown is neither delivery nor no debit")
                    check(!message.contains("已取消"), "Do not label service errors as explicit cancellation")
                }
            }
        }
        print("Payment presentation behavior: \(count) tests passed (UIKit doubles; no real purchases).")
    }
}
