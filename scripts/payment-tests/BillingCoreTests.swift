import Foundation

extension Harness {
    static func billingCoreTests() async throws {
        let service = AppStoreBillingService.shared
        events = []; purchaseMode = "cancel"; purchaseError = nil
        expectedPurchaseToken = nil
        var held: CheckedContinuation<Void, Never>?
        purchaseHook = { await withCheckedContinuation { held = $0 } }
        let first = Task { try await service.purchase(productId: "pbm_tier_099", appAccountToken: serverToken) }
        while held == nil { await Task.yield() }
        for cancelFirst in [false, true] {
            if cancelFirst { first.cancel() }
            do {
                _ = try await service.purchase(product: Product(id: "pbm_tier_499"), options: [.appAccountToken(serverToken)])
                preconditionFailure("Two adapters opened Apple checkout concurrently")
            } catch AppStoreBillingService.BillingError.purchaseInProgress { }
        }
        precondition(events.filter { $0 == "purchase" }.count == 1)
        held?.resume(); _ = try await first.value
        purchaseHook = nil
        _ = try await service.purchase(product: Product(id: "pbm_tier_499"), options: [.appAccountToken(serverToken)])
        precondition(events.filter { $0 == "purchase" }.count == 2)
        print("PASS shared core holds checkout lock through caller cancellation until Apple returns")
        testCount += 1

        events = []; purchaseMode = "success"; transactionAccountToken = serverToken
        _ = try await service.purchase(product: Product(id: "pbm_tier_099"), options: [.appAccountToken(serverToken)])
        precondition(events == ["purchase"], "StoreKit core must not verify on backend, grant or finish")
        print("PASS purchase result alone never grants assets or finishes a transaction")
        testCount += 1

        holdUpdates = true; updateReads = 0
        let one = service.transactionUpdates(), two = service.transactionUpdates()
        var oneIDs: [UInt64] = [], twoIDs: [UInt64] = []
        let listenerOne = Task {
            for await result in one { if case .verified(let value) = result { oneIDs.append(value.id) } }
        }
        let listenerTwo = Task {
            for await result in two { if case .verified(let value) = result { twoIDs.append(value.id) } }
        }
        while updateContinuation == nil { await Task.yield() }
        precondition(updateReads == 1, "Core must install only one StoreKit update observer")
        updateContinuation?.yield(.verified(Transaction(productID: "pbm_tier_099", id: 900)))
        while oneIDs.isEmpty || twoIDs.isEmpty { await Task.yield() }
        listenerOne.cancel(); await listenerOne.value
        for _ in 0..<10 { await Task.yield() }
        updateContinuation?.yield(.verified(Transaction(productID: "pbm_tier_099", id: 901)))
        while twoIDs.count != 2 { await Task.yield() }
        precondition(oneIDs == [900] && twoIDs == [900, 901])
        listenerTwo.cancel(); await listenerTwo.value
        updateContinuation?.finish(); updateContinuation = nil; holdUpdates = false
        for _ in 0..<10 { await Task.yield() }
        print("PASS one StoreKit observer fans out without one subscriber cancelling another")
        testCount += 1
    }
}
