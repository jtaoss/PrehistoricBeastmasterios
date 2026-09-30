import Foundation
import StoreKit

@MainActor
final class AppStoreBillingService {
    static let shared = AppStoreBillingService()

    enum BillingError: LocalizedError {
        case purchaseInProgress
        case productUnavailable
        case receiptUnavailable

        var errorDescription: String? {
            switch self {
            case .purchaseInProgress: return "App Store is already processing a purchase"
            case .productUnavailable: return "App Store did not return the requested product"
            case .receiptUnavailable: return "The app receipt is not available in this environment"
            }
        }
    }

    private var purchaseInProgress = false
    private var observation: Task<Void, Never>?
    private var subscribers: [UUID: AsyncStream<VerificationResult<Transaction>>.Continuation] = [:]

    private init() {}

    var storefrontIdentifier: String? { SKPaymentQueue.default().storefront?.identifier }

    func products(for identifiers: [String]) async throws -> [Product] {
        try await Product.products(for: identifiers)
    }

    func purchase(productId: String, appAccountToken: UUID) async throws -> Product.PurchaseResult {
        guard let product = try await products(for: [productId]).first(where: { $0.id == productId }) else {
            throw BillingError.productUnavailable
        }
        return try await purchase(product: product, options: [.appAccountToken(appAccountToken)])
    }

    func purchase(product: Product, options: Set<Product.PurchaseOption>) async throws -> Product.PurchaseResult {
        try Task.checkCancellation()
        guard !purchaseInProgress else { throw BillingError.purchaseInProgress }
        purchaseInProgress = true
        defer { purchaseInProgress = false }
        return try await product.purchase(options: options)
    }

    func transactionUpdates() -> AsyncStream<VerificationResult<Transaction>> {
        let id = UUID()
        return AsyncStream { continuation in
            subscribers[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.subscribers.removeValue(forKey: id) }
            }
            guard observation == nil else { return }
            observation = Task { [weak self] in
                for await update in Transaction.updates {
                    guard !Task.isCancelled else { return }
                    for subscriber in self?.subscribers.values ?? [:].values {
                        subscriber.yield(update)
                    }
                }
                self?.observation = nil
            }
        }
    }

    func storefrontUpdates() -> AsyncStream<Void> {
        AsyncStream { continuation in
            let task = Task {
                for await _ in Storefront.updates {
                    guard !Task.isCancelled else { break }
                    continuation.yield(())
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func unfinishedTransactions() async -> [VerificationResult<Transaction>]? {
        var result: [VerificationResult<Transaction>] = []
        for await transaction in Transaction.unfinished {
            guard !Task.isCancelled else { return nil }
            result.append(transaction)
        }
        return Task.isCancelled ? nil : result
    }

    func finish(_ transaction: Transaction) async {
        await transaction.finish()
    }

    func receiptDataBase64() throws -> String {
        guard let url = Bundle.main.appStoreReceiptURL,
              let data = try? Data(contentsOf: url), !data.isEmpty else {
            throw BillingError.receiptUnavailable
        }
        return data.base64EncodedString()
    }
}
