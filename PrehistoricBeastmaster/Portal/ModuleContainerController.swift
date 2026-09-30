import QuartzCore
import UIKit
import WebKit

enum ModuleExitStatus: String {
    case completed
    case cancelled
}

protocol ModuleContainerHost: AnyObject {
    func moduleContainerDidBecomeReady(_ controller: ModuleContainerController)
    func moduleContainer(_ controller: ModuleContainerController, didEmit name: String, fields: [String: String])
    func moduleContainerDidFinish(_ controller: ModuleContainerController, status: ModuleExitStatus)
}

/// WKUserContentController retains its script handlers. This proxy keeps that
/// reference from pinning the view controller, so dismissing the module can
/// release the web view and its content process.
final class WeakScriptMessageDelegate: NSObject, WKScriptMessageHandler {
    weak var handler: WKScriptMessageHandler?

    init(handler: WKScriptMessageHandler) {
        self.handler = handler
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        handler?.userContentController(userContentController, didReceive: message)
    }
}

/// Modal container for one remote season module. The bundled game stays underneath.
final class ModuleContainerController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let module: GameModule
    weak var host: ModuleContainerHost?

    private var webView: WKWebView?
    private var messageProxy: WeakScriptMessageDelegate?
    private let closeButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let skeletonView = ModuleLoadingSkeletonView()
    private let failureContainer = UIStackView()
    private let failureLabel = UILabel()
    private var handlersInstalled = false
    private var didReportReady = false
    private var didFinish = false
    private var readyFallback: DispatchWorkItem?
    private var emitTimes: [TimeInterval] = []
    private var didLogThrottle = false

    private static let messageName = "pbmModule"
    private static let allowedEvents: Set<String> = ["session_joined", "stage_checkpoint"]
    private static let maxEmitsPerSecond = 5

    init(module: GameModule) {
        self.module = module
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
        modalPresentationCapturesStatusBarAppearance = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        tearDownWebView()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.024, green: 0.090, blue: 0.078, alpha: 1)
        installWebView()
        installChrome()
        installFailureState()
        loadModule()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Full-screen presentation has no sheet grabber. This also blocks a
        // navigation pop if the container is ever wrapped, so a horizontal
        // swipe cannot discard an unsaved season session.
        navigationController?.interactivePopGestureRecognizer?.isEnabled = false
        webView?.allowsBackForwardNavigationGestures = false
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || isMovingFromParent {
            finish(status: .cancelled)
        }
    }

    func loadModule() {
        guard let webView, let url = module.entryURL, IOSWebNavigationPolicy.isApprovedRemoteGameURL(url) else {
            showFailure("這個活動入口無法打開")
            return
        }
        didReportReady = false
        didLogThrottle = false
        readyFallback?.cancel()
        failureContainer.isHidden = true
        webView.alpha = 0
        webView.isHidden = false
        skeletonView.isHidden = false
        skeletonView.startAnimating()
        PaymentDebugLog.record("module-load id=\(module.id)")
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20))
    }

    func finish(status: ModuleExitStatus) {
        guard !didFinish else { return }
        didFinish = true
        readyFallback?.cancel()
        tearDownWebView()
        host?.moduleContainerDidFinish(self, status: status)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        let isMainFrame = message.frameInfo.isMainFrame
        let frameURL = message.frameInfo.request.url
        let acceptedName = message.name == Self.messageName
        DispatchQueue.main.async { [weak self] in
            guard let self, acceptedName, isMainFrame, IOSWebNavigationPolicy.isApprovedRemoteGameURL(frameURL) else { return }
            self.receive(body)
        }
    }

    private func installWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.addUserScript(WKUserScript(
            source: Self.installScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = false
        webView.alpha = 0
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        let proxy = WeakScriptMessageDelegate(handler: self)
        webView.configuration.userContentController.add(proxy, name: Self.messageName)
        messageProxy = proxy
        handlersInstalled = true
        self.webView = webView
    }

    private func installChrome() {
        var closeConfig = UIButton.Configuration.filled()
        closeConfig.title = "返回營地"
        closeConfig.image = UIImage(systemName: "chevron.backward")
        closeConfig.imagePadding = 6
        closeConfig.baseForegroundColor = .white
        closeConfig.baseBackgroundColor = UIColor(white: 0.05, alpha: 0.88)
        closeConfig.background.strokeColor = UIColor(white: 1, alpha: 0.88)
        closeConfig.background.strokeWidth = 1
        closeConfig.cornerStyle = .capsule
        closeConfig.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14)
        closeButton.configuration = closeConfig
        closeButton.accessibilityIdentifier = "module-exit"
        closeButton.accessibilityLabel = "退出活動並返回營地"
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.text = module.title
        titleLabel.textColor = .white
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        skeletonView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(skeletonView)
        view.addSubview(closeButton)
        view.addSubview(titleLabel)
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            closeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            titleLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: closeButton.leadingAnchor, constant: -12),
            skeletonView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            skeletonView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            skeletonView.widthAnchor.constraint(equalToConstant: 220)
        ])
    }

    private func installFailureState() {
        failureLabel.textColor = .white
        failureLabel.font = .preferredFont(forTextStyle: .body)
        failureLabel.adjustsFontForContentSizeCategory = true
        failureLabel.textAlignment = .center
        failureLabel.numberOfLines = 0
        var retryConfig = UIButton.Configuration.tinted()
        retryConfig.title = "重新載入"
        retryConfig.baseForegroundColor = .white
        let retryButton = UIButton(type: .system)
        retryButton.configuration = retryConfig
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)
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

    @objc private func closeTapped() {
        finish(status: .cancelled)
    }

    @objc private func retryTapped() {
        loadModule()
    }

    private func receive(_ body: Any) {
        guard !didFinish, let fields = body as? [String: Any] else { return }
        switch fields["method"] as? String {
        case "ready":
            reportReady()
        case "exit":
            let status = Self.exitStatus(fields["status"])
            finish(status: status)
        case "emit":
            guard allowEmit(),
                  let name = fields["name"] as? String,
                  Self.allowedEvents.contains(name),
                  let payload = sanitizedFields(fields["payload"]) else { return }
            host?.moduleContainer(self, didEmit: name, fields: payload)
        default:
            break
        }
    }

    private func allowEmit() -> Bool {
        let now = CACurrentMediaTime()
        emitTimes.removeAll { now - $0 >= 1 }
        guard emitTimes.count < Self.maxEmitsPerSecond else {
            if !didLogThrottle {
                didLogThrottle = true
                PaymentDebugLog.record("module-emit-throttled id=\(module.id)")
            }
            return false
        }
        didLogThrottle = false
        emitTimes.append(now)
        return true
    }

    private static func exitStatus(_ value: Any?) -> ModuleExitStatus {
        guard let raw = value as? String else { return .cancelled }
        return raw == ModuleExitStatus.completed.rawValue ? .completed : .cancelled
    }

    private func sanitizedFields(_ value: Any?) -> [String: String]? {
        guard let raw = value as? [String: Any], raw.count <= 8 else { return nil }
        let allowedKey = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_"))
        var fields: [String: String] = [:]
        for (key, item) in raw {
            guard (1...32).contains(key.count),
                  key.unicodeScalars.allSatisfy({ allowedKey.contains($0) }),
                  let text = scalarString(item) else { return nil }
            fields[key] = text
        }
        return fields
    }

    private func scalarString(_ value: Any) -> String? {
        switch value {
        case let text as String:
            let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard clean.count <= 128, !clean.contains("\u{0000}") else { return nil }
            return clean
        case let flag as Bool:
            return flag ? "true" : "false"
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue ? "true" : "false"
            }
            guard number.doubleValue.isFinite else { return nil }
            return number.stringValue
        default:
            return nil
        }
    }

    private func reportReady() {
        guard !didReportReady, !didFinish, let webView else { return }
        didReportReady = true
        readyFallback?.cancel()
        skeletonView.stopAnimating()
        skeletonView.isHidden = true
        failureContainer.isHidden = true
        webView.isHidden = false
        view.bringSubviewToFront(closeButton)
        view.bringSubviewToFront(titleLabel)
        UIView.animate(withDuration: 0.28, delay: 0, options: [.curveEaseOut, .allowUserInteraction]) {
            webView.alpha = 1
        }
        host?.moduleContainerDidBecomeReady(self)
    }

    private func showFailure(_ message: String) {
        readyFallback?.cancel()
        skeletonView.stopAnimating()
        skeletonView.isHidden = true
        webView?.isHidden = true
        failureLabel.text = message
        failureContainer.isHidden = false
        view.bringSubviewToFront(closeButton)
        view.bringSubviewToFront(failureContainer)
    }

    private func scheduleReadyFallback() {
        readyFallback?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.reportReady()
        }
        readyFallback = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    private func tearDownWebView() {
        readyFallback?.cancel()
        guard let webView else {
            messageProxy?.handler = nil
            messageProxy = nil
            return
        }
        webView.stopLoading()
        webView.setAllMediaPlaybackSuspended(true)
        webView.evaluateJavaScript(Self.silenceMediaScript, completionHandler: nil)
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        if handlersInstalled {
            webView.configuration.userContentController.removeScriptMessageHandler(forName: Self.messageName)
            webView.configuration.userContentController.removeAllUserScripts()
            handlersInstalled = false
        }
        messageProxy?.handler = nil
        messageProxy = nil
        webView.removeFromSuperview()
        webView.load(URLRequest(url: URL(string: "about:blank")!))
        self.webView = nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame != false
        if !isMainFrame, url.absoluteString == "about:blank" || IOSWebNavigationPolicy.isApprovedRemoteGameURL(url) {
            decisionHandler(.allow)
            return
        }
        if isMainFrame, IOSWebNavigationPolicy.isApprovedRemoteGameURL(url) {
            decisionHandler(.allow)
            return
        }
        if isMainFrame, IOSWebNavigationPolicy.allowsExternal(url) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = navigationResponse.response as? HTTPURLResponse,
           navigationResponse.isForMainFrame,
           !(200...299).contains(http.statusCode) {
            decisionHandler(.cancel)
            showFailure("活動頁面暫時無法載入")
            return
        }
        guard let url = navigationResponse.response.url,
              IOSWebNavigationPolicy.isApprovedRemoteGameURL(url)
                || (!navigationResponse.isForMainFrame && url.absoluteString == "about:blank") else {
            decisionHandler(.cancel)
            if navigationResponse.isForMainFrame {
                showFailure("活動頁面不在允許的範圍內")
            }
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.absoluteString != "about:blank" else { return }
        scheduleReadyFallback()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showFailure("活動頁面已中斷，請重新載入")
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, IOSWebNavigationPolicy.isApprovedRemoteGameURL(url) {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    private func handleLoadError(_ error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled { return }
        showFailure("活動頁面載入失敗，請檢查網路後重試")
    }

    private static let installScript = """
    (function(){
      if (window.pbmModule) { return; }
      function post(body){
        try { window.webkit.messageHandlers.pbmModule.postMessage(body); } catch (error) {}
      }
      window.pbmModule = {
        ready: function(){ post({method:'ready'}); },
        exit: function(status){
          post({method:'exit', status: status === 'completed' ? 'completed' : 'cancelled'});
        },
        emit: function(name, payload){
          var fields = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
          post({method:'emit', name: name == null ? '' : String(name), payload: fields});
        }
      };
    })();
    """

    private static let silenceMediaScript = """
    (function(){
      var nodes = document.querySelectorAll('audio,video');
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].pause(); nodes[i].removeAttribute('src'); nodes[i].load(); } catch (error) {}
      }
      var contexts = window.__pbmAudioContexts || [];
      for (var j = 0; j < contexts.length; j++) { try { contexts[j].close && contexts[j].close(); } catch (error) {} }
    })();
    """
}

private final class ModuleLoadingSkeletonView: UIView {
    private let stack = UIStackView()
    private var pulsing = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        stack.axis = .vertical
        stack.spacing = 12
        stack.alignment = .leading
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        for width in [1.0, 0.72, 0.46] as [CGFloat] {
            let bar = UIView()
            bar.backgroundColor = UIColor(white: 1, alpha: 0.16)
            bar.layer.cornerRadius = 8
            bar.translatesAutoresizingMaskIntoConstraints = false
            stack.addArrangedSubview(bar)
            bar.heightAnchor.constraint(equalToConstant: 16).isActive = true
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor, multiplier: width).isActive = true
        }
        isAccessibilityElement = true
        accessibilityLabel = "活動載入中"
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func startAnimating() {
        guard !pulsing else { return }
        pulsing = true
        UIView.animate(withDuration: 0.8, delay: 0, options: [.autoreverse, .repeat, .allowUserInteraction]) {
            self.alpha = 0.45
        }
    }

    func stopAnimating() {
        pulsing = false
        layer.removeAllAnimations()
        alpha = 1
    }
}
