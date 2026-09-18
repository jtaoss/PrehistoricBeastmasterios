import Foundation

@MainActor extension Harness {
    static func sharedRecoverySafetyTests() async throws {
        let uncertain = ["query", "order", "checkout", "purchase", "STOREKIT_ERROR"]
        let unavailable = "ORDER_STATUS_UNAVAILABLE"
        let unresolved = "ORIGINAL_PAYMENT_UNCONFIRMED"

        try await run("unavailable recovery status is reported as unavailable, not no payment",
            expected: uncertain, after: { manager in
                let message = await manager.checkPendingPayments()
                precondition(message?.contains("暫時無法核對") == true)
                precondition(manager.hasRetainedOrders && successOrders.isEmpty)
            }) { _ in purchaseError = StoreKitError.unknown }

        for (name, error) in [
            ("offline", URLError(.notConnectedToInternet) as Error),
            ("timeout", URLError(.timedOut) as Error),
            ("server 502", BackendGateway.GatewayError.message(code: "HTTP_502", message: "unavailable") as Error),
            ("malformed response", BackendGateway.GatewayError.message(code: "INVALID_ORDER_STATUS", message: "invalid") as Error)
        ] {
            try await run("original retry blocks on status \(name), preserving order and purchase count",
                expected: uncertain + [unavailable], after: { manager in
                    let saved = UserDefaults.standard.values
                    statusError = error
                    purchaseError = nil; purchaseMode = "success"
                    manager.retryOriginal(try PayRequest(json: "test-cp-order"))
                    try await waitForIdle(manager)
                    precondition(UserDefaults.standard.values == saved && statusQueries == 1)
                    precondition(events.filter { $0 == "purchase" }.count == 1 && successOrders.isEmpty)
                }) { _ in purchaseError = StoreKitError.unknown }
        }

        for (name, status, expectedCode) in [
            ("another order", createdStatus(order: "other"), unavailable),
            ("another CP order", createdStatus(cp: "other"), unavailable),
            ("another SKU", createdStatus(product: "pbm_tier_499"), unavailable),
            ("wrong store", deliveredStatus(state: "CREATED", store: "google_play", transaction: ""), unavailable),
            ("paid awaiting delivery", deliveredStatus(state: "PURCHASED"), unresolved),
            ("delivery failed", deliveredStatus(state: "DELIVERY_FAILED"), unresolved),
            ("verification failed", deliveredStatus(state: "VERIFY_FAILED"), unresolved),
            ("unknown server state", deliveredStatus(state: "FUTURE_STATE", transaction: ""), unresolved),
            ("created with transaction", deliveredStatus(state: "CREATED"), unresolved),
            ("consumed without transaction", deliveredStatus(transaction: ""), unresolved)
        ] {
            try await run("original retry cannot buy on \(name)", expected: uncertain + [expectedCode], after: { manager in
                let saved = UserDefaults.standard.values
                orderStatus = status; purchaseError = nil
                manager.retryOriginal(try PayRequest(json: "test-cp-order"))
                try await waitForIdle(manager)
                precondition(UserDefaults.standard.values == saved && successOrders.isEmpty)
                precondition(events.filter { $0 == "order" }.count == 1 && events.filter { $0 == "purchase" }.count == 1)
            }) { _ in purchaseError = StoreKitError.unknown }
        }

        try await run("background CREATED result cannot bypass a failed explicit retry check",
            expected: uncertain + [unavailable], after: { manager in
                orderStatus = createdStatus()
                await manager.resumePurchases()
                precondition(statusQueries == 1)
                statusError = URLError(.timedOut)
                manager.retryOriginal(try PayRequest(json: "test-cp-order"))
                try await waitForIdle(manager)
                precondition(statusQueries == 2 && manager.hasRetainedOrders)
            }) { _ in purchaseError = StoreKitError.unknown }

        try await run("second check after retry catalog lookup fails closed without re-opening Apple",
            expected: uncertain + ["query", unavailable], after: { manager in
                orderStatus = createdStatus(); monotonicTime += 301
                queryHook = { statusError = URLError(.cannotConnectToHost) }
                manager.retryOriginal(try PayRequest(json: "test-cp-order"))
                try await waitForIdle(manager)
                precondition(statusQueries == 2 && manager.hasRetainedOrders)
                precondition(events.filter { $0 == "purchase" }.count == 1)
            }) { _ in purchaseError = StoreKitError.unknown }

        let weekly = "weekly-original|unit-test|role-test|900412|pbm_tier_4999|1017"
        let weeklyTap = "weekly-second-tap|unit-test|role-test|900412|pbm_tier_4999|1017"
        try await run("weekly gift: failed lookup blocks repeat, unrelated gift works, original recovers once",
            requestJSON: weekly,
            expected: uncertain + [unavailable, "order", "checkout", "purchase", "confirm", "success", "finish",
                                    "checkout", "purchase", "confirm", "success", "finish"], after: { manager in
                let saved = journal()["weekly-original"]! as NSDictionary
                manager.launch(try PayRequest(json: weeklyTap)); try await waitForIdle(manager)
                precondition(saved.isEqual(to: journal()["weekly-original"]!))
                let nextToken = UUID()
                expectedPurchaseToken = nextToken; transactionAccountToken = nextToken; transactionId = 2
                purchaseError = nil; purchaseMode = "success"
                manager.launch(try PayRequest(json: "other-gift|unit-test|role-test|900413|pbm_tier_4999|1017"))
                try await waitForIdle(manager); try await waitForAppleFinish(manager)
                precondition(saved.isEqual(to: journal()["weekly-original"]!))
                precondition(statusQueries == 1, "Unrelated gift was forced to query weekly order")
                expectedPurchaseToken = serverToken; transactionAccountToken = serverToken; transactionId = 3
                orderStatus = createdStatus(order: "weekly-original", cp: "weekly-original", product: "pbm_tier_4999")
                let original = manager.retryRequest(for: try PayRequest(json: weeklyTap))!
                precondition(original.rawJSON == weekly, "Weekly goods/account/server binding changed")
                manager.retryOriginal(original); try await waitForIdle(manager); try await waitForAppleFinish(manager)
                precondition(events.filter { $0 == "order" }.count == 2, "Retry created another weekly order")
                precondition(confirmedPairs == ["other-gift:2", "weekly-original:3"] && !manager.hasRetainedOrders)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        try await run("weekly gift: server delivery found before retry does not charge the weekly order again",
            requestJSON: weekly, expected: uncertain + ["success"], after: { manager in
                orderStatus = deliveredStatus(order: "weekly-original", cp: "weekly-original", product: "pbm_tier_4999")
                manager.retryOriginal(try PayRequest(json: weekly)); try await waitForIdle(manager)
                precondition(successOrders == ["weekly-original"] && !manager.hasRetainedOrders)
                precondition(events.filter { $0 == "purchase" }.count == 1)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        for recoveredByApple in [false, true] {
            let outcome = recoveredByApple ? ["confirm", "success", "PURCHASE_ALREADY_PROCESSED", "finish"] : ["success", "PURCHASE_ALREADY_PROCESSED"]
            try await run("weekly gift: repeat H5 tap recovers original via \(recoveredByApple ? "Apple" : "server") without another purchase",
                requestJSON: weekly, expected: uncertain + outcome, after: { manager in
                    if recoveredByApple {
                        unfinished = [.verified(Transaction(productID: "pbm_tier_4999"))]
                    } else {
                        orderStatus = deliveredStatus(order: "weekly-original", cp: "weekly-original", product: "pbm_tier_4999")
                    }
                    manager.launch(try PayRequest(json: weeklyTap))
                    try await waitForIdle(manager); try await waitForAppleFinish(manager)
                    precondition(!manager.hasRetainedOrders && successOrders == ["weekly-original"])
                    precondition(events.filter { $0 == "order" }.count == 1 && events.filter { $0 == "purchase" }.count == 1)
                }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }
        }

        try await run("weekly gift: delivery arriving while repeat tap is queued cannot become a new purchase",
            requestJSON: weekly, expected: uncertain + ["success", "PURCHASE_ALREADY_PROCESSED"], after: { manager in
                orderStatus = deliveredStatus(order: "weekly-original", cp: "weekly-original", product: "pbm_tier_4999")
                statusHook = {
                    statusHook = nil
                    manager.launch(try! PayRequest(json: weeklyTap))
                }
                await manager.resumePurchases()
                try await waitForIdle(manager)
                precondition(successOrders == ["weekly-original"] && !manager.hasRetainedOrders)
                precondition(events.filter { $0 == "order" }.count == 1 && events.filter { $0 == "purchase" }.count == 1)
            }) { _ in distinctOrders = true; purchaseError = StoreKitError.unknown }

        let newPurchase = ["query", "order", "checkout", "purchase", "cancel"]
        try await run("foreground plus checkout share hung Apple read; timeouts never mean empty queue",
            expected: ["PAYMENT_CHECK_TIMEOUT", "PAYMENT_CHECK_TIMEOUT"] + newPurchase,
            preflightTimeout: 0.06, after: { manager in
                let foreground = Task { await manager.resumePurchases() }
                try await Task.sleep(nanoseconds: 10_000_000)
                manager.launch(try PayRequest(json: "second-intent"))
                await foreground.value; try await waitForIdle(manager)
                precondition(unfinishedReads == 1, "Concurrent recovery created a second Apple scan")
                finishHeldReads(); try await Task.sleep(nanoseconds: 20_000_000)
                precondition(events == ["PAYMENT_CHECK_TIMEOUT", "PAYMENT_CHECK_TIMEOUT"])
                manager.launch(try PayRequest(json: "fresh-intent")); try await waitForIdle(manager)
                precondition(unfinishedReads == 2, "A completed snapshot was cached for new checkout")
            }) { _ in holdUnfinished = true }

        try await run("shared reader: one timeout does not cancel other readers; no stale snapshot cache",
            expected: newPurchase, after: { _ in
                let reader = CheckoutTransactionReader()
                holdUnfinished = true
                let baseline = unfinishedReads
                let first = Task { await reader.read(timeout: 0.03) }
                let second = Task { await reader.read(timeout: 0.2) }
                let timedOut = await first.value
                precondition(timedOut == nil)
                precondition(unfinishedReads == baseline + 1)
                for continuation in unfinishedContinuations {
                    continuation.yield(.verified(Transaction(productID: "pbm_tier_099")))
                }
                finishHeldReads()
                let snapshot = await second.value
                precondition(snapshot?.count == 1)
                let fresh = await reader.read(timeout: 0.2)
                precondition(fresh?.isEmpty == true && unfinishedReads == baseline + 2)
                reader.stop()
            })

        try await run("shared reader: canceled waiter leaves another reader alive and returns no false empty result",
            expected: newPurchase, after: { _ in
                let reader = CheckoutTransactionReader(); holdUnfinished = true
                let baseline = unfinishedReads
                let first = Task { await reader.read(timeout: 0.2) }
                let second = Task { await reader.read(timeout: 0.2) }
                try await Task.sleep(nanoseconds: 10_000_000)
                first.cancel()
                let canceled = await first.value
                precondition(canceled == nil && unfinishedReads == baseline + 1)
                finishHeldReads()
                let remaining = await second.value
                precondition(remaining?.isEmpty == true)
                reader.stop()
            })
    }
}
