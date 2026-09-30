import UIKit
import WebKit


final class GameActivityService {
    private struct SyncRequest: Encodable {
        let appId: String
        let channel: String
        let platform: String
        let appVersion: String
        let buildNumber: String
        let playerId: String?
    }

    private struct SyncProfileResponse: Decodable {
        let code: String?
        let data: ProfileData?

        struct ProfileData: Decodable {
            let userId: String?
            let accountStatus: String?
            let status: String?
            let featureFlags: FeatureFlags?
        }

        struct FeatureFlags: Decodable {
            let noticeUrl: String?
            let activityUrl: String?
        }
    }

    private let transport: SecureNetworkTransport

    init() {
        transport = SecureNetworkTransport(
            session: .shared,
            interceptors: [SecurityRequestInterceptor(
                bundleId: ShellConfig.bundleId,
                appVersion: ShellConfig.versionName
            )]
        )
    }

    func fetchNoticeURL(playerId: String?) async -> URL? {
        guard let endpoint = Self.profileSyncURL() else { return nil }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        let body = SyncRequest(
            appId: ShellConfig.backendAppId,
            channel: ShellConfig.channel,
            platform: "ios",
            appVersion: ShellConfig.versionName,
            buildNumber: ShellConfig.versionCode,
            playerId: playerId
        )
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        guard let httpBody = try? encoder.encode(body) else { return nil }
        request.httpBody = httpBody

        do {
            let response: SyncProfileResponse = try await transport.send(request)
            guard response.code?.uppercased() == "OK",
                  let data = response.data,
                  (data.accountStatus?.uppercased() == "ACTIVE" || data.status?.uppercased() == "ACTIVE"),
                  let rawURL = data.featureFlags?.noticeUrl ?? data.featureFlags?.activityUrl,
                  let url = URL(string: rawURL),
                  Self.isApprovedNoticeURL(url) else {
                return nil
            }
            return url
        } catch {
            return nil
        }
    }

    static func isApprovedNoticeURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(), !host.isEmpty,
              IOSWebNavigationPolicy.isApprovedBusinessHost(host),
              url.port == nil || url.port == 443,
              url.user == nil, url.password == nil,
              !url.path.isEmpty, url.path != "/" else {
            return false
        }
        return true
    }

    private static func profileSyncURL() -> URL? {
        guard let base = ServiceEndpoints.url(.sdkAPI),
              var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/api/v1/users/sync-profile"
        components.query = nil
        components.fragment = nil
        return components.url
    }
}


final class GameActivityWebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let targetURL: URL
    private let webView: WKWebView
    private let closeButton = UIButton(type: .system)
    private let progressIndicator = UIActivityIndicatorView(style: .large)
    private let failureContainer = UIStackView()
    private let failureLabel = UILabel()
    private let retryButton = UIButton(type: .system)

    init(url: URL) {
        self.targetURL = url

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        self.webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        setupWebView()
        setupTopBarControls()
        setupFailureStateView()
        loadActivityContent()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed {
            releaseWebContent()
        }
    }

    deinit {
        releaseWebContent()
    }


    private func setupWebView() {
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupTopBarControls() {
        var closeConfig = UIButton.Configuration.filled()
        closeConfig.title = "返回營地"
        closeConfig.image = UIImage(systemName: "chevron.backward")
        closeConfig.imagePadding = 6
        closeConfig.baseForegroundColor = .white
        closeConfig.baseBackgroundColor = UIColor.black.withAlphaComponent(0.75)
        closeConfig.cornerStyle = .capsule
        closeButton.configuration = closeConfig
        closeButton.accessibilityLabel = "退出活動並返回營地"
        closeButton.addTarget(self, action: #selector(handleClose), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)

        progressIndicator.hidesWhenStopped = true
        progressIndicator.color = .white
        progressIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progressIndicator)

        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            closeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),

            progressIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            progressIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])

        view.bringSubviewToFront(closeButton)
    }

    private func setupFailureStateView() {
        failureLabel.text = "活動頁面載入失敗，請檢查網路連線"
        failureLabel.textColor = .secondaryLabel
        failureLabel.font = .preferredFont(forTextStyle: .body)
        failureLabel.adjustsFontForContentSizeCategory = true
        failureLabel.textAlignment = .center
        failureLabel.numberOfLines = 0

        var retryConfig = UIButton.Configuration.tinted()
        retryConfig.title = "重新載入"
        retryButton.configuration = retryConfig
        retryButton.addTarget(self, action: #selector(retryLoading), for: .touchUpInside)

        failureContainer.axis = .vertical
        failureContainer.alignment = .center
        failureContainer.spacing = 14
        failureContainer.addArrangedSubview(failureLabel)
        failureContainer.addArrangedSubview(retryButton)
        failureContainer.isHidden = true
        failureContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(failureContainer)

        NSLayoutConstraint.activate([
            failureContainer.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            failureContainer.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            failureContainer.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            failureContainer.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32)
        ])
    }


    private func loadActivityContent() {
        failureContainer.isHidden = true
        webView.isHidden = false
        progressIndicator.startAnimating()
        view.bringSubviewToFront(closeButton)
        webView.load(URLRequest(
            url: targetURL,
            cachePolicy: .useProtocolCachePolicy,
            timeoutInterval: 25
        ))
    }

    @objc private func retryLoading() {
        loadActivityContent()
    }

    @objc private func handleClose() {
        releaseWebContent()
        dismiss(animated: true)
    }

    private func releaseWebContent() {
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    private func showFailureState() {
        progressIndicator.stopAnimating()
        webView.isHidden = true
        failureContainer.isHidden = false
        view.bringSubviewToFront(closeButton)
    }


    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased() else {
            decisionHandler(.cancel)
            return
        }

        // 仅放行授权业务域名内的 HTTPS 页面流转，拦截所有未受控的跨域外部跳转
        if scheme == "https",
           let host = url.host?.lowercased(),
           IOSWebNavigationPolicy.isApprovedBusinessHost(host) {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }

        // 仅在明确点击且符合官方合规外部链接时系统打开
        if scheme == "https",
           navigationAction.navigationType == .linkActivated,
           IOSWebNavigationPolicy.allowsExternal(url) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }

        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if let response = navigationResponse.response as? HTTPURLResponse,
           response.statusCode >= 400 {
            decisionHandler(.cancel)
            if navigationResponse.isForMainFrame { showFailureState() }
            return
        }
        guard let url = navigationResponse.response.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "https",
              let host = url.host?.lowercased(),
              IOSWebNavigationPolicy.isApprovedBusinessHost(host) else {
            decisionHandler(.cancel)
            if navigationResponse.isForMainFrame { showFailureState() }
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        progressIndicator.stopAnimating()
        webView.isHidden = false
        failureContainer.isHidden = true
        view.bringSubviewToFront(closeButton)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showFailureState()
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url,
           url.scheme?.lowercased() == "https",
           let host = url.host?.lowercased(),
           IOSWebNavigationPolicy.isApprovedBusinessHost(host) {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    private func handleError(_ error: Error) {
        let nsError = error as NSError
        guard !(nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled) else { return }
        showFailureState()
    }
}
