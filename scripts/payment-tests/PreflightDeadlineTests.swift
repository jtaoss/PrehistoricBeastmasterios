import Foundation

@MainActor extension Harness {
    static func seedPreflightOriginal() {
        replaceSavedContext([
            "requestJSON": "original", "sdkOrderId": "saved-order", "productId": "pbm_tier_099",
            "priceAmountMicros": 30_000_000, "currencyCode": "TWD", "recoveryState": "interrupted",
            "appAccountToken": serverToken.uuidString, "storefrontId": "143470", "attemptCount": 1
        ])
    }

    static func finishHeldReads() {
        for continuation in unfinishedContinuations { continuation.finish() }
        unfinishedContinuations = []; holdUnfinished = false
    }

    static func preflightDeadlineTests() async throws {
        let stopped = "PAYMENT_CHECK_STOPPED", timeout = "PAYMENT_CHECK_TIMEOUT"
        let newPurchase = ["query", "order", "checkout", "purchase", "cancel"]
        try await run("hung Apple history times out without orders; repeat waits share one read; late result stays inert",
            expected: [timeout, timeout] + newPurchase, preflightTimeout: 0.05, after: { manager in
                let saved = UserDefaults.standard.values
                precondition(!manager.canStopPreflight && !manager.isProcessingPayment && releasedCheckouts == ["test-cp-order"])
                manager.launch(try PayRequest(json: "second-tap")); try await waitForIdle(manager)
                precondition(unfinishedReads == 1 && UserDefaults.standard.values == saved)
                precondition(releasedCheckouts == ["test-cp-order", "second-tap"])
                finishHeldReads()
                try await Task.sleep(nanoseconds: 30_000_000)
                precondition(events == [timeout, timeout] && UserDefaults.standard.values == saved)
                expectedPurchaseToken = UUID()
                manager.launch(try PayRequest(json: "intentional-next|unit-test|role-test|2"))
                try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["saved-order"])
            }) { _ in seedPreflightOriginal(); holdUnfinished = true }

        try await run("player can stop only preflight and receive one result without clearing original",
            expected: [stopped], preflightTimeout: 0.2, after: { manager in
                precondition(manager.hasRetainedOrders && releasedCheckouts == ["test-cp-order"])
                let saved = UserDefaults.standard.values
                finishHeldReads()
                try await Task.sleep(nanoseconds: 250_000_000)
                precondition(!manager.stopWaitingForPreflight() && UserDefaults.standard.values == saved)
            }) { manager in
                seedPreflightOriginal(); holdUnfinished = true
                Task {
                    try? await Task.sleep(nanoseconds: 10_000_000)
                    precondition(manager.canStopPreflight && manager.checkoutBlockingMessage?.contains("尚未開啟付款") == true)
                    precondition(manager.stopWaitingForPreflight())
                    precondition(!manager.stopWaitingForPreflight())
                }
            }

        var heldStatus: CheckedContinuation<Void, Never>?
        try await run("late backend status after timeout cannot clear original or disturb next checkout",
            expected: [timeout] + newPurchase, preflightTimeout: 0.05, after: { manager in
                precondition(heldStatus != nil)
                let saved = journal() as NSDictionary
                statusHook = nil
                expectedPurchaseToken = UUID()
                manager.launch(try PayRequest(json: "other-item|unit-test|role-test|2"))
                try await waitForIdle(manager)
                heldStatus?.resume(); heldStatus = nil
                try await Task.sleep(nanoseconds: 30_000_000)
                precondition(saved.isEqual(to: journal()) && successOrders.isEmpty, "Late status mutated original order")
                precondition(releasedCheckouts == ["test-cp-order", "other-item"])
            }) { _ in
                seedPreflightOriginal()
                orderStatus = deliveredStatus(order: "saved-order", cp: "original")
                statusHook = { await withCheckedContinuation { heldStatus = $0 } }
            }

        try await run("preflight stop and deadline cannot cancel or unlock an active Apple purchase",
            expected: newPurchase, preflightTimeout: 0.03, after: { manager in
                precondition(!manager.stopWaitingForPreflight() && releasedCheckouts == ["test-cp-order"])
            }) { manager in
                purchaseHook = {
                    precondition(!manager.canStopPreflight && !manager.stopWaitingForPreflight())
                    try? await Task.sleep(nanoseconds: 100_000_000)
                    precondition(manager.isProcessingPayment && releasedCheckouts.isEmpty)
                    precondition(!events.contains(timeout) && !events.contains(stopped))
                }
            }

        try await run("second preflight on explicit original retry also times out without another Apple call",
            expected: ["query", "order", "checkout", "purchase", "STOREKIT_ERROR", "query", timeout], preflightTimeout: 0.05, after: { manager in
                orderStatus = createdStatus()
                let saved = UserDefaults.standard.values
                monotonicTime += 301 // Expire the real catalog cache without exposing a test-only API.
                queryHook = { holdUnfinished = true }
                manager.retryOriginal(try PayRequest(json: "test-cp-order"))
                try await waitForIdle(manager)
                precondition(UserDefaults.standard.values == saved)
                finishHeldReads()
                try await Task.sleep(nanoseconds: 30_000_000)
                precondition(events.filter { $0 == "purchase" }.count == 1 && !manager.isProcessingPayment)
            }) { _ in purchaseError = StoreKitError.unknown }

        try await run("late shared snapshot only resumes the new explicit intent, never the timed-out one",
            expected: [timeout] + newPurchase, preflightTimeout: 0.08, after: { manager in
                manager.launch(try PayRequest(json: "new-intent"))
                try await Task.sleep(nanoseconds: 10_000_000)
                precondition(unfinishedReads == 1 && manager.canStopPreflight)
                finishHeldReads(); try await waitForIdle(manager)
                precondition(releasedCheckouts == ["test-cp-order", "new-intent"])
                precondition(events.filter { $0 == "order" }.count == 1)
            }) { _ in holdUnfinished = true }

        var heldFinish: CheckedContinuation<Void, Never>?
        try await run("unfinished Apple cleanup is not bypassed; waiting can time out without a new purchase",
            expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "finish", timeout],
            preflightTimeout: 0.05, after: { manager in
                monotonicTime += 31
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                finishHook = { await withCheckedContinuation { heldFinish = $0 } }
                manager.launch(try PayRequest(json: "next-order")); try await waitForIdle(manager)
                precondition(heldFinish != nil && events.filter { $0 == "purchase" }.count == 1)
                heldFinish?.resume(); heldFinish = nil
                try await waitForAppleFinish(manager)
                precondition(releasedCheckouts == ["test-cp-order", "next-order"])
                precondition(successOrders == ["test-cp-order"] && !manager.canStopPreflight)
            }) { _ in purchaseMode = "success" }

        try await run("destroy resolves waiting preflight without purchase, callback or leaked continuation",
            expected: [], preflightTimeout: 0.2, after: { manager in
                finishHeldReads()
                try await Task.sleep(nanoseconds: 230_000_000)
                precondition(!manager.canStopPreflight && releasedCheckouts.isEmpty)
            }) { manager in
                holdUnfinished = true
                Task {
                    try? await Task.sleep(nanoseconds: 10_000_000)
                    manager.destroy()
                }
            }
    }
}
