import Foundation

@MainActor extension Harness {
    static func journal() -> [String: [String: Any]] {
        guard let text = UserDefaults.standard.values["ios_purchase_contexts_v2"],
              let data = text.data(using: .utf8) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]]) ?? [:]
    }

    static func orderIsolationTests() async throws {
        let tokenB = UUID(uuidString: "11223344-5566-8778-899A-BBCCDDEEFF00")!
        let tokenC = UUID(uuidString: "22334455-6677-8889-899A-BBCCDDEEFF00")!
        let uncertain = ["query", "order", "checkout", "purchase", "STOREKIT_ERROR"]
        let bought = ["order", "checkout", "purchase", "confirm", "success", "finish"]
        let old499 = "old499|unit-test|role-test|910007|pbm_tier_499|1"
        let new099 = "new099|unit-test|role-test|910001|pbm_tier_099|1"
        let new499 = "new499|unit-test|role-test|910002|pbm_tier_499|1"

        try await run("device regression: failed 4.99, successful 0.99, other 4.99, then restart and recover old order",
            requestJSON: old499, expected: uncertain + bought + bought + ["confirm", "success", "finish"], after: { manager in
                purchaseError = nil; purchaseMode = "success"
                for (request, token, id) in [(new099, tokenB, UInt64(2)), (new499, tokenC, UInt64(3))] {
                    expectedPurchaseToken = token; transactionAccountToken = token; transactionId = id
                    let parsed = try PayRequest(json: request)
                    precondition(paymentGate.tryStart(parsed.cpOrder))
                    manager.launch(parsed); try await waitForIdle(manager); try await waitForAppleFinish(manager)
                    precondition(Set(journal().keys) == ["old499"], "New purchase overwrote/cleared old 4.99")
                }
                precondition(successOrders == ["new099", "new499"])
                precondition(statusQueries == 0, "Unrelated old order delayed new checkout with status lookup")
                manager.destroy()
                let next = StoreKitManager(), listener = Listener(); next.listener = listener
                unfinished = [.verified(Transaction(productID: "pbm_tier_499", id: 1, token: serverToken))]
                await next.resumePurchases(); try await waitForAppleFinish(next)
                precondition(confirmedPairs == ["new099:2", "new499:3", "old499:1"])
                precondition(successOrders == ["new099", "new499", "old499"] && !next.hasRetainedOrders)
                next.destroy()
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("two unresolved orders at same price remain independently recoverable",
            expected: uncertain + ["order", "checkout", "purchase", "STOREKIT_ERROR", "confirm", "success", "finish", "confirm", "success", "finish"], after: { manager in
                expectedPurchaseToken = tokenB; transactionAccountToken = tokenB
                manager.launch(try PayRequest(json: "second|unit-test|role-test|2")); try await waitForIdle(manager)
                precondition(journal().count == 2)
                for (id, token) in [(UInt64(2), tokenB), (UInt64(1), serverToken)] {
                    unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: id, token: token))]
                    await manager.resumePurchases(); try await waitForAppleFinish(manager)
                }
                precondition(confirmedPairs == ["second:2", "test-cp-order:1"] && journal().isEmpty)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("legacy shared account token across different Apple products remains unambiguous",
            requestJSON: old499, expected: uncertain + bought, after: { manager in
                purchaseError = nil; purchaseMode = "success"; transactionId = 2
                manager.launch(try PayRequest(json: new099)); try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["old499"] && successOrders == ["new099"])
                precondition(confirmedPairs == ["new099:2"])
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("canceling different same-price item removes only that item",
            expected: uncertain + ["order", "checkout", "purchase", "cancel"], after: { manager in
                expectedPurchaseToken = tokenB; purchaseError = nil
                manager.launch(try PayRequest(json: "second|unit-test|role-test|2")); try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["test-cp-order"])
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("same goods and account remains protected from accidental repeat purchase",
            expected: uncertain + ["PURCHASE_RECOVERY_REQUIRED"], after: { manager in
                orderStatus = createdStatus(order: "test-cp-order")
                manager.launch(try PayRequest(json: "second")); try await waitForIdle(manager)
                let repeated = try PayRequest(json: "second")
                precondition(journal().count == 1 && manager.retryRequest(for: repeated)?.cpOrder == "test-cp-order")
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("backend reused binding token blocks new checkout without replacing old evidence",
            expected: uncertain + ["order", "ORDER_IDENTITY_CONFLICT"], after: { manager in
                manager.launch(try PayRequest(json: "second|unit-test|role-test|2")); try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["test-cp-order"] && events.filter { $0 == "purchase" }.count == 1)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("late old receipt during new checkout cannot release its tap gate or swallow its error",
            expected: uncertain + ["order", "checkout", "purchase", "confirm", "success", "finish", "STOREKIT_ERROR"], after: { manager in
                expectedPurchaseToken = tokenB
                precondition(paymentGate.tryStart("second"))
                purchaseHook = {
                    unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 1, token: serverToken))]
                    await manager.resumePurchases(); try? await waitForAppleFinish(manager); unfinished = []
                    precondition(!paymentGate.tryStart("third"), "Old success released new gate")
                }
                manager.launch(try PayRequest(json: "second|unit-test|role-test|2")); try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["second"] && successOrders == ["test-cp-order"])
                precondition(paymentGate.tryStart("third")); paymentGate.finish("third")
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("Apple returns old order through new purchase callback: settle old, never report new success",
            expected: uncertain + ["order", "checkout", "purchase", "confirm", "success", "STOREKIT_PREVIOUS_TRANSACTION", "finish"], after: { manager in
                expectedPurchaseToken = tokenB; purchaseError = nil; purchaseMode = "success"
                // Signed receipt belongs to token A even though B was passed into purchase().
                transactionAccountToken = serverToken
                manager.launch(try PayRequest(json: "second|unit-test|role-test|2")); try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["second"] && successOrders == ["test-cp-order"])
                precondition(journal()["second"]?["transactionId"] == nil)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        for (label, request) in [("role", "second|unit-test|other-role|1"), ("server", "second|unit-test|role-test|1|pbm_tier_099|other-server"), ("account", "second|other-user|role-test|1")] {
            try await run("\(label) switch cannot reuse or erase old same-price order", expected: uncertain + ["order", "checkout", "purchase", "cancel"], after: { manager in
                expectedPurchaseToken = tokenB; purchaseError = nil
                let other = try PayRequest(json: request)
                precondition(manager.retryRequest(for: other) == nil)
                manager.launch(other); try await waitForIdle(manager)
                precondition(Set(journal().keys) == ["test-cp-order"])
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }
        }

        try await run("unknown signed token cannot bind to either same-price order", expected: uncertain + ["order", "checkout", "purchase", "STOREKIT_ERROR", "ACCOUNT_MISMATCH"], after: { manager in
            expectedPurchaseToken = tokenB
            manager.launch(try PayRequest(json: "second|unit-test|role-test|2")); try await waitForIdle(manager)
            unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 3, token: tokenC))]
            await manager.resumePurchases()
            precondition(journal().count == 2 && confirmedPairs.isEmpty && !events.contains("finish"))
        }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("corrupt journal blocks purchase and keeps original bytes", expected: ["PURCHASE_STORAGE_UNAVAILABLE"], after: { _ in
            precondition(UserDefaults.standard.values["ios_purchase_contexts_v2"] == "not-json")
        }) { _ in UserDefaults.standard.values["ios_purchase_contexts_v2"] = "not-json" }

        try await run("journal write failure never opens Apple purchase", expected: ["query", "order", "PURCHASE_STORAGE_UNAVAILABLE"], after: { _ in
            precondition(!events.contains("purchase"))
        }) { _ in UserDefaults.standard.rejectWrites = true }

        try await run("aged pending order is retained but does not reserve every item at that price",
            expected: ["query", "order", "checkout", "purchase", "pending", "pending", "order", "checkout", "purchase", "cancel"], after: { manager in
                var saved = savedContext(); saved["pendingSince"] = 1.0; replaceSavedContext(saved)
                manager.launch(try PayRequest(json: "same-item")); try await waitForIdle(manager)
                precondition(journal().count == 1)
                expectedPurchaseToken = tokenB; purchaseMode = "cancel"
                manager.launch(try PayRequest(json: "different-item|unit-test|role-test|2")); try await waitForIdle(manager)
                precondition(journal().count == 1 && savedContext()["pendingSince"] as? Double == 1.0)
            }) { _ in distinctOrders = true; purchaseMode = "pending" }

        try await run("missing game item identity stays conservative instead of allowing duplicate purchase",
            expected: uncertain + ["PURCHASE_RECOVERY_REQUIRED"], after: { manager in
                manager.launch(try PayRequest(json: "missing-item|unit-test|role-test|0")); try await waitForIdle(manager)
                precondition(journal().count == 1)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("legacy uncertain order migrates intact and no longer blocks different item",
            expected: ["query", "order", "checkout", "purchase", "cancel"], after: { manager in
                precondition(UserDefaults.standard.values["ios_purchase_context_pbm_tier_099"] == nil)
                precondition(Set(journal().keys) == ["old-sdk-order"])
                precondition(journal()["old-sdk-order"]?["deliveryRetryCount"] as? Int == 3)
                precondition(manager.hasRetainedOrders)
            }) { _ in
                expectedPurchaseToken = tokenB; distinctOrders = true
                UserDefaults.standard.values["ios_purchase_context_pbm_tier_099"] = """
                {"requestJSON":"old-cp|unit-test|role-test|2","sdkOrderId":"old-sdk-order","productId":"pbm_tier_099","priceAmountMicros":30000000,"currencyCode":"TWD","appAccountToken":"\(serverToken)","recoveryState":"interrupted","deliveryRetryCount":3}
                """
            }
    }
}
