import Foundation

enum Spy {
    static var sdkTouches = 0, metaInit = 0, firebaseInit = 0, activations = 0
    static var firebaseEvents = 0, metaEvents = 0, games = 0
    static var collection: [Bool] = []
    static var sequence: [String] = []
    static var receivedOptions: [UIApplication.LaunchOptionsKey: Any]?
    static var hasFirebase = true, matchingFirebase = true, usesSystemMetaTracking = false
    static var trackingFlags: [Bool] = []
}
final class ShellPreferences {
    static var accepted = false
    var isPrivacyAccepted: Bool { Self.accepted }
    func setPrivacyAccepted(_ value: Bool) { Self.accepted = value }
}
enum ATTrackingManager {
    enum AuthorizationStatus: Int { case notDetermined, restricted, denied, authorized }
    static var trackingAuthorizationStatus: AuthorizationStatus = .notDetermined
    static var requests = 0
    static var callbacks: [(AuthorizationStatus) -> Void] = []
    static func requestTrackingAuthorization(completionHandler: @escaping (AuthorizationStatus) -> Void) {
        requests += 1; callbacks.append(completionHandler)
    }
}
enum DispatchQueue {
    struct Queue { func async(execute: () -> Void) { execute() } }
    static let main = Queue()
}
enum PaymentDebugLog { static func record(_ value: String) {} }
final class UIApplication {
    enum State { case active, inactive, background }
    struct LaunchOptionsKey: Hashable { let rawValue: String }
    static let shared = UIApplication()
    var applicationState: State = .active
    var delegate: AnyObject?
}
final class Settings {
    private static let instance = Settings()
    static var shared: Settings { Spy.sdkTouches += 1; return instance }
    var isAutoLogAppEventsEnabled = true, isAdvertiserIDCollectionEnabled = true
    var isAdvertiserTrackingEnabled = false { didSet { Spy.trackingFlags.append(isAdvertiserTrackingEnabled) } }
}
final class ApplicationDelegate {
    private static let instance = ApplicationDelegate()
    static var shared: ApplicationDelegate { Spy.sdkTouches += 1; return instance }
    func application(_ app: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Spy.metaInit += 1; Spy.sequence.append("meta-init"); Spy.receivedOptions = options; return true
    }
}
final class AppEvents {
    enum FlushBehavior { case auto, explicitOnly }
    var flushBehavior: FlushBehavior = .auto
    private static let instance = AppEvents()
    static var shared: AppEvents { Spy.sdkTouches += 1; return instance }
    func activateApp() { Spy.activations += 1 }
}
enum Bundle {
    static let main = TestBundle()
    struct TestBundle {
        let bundleIdentifier: String? = "com.stone.primitive.saga"
        func path(forResource: String, ofType: String) -> String? { Spy.hasFirebase ? "/fake/options" : nil }
    }
}
struct FirebaseOptions {
    let bundleID: String
    init?(contentsOfFile: String) { bundleID = Spy.matchingFirebase ? "com.stone.primitive.saga" : "wrong.bundle" }
}
enum FirebaseApp {
    static func configure(options: FirebaseOptions) { Spy.firebaseInit += 1; Spy.sequence.append("firebase-init") }
}
enum Analytics {
    static func setAnalyticsCollectionEnabled(_ value: Bool) { Spy.collection.append(value) }
    static func logEvent(_ name: String, parameters: [String: Any]) { Spy.firebaseEvents += 1 }
}
struct JSONObject {
    static func parse(_ json: String?) -> JSONObject { .init() }
    func string(_ key: String) -> String { "game_loading_complete" }
}
enum AnalyticsNames {
    static let allowed: Set<String> = ["game_loading_complete"]
    static func normalize(_ value: String) -> String { value }
    static func firebaseName(_ value: String) -> String { value }
    static func operationsName(_ value: String) -> String { value }
}
final class AnalyticsManager {
    var isFacebookConfigured: Bool { true }
    var isFirebaseConfigured: Bool { AnalyticsSDK.isFirebaseConfigured }
    func safeFields(_ source: JSONObject) -> [String: Any] { [:] }
    func safeName(_ source: String) -> String { source }
    func logFacebook(_ name: String, fields: [String: Any]) { Spy.metaEvents += 1 }
    /* LOG_EVENT */
}
/* SDK */
final class AppDelegate {
    var window: UIWindow?
    var analyticsLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
    var trackingRequestInFlight = false, trackingPromptAttempted = false
    /* ACTIVATION */
}
class UIViewController {
    let view = TestView()
    var viewIfLoaded: TestView? { view }
    var presentedViewController: UIViewController?
    func viewDidAppear(_ animated: Bool) {}
}
final class UIWindow {
    var rootViewController: UIViewController? {
        didSet { rootViewController?.view.window = self }
    }
}
final class TestView { var window: UIWindow? }
final class BillingStub {
    var isProcessingPayment = false
    var checkoutBlockingMessage: String?
}
final class GameViewController: UIViewController {
    let billing = BillingStub()
    var contentRouteReleased = true
    /* PRESENTATION */
    override init() { Spy.games += 1; Spy.sequence.append("game"); super.init() }
}
final class SplashViewController: UIViewController {
    var hasOpenedGame = false
    /* STARTUP */
}
func expect(_ value: @autoclosure () -> Bool, _ description: String) {
    guard value() else { fatalError(description) }
}
let scenario = CommandLine.arguments[1]
let app = UIApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
let window = UIWindow()
delegate.window = window
let splash = SplashViewController()
window.rootViewController = splash
let manager = AnalyticsManager()
func emit() { manager.logEvent("game_loading_complete", json: nil) }
func showGame() { splash.viewDidAppear(true) }
func request() { delegate.requestTrackingAuthorizationIfNeeded(app) }
func finishATT(_ result: ATTrackingManager.AuthorizationStatus, live: ATTrackingManager.AuthorizationStatus? = nil) {
    ATTrackingManager.trackingAuthorizationStatus = live ?? result
    let callback = ATTrackingManager.callbacks.removeFirst()
    callback(result)
}
func expectInactiveSDK() {
    expect(Spy.sdkTouches == 0 && Spy.firebaseInit == 0 && Spy.metaEvents == 0 && Spy.firebaseEvents == 0,
           "No measurement SDK access without system authorization")
}
switch scenario {
case "no-consent":
    delegate.refreshAnalyticsAuthorization(app); emit()
    expectInactiveSDK()
    showGame()
    expect(Spy.games == 1 && !ShellPreferences.accepted && ATTrackingManager.requests == 0, "Game opens without fabricated consent")
case "allow", "deny", "ios17-meta":
    Spy.usesSystemMetaTracking = scenario == "ios17-meta"
    showGame(); request(); request()
    expectInactiveSDK()
    expect(ATTrackingManager.requests == 1 && Spy.games == 1, "One system request after usable game")
    finishATT(scenario == "deny" ? .denied : .authorized)
    emit(); request()
    expect(!ShellPreferences.accepted, "ATT never accepts the user agreement")
    if scenario == "deny" {
        delegate.applicationDidBecomeActive(app)
        expectInactiveSDK()
        expect(Spy.games == 1 && ATTrackingManager.requests == 1, "Denial never blocks game or re-prompts")
    } else {
        expect(Spy.metaInit == 1 && Spy.firebaseInit == 1 && Spy.activations == 1 && Spy.collection == [true], "Allow initializes/activates once")
        expect(Spy.metaEvents == 1 && Spy.firebaseEvents == 1, "Authorized events sent once")
        expect(!Settings.shared.isAdvertiserIDCollectionEnabled && !Settings.shared.isAutoLogAppEventsEnabled, "No additional IDFA/automatic events")
        expect(Spy.usesSystemMetaTracking ? Spy.trackingFlags.isEmpty : Spy.trackingFlags.last == true, "Meta OS-specific tracking flag")
    }
case "restricted", "previously-denied":
    ATTrackingManager.trackingAuthorizationStatus = scenario == "restricted" ? .restricted : .denied
    delegate.refreshAnalyticsAuthorization(app); showGame(); request()
    delegate.applicationDidBecomeActive(app); emit()
    expectInactiveSDK()
    expect(ATTrackingManager.requests == 0 && Spy.games == 1, "Restriction/denial is respected")
case "returning-authorized":
    ATTrackingManager.trackingAuthorizationStatus = .authorized
    app.applicationState = .inactive
    delegate.refreshAnalyticsAuthorization(app); showGame()
    app.applicationState = .active; delegate.applicationDidBecomeActive(app); request()
    expect(Spy.metaInit == 1 && Spy.firebaseInit == 1 && Spy.activations == 1 && ATTrackingManager.requests == 0, "System grant restores SDK without prompt")
case "legacy-agreement":
    ShellPreferences.accepted = true
    delegate.refreshAnalyticsAuthorization(app); showGame(); request(); emit()
    expectInactiveSDK()
    expect(ATTrackingManager.requests == 1 && ShellPreferences.accepted, "Legacy agreement is preserved, never converted to tracking consent")
case "repeat-lifecycle":
    showGame(); request(); splash.viewDidAppear(true); delegate.applicationDidBecomeActive(app); request()
    expect(ATTrackingManager.requests == 1 && Spy.games == 1, "Repeated lifecycle is coalesced")
    finishATT(.denied); delegate.applicationDidBecomeActive(app); request()
    expect(ATTrackingManager.requests == 1, "No retry after denied")
case "not-active":
    app.applicationState = .inactive; showGame(); request()
    expect(ATTrackingManager.requests == 0, "No system prompt while inactive")
    app.applicationState = .active; delegate.applicationDidBecomeActive(app)
    expect(ATTrackingManager.requests == 1, "One prompt after foreground")
case "not-game":
    delegate.applicationDidBecomeActive(app); request()
    expect(ATTrackingManager.requests == 0, "No prompt over splash")
    showGame(); request(); expect(ATTrackingManager.requests == 1, "Request when game appears")
case "modal", "payment", "apple-finishing", "no-window", "route-pending":
    showGame(); let game = window.rootViewController as! GameViewController
    if scenario == "modal" { game.presentedViewController = UIViewController() }
    if scenario == "payment" { game.billing.isProcessingPayment = true }
    if scenario == "apple-finishing" { game.billing.checkoutBlockingMessage = "still finishing" }
    if scenario == "no-window" { game.view.window = nil }
    if scenario == "route-pending" { game.contentRouteReleased = false }
    request(); expect(ATTrackingManager.requests == 0, "Never compete with unavailable UI or checkout")
    game.presentedViewController = nil; game.billing.isProcessingPayment = false
    game.billing.checkoutBlockingMessage = nil; game.view.window = window
    game.contentRouteReleased = true
    request(); expect(ATTrackingManager.requests == 1, "Later safe lifecycle may request")
case "undetermined-callback", "no-callback", "stale-callback":
    showGame(); request()
    if scenario == "undetermined-callback" { finishATT(.notDetermined) }
    if scenario == "stale-callback" { finishATT(.authorized, live: .denied) }
    for _ in 0..<3 { request(); delegate.applicationDidBecomeActive(app); emit() }
    expectInactiveSDK()
    expect(ATTrackingManager.requests == 1 && Spy.games == 1, "Unknown/missing/stale completion never loops or authorizes")
case "background-callback":
    showGame(); request(); app.applicationState = .background
    finishATT(.authorized)
    expect(Spy.metaInit == 1 && Spy.activations == 0, "No foreground activation from background callback")
    app.applicationState = .active; delegate.applicationDidBecomeActive(app)
    expect(Spy.activations == 1 && ATTrackingManager.requests == 1, "Activate on real foreground")
case "revocation", "reenable":
    ATTrackingManager.trackingAuthorizationStatus = .authorized
    showGame(); request(); emit()
    ATTrackingManager.trackingAuthorizationStatus = .denied
    emit(); expect(Spy.metaEvents == 1 && Spy.firebaseEvents == 1, "Event checks live ATT even before foreground refresh")
    delegate.applicationDidBecomeActive(app)
    expect(Spy.collection == [true, false] && AppEvents.shared.flushBehavior == .explicitOnly, "Withdrawn permission disables collection and auto flush")
    expect(Spy.trackingFlags.last == false, "iOS 16 Meta permission withdrawn")
    if scenario == "reenable" {
        ATTrackingManager.trackingAuthorizationStatus = .authorized
        delegate.applicationDidBecomeActive(app); emit()
        expect(Spy.collection == [true, false, true] && Spy.metaInit == 1 && Spy.firebaseInit == 1, "Settings reauthorization doesn't reinitialize SDK")
        expect(Spy.metaEvents == 2 && Spy.firebaseEvents == 2, "No denied-period replay")
    }
    expect(ATTrackingManager.requests == 0 && Spy.games == 1, "Settings change never starts another game or prompt")
case "early-events":
    emit(); showGame(); request(); emit(); finishATT(.authorized); emit()
    expect(Spy.metaEvents == 1 && Spy.firebaseEvents == 1, "Drop pre-authorization events, no replay")
case "missing-firebase", "wrong-firebase":
    Spy.hasFirebase = scenario != "missing-firebase"; Spy.matchingFirebase = scenario != "wrong-firebase"
    showGame(); request(); finishATT(.authorized); emit()
    expect(Spy.firebaseInit == 0 && Spy.collection.isEmpty && Spy.firebaseEvents == 0, "Missing/mismatched Firebase stays off")
    expect(Spy.metaInit == 1 && Spy.metaEvents == 1 && Spy.games == 1, "Authorized Meta/game continue")
case "launch-options":
    let key = UIApplication.LaunchOptionsKey(rawValue: "test")
    delegate.analyticsLaunchOptions = [key: "fixture"]
    delegate.refreshAnalyticsAuthorization(app); showGame(); request()
    expect(delegate.analyticsLaunchOptions != nil && Spy.receivedOptions == nil, "Preserve launch context while awaiting ATT")
    finishATT(.authorized)
    expect(Spy.receivedOptions?[key] as? String == "fixture" && delegate.analyticsLaunchOptions == nil, "Forward launch options once after ATT")
default: fatalError("Unknown scenario")
}
print("PASS \(scenario)")
