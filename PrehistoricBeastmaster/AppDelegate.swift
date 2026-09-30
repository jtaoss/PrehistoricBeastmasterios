import AppTrackingTransparency
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var analyticsLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
    private var trackingRequestInFlight = false
    private var trackingPromptAttempted = false

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        PaymentDebugLog.reset()
        PaymentDebugLog.record("app-launch bundle=\(Bundle.main.bundleIdentifier ?? "<unknown>") build=\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown")")
        LocalStoreKitBootstrap.startIfRequested()
        analyticsLaunchOptions = launchOptions
        refreshAnalyticsAuthorization(application)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0.024, green: 0.090, blue: 0.078, alpha: 1)
        window.rootViewController = SplashViewController()
        window.makeKeyAndVisible()
        self.window = window
        PaymentDebugLog.record("boot-window-visible state=\(application.applicationState.rawValue) hidden=\(window.isHidden) bounds=\(window.bounds)")
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        PaymentDebugLog.record("boot-became-active windowPresent=\(window != nil)")
        refreshAnalyticsAuthorization(application, activate: true)
        requestTrackingAuthorizationIfNeeded(application)
    }

    func refreshAnalyticsAuthorization(_ application: UIApplication, activate: Bool = false) {
        let initialized = AnalyticsSDK.configure(application: application, launchOptions: analyticsLaunchOptions)
        if AnalyticsSDK.isConfigured { analyticsLaunchOptions = nil }
        if (initialized || activate), application.applicationState == .active {
            AnalyticsSDK.activate()
        }
    }

    func requestTrackingAuthorizationIfNeeded(_ application: UIApplication) {
        refreshAnalyticsAuthorization(application)
        guard application.applicationState == .active,
              let game = window?.rootViewController as? GameViewController,
              game.canPresentTrackingAuthorization,
              ATTrackingManager.trackingAuthorizationStatus == .notDetermined,
              !trackingRequestInFlight, !trackingPromptAttempted else { return }
        trackingRequestInFlight = true
        trackingPromptAttempted = true
        PaymentDebugLog.record("att-request-start")
        ATTrackingManager.requestTrackingAuthorization { [weak self] _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.trackingRequestInFlight = false
                self.refreshAnalyticsAuthorization(application)
                PaymentDebugLog.record("att-request-finished status=\(ATTrackingManager.trackingAuthorizationStatus.rawValue)")
            }
        }
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        .portrait
    }
}
