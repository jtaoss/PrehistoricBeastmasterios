import Foundation

// Test the production diagnostic task lifecycle without UIKit or Apple sign-in.
@MainActor final class DiagnosticHarness {
    final class Button { var isEnabled = true }
    private(set) static var authenticationInProgress = false
    private static let authenticationChanged = Notification.Name("UnitTestAuthenticationChanged")
    private var buttons = [Button()]
    private var operation: Task<Void, Never>?
    private var watchdog: Task<Void, Never>?
    private var runID: UUID?
    private var waitsForAuthentication = false
    private var lines: [String] = []
    private var dismissed = false
    private func append(_ line: String) { lines.append(line) }
    private func dismiss(animated: Bool) { dismissed = true }

    /*__OPERATIONS__*/

    private static var continuation: CheckedContinuation<Void, Never>?
    private static var entered = false
    private static func waitForTestResult() async {
        await withCheckedContinuation { continuation = $0 }
    }
    private static func tick() async throws { try await Task.sleep(nanoseconds: 30_000_000) }

    static func tests() async throws {
        var original: DiagnosticHarness? = DiagnosticHarness()
        weak var retainedOwner = original
        original!.run(timeout: 0, waitsForAuthentication: true) { _ in await waitForTestResult() }
        try await tick()
        precondition(authenticationInProgress && original!.runID != nil)
        precondition(!original!.buttons[0].isEnabled)
        precondition(original!.lines.contains(where: { $0.contains("diagnostic-timeout") }))
        print("PASS authentication timeout keeps lock and disables retry")

        original!.close()
        precondition(original!.dismissed && authenticationInProgress)
        original = nil
        precondition(retainedOwner != nil, "Pending authentication must retain its owner")
        let reopened = DiagnosticHarness()
        reopened.run { _ in entered = true }
        try await tick()
        precondition(!entered && reopened.runID == nil && authenticationInProgress)
        print("PASS closing and reopening cannot launch a second authentication")

        continuation!.resume()
        continuation = nil
        try await tick()
        precondition(!authenticationInProgress && retainedOwner == nil)
        reopened.authenticationDidChange()
        precondition(reopened.buttons[0].isEnabled)
        reopened.run { _ in entered = true }
        try await tick()
        precondition(entered && reopened.runID == nil)
        print("PASS only real completion releases authentication and restores retry")

        entered = false
        let query = DiagnosticHarness()
        query.run(timeout: 0) { _ in await waitForTestResult() }
        try await tick()
        precondition(query.runID == nil && query.buttons[0].isEnabled && !authenticationInProgress)
        // A stale completion must not finish the next request.
        let oldContinuation = continuation!
        query.run(timeout: 5) { _ in await waitForTestResult() }
        try await tick()
        let nextID = query.runID
        precondition(nextID != nil)
        oldContinuation.resume()
        try await tick()
        precondition(query.runID == nextID)
        continuation!.resume()
        continuation = nil
        try await tick()
        precondition(query.runID == nil)
        print("PASS read-only query timeout allows retry without stale completion interference")
        print("4 diagnostic lifecycle behavioral tests passed (no Apple authentication).")
    }
}

@main enum DiagnosticTestMain {
    static func main() async throws { try await DiagnosticHarness.tests() }
}
