import Foundation

@main @MainActor enum GameOrderGateHarness {
    static var count = 0, calls = 0
    static var time: TimeInterval = 100
    static var continuation: CheckedContinuation<[String: Any], Error>?
    static func check(_ value: Bool, _ label: String) {
        precondition(value, label); count += 1; print("PASS \(label)")
    }
    static func tick() async throws { try await Task.sleep(nanoseconds: 20_000_000) }
    static func reply(_ order: String) -> [String: Any] {
        ["status": 200, "body": "{\"status\":0,\"cpOrder\":\"\(order)\",\"price\":0.99}"]
    }
    static func network(_ order: String) async throws -> [String: Any] { calls += 1; return reply(order) }
    static func busy(_ response: [String: Any]) -> Bool { response["shellCheckoutBusy"] as? Bool == true }
    static func main() async throws {
        let gate = GameOrderRequestGate(now: { time })
        let first = Task { try await gate.response(for: "same-account-role-item") {
            calls += 1
            return try await withCheckedThrowingContinuation { continuation = $0 }
        } }
        try await tick()
        var taps: [Task<[String: Any], Error>] = []
        for _ in 0..<20 {
            taps.append(Task { try await gate.response(for: "same-account-role-item") { try await network("WRONG") } })
        }
        try await tick()
        check(calls == 1, "20 rapid identical taps share one actual PHP request")
        let other = try await gate.response(for: "other-item") { try await network("WRONG") }
        check(busy(other) && calls == 1, "other tier during creation is ignored before network")
        continuation?.resume(returning: reply("order-A")); continuation = nil
        let original = try await first.value
        check(original["body"] as? String == reply("order-A")["body"] as? String, "first real response unchanged")
        var same = true
        for tap in taps { let r = try await tap.value; same = same && r["body"] as? String == original["body"] as? String }
        check(same && calls == 1, "coalesced callbacks cannot get a second cpOrder")
        gate.beginCheckout("order-A")
        let beforePay = calls
        time += 3600
        for key in ["same-account-role-item", "different-role", "different-account", "other-item"] {
            let result = try await gate.response(for: key) { try await network("WRONG") }
            check(busy(result) && calls == beforePay, "native checkout cannot expire or create order for \(key)")
        }
        gate.endCheckout("older-order")
        let staleEnd = try await gate.response(for: "other-item") { try await network("WRONG") }
        check(busy(staleEnd), "old completion cannot release current order gate")
        gate.endCheckout("order-A")
        let repeatPurchase = try await gate.response(for: "same-account-role-item") { try await network("order-B") }
        check(repeatPurchase["body"] as? String == reply("order-B")["body"] as? String && calls == beforePay + 1,
              "after actual checkout release same item can be bought again with a new order")
        gate.beginCheckout("order-B"); gate.endCheckout("order-B")
        gate.beginCheckout("original-order-retry")
        let duringRetry = try await gate.response(for: "same-account-role-item") { try await network("WRONG") }
        check(busy(duringRetry), "explicit original retry blocks fresh PHP requests too")
        gate.endCheckout("original-order-retry")
        _ = try await gate.response(for: "abandoned") { try await network("abandoned") }
        time += 14
        let held = try await gate.response(for: "new-selection") { try await network("WRONG") }
        check(busy(held), "unclaimed response protects bridge handoff")
        time += 2
        let afterAbandon = try await gate.response(for: "new-selection") { try await network("new-selection") }
        check(!busy(afterAbandon), "aborted H5 response cannot lock the page forever")
        gate.endCheckout("new-selection")
        let failures: [[String: Any]] = [
            ["status": 500, "body": "backend unavailable"],
            ["status": 200, "body": "{\"status\":17,\"message\":\"rejected\"}"],
            ["status": 200, "body": "{\"status\":0}"],
            ["status": 200, "body": "not-json"], ["status": 200, "body": "[]"]
        ]
        for (i, failure) in failures.enumerated() {
            let bad = try await gate.response(for: "failure-\(i)") { calls += 1; return failure }
            let recovered = try await gate.response(for: "retry-\(i)") { try await network("retry-\(i)") }
            check(bad["body"] as? String == failure["body"] as? String && !busy(recovered),
                  "failure \(i) is unchanged and releases only the pre-purchase gate")
            gate.endCheckout("retry-\(i)")
        }
        do {
            _ = try await gate.response(for: "network-failure") { calls += 1; throw URLError(.timedOut) }
            preconditionFailure("Expected timeout")
        } catch { check((error as? URLError)?.code == .timedOut, "timeout is not disguised as duplicate order") }
        let afterFailure = try await gate.response(for: "after-failure") { try await network("after-failure") }
        check(!busy(afterFailure), "network failure does not leave a permanent lock")
        gate.endCheckout("after-failure")
        let delayed = Task { try await gate.response(for: "delayed-h5") {
            calls += 1
            return try await withCheckedThrowingContinuation { continuation = $0 }
        } }
        try await tick()
        check(!gate.beginCheckout("late-direct-native-order"), "late direct bridge cannot supersede the first H5 intent")
        continuation?.resume(returning: reply("late-H5-order")); continuation = nil
        let late = try await delayed.value
        check(!busy(late) && gate.beginCheckout("late-H5-order"), "first H5 response keeps its original checkout ownership")
        gate.endCheckout("late-direct-native-order")
        let stillHeld = try await gate.response(for: "new") { try await network("WRONG") }
        check(busy(stillHeld), "wrong completion cannot unlock first checkout")
        gate.endCheckout("late-H5-order")
        let next = try await gate.response(for: "new") { try await network("new") }
        check(!busy(next), "correct owner releases direct checkout")
        print("\(count) real Swift pre-order gate assertions passed (no network/purchase)")
    }
}
