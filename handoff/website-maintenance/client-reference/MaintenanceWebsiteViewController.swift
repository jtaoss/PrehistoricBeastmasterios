import UIKit
import WebKit

/// Displays the original website without native chrome or injected page content.
/// Game/payment/auth bridges and game cookies remain isolated from this browser.
final class MaintenanceWebsiteViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private(set) var displayConfig: WebsiteDisplayConfig
    private(set) lazy var browser: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let browser = WKWebView(frame: .zero, configuration: configuration)
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.isOpaque = false
        browser.backgroundColor = .systemBackground
        return browser
    }()

    init(config: WebsiteDisplayConfig) {
        displayConfig = config
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func loadView() {
        // No native header, buttons, spinner, error page, alerts or overlays.
        view = browser
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.accessibilityIdentifier = "maintenance-website"
        loadHome()
    }

    func update(_ config: WebsiteDisplayConfig) {
        let changedURL = config.websiteUrl != displayConfig.websiteUrl
        displayConfig = config
        if changedURL, isViewLoaded { loadHome() }
    }

    func stop() {
        browser.stopLoading()
        browser.setAllMediaPlaybackSuspended(true, completionHandler: nil)
        browser.navigationDelegate = nil
        browser.uiDelegate = nil
    }

    private func loadHome() {
        guard WebsiteNavigationPolicy.allowsEmbedded(displayConfig.websiteUrl, config: displayConfig) else { return }
        browser.load(URLRequest(url: displayConfig.websiteUrl, cachePolicy: .reloadIgnoringLocalCacheData,
                                timeoutInterval: 15))
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if WebsiteNavigationPolicy.allowsEmbedded(url, config: displayConfig) {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame == false, url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame != false,
           (navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil),
           WebsiteNavigationPolicy.allowsSupport(url, config: displayConfig) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigationResponse.response.url,
              WebsiteNavigationPolicy.allowsEmbedded(url, config: displayConfig)
                || (!navigationResponse.isForMainFrame && url.absoluteString == "about:blank") else {
            decisionHandler(.cancel)
            return
        }
        // Also render the website's own HTTP error pages without replacing them.
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if WebsiteNavigationPolicy.allowsEmbedded(url, config: displayConfig) {
            browser.load(navigationAction.request)
        } else if WebsiteNavigationPolicy.allowsSupport(url, config: displayConfig) {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }
}
