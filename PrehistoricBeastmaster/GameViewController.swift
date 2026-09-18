import Network
import UIKit

final class GameViewController: UIViewController, H5BridgeHost, StoreKitManager.Listener {
    private var webView: TrustedWebView!
    private let billing = StoreKitManager()
    private let contentConfigManager = ContentConfigManager()
    private let paymentGate = PaymentRequestGate()
    private let analyticsEvents = AnalyticsEventCoordinator()
    private var contentConfig = ContentConfig()
    private var contentRouteReleased = false
    private var localMediaSuspended = false
    private var lastWebUsername = ""
    private let pathMonitor = NWPathMonitor()
    private var networkWasSatisfied = false
    private var toastView: UIView?
    private var toastDismissal: DispatchWorkItem?
    private weak var paymentRetryAlert: UIAlertController?
    private var paymentRetryOrder = ""
    private var paymentSessionRevision = 0
    private var currentPaymentProgress = "付款處理中，請稍候…"
    private var finishingCheckoutOrder: String?
    private var visibleProgressMessage: String?
    private let stopPaymentCheckButton = UIButton(type: .system)
    #if DEBUG
    private var openedLaunchDiagnostics = false
    #endif

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    var canPresentTrackingAuthorization: Bool {
        viewIfLoaded?.window != nil && presentedViewController == nil
            && !billing.isProcessingPayment && billing.checkoutBlockingMessage == nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        webView = TrustedWebView(host: self)
        webView.onCheckoutBusy = { [weak self] in
            guard let self else { return }
            self.showToast(self.billing.checkoutBlockingMessage ?? "正在建立付款訂單，請稍候…")
        }
        webView.onNavigationBlocked = { [weak self] in
            // A blocked link is not an Apple payment failure. Do not release
            // the checkout gate, cancel a transaction, or emit a payment result.
            self?.showToast("此連結未在 iOS 版開放；儲值請在遊戲商品頁使用 App Store 付款", duration: 5)
        }
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.onPrivacyPolicyRequested = { [weak self] in self?.showPrivacyPolicy() }
        webView.onPageFinished = { [weak self] url in self?.onWebPageFinished(url) }
        view.addSubview(webView)
        NotificationCenter.default.addObserver(self, selector: #selector(suspendLocalMenuMusic), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeLocalMenuMusic), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(pushLowPowerState), name: .NSProcessInfoPowerStateDidChange, object: nil)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        billing.listener = self
        installPaymentWaitControl()
        billing.start()
        NotificationCenter.default.addObserver(self, selector: #selector(recoverPaymentsOnForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
        startNetworkMonitoring()
        initializeContentRoute()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        #if DEBUG
        if !openedLaunchDiagnostics, ProcessInfo.processInfo.environment["PBM_PAYMENT_DIAGNOSTICS"] == "1" {
            openedLaunchDiagnostics = true
            openPaymentDiagnostics()
        }
        #endif
        (UIApplication.shared.delegate as? AppDelegate)?.requestTrackingAuthorizationIfNeeded(UIApplication.shared)
        Task { await billing.resumePurchases(); refreshPaymentWaitControl() }
        contentConfigManager.refresh(force: false) { [weak self] config in
            self?.onContentConfigResolved(config)
        }
    }

    deinit {
        toastDismissal?.cancel()
        NotificationCenter.default.removeObserver(self)
        pathMonitor.cancel()
        contentConfigManager.destroy()
    }

    @objc private func suspendLocalMenuMusic() {
        guard let url = webView.url, isLocalGameCenter(url) else { return }
        localMediaSuspended = true
        webView.evaluate("window.setShellAppActive?.(false)")
        webView.setAllMediaPlaybackSuspended(true, completionHandler: nil)
    }

    @objc private func resumeLocalMenuMusic() {
        guard localMediaSuspended else { return }
        localMediaSuspended = false
        webView.setAllMediaPlaybackSuspended(false) { [weak self] in
            guard let self, UIApplication.shared.applicationState == .active,
                  let url = self.webView.url, self.isLocalGameCenter(url) else { return }
            self.webView.evaluate("window.setShellAppActive?.(true)")
            self.pushLowPowerState()
        }
    }

    @objc private func pushLowPowerState() {
        guard let url = webView.url, isLocalGameCenter(url) else { return }
        webView.evaluate("window.setShellLowPowerMode?.(\(ProcessInfo.processInfo.isLowPowerModeEnabled ? "true" : "false"))")
    }

    func onH5Ready() {
        installPaymentBridge()
        updateSdkStatus()
        callH5("initSuccess", fields: JSONObject())
    }

    func onAccountSession(_ json: String) {
        let account = JSONObject.parse(json)
        if accountUsername(account) != lastWebUsername {
            paymentSessionRevision += 1
            paymentRetryAlert?.dismiss(animated: true)
            finishingCheckoutOrder = nil
        }
        rememberWebUsername(accountUsername(account))
        analyticsEvents.onAccountSession(json)
    }

    func onLoginRequested() {
        webView.evaluate(InjectedScripts.paymentBridge)
        webView.evaluate(InjectedScripts.webSdkLogin(appId: ShellConfig.backendAppId, channel: ShellConfig.webSdkChannel))
    }

    func onLogoutRequested() {
        paymentSessionRevision += 1
        paymentRetryAlert?.dismiss(animated: true)
        finishingCheckoutOrder = nil
        lastWebUsername = ""
        analyticsEvents.onLogout()
        callH5("changeUserSuccess", fields: JSONObject())
    }

    func onBindingPhoneRequested() {
        showToast("目前不支援手機綁定")
    }

    func onPayRequested(_ json: String) {
        PaymentDebugLog.record("h5-pay-received")
        // Do not open a new UI request or emit a failure while Apple's previous
        // call is still returning, even when that order has already delivered.
        if let message = billing.checkoutBlockingMessage {
            PaymentDebugLog.record("h5-pay-blocked reason=apple-checkout-active")
            showToast(message, duration: 5)
            return
        }
        let request: PayRequest
        do {
            request = try PayRequest(json: json, fallbackUsername: lastWebUsername)
        } catch {
            PaymentDebugLog.record("h5-pay-invalid code=INVALID_PAYMENT_REQUEST")
            reportPaymentFailure(
                nil,
                code: "INVALID_PAYMENT_REQUEST",
                message: "支付資料不完整，請重新進入商品頁後再試"
            )
            return
        }
        guard paymentGate.tryStart(request.cpOrder) else {
            PaymentDebugLog.record("h5-pay-blocked code=PAYMENT_IN_PROGRESS")
            // Another tap is not a failed/cancelled payment. Keep the original
            // game order intact and the same progress visible until its result.
            showCurrentPaymentProgress()
            return
        }
        let diagnosticServer = request.serverId.allSatisfy({ $0.isNumber }) ? request.serverId : "unknown"
        PaymentDebugLog.record("h5-pay-parsed product=\(request.resolvedProductId()) server=\(diagnosticServer) goods=\(request.goodsId) price=\(request.price) usernamePresent=\(!request.username.isEmpty)")
        guard webView.beginGameOrderCheckout(request.cpOrder) else {
            paymentGate.finish(request.cpOrder)
            showToast("正在處理先前的付款請求，請稍候…")
            return
        }
        showPaymentProgress(request, message: "正在準備付款…")
        billing.launch(request)
    }

    func onGameOrderFailed(_ json: String) {
        // This is the H5 game's order-creation step, before any native checkout.
        // Never mark an existing Apple transaction failed or release its gate.
        guard paymentGate.canPresent(nil) else { return }
        let reason = JSONObject.parse(json).string("reason")
        let message = reason == "network" || reason == "http"
            ? "遊戲訂單暫時無法連線，尚未發起付款，請稍後再試"
            : "遊戲訂單建立失敗，尚未發起付款，請稍後再試"
        showToast(message, duration: 5)
    }

    func onRoleReported(_ json: String) {
        billing.prepareForCheckout()
        analyticsEvents.onRoleReported(json)
    }

    func onAnalyticsEvent(_ name: String, json: String?) {
        analyticsEvents.onH5Event(name, json: json)
    }

    func openExternalURL(_ url: String) {
        guard let parsed = URL(string: url) else { return }
        // The bridge uses the same allowlist as links, popups and redirects.
        webView.openApprovedExternalURL(parsed)
    }

    private func showPrivacyPolicy() {
        guard viewIfLoaded?.window != nil, presentedViewController == nil else { return }
        guard !billing.isProcessingPayment, billing.checkoutBlockingMessage == nil else {
            showToast("請先完成目前的付款操作，再查看隱私政策")
            return
        }
        let navigation = UINavigationController(rootViewController: PrivacyPolicyViewController())
        navigation.modalPresentationStyle = .fullScreen
        present(navigation, animated: true)
    }

    func openMainGame() {
        if currentContentMode() == .miniOnly {
            showToast("目前渠道僅開放小遊戲")
            return
        }
        if let url = ShellConfig.onlineGameURL {
            webView.loadTrustedURL(url)
        }
    }

    func returnToGameCenter() {
        if currentContentMode() == .onlineOnly {
            return
        }
        webView.loadLocalGame()
    }

    func onPaymentProgress(_ request: PayRequest?, message: String) {
        // Progress is not a payment result and must not release the H5 tap gate.
        refreshPaymentWaitControl()
        showPaymentProgress(request, message: message)
    }

    func onCheckoutStarted(_ request: PayRequest, _ productInfo: StoreKitManager.ProductInfo) {
        refreshPaymentWaitControl()
        showPaymentProgress(request, message: "正在等待 App Store 付款，請勿重複點擊…")
        PaymentDebugLog.record("checkout-started product=\(productInfo.productId)")
        analyticsEvents.onCheckoutStarted(request, productInfo)
    }

    func onCheckoutReleased(_ request: PayRequest) {
        webView.endGameOrderCheckout(request.cpOrder)
        refreshPaymentWaitControl()
        guard finishingCheckoutOrder == request.cpOrder else { return }
        finishingCheckoutOrder = nil
        guard paymentGate.canPresent(request.cpOrder) else { return }
        showToast(paymentSubject(request) + "已到帳，可繼續選購")
    }

    func onSuccess(_ request: PayRequest?, orderId: String, transactionId: String, productInfo: StoreKitManager.ProductInfo) {
        let showResult = paymentGate.canPresent(request?.cpOrder)
        refreshPaymentWaitControl()
        if paymentRetryOrder == request?.cpOrder {
            paymentRetryAlert?.dismiss(animated: true)
            paymentRetryOrder = ""
        }
        PaymentDebugLog.record("ui-payment-success product=\(productInfo.productId) transaction=\(transactionId)")
        if let request {
            paymentGate.finish(request.cpOrder)
        }
        analyticsEvents.onPurchaseSuccess(
            request,
            orderId: orderId,
            transactionId: transactionId,
            productInfo: productInfo
        )
        var fields = paymentFields(request, code: "0", message: "Payment verified and delivered")
        fields.put("orderId", orderId)
        fields.put("transactionId", transactionId)
        callH5("onPayResult", fields: fields)
        if showResult {
            if let request, billing.isCheckoutDelivered(request), billing.checkoutBlockingMessage != nil {
                finishingCheckoutOrder = request.cpOrder
                showPaymentProgress(request, message: "付款成功，獎勵已到帳；App Store 正在結束付款流程…")
            } else {
                showToast(paymentSubject(request) + "付款成功，獎勵已到帳")
            }
        }
    }

    func onPending(_ request: PayRequest?) {
        let showResult = paymentGate.canPresent(request?.cpOrder)
        refreshPaymentWaitControl()
        PaymentDebugLog.record("ui-payment-pending")
        paymentGate.finish(request?.cpOrder ?? "")
        callH5("onPayPending", fields: paymentFields(request, code: "PENDING", message: "Payment is pending"))
        if showResult { showToast(paymentSubject(request) + "付款待確認，請勿重複購買") }
    }

    func onCancel(_ request: PayRequest?) {
        let showResult = paymentGate.canPresent(request?.cpOrder)
        refreshPaymentWaitControl()
        PaymentDebugLog.record("ui-payment-not-completed source=storekit-cancel actualUserAction=unknown")
        paymentGate.finish(request?.cpOrder ?? "")
        if billing.hasUnresolvedOrder(for: request) {
            callH5("onPayPending", fields: paymentFields(request, code: "PURCHASE_RECOVERY_REQUIRED", message: "Retry canceled; original order still needs recovery"))
            if showResult { showToast(paymentSubject(request) + "本次付款已結束，先前訂單仍待核對；不會自動重新付款", duration: 5) }
            return
        }
        // Keep the H5 cancellation contract, but do not claim that the user
        // pressed Cancel or that no debit occurred based on this result alone.
        callH5("onPayCancel", fields: paymentFields(request, code: "USER_CANCELED", message: "App Store did not complete this payment"))
        if showResult { showToast(paymentSubject(request) + "App Store 未完成這次付款，付款視窗已關閉", duration: 5) }
    }

    func onError(_ request: PayRequest?, code: String, message: String) {
        // Some validation failures return before the StoreKit launch task exists.
        // Only that request may release the earlier PHP gate.
        if billing.checkoutBlockingMessage == nil, let request {
            webView.endGameOrderCheckout(request.cpOrder)
        }
        let showResult = paymentGate.canPresent(request?.cpOrder)
        refreshPaymentWaitControl()
        PaymentDebugLog.record("ui-payment-error code=\(code) message=\(message)")
        paymentGate.finish(request?.cpOrder ?? "")
        if code == "PAYMENT_IN_PROGRESS" || code == "PURCHASE_RECOVERY_IN_PROGRESS" {
            // This attempt never started a new purchase. Do not tell H5 that
            // Apple's still-active original payment failed.
            if showResult { showToast(billing.checkoutBlockingMessage ?? "App Store 正在處理，請稍候再操作") }
            return
        }
        // A lost Apple reply or pending delivery is not a definitive failure of
        // the original game order. Do not tell H5 to cancel that order.
        if code != "PURCHASE_ALREADY_PROCESSED" {
            let callback = billing.hasUnresolvedOrder(for: request) ? "onPayPending" : "onPayFail"
            callH5(callback, fields: paymentFields(request, code: code, message: message))
        }
        guard showResult else { return }
        // Only an explicit second tap on an unresolved product offers purchase
        // retry. Ordinary errors/foreground recovery do not stack modal alerts.
        if code == "PURCHASE_RECOVERY_REQUIRED", billing.retryRequest(for: request) != nil {
            hideToast()
            offerOriginalOrderRetry(for: request)
        } else {
            showToast(paymentSubject(request) + paymentDisplayMessage(code: code, fallback: message,
                hasRetainedOrder: billing.hasUnresolvedOrder(for: request)), duration: 5)
        }
    }

    private func offerOriginalOrderRetry(for request: PayRequest?) {
        guard let original = billing.retryRequest(for: request) else { return }
        let usernameAtPresentation = lastWebUsername
        let sessionAtPresentation = paymentSessionRevision
        // Let Apple's sheet dismiss first. Never stack another modal or retry
        // automatically on a timer, on foregrounding, or on a transaction update.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.viewIfLoaded?.window != nil,
                  UIApplication.shared.applicationState == .active,
                  self.presentedViewController == nil,
                  self.lastWebUsername == usernameAtPresentation,
                  self.paymentSessionRevision == sessionAtPresentation,
                  self.billing.checkoutBlockingMessage == nil, !self.billing.isProcessingPayment,
                  self.paymentGate.canPresent(original.cpOrder),
                  self.billing.retryRequest(for: request)?.cpOrder == original.cpOrder else { return }
            let tier = "US$\(original.price) 檔商品"
            let alert = UIAlertController(title: "確認原訂單",
                message: "\(self.paymentSubject(original))\(tier) 的原訂單仍待確認。若已確認付款或收到扣款通知，請返回遊戲並聯絡客服，勿再次付款。繼續會先核對原訂單，再由您確認是否付款；不會建立新訂單。",
                preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "返回遊戲", style: .cancel) { [weak self, weak alert] _ in
                guard let self, let alert, self.paymentRetryAlert === alert else { return }
                self.paymentRetryAlert = nil
                self.paymentRetryOrder = ""
            })
            var retrySelected = false
            alert.addAction(UIAlertAction(title: "繼續這筆付款", style: .default) { [weak self, weak alert] _ in
                guard let self, let alert, self.paymentRetryAlert === alert,
                      !retrySelected else { return }
                retrySelected = true
                let continueRetry: () -> Void = { [weak self] in
                    self?.continueOriginalOrderRetry(original, from: alert,
                        usernameAtPresentation: usernameAtPresentation,
                        sessionAtPresentation: sessionAtPresentation)
                }
                // Action selection is not proof that dismissal has completed.
                // Join UIKit's transition if it already started; otherwise dismiss
                // explicitly. Never use a guessed delay or open a second sheet early.
                if alert.isBeingDismissed {
                    guard let coordinator = alert.transitionCoordinator else { return }
                    coordinator.animate(alongsideTransition: nil) { context in
                        guard !context.isCancelled else { return }
                        continueRetry()
                    }
                } else if self.presentedViewController !== alert {
                    continueRetry()
                } else {
                    alert.dismiss(animated: true, completion: continueRetry)
                }
            })
            self.paymentRetryAlert = alert
            self.paymentRetryOrder = original.cpOrder
            self.present(alert, animated: true)
        }
    }

    private func continueOriginalOrderRetry(_ original: PayRequest, from alert: UIAlertController,
                                           usernameAtPresentation: String, sessionAtPresentation: Int) {
        // A late success or a newer dialog invalidates this continuation. Consume
        // the intent once; this only clears UI state, never the retained order.
        guard paymentRetryAlert === alert, paymentRetryOrder == original.cpOrder else { return }
        paymentRetryAlert = nil
        paymentRetryOrder = ""
        guard viewIfLoaded?.window != nil, UIApplication.shared.applicationState == .active,
              presentedViewController == nil, lastWebUsername == usernameAtPresentation,
              paymentSessionRevision == sessionAtPresentation,
              billing.retryRequest(for: original)?.cpOrder == original.cpOrder else { return }
        if let message = billing.checkoutBlockingMessage {
            showToast(message)
            return
        }
        guard !billing.isProcessingPayment else {
            showToast("正在核對付款結果，請稍候再操作")
            return
        }
        guard paymentGate.tryStart(original.cpOrder) else {
            showCurrentPaymentProgress()
            return
        }
        guard webView.beginGameOrderCheckout(original.cpOrder) else {
            paymentGate.finish(original.cpOrder)
            showToast("正在處理先前的付款請求，請稍候…")
            return
        }
        showPaymentProgress(original, message: "正在檢查原訂單…")
        billing.retryOriginal(original)
    }

    private func reportPaymentFailure(_ request: PayRequest?, code: String, message: String) {
        callH5("onPayFail", fields: paymentFields(request, code: code, message: message))
        showToast(message)
    }

    private func paymentDisplayMessage(code: String, fallback: String, hasRetainedOrder: Bool) -> String {
        switch code {
        case "PAYMENT_IN_PROGRESS", "PURCHASE_RECOVERY_IN_PROGRESS":
            return "上一筆支付仍在處理，請稍候"
        case "STORE_AUTHENTICATION_IN_PROGRESS":
            return "App Store 登入仍在處理，請先完成或取消系統登入視窗"
        case "STOREFRONT_CHANGED":
            return "App Store 地區已變更，請重新點選商品"
        case "ORIGINAL_PRICE_CHANGED":
            return "原商品價格已變更，請先核對原訂單，勿重複購買"
        case "USERNAME_REQUIRED":
            return "登入狀態已失效，請重新登入後再支付"
        case "PRICE_TIER_NOT_CONFIGURED", "PRODUCT_MAPPING_MISSING":
            return "此商品尚未完成 App Store 設定"
        case "PRODUCT_NOT_FOUND":
            return "App Store 尚未返回此商品，本次未建立訂單、未扣款"
        case "RETRY_PRODUCT_NOT_FOUND":
            return "暫時無法查詢原商品，原訂單仍已保留，請稍後再檢查"
        case "PURCHASE_CONTEXT_MISSING":
            return "偵測到未完成訂單，請聯絡客服核對"
        case "PURCHASE_RECOVERY_REQUIRED":
            return "此商品的原訂單仍待確認，請勿重複購買；其他商品的付款結果不受影響"
        case "ORDER_STATUS_UNAVAILABLE":
            return "暫時無法核對此商品的原訂單，尚未再次發起付款；請稍後再試，若已扣款請勿重買"
        case "ORIGINAL_PAYMENT_UNCONFIRMED":
            return "此商品的原訂單付款結果仍待確認，暫不再次發起付款；若已扣款請勿重買"
        case "PAYMENT_CHECK_TIMEOUT":
            return "檢查舊交易逾時，本次尚未開啟付款；原訂單保留，請稍後再試"
        case "PAYMENT_CHECK_STOPPED":
            return "已停止等待，本次尚未開啟付款；原訂單保留"
        case "PURCHASE_STORAGE_UNAVAILABLE":
            return "訂單紀錄暫時無法讀寫，已停止付款以保護原交易，請聯絡客服"
        case "ORDER_IDENTITY_CONFLICT":
            return "伺服器返回重複的訂單標識，本次尚未付款，請聯絡客服核對"
        case "PURCHASE_ALREADY_PROCESSED":
            return "原訂單已處理完成，本次沒有再次購買"
        case "STOREKIT_PREVIOUS_TRANSACTION":
            return "App Store 返回的是另一筆舊交易，此商品尚未確認付款，請勿重複購買；若持續未完成，請聯絡客服"
        case "APP_STORE_TEMPORARILY_UNAVAILABLE":
            return hasRetainedOrder
                ? "App Store 暫時無法回應，原訂單仍待核對，請勿重複付款"
                : "App Store 暫時無法回應，請稍後再試"
        case "APP_STORE_AUTHENTICATION_FAILED":
            return hasRetainedOrder
                ? "App Store 認證未完成，原訂單仍待核對，請勿重複付款"
                : "App Store 認證未完成，請檢查登入狀態後再試"
        case "APP_STORE_CONNECTION_INTERRUPTED":
            return hasRetainedOrder
                ? "App Store 付款服務暫時中斷，系統會核對原訂單；不會自動重新付款"
                : "App Store 付款服務暫時中斷，請稍後再試"
        case "APP_STORE_SHEET_INTERRUPTED":
            return hasRetainedOrder
                ? "付款視窗未完成，原訂單已保留，系統會嘗試核對；不會自動重新付款"
                : "付款視窗未返回結果，請稍後再試；若已確認付款，請聯絡客服核對"
        case "STOREKIT_ERROR", "STOREKIT_UNKNOWN":
            return hasRetainedOrder
                ? "App Store 未返回付款結果，原訂單已保留，請勿重複付款"
                : "App Store 暫時無法完成請求，請稍後再試"
        case "DELIVERY_PENDING":
            return "App Store 交易已確認，獎勵仍在發放中，請勿重複購買"
        case "DELIVERY_RETRY_SCHEDULED":
            return "App Store 交易已確認，正在自動重試驗單與補發，請勿重複購買"
        case "DELIVERY_RETRY_EXHAUSTED":
            return "自動補發暫未完成，原交易已保留。請聯絡客服核對，勿重複購買"
        case "DELIVERY_REVIEW_REQUIRED":
            return "原交易已保留，驗證仍需核對。請聯絡客服，勿重複購買"
        case "TRANSACTION_MISMATCH", "ACCOUNT_MISMATCH":
            return "交易與原訂單資料不一致，請聯絡客服核對，勿重複購買"
        case "NETWORK_ERROR", "HTTP_0":
            return hasRetainedOrder
                ? "網路連線異常，原訂單仍待核對，請勿重複付款"
                : "網路連線異常，請稍後再試"
        case "SERVER_REJECTED":
            return "訂單驗證失敗，請稍後再試"
        default:
            return fallback.isEmpty ? "支付失敗，請稍後再試" : fallback
        }
    }

    private func initializeContentRoute() {
        contentConfig = contentConfigManager.cachedOrDefault()
        contentConfigManager.refresh(force: true) { [weak self] config in
            self?.onContentConfigResolved(config)
        }
        releaseContentRoute()
    }

    private func onContentConfigResolved(_ next: ContentConfig) {
        if !contentRouteReleased {
            contentConfig = next
            return
        }
        applyContentConfig(next)
    }

    private func releaseContentRoute() {
        guard !contentRouteReleased else { return }
        contentRouteReleased = true
        applyContentConfig(contentConfig)
    }

    private func applyContentConfig(_ next: ContentConfig) {
        let previous = contentConfig.mode
        contentConfig = next
        updateSdkStatus()
        if previous == next.mode, webView.url != nil {
            applyLocalContentMode()
            return
        }
        if next.mode == .onlineOnly, let url = ShellConfig.onlineGameURL {
            webView.loadTrustedURL(url)
        } else {
            webView.loadLocalGame()
        }
    }

    private func onWebPageFinished(_ url: String) {
        guard let parsed = URL(string: url) else { return }
        if isLocalGameCenter(parsed) {
            applyLocalContentMode()
            pushLowPowerState()
            return
        }
        let host = parsed.host ?? ""
        if host.caseInsensitiveCompare("xundaocdn.xmw520.com") == .orderedSame
            || host.caseInsensitiveCompare("saftcdn.antieh.com") == .orderedSame {
            webView.evaluate(InjectedScripts.hideWebDebugUI)
            installPaymentBridge()
            if currentContentMode().allowsMiniGame {
                webView.evaluate(InjectedScripts.returnToGameCenter)
            }
        }
    }

    private func applyLocalContentMode() {
        guard let url = webView.url, isLocalGameCenter(url) else { return }
        webView.evaluate(InjectedScripts.contentMode(contentConfig.mode.javascriptValue))
    }

    private func isLocalGameCenter(_ url: URL) -> Bool {
        url.isFileURL && url.lastPathComponent == "index.html"
    }

    private func currentContentMode() -> ContentMode {
        contentConfig.mode
    }

    private func installPaymentBridge() {
        webView.evaluate(InjectedScripts.paymentBridge)
    }

    private func updateSdkStatus() {
        var status = JSONObject()
        status.put("appId", ShellConfig.backendAppId)
        status.put("channel", ShellConfig.channel)
        status.put("accountLoginConfigured", true)
        status.put("loginMode", "web_sdk")
        status.put("googleConfigured", false)
        status.put("facebookConfigured", false)
        status.put("facebookAnalyticsConfigured", analyticsEvents.isFacebookConfigured)
        status.put("firebaseAnalyticsConfigured", analyticsEvents.isFirebaseConfigured)
        status.put("loginServerConfigured", false)
        status.put("contentMode", currentContentMode().rawValue)
        status.put("contentConfigRevision", contentConfig.revision)
        status.put("contentConfigUpdatedAt", contentConfig.updatedAt)
        status.put("contentConfigEndpointConfigured", !ShellConfig.contentConfigEndpoint.isEmpty)
        status.put("store", "app_store")
        webView.evaluate(InjectedScripts.sdkStatus(status.jsonString()))
    }

    private func callH5(_ function: String, fields: JSONObject) {
        var result = fields
        result.put("func", function)
        webView.evaluate(InjectedScripts.javaCallBack(result.jsonString()))
    }

    private func rememberWebUsername(_ username: String) {
        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        lastWebUsername = trimmed
        webView.evaluate(InjectedScripts.rememberUsername(trimmed))
    }

    private func accountUsername(_ value: JSONObject) -> String {
        let direct = ShellText.firstNonBlank(value.string("user_name"), value.string("username"), value.string("userName"))
        if !direct.isEmpty { return direct }
        guard let nested = value.jsonObject("data") else { return "" }
        return ShellText.firstNonBlank(nested.string("user_name"), nested.string("username"), nested.string("userName"))
    }

    private func paymentFields(_ request: PayRequest?, code: String, message: String) -> JSONObject {
        var fields = JSONObject()
        fields.put("code", code)
        fields.put("message", message)
        if let request {
            fields.put("cpOrder", request.cpOrder)
            fields.put("productId", request.resolvedProductId())
        }
        return fields
    }

    private func paymentSubject(_ request: PayRequest?) -> String {
        guard let request else { return "" }
        let name = request.goodsName.components(separatedBy: .newlines).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return "「\(String(name.prefix(28)))」：" }
        return request.goodsId > 0 ? "商品 \(request.goodsId)：" : "US$\(request.price) 檔商品："
    }

    private func showPaymentProgress(_ request: PayRequest?, message: String) {
        guard paymentGate.canPresent(request?.cpOrder) else { return }
        currentPaymentProgress = paymentSubject(request) + message
        showCurrentPaymentProgress()
    }

    private func showCurrentPaymentProgress() {
        guard visibleProgressMessage != currentPaymentProgress || toastView == nil else { return }
        showToast(currentPaymentProgress, duration: 0)
        visibleProgressMessage = currentPaymentProgress
    }

    private func showToast(_ message: String, duration: TimeInterval = 3.5) {
        // A toast must never occupy the modal presenter used by StoreKit or hide
        // a fast failure behind an earlier progress alert. The latest status wins.
        hideToast()
        let bubble = UIView()
        bubble.backgroundColor = UIColor(white: 0.1, alpha: 0.95)
        bubble.layer.cornerRadius = 14
        bubble.isUserInteractionEnabled = false
        bubble.translatesAutoresizingMaskIntoConstraints = false
        let label = UILabel()
        label.text = message.isEmpty ? "支付失敗，請稍後再試" : message
        label.textColor = .white
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        bubble.addSubview(label)
        view.addSubview(bubble)
        NSLayoutConstraint.activate([
            bubble.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            bubble.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            bubble.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            bubble.widthAnchor.constraint(lessThanOrEqualToConstant: 520),
            bubble.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28),
            label.leadingAnchor.constraint(equalTo: bubble.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: bubble.trailingAnchor, constant: -16),
            label.topAnchor.constraint(equalTo: bubble.topAnchor, constant: 12),
            label.bottomAnchor.constraint(equalTo: bubble.bottomAnchor, constant: -12)
        ])
        toastView = bubble
        UIAccessibility.post(notification: .announcement, argument: label.text)
        // Non-modal progress stays visible while Apple is opening/authenticating.
        // Only a real result/next phase dismisses it; this is not a payment timer.
        guard duration > 0 else { return }
        let dismissal = DispatchWorkItem { [weak self, weak bubble] in
            guard let self, let bubble, self.toastView === bubble else { return }
            self.hideToast()
        }
        toastDismissal = dismissal
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: dismissal)
    }

    private func hideToast() {
        visibleProgressMessage = nil
        toastDismissal?.cancel()
        toastDismissal = nil
        toastView?.removeFromSuperview()
        toastView = nil
    }

    // Payment troubleshooting controls are not created or registered in the
    // game view. Only the temporary preflight stop control remains available.
    private func installPaymentWaitControl() {
        var stopConfig = UIButton.Configuration.tinted()
        stopConfig.title = "停止等待"
        stopConfig.baseForegroundColor = .white
        stopConfig.baseBackgroundColor = .systemOrange
        stopConfig.cornerStyle = .capsule
        stopPaymentCheckButton.configuration = stopConfig
        stopPaymentCheckButton.accessibilityIdentifier = "stop-payment-preflight"
        stopPaymentCheckButton.addTarget(self, action: #selector(stopPaymentPreflight), for: .touchUpInside)
        stopPaymentCheckButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stopPaymentCheckButton)
        NSLayoutConstraint.activate([
            stopPaymentCheckButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            stopPaymentCheckButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -10),
            stopPaymentCheckButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        refreshPaymentWaitControl()
    }

    private func refreshPaymentWaitControl() {
        stopPaymentCheckButton.isHidden = !billing.canStopPreflight
        if billing.canStopPreflight {
            view.bringSubviewToFront(stopPaymentCheckButton)
        }
    }

    @objc private func stopPaymentPreflight() {
        _ = billing.stopWaitingForPreflight()
        refreshPaymentWaitControl()
    }

    @objc private func recoverPaymentsOnForeground() {
        billing.prepareForCheckout()
        Task { [weak self] in
            guard let self else { return }
            await billing.resumePurchases()
            refreshPaymentWaitControl()
        }
    }

    #if DEBUG
    // Developer-only launch environment; there is no in-game tap target.
    private func openPaymentDiagnostics() {
        guard presentedViewController == nil else { return }
        guard !billing.isProcessingPayment else {
            showToast("請等待目前支付流程結束，再開啟診斷")
            return
        }
        hideToast()
        let navigation = UINavigationController(rootViewController: PaymentDiagnosticsViewController())
        navigation.modalPresentationStyle = .fullScreen
        present(navigation, animated: true)
    }
    #endif

    private func startNetworkMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.handlePath(path)
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "pbm.network"))
    }

    private func handlePath(_ path: NWPath) {
        let satisfied = path.status == .satisfied
        let restored = satisfied && !networkWasSatisfied
        networkWasSatisfied = satisfied
        if restored {
            billing.prepareForCheckout()
            Task { await billing.resumePurchases(); refreshPaymentWaitControl() }
            webView.evaluate(InjectedScripts.networkRestored)
            installPaymentBridge()
        }
    }
}
