import Foundation
import StoreKit

enum PaymentDebugLog {
    private static let lock = NSLock()

    static func reset() {
        #if DEBUG
        lock.lock()
        defer { lock.unlock() }
        guard let file = fileURL() else { return }
        try? FileManager.default.removeItem(at: file)
        #endif
    }

    static func record(_ message: String) {
        #if DEBUG
        lock.lock()
        defer { lock.unlock() }
        guard let file = fileURL() else { return }
        let clean = message.replacingOccurrences(of: "\n", with: " ")
        let line = "\(ISO8601DateFormatter().string(from: Date())) \(clean)\n"
        guard let data = line.data(using: .utf8) else { return }
        if !FileManager.default.fileExists(atPath: file.path) {
            try? data.write(to: file, options: .atomic)
            return
        }
        guard let handle = try? FileHandle(forWritingTo: file) else { return }
        defer { try? handle.close() }
        do {
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } catch {
            // Payment diagnostics must never affect checkout.
        }
        #endif
    }

    private static func fileURL() -> URL? {
        try? FileManager.default.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("payment_status.log")
    }
}

@MainActor
final class StoreKitManager {
    struct ProductInfo {
        let productId: String
        let priceAmountMicros: Int64
        let currencyCode: String
    }

    @MainActor protocol Listener: AnyObject {
        func onPaymentProgress(_ request: PayRequest?, message: String)
        func onCheckoutStarted(_ request: PayRequest, _ productInfo: ProductInfo)
        func onCheckoutReleased(_ request: PayRequest)
        func onSuccess(_ request: PayRequest?, orderId: String, transactionId: String, productInfo: ProductInfo)
        func onPending(_ request: PayRequest?)
        func onCancel(_ request: PayRequest?)
        func onError(_ request: PayRequest?, code: String, message: String)
    }

    private struct PurchaseContext: Codable {
        var requestJSON: String
        var sdkOrderId: String
        var productId: String
        var priceAmountMicros: Int64
        var currencyCode: String
        var pendingSince: TimeInterval?
        // Optional for decoding old unfinished contexts. New orders always store
        // the server-issued UUID; old receipts are retried unchanged, never rebuilt.
        var appAccountToken: UUID?
        // Optional for old installs. Persist before entering Apple UI, so a lost
        // response or process termination cannot silently replace the SDK order.
        var recoveryState: String?
        var storefrontId: String?
        var transactionId: String?
        var attemptCount: Int?
        var deliveryRetryCount: Int?
        var deliveryRetryAt: TimeInterval?
        var deliveryLastCode: String?
        var deliveryNeedsReview: Bool?

        var request: PayRequest? { try? PayRequest(json: requestJSON) }

        func productInfo() -> ProductInfo {
            ProductInfo(productId: productId, priceAmountMicros: priceAmountMicros, currencyCode: currencyCode)
        }
    }

    private enum ConfirmationResult {
        case delivered(PayRequest?)
        case alreadyDelivered(cpOrder: String)
        case failed(code: String, message: String)
        case inProgress
    }

    private let backend = BackendGateway()
    weak var listener: Listener?
    private var activeRequest: PayRequest?
    private var applePurchaseOrder: String?
    private var activeContext: PurchaseContext?
    private var confirmingTokens = Set<String>()
    private var confirmingOrders = Set<String>()
    private var finishingCompletedTokens = Set<String>()
    private var completedFinishTimes: [String: TimeInterval] = [:]
    private let completedFinishCooldown: TimeInterval = 30
    private var completedFinishJobs: [String: RecoveryJob] = [:]
    private enum RecoveryTrigger { case observed, automatic, manual }
    private struct RecoveryJob { let id: UUID; let task: Task<Void, Never> }
    private var recoveryJobs: [String: RecoveryJob] = [:]
    private let deliveryRetryDelays: [TimeInterval] = [2, 5, 15, 30, 60]
    private let recoveryNow: () -> TimeInterval
    private let recoveryWait: (TimeInterval) async throws -> Void
    private var recoveryStopped = false
    private var recoveryScanRunning = false
    private struct RecoveryScanSummary {
        var total = 0
        var delivered = 0
        var historicalIDs = Set<UInt64>()
        var historicalRemaining = 0
        var pending = 0
        var failed = 0
        var unavailableOrders = 0
        var interrupted = false
    }
    private var updatesTask: Task<Void, Never>?
    private var launchTask: Task<Void, Never>?
    private var checkoutID: UUID?
    private var checkoutRequest: PayRequest?
    private struct PreflightCheck {
        let id: UUID
        let request: PayRequest
        let continuation: CheckedContinuation<Bool, Never>
        let worker: Task<Void, Never>
        let deadline: Task<Void, Never>
    }
    private var preflightCheck: PreflightCheck?
    private let preflightTimeout: TimeInterval
    private let checkoutTransactions = CheckoutTransactionReader()
    var canStopPreflight: Bool { preflightCheck != nil && applePurchaseOrder == nil }
    private var interruptedRecoveryJobs: [String: RecoveryJob] = [:]
    private let store = UserDefaults.standard
    private let contextPrefix = "ios_purchase_context_"
    private let contextsKey = "ios_purchase_contexts_v2"
    // Completed means SERVER-DELIVERED, not Apple acknowledgement complete.
    // Old v1 records meet this stronger prerequisite too. The journal never
    // grants content or substitutes for server verification; finish is retriable.
    private struct CompletedTransaction: Codable {
        let transactionId: String
        let productId: String
        let appAccountToken: UUID?
        let cpOrder: String
    }
    private let completedKey = "ios_completed_transactions_v1"
    private lazy var completedTransactions: [CompletedTransaction] = {
        guard let text = store.string(forKey: completedKey), let data = text.data(using: .utf8),
              let records = try? JSONDecoder().decode([CompletedTransaction].self, from: data) else { return [] }
        return Array(records.suffix(512))
    }()
    private var cachedProducts: [String: Product] = [:]
    private var catalogLoadedAt: TimeInterval = 0
    private var catalogStorefront: String?
    private var catalogGeneration = 0
    private var catalogTask: (id: UUID, task: Task<[Product], Error>)?
    private var warmupTask: Task<Void, Never>?
    private var connectionWarmupTask: Task<Void, Never>?
    private var lastPreparationAt: TimeInterval = -.infinity
    private struct StatusJob { let id: UUID; let task: Task<BackendGateway.OrderStatus, Error> }
    private var statusJobs: [String: StatusJob] = [:]
    private var statusCheckedAt: [String: TimeInterval] = [:]
    private enum OrderReconciliation: Equatable {
        case delivered
        // A matched CREATED order without a transaction permits only an explicit
        // original-order retry after the fresh Apple scan, never automatic purchase.
        // It is not proof that Apple cannot subsequently return a transaction.
        case unresolved(retryEligible: Bool)
        case unavailable
    }
    private var storefrontTask: Task<Void, Never>?
    private let productCacheLifetime: TimeInterval = 5 * 60
    private let maximumProductQueryRetries = 1
    private let retryDelayNanoseconds: UInt64 = 700_000_000
    var isProcessingPayment: Bool {
        launchTask != nil || activeRequest != nil || !confirmingTokens.isEmpty
    }
    // Delivery and Apple's presentation lifetime are independent. Keep the
    // single-sheet lock, but never describe a delivered order as unpaid.
    var checkoutBlockingMessage: String? {
        guard launchTask != nil, let request = checkoutRequest else { return nil }
        if isCheckoutDelivered(request) {
            return "上一筆已到帳，App Store 仍在結束付款流程，請稍候再選購"
        }
        if canStopPreflight { return "正在檢查舊交易，尚未開啟付款；可點「停止等待」" }
        return "App Store 正在處理目前付款，請勿重複點擊"
    }

    func isCheckoutDelivered(_ request: PayRequest) -> Bool {
        checkoutRequest?.cpOrder == request.cpOrder &&
            completedTransactions.contains { $0.cpOrder == request.cpOrder }
    }
    #if DEBUG
    var hasScheduledDeliveryRecovery: Bool { !recoveryJobs.isEmpty }
    var hasPendingAppleFinish: Bool { !completedFinishJobs.isEmpty || !finishingCompletedTokens.isEmpty }
    var hasScheduledOriginalRecovery: Bool { !interruptedRecoveryJobs.isEmpty }
    #endif

    init(recoveryNow: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 },
         recoveryWait: @escaping (TimeInterval) async throws -> Void = { seconds in
             try await Task.sleep(nanoseconds: UInt64(max(0, min(seconds, 60)) * 1_000_000_000))
         }, preflightTimeout: TimeInterval = 8) {
        self.recoveryNow = recoveryNow
        self.recoveryWait = recoveryWait
        self.preflightTimeout = max(0.01, min(preflightTimeout, 8))
    }

    deinit {
        updatesTask?.cancel()
        launchTask?.cancel()
        warmupTask?.cancel()
        connectionWarmupTask?.cancel()
        for job in statusJobs.values { job.task.cancel() }
        storefrontTask?.cancel()
        catalogTask?.task.cancel()
        for job in recoveryJobs.values { job.task.cancel() }
        for job in completedFinishJobs.values { job.task.cancel() }
        for job in interruptedRecoveryJobs.values { job.task.cancel() }
    }

    func start() {
        guard updatesTask == nil else { return }
        recoveryStopped = false
        PaymentDebugLog.record("storekit-manager-start")
        prepareForCheckout()
        storefrontTask = Task { [weak self] in
            for await _ in Storefront.updates {
                guard !Task.isCancelled else { return }
                self?.invalidateProductCache()
            }
        }
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard !Task.isCancelled else { return }
                await self?.handle(verification: update)
            }
        }
        Task { [weak self] in
            await self?.resumePurchases()
        }
    }

    func destroy() {
        recoveryStopped = true
        if let check = preflightCheck { finishPreflight(check.id, result: false, stopped: "destroy") }
        checkoutTransactions.stop()
        for job in interruptedRecoveryJobs.values { job.task.cancel() }
        interruptedRecoveryJobs.removeAll()
        checkoutID = nil
        checkoutRequest = nil
        for job in recoveryJobs.values { job.task.cancel() }
        recoveryJobs.removeAll()
        for job in completedFinishJobs.values { job.task.cancel() }
        // Each finish operation owns its entry until it actually returns.
        warmupTask?.cancel()
        warmupTask = nil
        connectionWarmupTask?.cancel()
        connectionWarmupTask = nil
        for job in statusJobs.values { job.task.cancel() }
        storefrontTask?.cancel()
        storefrontTask = nil
        catalogTask?.task.cancel()
        invalidateProductCache()
        updatesTask?.cancel()
        updatesTask = nil
        launchTask?.cancel()
        launchTask = nil
        // In-flight confirmations own their locks until their real completion.
        activeRequest = nil
        activeContext = nil
    }

    func launch(_ request: PayRequest) {
        launch(request, retryingOriginal: false)
    }

    /// Called on game entry/foreground, not by an authentication or purchase
    /// timer. Catalog work and connection warmup run independently of checkout.
    func prepareForCheckout() {
        guard !recoveryStopped, !isProcessingPayment, interruptedRecoveryJobs.isEmpty,
              ProcessInfo.processInfo.systemUptime - lastPreparationAt >= 30 else { return }
        lastPreparationAt = ProcessInfo.processInfo.systemUptime
        if connectionWarmupTask == nil {
            connectionWarmupTask = Task { [weak self] in
                guard let self else { return }
                await self.backend.prepareConnection()
                self.connectionWarmupTask = nil
            }
        }
        guard warmupTask == nil else { return }
        warmupTask = Task { [weak self] in
            guard let self else { return }
            defer { self.warmupTask = nil }
            do {
                let product = try await self.loadProduct("pbm_tier_099")
                PaymentDebugLog.record("storekit-preflight-complete available=\(product != nil)")
            } catch {
                PaymentDebugLog.record("storekit-preflight-failed")
            }
        }
    }

    /// Called only by the native, explicit "retry original order" action.
    func retryOriginal(_ request: PayRequest) {
        launch(request, retryingOriginal: true)
    }

    func retryRequest(for request: PayRequest?) -> PayRequest? {
        guard let request, let context = blockingContext(for: request),
              context.recoveryState == "interrupted" || context.recoveryState == "awaitingApple",
              context.transactionId == nil, context.pendingSince == nil,
              context.appAccountToken != nil, let original = context.request,
              !original.username.isEmpty, original.username == request.username,
              original.uid == request.uid, original.roleId == request.roleId,
              original.serverId == request.serverId, original.channel == request.channel,
              original.goodsId == request.goodsId else { return nil }
        return original
    }

    func hasUnresolvedOrder(for request: PayRequest?) -> Bool {
        guard let request, let context = findContext(for: request),
              let original = context.request else { return false }
        return original.cpOrder == request.cpOrder && original.username == request.username
    }

    var hasRetainedOrders: Bool {
        guard let contexts = loadContexts() else { return true }
        return !contexts.isEmpty
    }

    private func launch(_ request: PayRequest, retryingOriginal: Bool) {
        PaymentDebugLog.record("launch-request product=\(request.resolvedProductId()) price=\(request.price)")
        guard launchTask == nil else {
            PaymentDebugLog.record("launch-rejected code=PAYMENT_IN_PROGRESS")
            listener?.onError(request, code: "PAYMENT_IN_PROGRESS", message: checkoutBlockingMessage ?? "App Store 正在處理目前付款")
            return
        }
        #if DEBUG
        guard !PaymentDiagnosticsViewController.authenticationInProgress else {
            PaymentDebugLog.record("launch-rejected code=STORE_AUTHENTICATION_IN_PROGRESS")
            listener?.onError(request, code: "STORE_AUTHENTICATION_IN_PROGRESS", message: "Finish or cancel the existing App Store sign-in before purchasing")
            return
        }
        #endif
        activeRequest = request
        guard loadContexts() != nil else {
            finishActiveRequest(request)
            listener?.onError(request, code: "PURCHASE_STORAGE_UNAVAILABLE", message: "Original order journal is unavailable; no purchase was started")
            return
        }
        guard ShellConfig.storeKitEnabled else {
            PaymentDebugLog.record("launch-rejected code=STOREKIT_DISABLED")
            finishActiveRequest(request)
            listener?.onError(request, code: "STOREKIT_DISABLED", message: "App Store purchases are not enabled")
            return
        }
        guard backend.isPurchaseConfirmationConfigured else {
            PaymentDebugLog.record("launch-rejected code=PURCHASE_SERVER_CONTRACT_MISSING")
            finishActiveRequest(request)
            listener?.onError(request, code: "PURCHASE_SERVER_CONTRACT_MISSING", message: "Purchase verification and delivery contract is not configured")
            return
        }
        let productId = request.resolvedProductId()
        guard !productId.isEmpty else {
            PaymentDebugLog.record("launch-rejected code=PRICE_TIER_NOT_CONFIGURED price=\(request.price)")
            finishActiveRequest(request)
            listener?.onError(request, code: "PRICE_TIER_NOT_CONFIGURED", message: "No App Store product is configured for this price tier")
            return
        }
        guard ProductCatalog.contains(productId) else {
            PaymentDebugLog.record("launch-rejected code=PRODUCT_ID_NOT_ALLOWED product=\(productId)")
            finishActiveRequest(request)
            listener?.onError(request, code: "PRODUCT_ID_NOT_ALLOWED", message: "The requested App Store product is not in the approved catalog")
            return
        }

        let id = UUID()
        // Capture before queuing async work: background delivery may complete
        // between this player's tap and the preflight worker starting.
        let selectionAtLaunch = blockingContext(for: request)?.request
        checkoutID = id
        checkoutRequest = request
        launchTask = Task { [weak self] in
            guard let self else { return }
            let preflightStarted = ProcessInfo.processInfo.systemUptime
            let shouldOpenCheckout = await self.boundedRecoverBeforeLaunch(request, productId: productId, retryingOriginal: retryingOriginal, selectionAtLaunch: selectionAtLaunch)
            self.recordTiming("checkout-preflight", since: preflightStarted)
            if shouldOpenCheckout, !Task.isCancelled, self.checkoutID == id {
                await self.createOrderAndPurchase(request, expectedProductId: productId, retryingOriginal: retryingOriginal)
            }
            if self.checkoutID == id {
                self.launchTask = nil
                self.checkoutID = nil
                self.checkoutRequest = nil
                PaymentDebugLog.record("checkout-released product=\(productId)")
                self.listener?.onCheckoutReleased(request)
            }
        }
    }

    func resumePurchases() async {
        _ = await scanUnfinished(trigger: .observed)
    }

    /// Recovery only: no order creation, payment sheet, or sign-in synchronization. A user
    /// action can retry after the automatic budget is exhausted or the server is fixed.
    func checkPendingPayments() async -> String? {
        PaymentDebugLog.record("payment-recovery-check-start")
        guard !recoveryScanRunning else {
            PaymentDebugLog.record("payment-recovery-check-busy reason=scan")
            return "查單正在進行，請稍候再查；本次未發起付款"
        }
        guard !isProcessingPayment else {
            PaymentDebugLog.record("payment-recovery-check-busy reason=payment")
            return checkoutBlockingMessage ?? "訂單仍在核對，請稍候再查單"
        }
        let result = await scanUnfinished(trigger: .manual)
        PaymentDebugLog.record("payment-recovery-check-result total=\(result.total) delivered=\(result.delivered) historical=\(result.historicalIDs.count) historicalRemaining=\(result.historicalRemaining) pending=\(result.pending) failed=\(result.failed) interrupted=\(result.interrupted) retained=\(hasRetainedOrders)")
        return recoveryMessage(result)
    }

    private func scanUnfinished(trigger: RecoveryTrigger) async -> RecoveryScanSummary {
        var summary = RecoveryScanSummary()
        guard !recoveryStopped, !Task.isCancelled, !recoveryScanRunning else {
            summary.interrupted = true
            return summary
        }
        recoveryScanRunning = true
        defer { recoveryScanRunning = false }
        var seen = Set<UInt64>()
        guard let snapshot = await checkoutTransactions.read(timeout: preflightTimeout),
              !Task.isCancelled, !recoveryStopped else {
            summary.interrupted = true
            return summary
        }
        for verification in snapshot {
            guard !Task.isCancelled, !recoveryStopped else { break }
            let id: UInt64
            switch verification {
            case .verified(let value), .unverified(let value, _): id = value.id
            }
            guard seen.insert(id).inserted else { continue }
            summary.total += 1
            switch await handle(verification: verification, trigger: trigger, waitForHistoricalFinish: trigger == .manual) {
            case .delivered: summary.delivered += 1
            case .alreadyDelivered: summary.historicalIDs.insert(id)
            case .inProgress: summary.pending += 1
            case .failed(let code, _):
                if code == "DELIVERY_RETRY_SCHEDULED" || code == "DELIVERY_PENDING" {
                    summary.pending += 1
                } else {
                    summary.failed += 1
                }
            }
        }
        // finish() has no server-acknowledgement result. Re-read the queue before
        // claiming that historical transactions have disappeared. This pass is
        // read-only: it cannot deliver, finish, purchase, or start authentication.
        if trigger == .manual, !summary.historicalIDs.isEmpty, !Task.isCancelled, !recoveryStopped {
            var remaining = Set<UInt64>()
            guard let remainingSnapshot = await checkoutTransactions.read(timeout: preflightTimeout),
                  !Task.isCancelled, !recoveryStopped else {
                summary.interrupted = true
                return summary
            }
            for verification in remainingSnapshot {
                guard !Task.isCancelled, !recoveryStopped else { break }
                let id: UInt64
                switch verification {
                case .verified(let value), .unverified(let value, _): id = value.id
                }
                if summary.historicalIDs.contains(id) { remaining.insert(id) }
            }
            summary.historicalRemaining = remaining.count
        }
        summary.interrupted = Task.isCancelled || recoveryStopped
        if !summary.interrupted {
            for context in (loadContexts() ?? [:]).values.sorted(by: { $0.sdkOrderId < $1.sdkOrderId }) {
                switch await reconcileDeliveredOrder(orderId: context.sdkOrderId, force: trigger == .manual) {
                case .delivered: summary.delivered += 1
                case .unavailable: summary.unavailableOrders += 1
                case .unresolved: break
                }
            }
        }
        return summary
    }

    private func recoveryMessage(_ result: RecoveryScanSummary) -> String {
        if result.interrupted { return "查單已中斷，請稍後再查；本次未發起付款" }
        if result.unavailableOrders > 0 {
            let delivered = result.delivered > 0 ? "已確認補發 \(result.delivered) 筆；" : ""
            return delivered + "\(result.unavailableOrders) 筆原訂單暫時無法核對，紀錄已保留；本次未再次發起付款"
        }
        if result.failed > 0 || result.pending > 0 {
            var parts: [String] = []
            if result.delivered > 0 { parts.append("已確認補發 \(result.delivered) 筆") }
            if result.failed > 0 { parts.append("\(result.failed) 筆交易需核對") }
            if result.pending > 0 { parts.append("\(result.pending) 筆仍待確認") }
            return "查單完成：" + parts.joined(separator: "；") + "。請稍後查單，勿重複購買"
        }
        let unconfirmedCheckout = (loadContexts() ?? [:]).values.contains { context in
            return context.transactionId == nil && context.pendingSince == nil
        }
        if result.delivered == 0, unconfirmedCheckout {
            return "暫未查到付款結果，原訂單已保留。請回商品頁處理；若已付款，請勿重買"
        }
        var message: String
        if result.delivered > 0 {
            message = "查單完成：已確認補發 \(result.delivered) 筆；本次未發起付款"
        } else if result.historicalRemaining > 0 {
            message = "已到帳訂單仍待同步，系統會處理；本次未發起付款"
        } else if !result.historicalIDs.isEmpty {
            message = "查單完成：舊交易已收尾；本次未發起付款"
        } else {
            message = "查單完成：目前沒有可補發的交易；本次未發起付款"
        }
        if hasRetainedOrders {
            message += "。另有訂單待確認，請勿重複購買"
        }
        return message
    }

    /// Stop only the read/recovery preflight. Never cancel a live purchase or
    /// interpret timeout as proof that an older order was unpaid.
    @discardableResult
    func stopWaitingForPreflight() -> Bool {
        guard canStopPreflight, let check = preflightCheck else { return false }
        finishPreflight(check.id, result: false, stopped: "user")
        return true
    }

    private func boundedRecoverBeforeLaunch(_ request: PayRequest, productId: String, retryingOriginal: Bool, selectionAtLaunch: PayRequest? = nil) async -> Bool {
        guard !Task.isCancelled, !recoveryStopped, preflightCheck == nil else { return false }
        return await withCheckedContinuation { continuation in
            let id = UUID()
            let worker = Task { [weak self] in
                guard let self else { return }
                let result = await self.recoverBeforeLaunch(request, productId: productId, retryingOriginal: retryingOriginal, selectionAtLaunch: selectionAtLaunch)
                guard !Task.isCancelled else { return }
                self.finishPreflight(id, result: result)
            }
            let seconds = preflightTimeout
            let deadline = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) } catch { return }
                self?.finishPreflight(id, result: false, stopped: "timeout")
            }
            preflightCheck = PreflightCheck(id: id, request: request, continuation: continuation, worker: worker, deadline: deadline)
            PaymentDebugLog.record("checkout-check-start timeoutSeconds=\(seconds) applePurchaseStarted=false")
            listener?.onPaymentProgress(request, message: "正在檢查舊交易，尚未開啟付款；可點「停止等待」")
        }
    }

    private func finishPreflight(_ id: UUID, result: Bool, stopped: String? = nil) {
        guard let check = preflightCheck, check.id == id else { return }
        preflightCheck = nil
        check.deadline.cancel()
        if let stopped {
            check.worker.cancel()
            PaymentDebugLog.record("checkout-check-stopped reason=\(stopped) applePurchaseStarted=false originalOrdersRetained=true")
            finishActiveRequest(check.request)
            if stopped != "destroy" {
                let code = stopped == "timeout" ? "PAYMENT_CHECK_TIMEOUT" : "PAYMENT_CHECK_STOPPED"
                listener?.onError(check.request, code: code, message: stopped == "timeout"
                    ? "檢查舊交易逾時，本次尚未開啟付款；原訂單保留，請稍後再查"
                    : "已停止等待，本次尚未開啟付款；原訂單保留")
            }
        } else if result {
            listener?.onPaymentProgress(check.request, message: "檢查完成，正在準備付款…")
        }
        // Resume once without waiting for an uncooperative StoreKit read. The
        // worker cannot proceed to purchase; that is owned by the awaiting caller.
        check.continuation.resume(returning: result)
    }

    /// Isolate game orders, not price tiers. Known unrelated orders retain their own
    /// recovery records and cannot monopolize another game's item at the same price.
    private func recoverBeforeLaunch(_ request: PayRequest, productId: String, retryingOriginal: Bool = false, selectionAtLaunch: PayRequest? = nil) async -> Bool {
        // A repeat tap while this item has an unresolved order is a recovery
        // intent, not permission to buy again if that older order just delivers.
        // This also protects limited gifts without inventing local weekly rules.
        let selectionAtStart = selectionAtLaunch ?? blockingContext(for: request)?.request
        guard let snapshot = await checkoutTransactions.read(), !Task.isCancelled, !recoveryStopped else { return false }
        for verification in snapshot {
            guard !Task.isCancelled, !recoveryStopped else { return false }
            let transaction: Transaction
            switch verification {
            case .unverified(let value, let error):
                guard value.productID == productId else { continue }
                if let owner = findContext(transaction: value)?.request, !sameSelection(owner, request) { continue }
                finishActiveRequest(request)
                listener?.onError(request, code: "STOREKIT_UNVERIFIED", message: error.localizedDescription)
                return false
            case .verified(let value):
                guard value.productID == productId else { continue }
                transaction = value
            }

            let unrelated = findContext(transaction: transaction)?.request.map { !sameSelection($0, request) } ?? false

            let result = await confirm(
                transaction: transaction,
                jws: verification.jwsRepresentation,
                notifySuccess: true,
                notifyFailure: false
            )
            guard !Task.isCancelled, !recoveryStopped else { return false }
            switch result {
            case .delivered(let recoveredRequest):
                if recoveredRequest?.cpOrder == request.cpOrder {
                    // The retry was the already-delivered order. Its callback above is the
                    // terminal result; opening another checkout would double-charge it.
                    finishActiveRequest(request)
                    return false
                }
            case .alreadyDelivered(let cpOrder):
                if cpOrder == request.cpOrder {
                    finishActiveRequest(request)
                    listener?.onError(request, code: "PURCHASE_ALREADY_PROCESSED", message: "Original order already completed; no new purchase was started")
                    return false
                }
            case .inProgress:
                if unrelated { continue }
                finishActiveRequest(request)
                listener?.onError(
                    request,
                    code: "PURCHASE_RECOVERY_IN_PROGRESS",
                    message: "An existing purchase is still being verified; please try again shortly"
                )
                return false
            case .failed(let code, let message):
                if unrelated { continue }
                finishActiveRequest(request)
                listener?.onError(request, code: code, message: message)
                return false
            }
        }

        // A local uncertain marker is not proof of non-payment. Ask the actual
        // delivery backend before offering a retry or rejecting a new tap.
        guard !Task.isCancelled, !recoveryStopped else { return false }
        if finishRecoveredSelection(selectionAtStart, for: request) { return false }
        let blocker = blockingContext(for: request)
        let reconciled = if let blocker {
            await reconcileDeliveredOrder(orderId: blocker.sdkOrderId, force: true)
        } else { OrderReconciliation.unavailable }
        guard !Task.isCancelled, !recoveryStopped else { return false }
        if finishRecoveredSelection(selectionAtStart, for: request) { return false }
        if completedTransactions.contains(where: { $0.cpOrder == request.cpOrder }) {
            finishActiveRequest(request)
            if reconciled == .delivered { return false } // Reconciliation already emitted the single success result.
            listener?.onError(request, code: "PURCHASE_ALREADY_PROCESSED", message: "Original order already completed; no new purchase was started")
            return false
        }

        if blockingContext(for: request)?.pendingSince != nil {
            // Age is not proof of cancellation; keep Ask to Buy orders recoverable.
            finishActiveRequest(request)
            listener?.onPending(request)
            return false
        }
        // Preserve existing pending/verified/account-isolation behavior. Only a
        // retryable interrupted order may ever reach another purchase call.
        // A lookup failure, mismatched response, or paid/unknown server state
        // must not be treated as an unpaid order, including on a rapid retry.
        if let blocker, blockingContext(for: request)?.sdkOrderId == blocker.sdkOrderId,
           retryRequest(for: request) != nil {
            switch reconciled {
            case .unavailable:
                finishActiveRequest(request)
                listener?.onError(request, code: "ORDER_STATUS_UNAVAILABLE",
                    message: "暫時無法核對原訂單，尚未再次發起付款；請稍後再試")
                return false
            case .unresolved(retryEligible: false):
                finishActiveRequest(request)
                listener?.onError(request, code: "ORIGINAL_PAYMENT_UNCONFIRMED",
                    message: "原訂單付款結果仍待確認，暫不再次發起付款；若已扣款請勿重買")
                return false
            case .unresolved(retryEligible: true), .delivered:
                break
            }
        }
        if retryingOriginal {
            guard retryRequest(for: request)?.cpOrder == request.cpOrder else {
                finishActiveRequest(request)
                listener?.onError(request, code: "PURCHASE_RECOVERY_REQUIRED", message: "Original order must be checked before purchasing again")
                return false
            }
        } else if blockingContext(for: request) != nil {
            finishActiveRequest(request)
            listener?.onError(request, code: "PURCHASE_RECOVERY_REQUIRED", message: "An original order is unresolved; no new order was created")
            return false
        }
        return true
    }

    private func finishRecoveredSelection(_ selection: PayRequest?, for request: PayRequest) -> Bool {
        guard let selection, selection.cpOrder != request.cpOrder,
              completedTransactions.contains(where: { $0.cpOrder == selection.cpOrder }) else { return false }
        finishActiveRequest(request)
        listener?.onError(request, code: "PURCHASE_ALREADY_PROCESSED",
            message: "此商品的原訂單已處理完成，本次未再次發起付款")
        return true
    }

    private func createOrderAndPurchase(_ request: PayRequest, expectedProductId: String, retryingOriginal: Bool = false) async {
        var phase = "product-query"
        var phaseStarted = ProcessInfo.processInfo.systemUptime
        do {
            // Resolve availability before creating a backend order. Reuse this exact
            // Product for checkout, after validating the backend's returned SKU.
            try Task.checkCancellation()
            PaymentDebugLog.record("product-query-start product=\(expectedProductId)")
            guard let product = try await loadProduct(expectedProductId) else {
                PaymentDebugLog.record("product-query-missing product=\(expectedProductId) backendOrderCreated=false")
                finishActiveRequest(request)
                listener?.onError(request, code: retryingOriginal ? "RETRY_PRODUCT_NOT_FOUND" : "PRODUCT_NOT_FOUND", message: "App Store did not return this product; no new backend order was created")
                return
            }
            try Task.checkCancellation()
            PaymentDebugLog.record("product-query-success product=\(product.id) displayPrice=\(product.displayPrice)")
            let checkoutStorefront = SKPaymentQueue.default().storefront?.identifier
            recordTiming(phase, since: phaseStarted)
            if retryingOriginal {
                // Catalog loading is an await point: an old transaction can arrive
                // during it. Recover again before re-entering the Apple sheet.
                guard await boundedRecoverBeforeLaunch(request, productId: expectedProductId, retryingOriginal: true),
                      var context = findContext(for: request) else { return }
                guard let savedStorefront = context.storefrontId, savedStorefront == checkoutStorefront else {
                    throw BackendGateway.GatewayError.message(code: "STOREFRONT_CHANGED", message: "Return to the original App Store region before retrying this order")
                }
                guard context.priceAmountMicros == priceAmountMicros(product), context.currencyCode == currencyCode(for: product) else {
                    throw BackendGateway.GatewayError.message(code: "ORIGINAL_PRICE_CHANGED", message: "The original product price changed; check the original transaction before purchasing")
                }
                activeContext = context
                phase = "purchase"
                phaseStarted = ProcessInfo.processInfo.systemUptime
                PaymentDebugLog.record("retry-original-order product=\(expectedProductId) backendOrderCreated=false")
                try await purchase(product: product, context: &context, request: request)
                return
            }
            phase = "backend-create-order"
            phaseStarted = ProcessInfo.processInfo.systemUptime
            listener?.onPaymentProgress(request, message: "正在建立支付訂單…")
            PaymentDebugLog.record("backend-create-order-start product=\(expectedProductId) usernamePresent=\(!request.username.isEmpty)")
            let order = try await backend.createPlayOrder(request)
            try Task.checkCancellation()
            PaymentDebugLog.record("backend-create-order-success product=\(order.productId)")
            recordTiming(phase, since: phaseStarted)
            guard ProductCatalog.contains(order.productId) else {
                finishActiveRequest(request)
                listener?.onError(request, code: "PRODUCT_ID_NOT_ALLOWED", message: "SDK backend returned a product outside the approved catalog")
                return
            }
            guard order.productId == expectedProductId else {
                finishActiveRequest(request)
                listener?.onError(request, code: "PRODUCT_ID_MISMATCH", message: "SDK backend product does not match the requested price tier")
                return
            }
            guard let contexts = loadContexts(),
                  !contexts.values.contains(where: { $0.sdkOrderId == order.orderId || ($0.productId == order.productId && $0.appAccountToken == order.appAccountToken) }) else {
                throw BackendGateway.GatewayError.message(code: "ORDER_IDENTITY_CONFLICT", message: "Backend reused an unresolved order identity; no new Apple purchase was started")
            }
            guard checkoutStorefront == SKPaymentQueue.default().storefront?.identifier else {
                throw BackendGateway.GatewayError.message(code: "STOREFRONT_CHANGED", message: "App Store region changed; please retry")
            }
            var context = PurchaseContext(
                requestJSON: request.rawJSON,
                sdkOrderId: order.orderId,
                productId: order.productId,
                priceAmountMicros: 0,
                currencyCode: "",
                pendingSince: nil,
                appAccountToken: order.appAccountToken,
                storefrontId: checkoutStorefront
            )
            activeContext = context
            guard storeContext(context) else {
                throw BackendGateway.GatewayError.message(code: "PURCHASE_STORAGE_UNAVAILABLE", message: "Cannot persist order before purchasing")
            }
            phase = "purchase"
            phaseStarted = ProcessInfo.processInfo.systemUptime
            try await purchase(product: product, context: &context, request: request)
        } catch let error as BackendGateway.GatewayError {
            recordTiming(phase + "-failed", since: phaseStarted)
            PaymentDebugLog.record("\(phase)-failed code=\(error.code) message=\(error.localizedDescription)")
            // A failed preflight on a retry must not delete the original order.
            if !retryingOriginal && phase != "purchase" { removeActiveContext(for: request) }
            finishActiveRequest(request)
            listener?.onError(request, code: error.code, message: error.localizedDescription)
        } catch is CancellationError {
            PaymentDebugLog.record("\(phase)-cancelled")
            if phase == "purchase" {
                preserveInterrupted(request)
                if !Task.isCancelled && !isSettlingOrCompleted(request) {
                    listener?.onError(request, code: "STOREKIT_ERROR", message: "App Store did not return a final purchase result")
                }
            } else if !retryingOriginal { removeActiveContext(for: request) }
            finishActiveRequest(request)
        } catch {
            recordTiming(phase + "-failed", since: phaseStarted)
            let failure = Self.paymentFailure(for: error)
            PaymentDebugLog.record("\(phase)-error code=\(failure.code) chain=\(failure.diagnostic)")
            // An updates callback may have already delivered, or be delivering,
            // this order while Product.purchase() is returning a late error.
            guard !isSettlingOrCompleted(request) else { return }
            if phase == "purchase", !failure.isUserCancellation {
                preserveInterrupted(request)
                if failure.shouldCheckOriginalAutomatically {
                    invalidateProductCache()
                    scheduleInterruptedRecovery(request)
                }
            } else if phase == "purchase", failure.isUserCancellation {
                cancelPurchaseAttempt(request)
            } else if !retryingOriginal {
                removeActiveContext(for: request)
            }
            finishActiveRequest(request)
            if phase == "purchase", failure.isUserCancellation {
                listener?.onCancel(request)
            } else {
                listener?.onError(request, code: failure.code, message: failure.message)
            }
        }
    }

    private func purchase(product: Product, context: inout PurchaseContext, request: PayRequest) async throws {
        try Task.checkCancellation()
        guard !isSettlingOrCompleted(request) else { return }
        guard let token = context.appAccountToken else {
            throw BackendGateway.GatewayError.message(code: "APP_ACCOUNT_TOKEN_MISSING", message: "The SDK order has no server account binding token")
        }
        if let priceMicros = priceAmountMicros(product) {
            context.priceAmountMicros = priceMicros
            context.currencyCode = currencyCode(for: product)
            storeContext(context)
            activeContext = context
        }
        listener?.onCheckoutStarted(request, context.productInfo())
        context.recoveryState = "awaitingApple"
        context.attemptCount = (context.attemptCount ?? 0) + 1
        guard storeContext(context) else {
            throw BackendGateway.GatewayError.message(code: "PURCHASE_STORAGE_UNAVAILABLE", message: "Cannot persist purchase attempt")
        }
        activeContext = context
        PaymentDebugLog.record("purchase-sheet-requested product=\(product.id)")

        let options: Set<Product.PurchaseOption> = [.appAccountToken(token)]
        let purchaseStarted = ProcessInfo.processInfo.systemUptime
        applePurchaseOrder = request.cpOrder
        defer { if applePurchaseOrder == request.cpOrder { applePurchaseOrder = nil } }
        let result = try await product.purchase(options: options)
        recordTiming("apple-purchase-return", since: purchaseStarted)
        switch result {
        case .success(let verification):
            PaymentDebugLog.record("purchase-result success product=\(product.id)")
            let confirmation = await handle(verification: verification, waitForHistoricalFinish: false)
            // Apple can return an older, already-delivered consumable from this
            // checkout. Silently deduplicating it would leave the NEW request's
            // native/H5 gates locked forever. Only the checkout owner releases
            // its request; background old-transaction callbacks must stay silent.
            let otherOrder: Bool
            switch confirmation {
            case .alreadyDelivered(let order): otherOrder = order != request.cpOrder
            case .delivered(let order): otherOrder = order?.cpOrder != request.cpOrder
            case .inProgress: otherOrder = !isSettlingOrCompleted(request)
            case .failed: otherOrder = !isSettlingOrCompleted(request) && activeRequest?.cpOrder == request.cpOrder
            }
            if otherOrder, !isSettlingOrCompleted(request) {
                PaymentDebugLog.record("purchase-old-transaction-returned product=\(product.id) currentOrderConfirmed=false")
                preserveInterrupted(request)
                finishActiveRequest(request)
                if case .failed(let code, let message) = confirmation {
                    listener?.onError(request, code: code, message: message)
                } else {
                    listener?.onError(request, code: "STOREKIT_PREVIOUS_TRANSACTION",
                        message: "App Store returned another order's transaction; this order remains unconfirmed")
                }
            }
        case .userCancelled:
            guard !isSettlingOrCompleted(request), findContext(for: request)?.transactionId == nil else { return }
            PaymentDebugLog.record("purchase-result user-cancelled product=\(product.id) source=storekit actualUserAction=unknown")
            cancelPurchaseAttempt(request)
            finishActiveRequest(request)
            listener?.onCancel(request)
        case .pending:
            guard !isSettlingOrCompleted(request), findContext(for: request)?.transactionId == nil else { return }
            PaymentDebugLog.record("purchase-result pending product=\(product.id)")
            context.pendingSince = Date().timeIntervalSince1970
            context.recoveryState = "pending"
            storeContext(context)
            activeContext = context
            finishActiveRequest(request)
            listener?.onPending(request)
        @unknown default:
            guard !isSettlingOrCompleted(request) else { return }
            PaymentDebugLog.record("purchase-result unknown product=\(product.id)")
            preserveInterrupted(request)
            finishActiveRequest(request)
            listener?.onError(request, code: "STOREKIT_UNKNOWN", message: "Unknown App Store purchase result")
        }
    }

    private func loadProduct(_ productId: String, attempt: Int = 0) async throws -> Product? {
        try Task.checkCancellation()
        do {
            let storefront = SKPaymentQueue.default().storefront?.identifier
            let now = ProcessInfo.processInfo.systemUptime
            if let storefront, storefront == catalogStorefront,
               now - catalogLoadedAt < productCacheLifetime,
               let product = cachedProducts[productId] {
                PaymentDebugLog.record("product-cache-hit product=\(productId)")
                return product
            }
            if storefront != catalogStorefront { invalidateProductCache() }
            catalogStorefront = storefront
            let generation = catalogGeneration
            let pending: (id: UUID, task: Task<[Product], Error>)
            if let existing = catalogTask {
                pending = existing
            } else {
                pending = (UUID(), Task { try await Product.products(for: ProductCatalog.allProductIds.sorted()) })
                catalogTask = pending
            }
            let products: [Product]
            do { products = try await pending.task.value }
            catch {
                if catalogTask?.id == pending.id { catalogTask = nil }
                throw error
            }
            if catalogTask?.id == pending.id { catalogTask = nil }
            try Task.checkCancellation()
            guard generation == catalogGeneration,
                  storefront == SKPaymentQueue.default().storefront?.identifier else {
                throw BackendGateway.GatewayError.message(code: "STOREFRONT_CHANGED", message: "App Store region changed; please retry")
            }
            cachedProducts = Dictionary(products.filter { ProductCatalog.contains($0.id) }.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
            catalogLoadedAt = ProcessInfo.processInfo.systemUptime
            PaymentDebugLog.record("product-catalog-loaded count=\(cachedProducts.count)")
            return products.first(where: { $0.id == productId })
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard attempt < maximumProductQueryRetries, !Task.isCancelled else { throw error }
            try await Task.sleep(nanoseconds: retryDelayNanoseconds)
            return try await loadProduct(productId, attempt: attempt + 1)
        }
    }

    private func invalidateProductCache() {
        catalogGeneration += 1
        cachedProducts.removeAll()
        catalogLoadedAt = 0
        catalogStorefront = nil
        // A stale fetch may finish, but its generation cannot populate this cache.
        catalogTask = nil
        PaymentDebugLog.record("product-cache-invalidated")
    }

    private func recordTiming(_ phase: String, since start: TimeInterval) {
        let milliseconds = Int((ProcessInfo.processInfo.systemUptime - start) * 1000)
        PaymentDebugLog.record("payment-timing stage=\(phase) elapsedMs=\(milliseconds)")
    }

    @discardableResult
    private func handle(verification: VerificationResult<Transaction>, trigger: RecoveryTrigger = .observed,
                        waitForHistoricalFinish: Bool = false) async -> ConfirmationResult {
        let transaction: Transaction
        switch verification {
        case .unverified(let value, let error):
            PaymentDebugLog.record("transaction-unverified product=\(value.productID) message=\(error.localizedDescription)")
            if var context = findContext(transaction: value) {
                context.recoveryState = "unverified"
                storeContext(context)
            }
            let request = findContext(transaction: value)?.request
            finishActiveRequest(request)
            if request != nil || activeRequest == nil { listener?.onError(request, code: "STOREKIT_UNVERIFIED", message: error.localizedDescription) }
            return .failed(code: "STOREKIT_UNVERIFIED", message: error.localizedDescription)
        case .verified(let verified):
            PaymentDebugLog.record("transaction-verified product=\(verified.productID) transaction=\(verified.id)")
            transaction = verified
        }
        return await confirm(
            transaction: transaction,
            jws: verification.jwsRepresentation,
            notifySuccess: true,
            notifyFailure: true,
            trigger: trigger,
            waitForHistoricalFinish: waitForHistoricalFinish
        )
    }

    private func confirm(
        transaction: Transaction,
        jws: String,
        notifySuccess: Bool,
        notifyFailure: Bool,
        trigger: RecoveryTrigger = .observed,
        waitForHistoricalFinish: Bool = true
    ) async -> ConfirmationResult {
        // Both Transaction.updates and purchase() can supply the SAME transaction.
        // Check identity before looking for a context already cleared by success.
        let token = String(transaction.id)
        if ProductCatalog.contains(transaction.productID),
           let completed = completedTransactions.first(where: { $0.transactionId == token }),
           completed.productId == transaction.productID,
           completed.appAccountToken == transaction.appAccountToken {
            PaymentDebugLog.record("transaction-duplicate-ignored transaction=\(token)")
            if !waitForHistoricalFinish {
                scheduleCompletedFinish(transaction)
                return .alreadyDelivered(cpOrder: completed.cpOrder)
            }
            return await finishCompletedTransaction(transaction, completed: completed, trigger: trigger)
        }
        guard !confirmingTokens.contains(token) else { return .inProgress }
        if ProductCatalog.contains(transaction.productID),
           AnalyticsEventCoordinator.hasLegacyVerifiedPurchase(transactionId: token) {
            // Old builds wrote their native verified-success marker only AFTER
            // server delivery. Migrate it without ordering, notifying H5, emitting
            // revenue again, or clearing a newer same-product purchase context.
            confirmingTokens.insert(token)
            defer { confirmingTokens.remove(token) }
            await transaction.finish()
            recordCompleted(transaction, cpOrder: "")
            completedFinishTimes[token] = ProcessInfo.processInfo.systemUptime
            PaymentDebugLog.record("legacy-completed-transaction-migrated transaction=\(token)")
            return .alreadyDelivered(cpOrder: "")
        }
        let context = findContext(transaction: transaction)
        let request = context?.request
        guard var context else {
            let code = (loadContexts() ?? [:]).values.contains { $0.productId == transaction.productID } ? "ACCOUNT_MISMATCH" : "PURCHASE_CONTEXT_MISSING"
            PaymentDebugLog.record("confirmation-failed code=\(code) product=\(transaction.productID)")
            let message = "An App Store purchase exists but its SDK order context is missing"
            // Unowned background receipts must not impersonate the current tap.
            // An explicit checkout/preflight reports its own failure separately.
            if notifyFailure, activeRequest == nil { listener?.onError(nil, code: code, message: message) }
            return .failed(code: code, message: message)
        }
        if let expectedToken = context.appAccountToken, transaction.appAccountToken != expectedToken {
            let message = "The App Store transaction does not match the original SDK order account"
            finishActiveRequest(request)
            if notifyFailure { listener?.onError(request, code: "ACCOUNT_MISMATCH", message: message) }
            return .failed(code: "ACCOUNT_MISMATCH", message: message)
        }
        if let expectedTransaction = context.transactionId, expectedTransaction != token {
            let message = "Another transaction is already bound to the original SDK order"
            finishActiveRequest(request)
            if notifyFailure { listener?.onError(request, code: "TRANSACTION_MISMATCH", message: message) }
            return .failed(code: "TRANSACTION_MISMATCH", message: message)
        }
        context.transactionId = token
        context.recoveryState = "confirmed"
        if trigger == .manual {
            cancelDeliveryRecovery(token)
            context.deliveryRetryCount = 0
            context.deliveryRetryAt = nil
            context.deliveryLastCode = nil
            context.deliveryNeedsReview = false
        } else if context.deliveryNeedsReview == true {
            let code = Self.isTransientDeliveryCode(context.deliveryLastCode ?? "") ? "DELIVERY_RETRY_EXHAUSTED" : "DELIVERY_REVIEW_REQUIRED"
            finishActiveRequest(request)
            if notifyFailure { listener?.onError(request, code: code, message: "Original transaction retained; use check/recover or contact support") }
            return .failed(code: code, message: "Original transaction retained; manual recovery required")
        } else if trigger == .observed, context.deliveryRetryAt != nil {
            scheduleDeliveryRecovery(transaction: transaction, jws: jws, context: context)
            finishActiveRequest(request)
            return .failed(code: "DELIVERY_RETRY_SCHEDULED", message: "Original transaction is waiting for automatic delivery retry")
        }
        if trigger == .automatic {
            guard (context.deliveryRetryCount ?? 0) < deliveryRetryDelays.count else {
                context.deliveryNeedsReview = true
                context.deliveryRetryAt = nil
                storeContext(context)
                finishActiveRequest(request)
                if notifyFailure { listener?.onError(request, code: "DELIVERY_RETRY_EXHAUSTED", message: "Automatic delivery retry limit reached; original transaction retained") }
                return .failed(code: "DELIVERY_RETRY_EXHAUSTED", message: "Automatic delivery retry limit reached")
            }
            // Persist before contacting the server. A restart cannot reset the budget.
            context.deliveryRetryCount = (context.deliveryRetryCount ?? 0) + 1
        }
        // Leave a durable recovery deadline while the HTTP request is in flight.
        // If the process dies, the next launch resumes with the same retry budget.
        if context.deliveryRetryAt == nil { context.deliveryRetryAt = recoveryNow() + deliveryRetryDelays[0] }
        guard storeContext(context) else {
            finishActiveRequest(request)
            if notifyFailure { listener?.onError(request, code: "PURCHASE_STORAGE_UNAVAILABLE", message: "Original transaction retained; journal unavailable") }
            return .failed(code: "PURCHASE_STORAGE_UNAVAILABLE", message: "Cannot persist transaction binding")
        }
        guard confirmingTokens.insert(token).inserted else { return .inProgress }
        confirmingOrders.insert(context.sdkOrderId)
        defer {
            confirmingTokens.remove(token)
            confirmingOrders.remove(context.sdkOrderId)
        }

        let confirmationStarted = ProcessInfo.processInfo.systemUptime
        do {
            if trigger != .automatic { listener?.onPaymentProgress(request, message: "App Store 已確認，正在驗證並發放獎勵…") }
            PaymentDebugLog.record("confirmation-start product=\(transaction.productID) transaction=\(transaction.id)")
            let confirmation = try await backend.confirmPurchase(
                sdkOrderId: context.sdkOrderId,
                signedTransaction: jws,
                productId: transaction.productID,
                transactionId: String(transaction.id)
            )
            recordTiming("backend-confirmation", since: confirmationStarted)
            guard confirmation.consume else {
                throw BackendGateway.GatewayError.message(code: "DELIVERY_PENDING", message: "Server delivery is not complete; the transaction remains unfinished")
            }
            PaymentDebugLog.record("confirmation-success product=\(transaction.productID) transaction=\(transaction.id)")
            // consume=true is the server's verified-delivery acknowledgement.
            // Persist that proof before releasing this order. Apple finish may
            // take seconds and must not delay the already-earned game reward.
            recordCompleted(transaction, cpOrder: context.request?.cpOrder ?? "")
            cancelDeliveryRecovery(token)
            removeStoredContext(context)
            finishActiveRequest(request)
            scheduleCompletedFinish(transaction)
            if notifySuccess {
                listener?.onSuccess(
                    request,
                    orderId: context.sdkOrderId,
                    transactionId: String(transaction.id),
                    productInfo: context.productInfo()
                )
            }
            return .delivered(request)
        } catch let error as BackendGateway.GatewayError {
            recordTiming("backend-confirmation-failed", since: confirmationStarted)
            PaymentDebugLog.record("confirmation-failed code=\(error.code) message=\(error.localizedDescription)")
            return deliveryFailed(transaction: transaction, jws: jws, context: context,
                                  code: error.code, message: error.localizedDescription,
                                  notifyFailure: notifyFailure, trigger: trigger)
        } catch {
            recordTiming("backend-confirmation-failed", since: confirmationStarted)
            let value = error as NSError
            let interrupted = error is CancellationError || (value.domain == NSURLErrorDomain && value.code == -999)
            let transient = value.domain == NSURLErrorDomain && [-1001, -1003, -1004, -1005, -1006, -1009].contains(value.code)
            let code = interrupted ? "DELIVERY_INTERRUPTED" : (transient ? "NETWORK_ERROR" : "DELIVERY_REVIEW_REQUIRED")
            PaymentDebugLog.record("confirmation-failed code=\(code) chain=\(Self.paymentFailure(for: error).diagnostic)")
            return deliveryFailed(transaction: transaction, jws: jws, context: context,
                                  code: code, message: "Original transaction retained after verification request failed",
                                  notifyFailure: notifyFailure, trigger: trigger)
        }
    }

    static func isTransientDeliveryCode(_ code: String) -> Bool {
        ["NETWORK_ERROR", "HTTP_0", "HTTP_408", "HTTP_429", "HTTP_500", "HTTP_502", "HTTP_503", "HTTP_504", "DELIVERY_PENDING", "DELIVERY_INTERRUPTED"].contains(code)
    }

    private func deliveryFailed(transaction: Transaction, jws: String, context: PurchaseContext,
                                code: String, message: String, notifyFailure: Bool,
                                trigger: RecoveryTrigger) -> ConfirmationResult {
        var saved = context
        saved.deliveryLastCode = code
        let attempts = saved.deliveryRetryCount ?? 0
        let retry = Self.isTransientDeliveryCode(code) && attempts < deliveryRetryDelays.count
        let reportCode: String
        if retry {
            saved.deliveryRetryAt = recoveryNow() + deliveryRetryDelays[attempts]
            saved.deliveryNeedsReview = false
            reportCode = "DELIVERY_RETRY_SCHEDULED"
        } else {
            saved.deliveryRetryAt = nil
            saved.deliveryNeedsReview = true
            reportCode = Self.isTransientDeliveryCode(code) ? "DELIVERY_RETRY_EXHAUSTED" : code
        }
        storeContext(saved)
        finishActiveRequest(saved.request)
        if retry { scheduleDeliveryRecovery(transaction: transaction, jws: jws, context: saved) }
        else { cancelDeliveryRecovery(String(transaction.id)) }
        // Intermediate retries stay quiet. Initial status and final exhaustion
        // are visible; neither is a success or a reason to repurchase.
        if notifyFailure && (trigger != .automatic || !retry) {
            listener?.onError(saved.request, code: reportCode, message: message)
        }
        return .failed(code: reportCode, message: message)
    }

    private func scheduleDeliveryRecovery(transaction: Transaction, jws: String, context: PurchaseContext) {
        let token = String(transaction.id)
        guard !recoveryStopped, recoveryJobs[token] == nil,
              let retryAt = context.deliveryRetryAt, context.deliveryNeedsReview != true else { return }
        let id = UUID()
        let delay = max(0, min(60, retryAt - recoveryNow()))
        let wait = recoveryWait
        let task = Task { [weak self] in
            do { try await wait(delay) } catch { return }
            guard !Task.isCancelled, let self, !self.recoveryStopped,
                  self.recoveryJobs[token]?.id == id else { return }
            self.recoveryJobs.removeValue(forKey: token)
            guard let current = self.findContext(orderId: context.sdkOrderId),
                  current.sdkOrderId == context.sdkOrderId, current.transactionId == token else { return }
            PaymentDebugLog.record("delivery-auto-retry product=\(transaction.productID) attempt=\((current.deliveryRetryCount ?? 0) + 1)")
            _ = await self.confirm(transaction: transaction, jws: jws, notifySuccess: true,
                                   notifyFailure: true, trigger: .automatic)
        }
        recoveryJobs[token] = RecoveryJob(id: id, task: task)
        PaymentDebugLog.record("delivery-retry-scheduled product=\(transaction.productID) delaySeconds=\(Int(delay))")
    }

    private func cancelDeliveryRecovery(_ transactionId: String) {
        recoveryJobs.removeValue(forKey: transactionId)?.task.cancel()
    }

    /// Only called after StoreKit signature verification AND an exact match to
    /// the journal written after server-confirmed delivery. No new context is
    /// read/cleared here; this old transaction must never settle a newer order.
    private func finishCompletedTransaction(_ transaction: Transaction, completed: CompletedTransaction,
                                            trigger: RecoveryTrigger) async -> ConfirmationResult {
        guard !Task.isCancelled, !recoveryStopped else {
            return .failed(code: "DELIVERY_INTERRUPTED", message: "Historical transaction cleanup interrupted")
        }
        if let job = completedFinishJob(transaction, trigger: trigger) {
            // Preflight for the same product joins cleanup; it must not submit
            // another checkout while the old consumable is still being finished.
            // Purchase replies themselves use the nonblocking path in confirm.
            await job.task.value
        }
        return .alreadyDelivered(cpOrder: completed.cpOrder)
    }

    private func scheduleCompletedFinish(_ transaction: Transaction) {
        _ = completedFinishJob(transaction, trigger: .observed)
    }

    private func completedFinishJob(_ transaction: Transaction, trigger: RecoveryTrigger) -> RecoveryJob? {
        let token = String(transaction.id)
        guard !recoveryStopped, ProductCatalog.contains(transaction.productID),
              completedTransactions.contains(where: {
                  $0.transactionId == token && $0.productId == transaction.productID &&
                  $0.appAccountToken == transaction.appAccountToken
              }) else { return nil }
        if let job = completedFinishJobs[token] { return job }
        if trigger != .manual, let last = completedFinishTimes[token],
           ProcessInfo.processInfo.systemUptime - last < completedFinishCooldown { return nil }
        let id = UUID()
        let task = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.completedFinishJobs[token]?.id == id {
                    self.completedFinishJobs.removeValue(forKey: token)
                    self.finishingCompletedTokens.remove(token)
                }
            }
            guard !Task.isCancelled, !self.recoveryStopped else { return }
            PaymentDebugLog.record("completed-transaction-finish-start product=\(transaction.productID) transaction=\(token)")
            let started = ProcessInfo.processInfo.systemUptime
            await transaction.finish()
            self.recordTiming("apple-finish", since: started)
            self.completedFinishTimes[token] = ProcessInfo.processInfo.systemUptime
            PaymentDebugLog.record("completed-transaction-finish-returned product=\(transaction.productID) transaction=\(token)")
        }
        let job = RecoveryJob(id: id, task: task)
        finishingCompletedTokens.insert(token)
        completedFinishJobs[token] = job
        return job
    }

    private func recordCompleted(_ transaction: Transaction, cpOrder: String) {
        recordDelivered(transactionId: String(transaction.id), productId: transaction.productID,
                        appAccountToken: transaction.appAccountToken, cpOrder: cpOrder)
    }

    private func recordDelivered(transactionId token: String, productId: String, appAccountToken: UUID?, cpOrder: String) {
        completedTransactions.removeAll { $0.transactionId == token }
        completedTransactions.append(CompletedTransaction(transactionId: token, productId: productId,
                                                         appAccountToken: appAccountToken, cpOrder: cpOrder))
        completedTransactions = Array(completedTransactions.suffix(512))
        let recordedIDs = Set(completedTransactions.map { $0.transactionId })
        completedFinishTimes = completedFinishTimes.filter { recordedIDs.contains($0.key) }
        if let data = try? JSONEncoder().encode(completedTransactions), let text = String(data: data, encoding: .utf8) {
            store.set(text, forKey: completedKey)
        }
    }

    @discardableResult
    private func reconcileDeliveredOrder(orderId: String, force: Bool) async -> OrderReconciliation {
        guard !recoveryStopped, !Task.isCancelled,
              let context = findContext(orderId: orderId), let original = context.request,
              let accountToken = context.appAccountToken,
              !confirmingOrders.contains(context.sdkOrderId) else { return .unavailable }
        // Do not race the live Apple sheet or an active native confirmation.
        if applePurchaseOrder == original.cpOrder { return .unavailable }
        let productId = context.productId
        let job: StatusJob
        if let existing = statusJobs[context.sdkOrderId] {
            job = existing
        } else {
            let now = ProcessInfo.processInfo.systemUptime
            // Explicit retry checks need a real response, not a throttled false
            // or an old CREATED cache entry. Still join an in-flight lookup.
            if !force, let checked = statusCheckedAt[context.sdkOrderId], now - checked < 30 { return .unavailable }
            statusCheckedAt[context.sdkOrderId] = now
            job = StatusJob(id: UUID(), task: Task { try await self.backend.orderStatus(sdkOrderId: context.sdkOrderId) })
            statusJobs[context.sdkOrderId] = job
        }
        defer {
            if statusJobs[context.sdkOrderId]?.id == job.id { statusJobs.removeValue(forKey: context.sdkOrderId) }
        }
        do {
            let started = ProcessInfo.processInfo.systemUptime
            let status = try await job.task.value
            recordTiming("backend-order-status", since: started)
            guard !Task.isCancelled, !recoveryStopped,
                  status.orderId == context.sdkOrderId, status.cpOrder == original.cpOrder,
                  status.productId == context.productId, status.store == "app_store",
                  let current = findContext(orderId: context.sdkOrderId),
                  current.request?.cpOrder == original.cpOrder, current.appAccountToken == accountToken,
                  current.transactionId == nil || current.transactionId == status.transactionId,
                  !confirmingOrders.contains(context.sdkOrderId) else { return .unavailable }
            guard status.isDelivered else {
                return .unresolved(retryEligible: status.state == "CREATED" && status.transactionId.isEmpty && current.transactionId == nil)
            }
            // Never steal a transaction already bound to another order/account.
            if let completed = completedTransactions.first(where: { $0.transactionId == status.transactionId }),
               completed.cpOrder != original.cpOrder || completed.productId != productId || completed.appAccountToken != accountToken { return .unavailable }
            let alreadyNotified = completedTransactions.contains { $0.transactionId == status.transactionId }
            recordDelivered(transactionId: status.transactionId, productId: productId,
                            appAccountToken: accountToken, cpOrder: original.cpOrder)
            cancelDeliveryRecovery(status.transactionId)
            removeStoredContext(current)
            finishActiveRequest(original)
            PaymentDebugLog.record("server-order-reconciled product=\(productId) transaction=\(status.transactionId) state=CONSUMED")
            // No fake receipt, new order, purchase, or Apple finish here. If Apple
            // redelivers the signed transaction, the existing verified path finishes it.
            if !alreadyNotified {
                listener?.onSuccess(original, orderId: current.sdkOrderId,
                                    transactionId: status.transactionId, productInfo: current.productInfo())
            }
            return .delivered
        } catch {
            PaymentDebugLog.record("server-order-query-unavailable product=\(productId)")
            return .unavailable // Failure is not an unpaid order and never authorizes retry.
        }
    }

    // One journal entry per SDK ORDER, never per price tier. Legacy keys are
    // migrated only after writing and reading back the entire new journal.
    // Corruption is not an empty queue: fail closed, without erasing evidence.
    private func loadContexts() -> [String: PurchaseContext]? {
        var contexts: [String: PurchaseContext] = [:]
        if let text = store.string(forKey: contextsKey) {
            guard let data = text.data(using: .utf8),
                  let decoded = try? JSONDecoder().decode([String: PurchaseContext].self, from: data),
                  decoded.allSatisfy({ !$0.key.isEmpty && $0.key == $0.value.sdkOrderId && $0.value.request != nil }) else { return nil }
            contexts = decoded
        }
        var migratedKeys: [String] = []
        for productId in ProductCatalog.allProductIds {
            let key = contextPrefix + productId
            guard let text = store.string(forKey: key) else { continue }
            guard let data = text.data(using: .utf8),
                  let legacy = try? JSONDecoder().decode(PurchaseContext.self, from: data),
                  legacy.productId == productId, !legacy.sdkOrderId.isEmpty, legacy.request != nil else { return nil }
            if let current = contexts[legacy.sdkOrderId] {
                guard current.requestJSON == legacy.requestJSON,
                      current.productId == legacy.productId, current.appAccountToken == legacy.appAccountToken else { return nil }
            } else {
                contexts[legacy.sdkOrderId] = legacy
            }
            migratedKeys.append(key)
        }
        if !migratedKeys.isEmpty {
            guard saveContexts(contexts) else { return nil }
            for key in migratedKeys { store.removeObject(forKey: key) }
            PaymentDebugLog.record("order-journal-migrated count=\(migratedKeys.count)")
        }
        return contexts
    }

    private func saveContexts(_ contexts: [String: PurchaseContext]) -> Bool {
        guard let data = try? JSONEncoder().encode(contexts), let text = String(data: data, encoding: .utf8) else { return false }
        store.set(text, forKey: contextsKey)
        return store.string(forKey: contextsKey) == text
    }

    private func findContext(orderId: String) -> PurchaseContext? { loadContexts()?[orderId] }

    private func sameSelection(_ left: PayRequest, _ right: PayRequest) -> Bool {
        left.resolvedProductId() == right.resolvedProductId()
            && left.username == right.username && left.uid == right.uid
            && left.roleId == right.roleId && left.serverId == right.serverId
            && left.channel == right.channel
            && (left.goodsId == right.goodsId || left.goodsId <= 0 || right.goodsId <= 0)
    }

    private func findContext(for request: PayRequest) -> PurchaseContext? {
        let matches = (loadContexts() ?? [:]).values.filter {
            $0.request.map { $0.cpOrder == request.cpOrder && sameSelection($0, request) } == true
        }
        return matches.count == 1 ? matches.first : nil
    }

    private func blockingContext(for request: PayRequest) -> PurchaseContext? {
        let matches = (loadContexts() ?? [:]).values.filter { context in
            guard context.productId == request.resolvedProductId(), let original = context.request else { return false }
            // A legacy unbound order cannot safely coexist with another order of
            // that SKU. Recover it first; never guess ownership of a late receipt.
            return context.appAccountToken == nil || original.cpOrder == request.cpOrder || sameSelection(original, request)
        }.sorted { $0.sdkOrderId < $1.sdkOrderId }
        return matches.first
    }

    private func findContext(transaction: Transaction) -> PurchaseContext? {
        let candidates = (loadContexts() ?? [:]).values.filter { $0.productId == transaction.productID }
        if let token = transaction.appAccountToken {
            let matched = candidates.filter { $0.appAccountToken == token }
            if matched.count == 1 { return matched.first }
            if matched.count > 1 { return nil }
        }
        // Compatibility for a single old pre-token order; server verification is
        // still mandatory. With multiple orders, price/product is never identity.
        if candidates.count == 1, candidates.first?.appAccountToken == nil { return candidates.first }
        return nil
    }

    @discardableResult
    private func storeContext(_ context: PurchaseContext) -> Bool {
        guard var contexts = loadContexts(), !context.sdkOrderId.isEmpty else { return false }
        if let existing = contexts[context.sdkOrderId] {
            guard existing.requestJSON == context.requestJSON, existing.productId == context.productId,
                  existing.appAccountToken == context.appAccountToken else { return false }
        }
        contexts[context.sdkOrderId] = context
        return saveContexts(contexts)
    }

    private func removeStoredContext(_ context: PurchaseContext) {
        guard var contexts = loadContexts(), let current = contexts[context.sdkOrderId],
              current.requestJSON == context.requestJSON, current.appAccountToken == context.appAccountToken else { return }
        contexts.removeValue(forKey: context.sdkOrderId)
        guard saveContexts(contexts) else { return }
        if activeContext?.sdkOrderId == context.sdkOrderId { activeContext = nil }
    }

    private func removeActiveContext(for request: PayRequest) {
        guard let context = activeContext, context.request?.cpOrder == request.cpOrder else { return }
        removeStoredContext(context)
    }

    private func isSettlingOrCompleted(_ request: PayRequest) -> Bool {
        if completedTransactions.contains(where: { $0.cpOrder == request.cpOrder }) { return true }
        guard let context = findContext(for: request),
              context.request?.cpOrder == request.cpOrder else { return false }
        return context.transactionId != nil || confirmingOrders.contains(context.sdkOrderId)
    }

    private func cancelPurchaseAttempt(_ request: PayRequest) {
        guard let context = findContext(for: request),
              context.request?.cpOrder == request.cpOrder else { return }
        // Canceling the retry sheet says nothing about an earlier lost response.
        if (context.attemptCount ?? 1) > 1 { preserveInterrupted(request) }
        else { removeStoredContext(context) }
    }

    private func preserveInterrupted(_ request: PayRequest) {
        guard var context = findContext(for: request),
              context.request?.cpOrder == request.cpOrder,
              context.transactionId == nil, context.pendingSince == nil,
              context.recoveryState != "unverified" else { return }
        context.recoveryState = "interrupted"
        storeContext(context)
        activeContext = nil
        PaymentDebugLog.record("purchase-context-retained product=\(context.productId)")
    }

    struct PaymentFailure {
        let code: String
        let message: String
        let diagnostic: String
        var isUserCancellation: Bool { code == "USER_CANCELED" }
        var shouldCheckOriginalAutomatically: Bool {
            ["APP_STORE_CONNECTION_INTERRUPTED", "APP_STORE_SHEET_INTERRUPTED",
             "APP_STORE_TEMPORARILY_UNAVAILABLE", "APP_STORE_AUTHENTICATION_FAILED", "NETWORK_ERROR"].contains(code)
        }
    }

    /// A lost Apple reply is not permission to buy again. After a short backoff,
    /// check only this saved order (at most three times). Never sync/sign in,
    /// create an order or invoke purchase() from recovery.
    private func scheduleInterruptedRecovery(_ request: PayRequest) {
        guard !recoveryStopped, let context = findContext(for: request),
              context.transactionId == nil, context.pendingSince == nil,
              interruptedRecoveryJobs[context.sdkOrderId] == nil else { return }
        let id = UUID(), orderId = context.sdkOrderId
        let task = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.interruptedRecoveryJobs[orderId]?.id == id {
                    self.interruptedRecoveryJobs.removeValue(forKey: orderId)
                }
            }
            for delay: TimeInterval in [1, 3, 8] {
                do { try await self.recoveryWait(delay) } catch { return }
                guard !Task.isCancelled, !self.recoveryStopped,
                      let current = self.findContext(orderId: orderId),
                      current.requestJSON == context.requestJSON,
                      current.appAccountToken == context.appAccountToken,
                      current.transactionId == nil, current.pendingSince == nil,
                      current.recoveryState == "interrupted" else { return }
                // Foreground/preflight scans own the queue while they run.
                // Do not add competing StoreKit work to a live Apple sheet.
                guard self.applePurchaseOrder == nil, !self.recoveryScanRunning else { continue }
                self.recoveryScanRunning = true
                await self.checkInterruptedOrder(orderId)
                self.recoveryScanRunning = false
            }
            if self.findContext(orderId: orderId) != nil {
                PaymentDebugLog.record("original-recovery-paused product=\(context.productId) orderRetained=true automaticPurchase=false")
            }
        }
        interruptedRecoveryJobs[orderId] = RecoveryJob(id: id, task: task)
        PaymentDebugLog.record("original-recovery-scheduled product=\(context.productId) automaticPurchase=false")
    }

    private func checkInterruptedOrder(_ orderId: String) async {
        guard let snapshot = await checkoutTransactions.read(timeout: preflightTimeout),
              !Task.isCancelled, !recoveryStopped else { return }
        for verification in snapshot {
            guard !Task.isCancelled, !recoveryStopped else { return }
            guard case .verified(let transaction) = verification,
                  findContext(transaction: transaction)?.sdkOrderId == orderId else { continue }
            _ = await confirm(transaction: transaction, jws: verification.jwsRepresentation,
                              notifySuccess: true, notifyFailure: false, trigger: .automatic,
                              waitForHistoricalFinish: false)
        }
        guard !Task.isCancelled, !recoveryStopped else { return }
        _ = await reconcileDeliveredOrder(orderId: orderId, force: true)
    }

    /// Public StoreKit cases determine behavior. Internal Apple error metadata is
    /// diagnostic evidence only; never a reason to skip verification or finish.
    static func paymentFailure(for error: Error) -> PaymentFailure {
        var pending: [Error] = [error]
        var seen = Set<ObjectIdentifier>()
        var diagnostic: [String] = []
        var cancelled = false, network = false, authentication = false, gateway = false
        var serviceInterrupted = false, sheetInterrupted = false
        var count = 0
        while let next = pending.popLast(), count < 12 {
            count += 1
            if let storeError = next as? StoreKitError {
                switch storeError {
                case .userCancelled: cancelled = true
                case .networkError(let underlying): network = true; pending.append(underlying)
                case .systemError(let underlying): pending.append(underlying)
                default: break
                }
            }
            let value = next as NSError
            guard seen.insert(ObjectIdentifier(value)).inserted else { continue }
            let allowed = [SKErrorDomain, NSURLErrorDomain, NSCocoaErrorDomain, "StoreKit.StoreKitError", "AMSErrorDomain", "ASDErrorDomain", "AKAuthenticationError"]
            let domain = allowed.contains(value.domain) ? value.domain : "other"
            diagnostic.append("\(domain):\(value.code)")
            if value.domain == SKErrorDomain && value.code == SKError.paymentCancelled.rawValue { cancelled = true }
            if value.domain == NSURLErrorDomain { network = true }
            if value.domain == NSCocoaErrorDomain && [4097, 4099].contains(value.code) { serviceInterrupted = true }
            if value.domain == "AMSErrorDomain" {
                if value.code == 100 { authentication = true }
                if value.code == 6 { sheetInterrupted = true }
                if let status = value.userInfo["AMSStatusCode"] as? NSNumber, (500...599).contains(status.intValue) {
                    gateway = true
                    diagnostic.append("http:\(status.intValue)")
                }
            }
            if let underlying = value.userInfo[NSUnderlyingErrorKey] as? Error { pending.append(underlying) }
            if let underlying = value.userInfo["NSMultipleUnderlyingErrorsKey"] as? [Error] {
                pending.append(contentsOf: underlying.prefix(12))
            }
        }
        // Never log userInfo, URLs, descriptions, account identifiers or tokens.
        let chain = diagnostic.joined(separator: ">")
        if gateway { return PaymentFailure(code: "APP_STORE_TEMPORARILY_UNAVAILABLE", message: "App Store 暫時無法完成請求，請稍後檢查原訂單再重試", diagnostic: chain) }
        if serviceInterrupted { return PaymentFailure(code: "APP_STORE_CONNECTION_INTERRUPTED", message: "App Store 付款服務暫時中斷，原訂單已保留，系統會嘗試核對", diagnostic: chain) }
        if authentication { return PaymentFailure(code: "APP_STORE_AUTHENTICATION_FAILED", message: "App Store 認證未完成，請檢查登入狀態後重試原訂單", diagnostic: chain) }
        if network { return PaymentFailure(code: "NETWORK_ERROR", message: "連線中斷，請稍後檢查原訂單再重試", diagnostic: chain) }
        if sheetInterrupted { return PaymentFailure(code: "APP_STORE_SHEET_INTERRUPTED", message: "App Store 付款視窗未返回結果，原訂單已保留", diagnostic: chain) }
        // Public API cancellation does not prove the user tapped Cancel. iOS 16
        // also maps some sheet/authentication failures to this result.
        if cancelled { return PaymentFailure(code: "USER_CANCELED", message: "App Store 未完成這次付款", diagnostic: chain) }
        return PaymentFailure(code: "STOREKIT_ERROR", message: "App Store 未能完成請求，請稍後檢查原訂單再重試", diagnostic: chain)
    }

    private func finishActiveRequest(_ request: PayRequest?) {
        guard let request else { return }
        if activeRequest?.cpOrder == request.cpOrder {
            activeRequest = nil
        }
    }

    private func currencyCode(for product: Product) -> String {
        product.priceFormatStyle.locale.currency?.identifier ?? "USD"
    }

    private func priceAmountMicros(_ product: Product) -> Int64? {
        let number = NSDecimalNumber(decimal: product.price)
        return number.multiplying(byPowerOf10: 6).int64Value
    }

}

/// A single read-only StoreKit enumeration, independent of checkout lifetime.
/// Removing a waiter never claims that Apple cancelled a transaction. Late
/// results can only satisfy current readers, never open a payment or mutate orders.
@MainActor private final class CheckoutTransactionReader {
    private var job: (id: UUID, task: Task<Void, Never>)?
    private var waiters: [UUID: CheckedContinuation<[VerificationResult<Transaction>]?, Never>] = [:]
    private var deadlines: [UUID: Task<Void, Never>] = [:]

    // All recovery/preflight readers join the same live Apple enumeration.
    // No completed snapshot is cached: a later explicit retry must see fresh
    // transactions. Timeout detaches only that reader, never claims an empty
    // queue and never creates more calls while a hung Apple read is outstanding.
    func read(timeout: TimeInterval? = nil) async -> [VerificationResult<Transaction>]? {
        let waiterID = UUID()
        return await withTaskCancellationHandler(operation: {
            await withCheckedContinuation { continuation in
                guard !Task.isCancelled else { continuation.resume(returning: nil); return }
                waiters[waiterID] = continuation
                if let timeout {
                    deadlines[waiterID] = Task { [weak self] in
                        do { try await Task.sleep(nanoseconds: UInt64(max(0.01, min(timeout, 8)) * 1_000_000_000)) }
                        catch { return }
                        self?.detach(waiterID)
                    }
                }
                guard job == nil else { return }
                let id = UUID()
                let task = Task { [weak self] in
                    var snapshot: [VerificationResult<Transaction>] = []
                    for await verification in Transaction.unfinished {
                        guard !Task.isCancelled else { break }
                        snapshot.append(verification)
                    }
                    self?.complete(id, snapshot: Task.isCancelled ? nil : snapshot)
                }
                job = (id, task)
            }
        }, onCancel: { [weak self] in
            Task { @MainActor in self?.detach(waiterID) }
        })
    }

    private func detach(_ id: UUID) {
        deadlines.removeValue(forKey: id)?.cancel()
        waiters.removeValue(forKey: id)?.resume(returning: nil)
    }

    private func complete(_ id: UUID, snapshot: [VerificationResult<Transaction>]?) {
        guard job?.id == id else { return }
        job = nil
        for deadline in deadlines.values { deadline.cancel() }
        deadlines.removeAll()
        let pending = waiters.values
        waiters.removeAll()
        for continuation in pending { continuation.resume(returning: snapshot) }
    }

    func stop() {
        job?.task.cancel()
        if let id = job?.id { complete(id, snapshot: nil) }
    }
}
