import Foundation

@MainActor extension Harness {
    static func waitForOriginalRecovery(_ manager: StoreKitManager) async throws {
        let deadline = Date().addingTimeInterval(3)
        while manager.hasScheduledOriginalRecovery && Date() < deadline {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        precondition(!manager.hasScheduledOriginalRecovery, "Original recovery did not stop")
    }

    static func checkoutResilienceTests() async throws {
        let disconnected = StoreKitError.systemError(NSError(domain: NSCocoaErrorDomain, code: 4097,
            userInfo: [NSDebugDescriptionErrorKey: "private-service account@example.invalid token=secret"]))
        let interrupted = ["query", "order", "checkout", "purchase", "APP_STORE_CONNECTION_INTERRUPTED"]
        for code in [4097, 4099] {
            let failure = StoreKitManager.paymentFailure(for: StoreKitError.systemError(
                NSError(domain: NSCocoaErrorDomain, code: code)))
            precondition(failure.code == "APP_STORE_CONNECTION_INTERRUPTED" && failure.shouldCheckOriginalAutomatically)
            precondition(failure.diagnostic.contains("NSCocoaErrorDomain:\(code)"))
        }
        let privateFailure = StoreKitManager.paymentFailure(for: disconnected)
        precondition(!privateFailure.diagnostic.contains("secret") && !privateFailure.diagnostic.contains("private-service"))
        precondition(StoreKitManager.paymentFailure(for: NSError(domain: "foreign", code: 4097)).code == "STOREKIT_ERROR")
        precondition(StoreKitManager.paymentFailure(for: StoreKitError.userCancelled).message == "App Store 未完成這次付款")
        let sheetFailure = NSError(domain: "AMSErrorDomain", code: 6)
        precondition(StoreKitManager.paymentFailure(for: NSError(domain: SKErrorDomain, code: 2,
            userInfo: [NSUnderlyingErrorKey: sheetFailure])).code == "APP_STORE_SHEET_INTERRUPTED")
        print("PASS runtime error domains classified without guessing cancellation or leaking private metadata")
        testCount += 1

        try await run("delivered while Apple is still returning: block second purchase with delivered status, then release",
            expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish", "PAYMENT_IN_PROGRESS",
                       "order", "checkout", "purchase", "confirm", "success", "finish"], after: { manager in
                precondition(manager.checkoutBlockingMessage == nil && releasedCheckouts == ["test-cp-order"])
                precondition(successOrders == ["test-cp-order"])
                purchaseHook = nil; unfinished = []
                transactionId = 2
                expectedPurchaseToken = UUID(); transactionAccountToken = expectedPurchaseToken
                manager.launch(try PayRequest(json: "second"))
                try await waitForIdle(manager)
                precondition(releasedCheckouts == ["test-cp-order", "second"] && successOrders == releasedCheckouts)
            }) { manager in
                distinctOrders = true; purchaseMode = "success"
                purchaseHook = {
                    let original = try! PayRequest(json: "test-cp-order")
                    precondition(manager.checkoutBlockingMessage != nil && !manager.isCheckoutDelivered(original))
                    unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                    await manager.resumePurchases(); try? await waitForAppleFinish(manager)
                    precondition(manager.isCheckoutDelivered(original))
                    precondition(manager.checkoutBlockingMessage?.contains("已到帳") == true)
                    precondition(manager.isProcessingPayment && releasedCheckouts.isEmpty)
                    let status = await manager.checkPendingPayments()
                    precondition(status?.contains("已到帳") == true)
                    manager.launch(try! PayRequest(json: "too-early"))
                    precondition(events.filter { $0 == "order" }.count == 1 && events.filter { $0 == "purchase" }.count == 1)
                }
            }

        try await run("late XPC failure after successful update cannot overwrite success or schedule recovery",
            expected: ["query", "order", "checkout", "purchase", "confirm", "success", "finish"], after: { manager in
                precondition(!manager.hasScheduledOriginalRecovery && manager.checkoutBlockingMessage == nil)
                precondition(releasedCheckouts == ["test-cp-order"] && !manager.hasRetainedOrders)
            }) { manager in
                purchaseError = disconnected
                purchaseHook = {
                    unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                    await manager.resumePurchases(); try? await waitForAppleFinish(manager)
                }
            }

        try await run("XPC recovery is bounded, leaves original intact and never opens Apple automatically",
            expected: interrupted, fastRecovery: true, after: { manager in
                let before = savedContext()
                try await waitForOriginalRecovery(manager)
                precondition(recoveryWaits == [1, 3, 8] && statusQueries >= 1 && statusQueries <= 3)
                precondition(savedContext()["sdkOrderId"] as? String == before["sdkOrderId"] as? String)
                precondition(savedContext()["appAccountToken"] as? String == before["appAccountToken"] as? String)
                let nextTap = try PayRequest(json: "next-tap")
                precondition(manager.retryRequest(for: nextTap)?.cpOrder == "test-cp-order")
                precondition(manager.hasRetainedOrders && !manager.isProcessingPayment)
            }) { _ in purchaseError = disconnected }

        try await run("after service restart auto-check finds original signed transaction and delivers once",
            expected: interrupted + ["confirm", "success", "finish"], fastRecovery: true, after: { manager in
                unfinished = [.verified(Transaction(productID: "pbm_tier_099"))]
                try await waitForOriginalRecovery(manager); try await waitForAppleFinish(manager)
                precondition(confirmedPairs == ["test-order:1"] && successOrders == ["test-cp-order"])
                precondition(!manager.hasRetainedOrders && statusQueries == 0)
            }) { _ in purchaseError = disconnected; finishRemovesTransaction = true }

        try await run("lost Apple reply can recover server-delivered original without purchase or synthetic finish",
            expected: interrupted + ["success"], fastRecovery: true, after: { manager in
                orderStatus = BackendGateway.OrderStatus(orderId: "test-order", cpOrder: "test-cp-order", productId: "pbm_tier_099",
                    state: "CONSUMED", store: "app_store", transactionId: "31")
                try await waitForOriginalRecovery(manager)
                precondition(!manager.hasRetainedOrders && confirmedPairs.isEmpty && successOrders == ["test-cp-order"])
            }) { _ in purchaseError = disconnected }

        try await run("automatic original check rejects unrelated signed token and mismatched server order",
            expected: interrupted, fastRecovery: true, after: { manager in
                unfinished = [.verified(Transaction(productID: "pbm_tier_099", id: 2, token: UUID()))]
                orderStatus = BackendGateway.OrderStatus(orderId: "someone-else", cpOrder: "other", productId: "pbm_tier_099",
                    state: "CONSUMED", store: "app_store", transactionId: "2")
                try await waitForOriginalRecovery(manager)
                precondition(manager.hasRetainedOrders && confirmedPairs.isEmpty && successOrders.isEmpty)
            }) { _ in purchaseError = disconnected }

        try await run("destroy cancels scheduled original checks without removing the original order",
            expected: interrupted, fastRecovery: true, after: { manager in
                manager.destroy()
                try await Task.sleep(nanoseconds: 160_000_000)
                precondition(!manager.hasScheduledOriginalRecovery && statusQueries == 0 && manager.hasRetainedOrders)
            }) { _ in purchaseError = disconnected }

        try await run("original background checks do not compete with an explicit retry payment sheet",
            expected: interrupted + ["query", "checkout", "purchase", "confirm", "success", "finish"], fastRecovery: true, after: { manager in
                orderStatus = createdStatus()
                purchaseError = nil; purchaseMode = "success"
                purchaseHook = {
                    let queriesBefore = statusQueries
                    try? await Task.sleep(nanoseconds: 160_000_000)
                    precondition(statusQueries == queriesBefore, "Recovery touched backend during live Apple UI")
                    precondition(events.filter { $0 == "purchase" }.count == 2)
                }
                manager.retryOriginal(try PayRequest(json: "test-cp-order"))
                try await waitForIdle(manager); try await waitForOriginalRecovery(manager)
                precondition(!manager.hasRetainedOrders && events.filter { $0 == "order" }.count == 1)
            }) { _ in purchaseError = disconnected }

        try await run("first documented cancellation stays neutral and does not launch recovery or a new payment",
            expected: ["query", "order", "checkout", "purchase", "cancel"], after: { manager in
                precondition(manager.checkoutBlockingMessage == nil && releasedCheckouts == ["test-cp-order"])
                precondition(!manager.hasScheduledOriginalRecovery && savedContext().isEmpty)
            }) { _ in purchaseError = StoreKitError.userCancelled }
    }
}
