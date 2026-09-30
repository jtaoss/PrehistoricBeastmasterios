import Network
import UIKit

final class GameViewController: UIViewController, H5BridgeHost, StoreKitManager.Listener, GameShopViewControllerDelegate {
    private var webView: TrustedWebView!
    private let billing = StoreKitManager()
    private let miniGameAuth = MiniGameAuthService()
    private let activityService = GameActivityService()
    private let billingService: BillingServiceProtocol
    private let telemetryTracker: TelemetryTrackerProtocol
    private let economy = GameEconomyManager.shared
    private var activeStageId: String?
    private var activeStageStartedAt: TimeInterval?
    private lazy var assetOrders = AssetOrderCoordinator(auth: miniGameAuth)
    private var localPaymentRequests = Set<String>()
    private var nativeShopRequests: [String: MiniGameProductCatalog.Offer] = [:]
    private var newlyCreditedTransactions = Set<String>()
    private weak var gameShopViewController: GameShopViewController?
    private lazy var localAssets = LocalAssetSyncManager(
        orders: assetOrders,
        canStart: { [weak self] in self?.canStartAssetPayment == true },
        submit: { [weak self] request in self?.startStoreKitPayment(request) }
    )
    private lazy var webActions = WebActionSyncHandler(
        orders: assetOrders,
        isTrustedURL: { url in
            guard let url else { return false }
            if url.isFileURL, let entry = ShellConfig.localGameURL {
                return url.standardizedFileURL.path == entry.standardizedFileURL.path
            }
            return IOSWebNavigationPolicy.isApprovedRemoteGameURL(url)
        },
        canStart: { [weak self] in self?.canStartAssetPayment == true },
        submit: { [weak self] request in self?.startStoreKitPayment(request) }
    )

    private var canStartAssetPayment: Bool {
        !billing.isProcessingPayment && billing.checkoutBlockingMessage == nil
            && miniGameAuthTask == nil && isTowerDefensePage(webView?.url)
    }
    private let paymentGate = PaymentRequestGate()
    private let analyticsEvents = AnalyticsEventCoordinator()
    private var contentRouteReleased = false
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
    private let economyButton = UIButton(type: .system)
    private var miniGameAuthTask: Task<Void, Never>?
    private var activityPollingTask: Task<Void, Never>?
    private let moduleSession = ModuleSession()
    private let moduleCatalog = ModuleCatalogService()
    private let moduleDock = ModuleDockView()
    private var catalogTask: Task<Void, Never>?
    private var catalogFetchedAt: Date?
    private var catalogGeneration = UUID()
    private var dynamicNoticeURL: URL? = nil
    private let activityNoticeButton = UIButton(type: .system)
    private var initialH5Ready = false
    #if DEBUG
    private var openedLaunchDiagnostics = false
    #endif

    init(
        billingService: BillingServiceProtocol = BillingService.shared,
        telemetryTracker: TelemetryTrackerProtocol = TelemetryTracker.shared
    ) {
        self.billingService = billingService
        self.telemetryTracker = telemetryTracker
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        self.billingService = BillingService.shared
        self.telemetryTracker = TelemetryTracker.shared
        super.init(coder: coder)
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    var canPresentTrackingAuthorization: Bool {
        viewIfLoaded?.window != nil && presentedViewController == nil
            && !billing.isProcessingPayment && billing.checkoutBlockingMessage == nil
            && contentRouteReleased && initialH5Ready
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.024, green: 0.090, blue: 0.078, alpha: 1)
        webView = TrustedWebView(host: self)
        webActions.attach(to: webView)
        webView.onNavigationStarted = { [weak self] in
            self?.webActions.navigationStarted()
            self?.localAssets.cancelPreparation()
            self?.localPaymentRequests.removeAll()
        }
        localAssets.onPreparation = { [weak self] in self?.showToast("正在建立 App Store 訂單…", duration: 0) }
        localAssets.onFailure = { [weak self] message in self?.showToast(message, duration: 5) }
        webActions.onPreparation = { [weak self] in self?.showToast("正在建立 App Store 訂單…", duration: 0) }
        webActions.onFailure = { [weak self] message in self?.showToast(message, duration: 5) }
        NotificationCenter.default.addObserver(self, selector: #selector(localAssetStatusChanged(_:)),
                                               name: .localAssetUpdated, object: localAssets)
        NotificationCenter.default.addObserver(self, selector: #selector(localAssetStatusChanged(_:)),
                                               name: .localAssetSyncStatusChanged, object: localAssets)
        NotificationCenter.default.addObserver(self, selector: #selector(economyBalanceChanged),
                                               name: .gameEconomyDidChange, object: economy)
        webView.onNavigationBlocked = { [weak self] in
            self?.showToast("此連結未在 iOS 版開放；儲值請在遊戲商品頁使用 App Store 付款", duration: 5)
        }
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.onPrivacyPolicyRequested = { [weak self] in self?.showPrivacyPolicy() }
        webView.onPageFinished = { [weak self] url in self?.onWebPageFinished(url) }
        webView.onNavigationFailed = { [weak self] message in self?.onWebNavigationFailed(message) }
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        installActivityNoticeButton()
        installEconomyEntry()
        installModuleDock()
        initializeContentRoute()
        billing.listener = self
        installPaymentWaitControl()
        billing.start()
        NotificationCenter.default.addObserver(self, selector: #selector(recoverPaymentsOnForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
        startNetworkMonitoring()
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
        refreshRemoteCatalog(force: false)
    }

    deinit {
        toastDismissal?.cancel()
        NotificationCenter.default.removeObserver(self)
        pathMonitor.cancel()
        miniGameAuthTask?.cancel()
        activityPollingTask?.cancel()
        catalogTask?.cancel()
    }

    func onH5Ready() {
        initialH5Ready = true
        moduleSession.noteHomeReady()
        startActivityNoticePollingIfNeeded()
        updateSdkStatus()
        callH5("initSuccess", fields: JSONObject())
        sendEconomyStateToGame()
        telemetryTracker.recordAppLaunch()
    }

    private func startStoreKitPayment(_ request: PayRequest) {
        PaymentDebugLog.record("storekit-request-received")
        if let message = billing.checkoutBlockingMessage {
            PaymentDebugLog.record("storekit-request-blocked reason=apple-checkout-active")
            showToast(message, duration: 5)
            return
        }
        if !request.resultAccountId.isEmpty {
            guard request.resultAccountId == assetOrders.currentAccountID else { return }
        }
        if !request.username.isEmpty {
            lastWebUsername = request.username
        }
        guard paymentGate.tryStart(request.cpOrder) else {
            PaymentDebugLog.record("storekit-request-blocked code=PAYMENT_IN_PROGRESS")
            showCurrentPaymentProgress()
            return
        }
        let diagnosticServer = request.serverId.allSatisfy({ $0.isNumber }) ? request.serverId : "unknown"
        PaymentDebugLog.record("storekit-request-parsed product=\(request.resolvedProductId()) server=\(diagnosticServer) goods=\(request.goodsId) price=\(request.price) usernamePresent=\(!request.username.isEmpty)")
        showPaymentProgress(request, message: "正在準備付款…")
        billing.launch(request)
        telemetryTracker.recordCheckoutInitiate(productId: request.resolvedProductId())
    }

    func onPayRequested(_ json: String) {
        PaymentDebugLog.record("h5-pay-received")
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
        startStoreKitPayment(request)
    }

    func onMiniPurchaseRequested(_ json: String) {
        let payload = JSONObject.parse(json)
        let requestId = payload.string("clientRequestId")
        localPaymentRequests.insert(requestId)
        localAssets.syncLocalAsset(assetId: payload.string("offerId"), requestId: requestId)
    }

    func onEconomyActionRequested(_ json: String) {
        guard isTowerDefensePage(webView.url) else { return }
        let payload = JSONObject.parse(json)
        let requestId = payload.string("requestId")
        let action = payload.string("action")
        let runId = payload.string("runId")
        guard UUID(uuidString: requestId) != nil, !runId.isEmpty, runId.count <= 128 else { return }
        let consumed: Bool
        switch action {
        case ConsumptionReason.reviveOnDefeat.rawValue:
            guard payload.int("amount") == ConsumptionReason.reviveOnDefeat.pearlCost else { return }
            consumed = economy.beginRevive(runId: runId, requestId: requestId)
        case "completeRevive":
            consumed = economy.completeRevive(runId: runId)
        default:
            return
        }
        var result = JSONObject()
        result.put("requestId", requestId)
        result.put("success", consumed)
        result.put("balance", economy.balance)
        result.put("code", consumed ? "OK" : (action == "completeRevive" ? "REVIVE_NOT_PENDING" : "INSUFFICIENT_PEARLS"))
        webView.evaluate(PageScripts.economyResult(result.jsonString()))
        sendEconomyStateToGame()
        if consumed && action == ConsumptionReason.reviveOnDefeat.rawValue {
            showToast("已消耗 20 原始珍珠，繼續本關")
        } else if action == ConsumptionReason.reviveOnDefeat.rawValue {
            presentInsufficientPearlsAlert()
        }
    }

    func onGameShopRequested() {
        openGameShop()
    }

    func onMiniAuthRequested(_ json: String) {
        let payload = JSONObject.parse(json)
        let requestId = payload.string("requestId")
        let action = payload.string("action")
        guard UUID(uuidString: requestId) != nil,
              ["status", "login", "register", "recover", "logout", "delete", "completeDelete"].contains(action) else { return }
        guard miniGameAuthTask == nil else {
            reportMiniAuthFailure(requestId: requestId, action: action, code: "AUTH_IN_PROGRESS",
                                  message: "另一項帳號操作正在處理，請稍候")
            return
        }
        if ["login", "register", "logout", "delete", "completeDelete"].contains(action) {
            clearPaymentAccountContext()
            assetOrders.accountDidChange()
            localAssets.cancelPreparation()
            webActions.accountDidChange()
            localPaymentRequests.removeAll()
            nativeShopRequests.removeAll()
        }
        miniGameAuthTask = Task { [weak self] in
            guard let self else { return }
            defer { self.miniGameAuthTask = nil }
            do {
                let result: JSONObject
                switch action {
                case "status":
                    result = try await self.miniGameAuth.status()
                case "login":
                    result = try await self.miniGameAuth.login(
                        account: payload.string("account"), password: payload.string("password")
                    )
                case "register":
                    result = try await self.miniGameAuth.register(
                        account: payload.string("account"), password: payload.string("password"),
                        nickname: payload.string("nickname"),
                        acceptedTermsVersion: payload.string("acceptedTermsVersion")
                    )
                case "recover":
                    result = try await self.miniGameAuth.recover(account: payload.string("account"))
                case "logout":
                    result = try await self.miniGameAuth.logout()
                    self.clearPaymentAccountContext()
                case "delete":
                    result = try await self.miniGameAuth.deleteAccount()
                case "completeDelete":
                    result = try self.miniGameAuth.completeDeletionCleanup()
                    self.clearPaymentAccountContext()
                default:
                    return
                }
                guard self.isTowerDefensePage(self.webView.url) else { return }
                var fields = JSONObject()
                fields.put("requestId", requestId)
                fields.put("action", action)
                fields.put("code", "OK")
                fields.put("data", result.dictionary)
                self.callH5("onMiniAuthResult", fields: fields)
            } catch is CancellationError {
                self.reportMiniAuthFailure(requestId: requestId, action: action, code: "AUTH_CANCELLED",
                                           message: "帳號操作已取消")
            } catch let error as MiniGameAuthService.AuthError {
                self.reportMiniAuthFailure(requestId: requestId, action: action, code: error.code,
                                           message: error.errorDescription ?? "帳號服務未能完成請求")
            } catch {
                self.reportMiniAuthFailure(requestId: requestId, action: action, code: "AUTH_FAILED",
                                           message: "帳號服務未能完成請求")
            }
        }
    }

    func onAnalyticsEvent(_ name: String, json: String?) {
        analyticsEvents.onH5Event(name, json: json)
    }

    func onAccountSession(_ json: String) {
        let account = JSONObject.parse(json)
        let username = accountUsername(account)
        if !username.isEmpty && username != lastWebUsername {
            paymentSessionRevision += 1
            paymentRetryAlert?.dismiss(animated: true)
            finishingCheckoutOrder = nil
        }
        if !username.isEmpty {
            lastWebUsername = username
        }
        analyticsEvents.onAccountSession(json)
    }

    func onRoleReported(_ json: String) {
        analyticsEvents.onRoleReported(json)
    }

    private func accountUsername(_ value: JSONObject) -> String {
        let direct = ShellText.firstNonBlank(value.string("user_name"), value.string("username"), value.string("userName"), value.string("account"))
        if !direct.isEmpty { return direct }
        guard let nested = value.jsonObject("data") else { return "" }
        return ShellText.firstNonBlank(nested.string("user_name"), nested.string("username"), nested.string("userName"), nested.string("account"))
    }

    func onGameTelemetryEvent(_ json: String) {
        let payload = JSONObject.parse(json)
        switch payload.string("event") {
        case "stage_start":
            let stageId = payload.string("stage_id")
            guard !stageId.isEmpty else { return }
            activeStageId = stageId
            activeStageStartedAt = Date().timeIntervalSince1970
            telemetryTracker.recordStageStart(stageId: stageId)
        case "stage_end":
            let stageId = payload.string("stage_id").isEmpty
                ? (activeStageId ?? "")
                : payload.string("stage_id")
            guard !stageId.isEmpty else { return }
            let result: StageTelemetryResult = payload.string("result") == "win" ? .win : .fail
            let durationSeconds = payload.has("duration_seconds")
                ? payload.int("duration_seconds")
                : Int(max(0, Date().timeIntervalSince1970 - (activeStageStartedAt ?? Date().timeIntervalSince1970)))
            telemetryTracker.recordStageEnd(
                stageId: stageId,
                result: result,
                durationSeconds: durationSeconds
            )
            activeStageId = nil
            activeStageStartedAt = nil
        case "item_consume":
            economy.recordItemConsume(
                itemId: payload.string("item_id"),
                costPearls: payload.int("cost_pearls"),
                remainingBalance: payload.int("remaining_balance")
            )
        default:
            break
        }
    }

    func openExternalURL(_ url: String) {
        guard let parsed = URL(string: url) else { return }
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

    func onPaymentProgress(_ request: PayRequest?, message: String) {
        refreshPaymentWaitControl()
        showPaymentProgress(request, message: message)
    }

    func onVerifiedDelivery(_ request: PayRequest?, orderId: String,
                            transactionId: String, productInfo: StoreKitManager.ProductInfo) -> Bool {
        guard let offer = pearlOffer(for: request) else { return true }
        if economy.hasCredited(transactionId: transactionId) { return true }
        let applied = economy.applyPurchase(
            amount: offer.pearlAmount,
            transactionId: transactionId,
            grantsLimitedSkin: offer.grantsLimitedSkin
        )
        if applied { newlyCreditedTransactions.insert(transactionId) }
        return applied
    }

    func onCheckoutStarted(_ request: PayRequest, _ productInfo: StoreKitManager.ProductInfo) {
        refreshPaymentWaitControl()
        showPaymentProgress(request, message: "正在等待 App Store 付款，請勿重複點擊…")
        PaymentDebugLog.record("checkout-started product=\(productInfo.productId)")
        analyticsEvents.onCheckoutStarted(request, productInfo)
    }

    func onCheckoutReleased(_ request: PayRequest) {
        refreshPaymentWaitControl()
        guard finishingCheckoutOrder == request.cpOrder else { return }
        finishingCheckoutOrder = nil
        guard paymentGate.canPresent(request.cpOrder) else { return }
        if pearlOffer(for: request) != nil { return }
        showToast(paymentSubject(request) + "已到帳，可繼續選購")
    }

    func onSuccess(_ request: PayRequest?, orderId: String, transactionId: String, productInfo: StoreKitManager.ProductInfo) {
        let showResult = canPresentPaymentResult(request)
        let isPearlPurchase = pearlOffer(for: request) != nil
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
        sendPaymentResult("onPayResult", request: request, fields: fields)
        if showResult && !isPearlPurchase {
            if let request, billing.isCheckoutDelivered(request), billing.checkoutBlockingMessage != nil {
                finishingCheckoutOrder = request.cpOrder
                showPaymentProgress(request, message: "付款成功，獎勵已到帳；App Store 正在結束付款流程…")
            } else {
                showToast(paymentSubject(request) + "付款成功，獎勵已到帳")
            }
        }
        if let request {
            economy.recordCheckoutResult(
                productId: request.resolvedProductId(),
                orderId: orderId,
                success: true
            )
        }
    }

    func onPending(_ request: PayRequest?) {
        let showResult = canPresentPaymentResult(request)
        refreshPaymentWaitControl()
        PaymentDebugLog.record("ui-payment-pending")
        paymentGate.finish(request?.cpOrder ?? "")
        sendPaymentResult("onPayPending", request: request, fields: paymentFields(request, code: "PENDING", message: "Payment is pending"))
        if showResult { showToast(paymentSubject(request) + "付款待確認，請勿重複購買") }
    }

    func onCancel(_ request: PayRequest?) {
        let showResult = canPresentPaymentResult(request)
        refreshPaymentWaitControl()
        PaymentDebugLog.record("ui-payment-not-completed source=storekit-cancel actualUserAction=unknown")
        paymentGate.finish(request?.cpOrder ?? "")
        if billing.hasUnresolvedOrder(for: request) {
            sendPaymentResult("onPayPending", request: request, fields: paymentFields(request, code: "PURCHASE_RECOVERY_REQUIRED", message: "Retry canceled; original order still needs recovery"))
            if showResult { showToast(paymentSubject(request) + "本次付款已結束，先前訂單仍待核對；不會自動重新付款", duration: 5) }
            return
        }
        sendPaymentResult("onPayCancel", request: request, fields: paymentFields(request, code: "USER_CANCELED", message: "App Store did not complete this payment"))
        if showResult { showToast(paymentSubject(request) + "App Store 未完成這次付款，付款視窗已關閉", duration: 5) }
    }

    func onError(_ request: PayRequest?, code: String, message: String) {
        let showResult = canPresentPaymentResult(request)
        refreshPaymentWaitControl()
        PaymentDebugLog.record("ui-payment-error code=\(code) message=\(message)")
        paymentGate.finish(request?.cpOrder ?? "")
        if code == "PAYMENT_IN_PROGRESS" || code == "PURCHASE_RECOVERY_IN_PROGRESS" {
            if showResult { showToast(billing.checkoutBlockingMessage ?? "App Store 正在處理，請稍候再操作") }
            return
        }
        if code != "PURCHASE_ALREADY_PROCESSED" {
            let callback = billing.hasUnresolvedOrder(for: request) ? "onPayPending" : "onPayFail"
            sendPaymentResult(callback, request: request, fields: paymentFields(request, code: code, message: message))
        }
        if let request, code != "PURCHASE_ALREADY_PROCESSED" {
            economy.recordCheckoutResult(
                productId: request.resolvedProductId(),
                orderId: request.cpOrder,
                success: false
            )
        }
        guard showResult else { return }
        if code == "PURCHASE_RECOVERY_REQUIRED", billing.retryRequest(for: request) != nil {
            dismissToast()
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
        showPaymentProgress(original, message: "正在檢查原訂單…")
        billing.retryOriginal(original)
    }

    private func reportPaymentFailure(_ request: PayRequest?, code: String, message: String) {
        sendPaymentResult("onPayFail", request: request, fields: paymentFields(request, code: code, message: message))
        showToast(message)
    }

    private func sendPaymentResult(_ function: String, request: PayRequest?, fields: JSONObject) {
        guard let request else { return }
        switch request.destination {
        case .localAssets:
            localAssets.receive(function, request: request, fields: fields)
        case .webActions:
            if request.paymentCallback == .actionSync {
                webActions.receive(function, request: request, fields: fields)
            } else {
                guard canPresentPaymentResult(request) else { return }
                callH5(function, fields: fields)
            }
        }
    }

    private func canPresentPaymentResult(_ request: PayRequest?) -> Bool {
        guard paymentGate.canPresent(request?.cpOrder) else { return false }
        guard let request else { return true }
        if !request.resultAccountId.isEmpty { return request.resultAccountId == assetOrders.currentAccountID }
        if !lastWebUsername.isEmpty && !request.username.isEmpty {
            return request.username == lastWebUsername
        }
        return true
    }

    @objc private func localAssetStatusChanged(_ notification: Notification) {
        guard isTowerDefensePage(webView.url), let info = notification.userInfo as? [String: Any] else { return }
        let fields = JSONObject(info)
        let requestId = fields.string("clientRequestId")
        guard fields.string("accountId") == assetOrders.currentAccountID else { return }
        let function = fields.string("func")
        guard ["onPayResult", "onPayPending", "onPayCancel", "onPayFail"].contains(function) else { return }

        let deliveredOffer = MiniGameProductCatalog.pearlOffer(
            goodsId: fields.int("goodsId"),
            productId: fields.string("productId")
        )
        let requestedOffer = nativeShopRequests[requestId]
        if let offer = deliveredOffer ?? requestedOffer {
            handleNativeShopStatus(function, fields: fields, offer: offer,
                                   deliveryIdentityValidated: deliveredOffer != nil)
            if function != "onPayPending" { nativeShopRequests.removeValue(forKey: requestId) }
            return
        }

        guard localPaymentRequests.contains(requestId) else { return }
        callH5(function, fields: fields)
        if function != "onPayPending" { localPaymentRequests.remove(requestId) }
    }

    private func handleNativeShopStatus(_ function: String, fields: JSONObject,
                                        offer: MiniGameProductCatalog.Offer,
                                        deliveryIdentityValidated: Bool) {
        switch function {
        case "onPayResult":
            let transactionId = fields.string("transactionId")
            guard deliveryIdentityValidated, !transactionId.isEmpty,
                  economy.hasCredited(transactionId: transactionId) else {
                let message = "付款已驗證，但本機資產尚未安全寫入；請勿重複購買並稍後重試。"
                gameShopViewController?.purchaseDidFail(offer: offer, message: message)
                showToast(message, duration: 6)
                return
            }
            let wasNewCredit = newlyCreditedTransactions.remove(transactionId) != nil
            gameShopViewController?.purchaseDidSucceed(offer: offer, wasNewCredit: wasNewCredit)
            updateEconomyHUD()
            sendEconomyStateToGame()
            if gameShopViewController == nil {
                showToast("購買成功，已到賬 \(offer.pearlAmount) 原始珍珠")
            }
        case "onPayPending":
            gameShopViewController?.purchaseDidBecomePending(
                offer: offer,
                message: "付款結果仍待 App Store 或伺服器確認，請勿重複購買。"
            )
        case "onPayCancel":
            gameShopViewController?.purchaseDidFail(offer: offer, message: "App Store 未完成這次付款。")
        default:
            let message = fields.string("message").isEmpty ? "付款未完成，沒有增加珍珠。" : fields.string("message")
            gameShopViewController?.purchaseDidFail(offer: offer, message: message)
        }
    }

    func gameShop(_ controller: GameShopViewController, purchase offer: MiniGameProductCatalog.Offer) {
        guard gameShopViewController === controller else { return }
        let requestId = UUID().uuidString
        nativeShopRequests[requestId] = offer
        localAssets.syncLocalAsset(assetId: offer.id, requestId: requestId)
    }

    private func reportMiniAuthFailure(requestId: String, action: String, code: String, message: String) {
        guard isTowerDefensePage(webView.url) else { return }
        var fields = JSONObject()
        fields.put("requestId", requestId)
        fields.put("action", action)
        fields.put("code", code)
        fields.put("message", message)
        callH5("onMiniAuthFail", fields: fields)
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
        case "LOCAL_DELIVERY_STORAGE_UNAVAILABLE":
            return "付款已驗證，但本機資產暫時無法安全寫入；原交易已保留，請勿重複購買"
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
        guard !contentRouteReleased else { return }
        contentRouteReleased = true
        updateSdkStatus()
        PaymentDebugLog.record("route-launch-local-home id=\(moduleSession.home.id)")
        webView.loadLocalGame()
        refreshRemoteCatalog(force: true)
    }

    private func installModuleDock() {
        moduleDock.translatesAutoresizingMaskIntoConstraints = false
        moduleDock.onSelect = { [weak self] module in
            self?.openRemoteModule(module)
        }
        view.addSubview(moduleDock)
        let dockWidth = moduleDock.widthAnchor.constraint(equalToConstant: 200)
        dockWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            moduleDock.topAnchor.constraint(equalTo: activityNoticeButton.bottomAnchor, constant: 8),
            moduleDock.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 10),
            moduleDock.trailingAnchor.constraint(lessThanOrEqualTo: economyButton.leadingAnchor, constant: -8),
            dockWidth,
            moduleDock.heightAnchor.constraint(equalToConstant: 44)
        ])
    }

    private func refreshRemoteCatalog(force: Bool) {
        if moduleSession.isRemoteForeground { return }
        if !force {
            if catalogTask != nil { return }
            if let catalogFetchedAt, Date().timeIntervalSince(catalogFetchedAt) < 45 { return }
        }
        catalogTask?.cancel()
        let generation = UUID()
        catalogGeneration = generation
        catalogTask = Task { [weak self] in
            let modules = await self?.moduleCatalog.fetchRemoteModules() ?? []
            guard let self, !Task.isCancelled, self.catalogGeneration == generation else { return }
            self.catalogFetchedAt = Date()
            self.catalogTask = nil
            self.moduleDock.setModules(modules)
            if !modules.isEmpty {
                self.view.bringSubviewToFront(self.moduleDock)
            }
            PaymentDebugLog.record("module-catalog count=\(modules.count)")
        }
    }

    private func openRemoteModule(_ module: GameModule) {
        guard presentedViewController == nil, module.origin == .remote, module.entryURL != nil else { return }
        guard !paymentBlocksRemoteModule else {
            showToast("請先完成目前的付款或訂單核對")
            return
        }
        moduleSession.beginRemote(module)
        webView.evaluate(PageScripts.shellSuspend)
        let controller = ModuleContainerController(module: module)
        controller.host = self
        present(controller, animated: true)
    }

    private var paymentBlocksRemoteModule: Bool {
        billing.isProcessingPayment
            || billing.checkoutBlockingMessage != nil
            || BillingService.shared.isOccupied
    }

    private func restoreHomeModule(reason: String) {
        guard moduleSession.isRemoteForeground else { return }
        let home = moduleSession.endRemote()
        webView.evaluate(PageScripts.shellResume)
        PaymentDebugLog.record("module-restored home=\(home.id) reason=\(reason)")
        if presentedViewController is ModuleContainerController {
            dismiss(animated: true)
        }
    }

    private func installActivityNoticeButton() {
        var configuration = UIButton.Configuration.tinted()
        configuration.title = "活動中心"
        configuration.image = UIImage(systemName: "sparkles")
        configuration.imagePlacement = .leading
        configuration.imagePadding = 6
        configuration.baseForegroundColor = .white
        configuration.baseBackgroundColor = UIColor(white: 0.08, alpha: 0.82)
        configuration.cornerStyle = .capsule
        activityNoticeButton.configuration = configuration
        activityNoticeButton.accessibilityLabel = "遊戲活動中心"
        activityNoticeButton.addTarget(self, action: #selector(openDynamicNoticeActivity), for: .touchUpInside)
        activityNoticeButton.isHidden = true
        activityNoticeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activityNoticeButton)
        NSLayoutConstraint.activate([
            activityNoticeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            activityNoticeButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 10),
            activityNoticeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }

    private func startActivityNoticePollingIfNeeded() {
        guard activityPollingTask == nil else { return }
        activityPollingTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.fetchDynamicActivityNotice()
                do {
                    try await Task.sleep(nanoseconds: 300_000_000_000)
                } catch {
                    return
                }
            }
        }
    }

    private func fetchDynamicActivityNotice() async {
        let noticeURL = await activityService.fetchNoticeURL(playerId: miniGameAuth.currentPlayerID)
        guard !Task.isCancelled else { return }
        await MainActor.run {
            self.dynamicNoticeURL = noticeURL
            let shouldShow = noticeURL != nil
            self.activityNoticeButton.isHidden = !shouldShow
            if shouldShow {
                self.view.bringSubviewToFront(self.activityNoticeButton)
            }
        }
    }

    @objc private func openDynamicNoticeActivity() {
        guard presentedViewController == nil,
              !billing.isProcessingPayment,
              let url = dynamicNoticeURL else { return }
        let controller = GameActivityWebViewController(url: url)
        controller.modalPresentationStyle = .fullScreen
        present(controller, animated: true)
    }

    private func onWebPageFinished(_ url: String) {
        guard let parsed = URL(string: url) else { return }
        if isTowerDefensePage(parsed) {
            updateSdkStatus()
            (UIApplication.shared.delegate as? AppDelegate)?.requestTrackingAuthorizationIfNeeded(UIApplication.shared)
        }
    }

    private func onWebNavigationFailed(_ message: String) {
        showToast("遊戲載入失敗，請檢查網路後重試", duration: 5)
        PaymentDebugLog.record("game-load-failed message=\(message)")
    }

    private func isTowerDefensePage(_ url: URL?) -> Bool {
        IOSWebNavigationPolicy.isBundledFile(url, in: ShellConfig.localGameDirectory)
            || IOSWebNavigationPolicy.isApprovedRemoteGameURL(url)
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
        status.put("game", "tower-defense")
        status.put("store", "app_store")
        webView.evaluate(PageScripts.sdkStatus(status.jsonString()))
    }

    private func callH5(_ function: String, fields: JSONObject) {
        var result = fields
        result.put("func", function)
        webView.evaluate(PageScripts.javaCallBack(result.jsonString()))
    }

    private func clearPaymentAccountContext() {
        paymentSessionRevision += 1
        paymentRetryAlert?.dismiss(animated: true)
        finishingCheckoutOrder = nil
        lastWebUsername = ""
        analyticsEvents.onLogout()
    }

    private func paymentFields(_ request: PayRequest?, code: String, message: String) -> JSONObject {
        var fields = JSONObject()
        fields.put("code", code)
        fields.put("message", message)
        if let request {
            fields.put("cpOrder", request.cpOrder)
            fields.put("productId", request.resolvedProductId())
            fields.put("goodsId", request.goodsId)
            fields.put("clientRequestId", request.clientRequestId)
        }
        return fields
    }

    private func pearlOffer(for request: PayRequest?) -> MiniGameProductCatalog.Offer? {
        guard let request else { return nil }
        return MiniGameProductCatalog.pearlOffer(
            goodsId: request.goodsId,
            productId: request.resolvedProductId()
        )
    }

    private func paymentSubject(_ request: PayRequest?) -> String {
        guard let request else { return "" }
        let name = request.goodsName.components(separatedBy: .newlines).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return "「\(String(name.prefix(28)))」：" }
        return request.goodsId > 0 ? "商品 \(request.goodsId)：" : "US$\(request.price) 檔商品："
    }

    private func showPaymentProgress(_ request: PayRequest?, message: String) {
        guard canPresentPaymentResult(request) else { return }
        currentPaymentProgress = paymentSubject(request) + message
        showCurrentPaymentProgress()
    }

    private func showCurrentPaymentProgress() {
        guard visibleProgressMessage != currentPaymentProgress || toastView == nil else { return }
        showToast(currentPaymentProgress, duration: 0)
        visibleProgressMessage = currentPaymentProgress
    }

    private func showToast(_ message: String, duration: TimeInterval = 3.5) {
        dismissToast()
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
        guard duration > 0 else { return }
        let dismissal = DispatchWorkItem { [weak self, weak bubble] in
            guard let self, let bubble, self.toastView === bubble else { return }
            self.dismissToast()
        }
        toastDismissal = dismissal
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: dismissal)
    }

    private func dismissToast() {
        visibleProgressMessage = nil
        toastDismissal?.cancel()
        toastDismissal = nil
        toastView?.removeFromSuperview()
        toastView = nil
    }

    private func installEconomyEntry() {
        var configuration = UIButton.Configuration.tinted()
        configuration.baseForegroundColor = UIColor(red: 0.78, green: 0.97, blue: 0.93, alpha: 1)
        configuration.baseBackgroundColor = UIColor(white: 0.08, alpha: 0.84)
        configuration.cornerStyle = .capsule
        configuration.image = UIImage(systemName: "plus.circle.fill")
        configuration.imagePlacement = .trailing
        configuration.imagePadding = 7
        economyButton.configuration = configuration
        economyButton.accessibilityIdentifier = "game-pearl-shop-button"
        economyButton.addTarget(self, action: #selector(openGameShop), for: .touchUpInside)
        economyButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(economyButton)
        NSLayoutConstraint.activate([
            economyButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            economyButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -10),
            economyButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        updateEconomyHUD()
        view.bringSubviewToFront(economyButton)
    }

    @objc private func economyBalanceChanged(_ notification: Notification) {
        updateEconomyHUD()
        sendEconomyStateToGame()
    }

    private func updateEconomyHUD() {
        var configuration = economyButton.configuration
        configuration?.title = "◈ \(economy.balance)"
        economyButton.configuration = configuration
        economyButton.accessibilityLabel = "原始珍珠 \(economy.balance)，打開商城"
    }

    private func sendEconomyStateToGame() {
        guard webView != nil, isTowerDefensePage(webView.url) else { return }
        var fields = JSONObject()
        fields.put("balance", economy.balance)
        fields.put("limitedDinoSkin", economy.hasLimitedDinoSkin)
        fields.put("tyrannosaurusSkin", economy.hasUnlockedDinoSkin)
        fields.put("pendingReviveRunId", economy.pendingReviveRunId)
        webView.evaluate(PageScripts.economyState(fields.jsonString()))
    }

    @objc private func openGameShop() {
        guard presentedViewController == nil else { return }
        guard !billing.isProcessingPayment, billing.checkoutBlockingMessage == nil else {
            showToast("請先完成目前的付款操作")
            return
        }
        let controller = GameShopViewController(economy: economy)
        controller.delegate = self
        gameShopViewController = controller
        present(controller, animated: true)
    }

    private func presentInsufficientPearlsAlert() {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(
            title: "原始珍珠不足",
            message: "原地復活需要 20 原始珍珠。目前餘額為 \(economy.balance)。",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "返回結算", style: .cancel))
        alert.addAction(UIAlertAction(title: "打開商城", style: .default) { [weak self] _ in
            DispatchQueue.main.async { self?.openGameShop() }
        })
        present(alert, animated: true)
    }

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
            stopPaymentCheckButton.topAnchor.constraint(equalTo: economyButton.bottomAnchor, constant: 8),
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
        refreshRemoteCatalog(force: false)
        Task { [weak self] in
            guard let self else { return }
            await billing.resumePurchases()
            refreshPaymentWaitControl()
        }
    }

    #if DEBUG
    private func openPaymentDiagnostics() {
        guard presentedViewController == nil else { return }
        guard !billing.isProcessingPayment else {
            showToast("請等待目前支付流程結束，再開啟診斷")
            return
        }
        dismissToast()
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
            webView.evaluate(PageScripts.networkRestored)
        }
    }
}

extension GameViewController: ModuleContainerHost {
    func moduleContainerDidBecomeReady(_ controller: ModuleContainerController) {
        moduleSession.markReady()
        PaymentDebugLog.record("module-ready id=\(controller.module.id)")
    }

    func moduleContainer(_ controller: ModuleContainerController, didEmit name: String, fields: [String: String]) {
        var parameters: [String: Any] = ["module_id": controller.module.id]
        for (key, value) in fields {
            parameters[key] = value
        }
        telemetryTracker.track(.custom(name: name, category: "liveops", parameters: parameters))
        PaymentDebugLog.record("module-event id=\(controller.module.id) name=\(name)")
    }

    func moduleContainerDidFinish(_ controller: ModuleContainerController, status: ModuleExitStatus) {
        restoreHomeModule(reason: status.rawValue)
    }
}
