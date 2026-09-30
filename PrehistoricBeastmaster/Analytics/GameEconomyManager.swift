import Foundation
import Security

extension Notification.Name {
    static let gameEconomyDidChange = Notification.Name("pbm.gameEconomy.didChange")
}

enum ConsumptionReason: String, Codable, CaseIterable {
    case reviveOnDefeat
    case unlockDinoSkin

    var pearlCost: Int {
        switch self {
        case .reviveOnDefeat: return 20
        case .unlockDinoSkin: return 50
        }
    }

    var itemIdentifier: String {
        switch self {
        case .reviveOnDefeat: return "revive_on_defeat"
        case .unlockDinoSkin: return "tyrannosaurus_skin"
        }
    }
}

@MainActor
final class GameEconomyManager {
    struct LedgerEntry: Codable, Equatable {
        enum Kind: String, Codable {
            case purchase
            case consumption
        }

        let id: UUID
        let kind: Kind
        let amount: Int
        let balanceAfter: Int
        let transactionId: String?
        let reason: ConsumptionReason?
        let createdAt: Date
    }

    static let shared = GameEconomyManager()

    private struct State: Codable {
        struct PendingRevive: Codable {
            let runId: String
            let requestId: String
            let createdAt: Date
        }

        var schemaVersion = 1
        var balance = 0
        var ledger: [LedgerEntry] = []
        var creditedTransactionIds: Set<String> = []
        var entitlements: Set<String> = []
        var pendingRevive: PendingRevive?
    }

    private enum EconomyError: Error {
        case keychain(OSStatus)
        case encoding
    }

    private static let service = (Bundle.main.bundleIdentifier ?? "com.prehistoricbeastmaster.game") + ".economy"
    private static let account = "primal-pearls-v1"
    private static let historyLimit = 200

    private let tracker: TelemetryTrackerProtocol
    private var state: State

    init(tracker: TelemetryTrackerProtocol = TelemetryTracker.shared) {
        self.tracker = tracker
        state = Self.loadState() ?? State()
    }

    var balance: Int { state.balance }
    var transactionHistory: [LedgerEntry] { state.ledger }
    var hasLimitedDinoSkin: Bool { state.entitlements.contains("limited_dino_skin") }
    var hasUnlockedDinoSkin: Bool { state.entitlements.contains(ConsumptionReason.unlockDinoSkin.itemIdentifier) }
    var pendingReviveRunId: String? { state.pendingRevive?.runId }

    @discardableResult
    func addPearls(amount: Int, transactionId: String) -> Bool {
        applyPurchase(amount: amount, transactionId: transactionId, grantsLimitedSkin: false)
    }

    @discardableResult
    func applyPurchase(amount: Int, transactionId: String, grantsLimitedSkin: Bool) -> Bool {
        let id = transactionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard amount > 0, !id.isEmpty, id.count <= 128,
              !state.creditedTransactionIds.contains(id),
              state.balance <= Int.max - amount else { return false }

        var updated = state
        updated.balance += amount
        updated.creditedTransactionIds.insert(id)
        if grantsLimitedSkin { updated.entitlements.insert("limited_dino_skin") }
        updated.ledger.append(LedgerEntry(
            id: UUID(), kind: .purchase, amount: amount,
            balanceAfter: updated.balance, transactionId: id,
            reason: nil, createdAt: Date()
        ))
        trimHistory(&updated)
        guard persistAndCommit(updated) else { return false }
        publishChange()
        return true
    }

    @discardableResult
    func consumePearls(amount: Int, reason: ConsumptionReason) -> Bool {
        guard amount == reason.pearlCost, amount > 0, state.balance >= amount else { return false }

        var updated = state
        updated.balance -= amount
        if reason == .unlockDinoSkin {
            updated.entitlements.insert(reason.itemIdentifier)
        }
        updated.ledger.append(LedgerEntry(
            id: UUID(), kind: .consumption, amount: -amount,
            balanceAfter: updated.balance, transactionId: nil,
            reason: reason, createdAt: Date()
        ))
        trimHistory(&updated)
        guard persistAndCommit(updated) else { return false }
        tracker.recordItemConsume(
            itemId: reason.itemIdentifier,
            costPearls: amount,
            remainingBalance: updated.balance
        )
        publishChange()
        return true
    }

    @discardableResult
    func beginRevive(runId: String, requestId: String) -> Bool {
        let run = runId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !run.isEmpty, run.count <= 128, UUID(uuidString: requestId) != nil else { return false }
        if state.pendingRevive?.runId == run { return true }
        let reason = ConsumptionReason.reviveOnDefeat
        guard state.balance >= reason.pearlCost else { return false }

        var updated = state
        updated.balance -= reason.pearlCost
        updated.pendingRevive = State.PendingRevive(runId: run, requestId: requestId, createdAt: Date())
        updated.ledger.append(LedgerEntry(
            id: UUID(), kind: .consumption, amount: -reason.pearlCost,
            balanceAfter: updated.balance, transactionId: nil,
            reason: reason, createdAt: Date()
        ))
        trimHistory(&updated)
        guard persistAndCommit(updated) else { return false }
        tracker.recordItemConsume(
            itemId: reason.itemIdentifier,
            costPearls: reason.pearlCost,
            remainingBalance: updated.balance
        )
        publishChange()
        return true
    }

    @discardableResult
    func completeRevive(runId: String) -> Bool {
        guard state.pendingRevive?.runId == runId else { return false }
        var updated = state
        updated.pendingRevive = nil
        return persistAndCommit(updated)
    }

    func hasCredited(transactionId: String) -> Bool {
        state.creditedTransactionIds.contains(transactionId)
    }

    func recordItemConsume(itemId: String, costPearls: Int, remainingBalance: Int) {
        tracker.recordItemConsume(itemId: itemId, costPearls: costPearls, remainingBalance: remainingBalance)
    }

    func recordCheckoutResult(productId: String, orderId: String, success: Bool) {
        tracker.recordCheckoutResult(productId: productId, orderId: orderId, success: success)
    }

    private func trimHistory(_ value: inout State) {
        if value.ledger.count > Self.historyLimit {
            value.ledger.removeFirst(value.ledger.count - Self.historyLimit)
        }
    }

    private func persistAndCommit(_ updated: State) -> Bool {
        do {
            try Self.saveState(updated)
            state = updated
            return true
        } catch {
            return false
        }
    }

    private func publishChange() {
        NotificationCenter.default.post(
            name: .gameEconomyDidChange,
            object: self,
            userInfo: ["balance": state.balance]
        )
    }

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    private static func loadState() -> State? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(State.self, from: data)
    }

    private static func saveState(_ state: State) throws {
        guard let data = try? JSONEncoder().encode(state) else { throw EconomyError.encoding }
        let query = baseQuery()
        let attributes: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw EconomyError.keychain(updateStatus) }

        var addition = query
        addition[kSecValueData as String] = data
        addition[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(addition as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw EconomyError.keychain(addStatus) }
    }
}
