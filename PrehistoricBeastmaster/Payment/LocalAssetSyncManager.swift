import Foundation

extension Notification.Name {
    static let localAssetUpdated = Notification.Name("LocalAssetUpdatedNotification")
    static let localAssetSyncStatusChanged = Notification.Name("LocalAssetSyncStatusChangedNotification")
}

@MainActor
final class AssetOrderCoordinator {
    private let auth: MiniGameAuthService
    private let backend = BillingService.shared
    private(set) var isPreparing = false
    private var accountRevision = 0

    init(auth: MiniGameAuthService) { self.auth = auth }

    var currentAccountID: String { auth.currentPlayerID ?? "" }

    func accountDidChange() { accountRevision += 1 }

    func makeRequest(assetId: String, requestId: String, destination: PaymentDestination,
                     callback: PaymentCallback) async throws -> PayRequest {
        guard !isPreparing else {
            throw BillingError.message(code: "PAYMENT_IN_PROGRESS", message: "已有一筆付款正在處理")
        }
        guard MiniGameProductCatalog.offer(assetId) != nil, UUID(uuidString: requestId) != nil else {
            throw BillingError.message(code: "INVALID_ASSET", message: "商品或請求編號無效")
        }
        guard Config.receiptValidationURL != nil else {
            throw BillingError.message(code: "PURCHASE_SERVER_CONTRACT_MISSING", message: "驗單服務尚未設定")
        }
        isPreparing = true
        defer { isPreparing = false }
        let revision = accountRevision
        let identity = try await auth.paymentIdentity()
        try Task.checkCancellation()
        guard revision == accountRevision, currentAccountID == identity.playerId else {
            throw CancellationError()
        }
        let request = try await backend.createMiniGameOrder(
            offerId: assetId, clientRequestId: requestId, identity: identity
        )
        try Task.checkCancellation()
        guard revision == accountRevision, currentAccountID == identity.playerId else {
            throw CancellationError()
        }
        return try request.routed(to: destination, accountId: identity.playerId,
                                  callback: callback, requestId: requestId)
    }
}

@MainActor
final class LocalAssetSyncManager {
    private let orders: AssetOrderCoordinator
    private let canStart: () -> Bool
    private let submit: (PayRequest) -> Void
    private let notifications: NotificationCenter
    private var preparation: Task<Void, Never>?
    private var activeRequests = Set<String>()
    private var completedRequests = Set<String>()
    private var deliveredTransactions = Set<String>()
    var onPreparation: (() -> Void)?
    var onFailure: ((String) -> Void)?

    init(orders: AssetOrderCoordinator, notifications: NotificationCenter = .default,
         canStart: @escaping () -> Bool, submit: @escaping (PayRequest) -> Void) {
        self.orders = orders
        self.notifications = notifications
        self.canStart = canStart
        self.submit = submit
    }

    func syncLocalAsset(assetId: String, requestId: String = UUID().uuidString) {
        guard !activeRequests.contains(requestId), !completedRequests.contains(requestId) else { return }
        guard preparation == nil, !orders.isPreparing, canStart() else {
            reject(requestId, code: "PAYMENT_IN_PROGRESS", message: "已有一筆付款正在處理，請勿重複點擊")
            return
        }
        activeRequests.insert(requestId)
        let accountId = orders.currentAccountID
        onPreparation?()
        preparation = Task { [weak self] in
            guard let self else { return }
            defer { self.preparation = nil }
            do {
                let request = try await self.orders.makeRequest(assetId: assetId, requestId: requestId,
                                                               destination: .localAssets, callback: .legacy)
                try Task.checkCancellation()
                guard self.canStart() else { throw CancellationError() }
                self.submit(request)
            } catch is CancellationError {
                self.reject(requestId, accountId: accountId, code: "ASSET_SYNC_CANCELLED", message: "訂單準備已結束，未發起付款")
            } catch let error as BillingError {
                self.reject(requestId, accountId: accountId, code: error.code, message: error.localizedDescription)
            } catch let error as MiniGameAuthService.AuthError {
                self.reject(requestId, accountId: accountId, code: error.code, message: error.localizedDescription)
            } catch {
                self.reject(requestId, accountId: accountId, code: "ASSET_SYNC_FAILED", message: "訂單建立失敗，未發起付款")
            }
        }
    }

    func cancelPreparation() { preparation?.cancel() }

    func receive(_ function: String, request: PayRequest, fields: JSONObject) {
        guard request.destination == .localAssets else { return }
        if function == "onPayResult" {
            let transactionId = fields.string("transactionId")
            guard !transactionId.isEmpty, deliveredTransactions.insert(transactionId).inserted else { return }
        }
        if function != "onPayPending" {
            activeRequests.remove(request.clientRequestId)
            completedRequests.insert(request.clientRequestId)
        }
        var result = fields
        result.put("func", function)
        result.put("accountId", request.resultAccountId)
        notifications.post(name: function == "onPayResult" ? .localAssetUpdated : .localAssetSyncStatusChanged,
                           object: self, userInfo: result.dictionary)
    }

    private func reject(_ requestId: String, accountId: String? = nil, code: String, message: String) {
        activeRequests.remove(requestId)
        notifications.post(name: .localAssetSyncStatusChanged, object: self, userInfo: [
            "func": "onPayFail", "code": code, "message": message,
            "clientRequestId": requestId, "accountId": accountId ?? orders.currentAccountID
        ])
        if accountId == nil || accountId == orders.currentAccountID { onFailure?(message) }
    }
}
