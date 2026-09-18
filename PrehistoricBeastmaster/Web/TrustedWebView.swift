import UIKit
import WebKit

protocol H5BridgeHost: AnyObject {
    func onH5Ready()
    func onAccountSession(_ json: String)
    func onLoginRequested()
    func onLogoutRequested()
    func onBindingPhoneRequested()
    func onPayRequested(_ json: String)
    func onGameOrderFailed(_ json: String)
    func onRoleReported(_ json: String)
    func onAnalyticsEvent(_ name: String, json: String?)
    func openExternalURL(_ url: String)
    func openMainGame()
    func returnToGameCenter()
}

final class IosWkBridge: NSObject, WKScriptMessageHandler {
    weak var host: H5BridgeHost?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        DispatchQueue.main.async { [weak self] in
            self?.dispatch(name: message.name, body: message.body)
        }
    }

    private func dispatch(name: String, body: Any) {
        switch name {
        case "regsuccess":
            host?.onH5Ready()
        case "startSDK":
            host?.onLoginRequested()
        case "loginout":
            host?.onLogoutRequested()
        case "pay":
            host?.onPayRequested(jsonPayload(body))
        case "uploadRole":
            host?.onRoleReported(jsonPayload(body))
        default:
            break
        }
    }

    private func jsonPayload(_ body: Any) -> String {
        if let text = body as? String {
            return text
        }
        if let dict = body as? [String: Any],
           let data = try? JSONSerialization.data(withJSONObject: dict),
           let json = String(data: data, encoding: .utf8) {
            return json
        }
        return String(describing: body)
    }
}

final class ShellLogBridge: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let level = String(describing: body["level"] ?? "log")
        let text = String(describing: body["message"] ?? "")
        NSLog("[PBM-WEB][%@] %@", level, text)
    }
}

/// A deliberately narrow bridge for the bundled game only. Remote H5 pages
/// cannot invoke native haptics through this handler.
final class GameHapticsBridge: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true else { return }
        let style: String
        if let body = message.body as? [String: Any] {
            style = String(describing: body["style"] ?? "light")
        } else {
            style = String(describing: message.body)
        }
        DispatchQueue.main.async { Self.play(style) }
    }

    private static func play(_ style: String) {
        switch style {
        case "selection":
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
        case "success", "warning", "error":
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(style == "success" ? .success : style == "error" ? .error : .warning)
        default:
            let impact: UIImpactFeedbackGenerator.FeedbackStyle
            switch style {
            case "heavy": impact = .heavy
            case "medium": impact = .medium
            default: impact = .light
            }
            let generator = UIImpactFeedbackGenerator(style: impact)
            generator.prepare()
            generator.impactOccurred()
        }
    }
}

final class H5Bridge: NSObject, WKScriptMessageHandler {
    weak var host: H5BridgeHost?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let method = String(describing: body["method"] ?? "")
        let payload = String(describing: body["payload"] ?? "")
        DispatchQueue.main.async { [weak self] in
            self?.dispatch(method: method, payload: payload)
        }
    }

    private func dispatch(method: String, payload: String) {
        switch method {
        case "regsuccess", "loadComplete":
            host?.onH5Ready()
        case "account":
            host?.onAccountSession(payload)
        case "login":
            host?.onLoginRequested()
        case "loginout":
            host?.onLogoutRequested()
        case "bindingPhone":
            host?.onBindingPhoneRequested()
        case "pay", "chargeInfo":
            host?.onPayRequested(payload)
        case "gameOrderFailed":
            host?.onGameOrderFailed(payload)
        case "upRole", "upLoadAccountInfo":
            host?.onRoleReported(payload)
        case "sdkEvent":
            let envelope = JSONObject.parse(payload)
            host?.onAnalyticsEvent(envelope.string("name"), json: envelope.string("json"))
        case "AF_Event_Name":
            host?.onAnalyticsEvent("legacy_af_event", json: payload)
        case "sdkToBrowser":
            host?.openExternalURL(payload)
        case "openMainGame":
            host?.openMainGame()
        case "returnToGameCenter":
            host?.returnToGameCenter()
        case "sendToNative":
            if payload.hasPrefix("[GP-SHELL]") || payload.hasPrefix("[PBM-SHELL]") {
                NSLog("%@", payload)
                PaymentDebugLog.record("web \(payload)")
            }
        default:
            break
        }
    }
}

final class TrustedWebView: WKWebView, WKNavigationDelegate, WKUIDelegate {
    var onPageFinished: ((String) -> Void)?
    var onNavigationBlocked: (() -> Void)?
    var onPrivacyPolicyRequested: (() -> Void)?
    var onCheckoutBusy: (() -> Void)? {
        didSet { proxy.onCheckoutBusy = onCheckoutBusy }
    }
    private let bridge = H5Bridge()
    private let iosWkBridge = IosWkBridge()
    private let shellLogBridge = ShellLogBridge()
    private let gameHaptics = GameHapticsBridge()
    private let proxy = GameAPIProxy()
    private let localMusic = LocalMusicPlayer()
    private let iosWkHandlerNames = ["regsuccess", "startSDK", "loginout", "pay", "uploadRole"]

    init(host: H5BridgeHost) {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let userContent = config.userContentController
        userContent.addUserScript(WKUserScript(source: Self.consoleBridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        userContent.addUserScript(WKUserScript(source: InjectedScripts.loadingRecovery, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if let androidBridge = Self.loadScript("android_bridge") {
            userContent.addUserScript(WKUserScript(source: androidBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let analyticsBridge = Self.loadScript("analytics_bridge") {
            userContent.addUserScript(WKUserScript(source: analyticsBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        // Watch for the asynchronously loaded H5 SDK from the beginning. The
        // script is idempotent, so post-navigation installs remain fallbacks.
        userContent.addUserScript(WKUserScript(source: InjectedScripts.paymentBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let orderScript = InjectedScripts.orderEndpoint(ShellConfig.gameOrderEndpoint)
        userContent.addUserScript(WKUserScript(source: orderScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        if let proxyScript = Self.loadScript("game_api_proxy") {
            userContent.addUserScript(WKUserScript(source: proxyScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        userContent.add(bridge, name: "android")
        userContent.add(shellLogBridge, name: "shellLog")
        userContent.add(gameHaptics, name: "gameHaptics")
        for name in iosWkHandlerNames {
            userContent.add(iosWkBridge, name: name)
        }
        userContent.addScriptMessageHandler(proxy, contentWorld: .page, name: "gameApiProxy")
        userContent.addScriptMessageHandler(localMusic, contentWorld: .page, name: "localMusic")
        super.init(frame: .zero, configuration: config)
        localMusic.webView = self
        bridge.host = host
        iosWkBridge.host = host
        navigationDelegate = self
        uiDelegate = self
        scrollView.bounces = false
        scrollView.contentInsetAdjustmentBehavior = .never
        isOpaque = false
        backgroundColor = .black
        scrollView.backgroundColor = .black
        #if DEBUG
        if #available(iOS 16.4, *) {
            isInspectable = true
        }
        #endif
    }

    deinit {
        let userContent = configuration.userContentController
        userContent.removeScriptMessageHandler(forName: "android")
        userContent.removeScriptMessageHandler(forName: "shellLog")
        userContent.removeScriptMessageHandler(forName: "gameHaptics")
        for name in iosWkHandlerNames {
            userContent.removeScriptMessageHandler(forName: name)
        }
        userContent.removeScriptMessageHandler(forName: "gameApiProxy", contentWorld: .page)
        userContent.removeScriptMessageHandler(forName: "localMusic", contentWorld: .page)
        localMusic.pauseAll()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func loadLocalGame() {
        guard let fileURL = ShellConfig.localGameURL, let directory = ShellConfig.localGameDirectory else { return }
        localMusic.pauseAll()
        localMusic.prepare()
        recordDiagnostic("load-local \(fileURL.absoluteString)")
        loadFileURL(fileURL, allowingReadAccessTo: directory)
    }

    func loadTrustedURL(_ url: URL) {
        guard shouldAllow(url) else {
            openApprovedExternalURL(url)
            return
        }
        recordDiagnostic("load-remote \(url.absoluteString)")
        localMusic.pauseAll()
        load(URLRequest(url: url))
    }

    func evaluate(_ script: String) {
        evaluateJavaScript(script, completionHandler: nil)
    }

    func beginGameOrderCheckout(_ cpOrder: String) -> Bool { proxy.beginCheckout(cpOrder) }
    func endGameOrderCheckout(_ cpOrder: String) { proxy.endCheckout(cpOrder) }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isTrustedTopLevel(url) || shouldAllow(url) {
            if navigationAction.targetFrame?.isMainFrame == true { localMusic.pauseAll() }
            decisionHandler(.allow)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame != false
        // Empty child frames are also used by non-payment SDK components.
        if !isMainFrame, url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }
        if isMainFrame {
            openApprovedExternalURL(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // Check the final destination too; an approved URL may HTTP-redirect.
        guard let url = navigationResponse.response.url else {
            decisionHandler(.cancel)
            return
        }
        if shouldAllow(url) || (!navigationResponse.isForMainFrame && url.absoluteString == "about:blank") {
            decisionHandler(.allow)
        } else {
            if navigationResponse.isForMainFrame { rejectNavigation(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        recordDiagnostic("finished \(webView.url?.absoluteString ?? "<nil>")")
        #if DEBUG
        recordRenderSnapshot(label: "finish")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self, weak webView] in
            guard let self, let webView else { return }
            self.recordRenderSnapshot(label: "after-1s", in: webView)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self, weak webView] in
            guard let self, let webView else { return }
            self.recordRenderSnapshot(label: "after-4s", in: webView)
        }
        #endif
        onPageFinished?(webView.url?.absoluteString ?? "")
    }

    #if DEBUG
    private func recordRenderSnapshot(label: String, in target: WKWebView? = nil) {
        let webView = target ?? self
        let snapshot = """
        (function(){try{
        function inspect(id){var node=document.getElementById(id);if(!node){return null;}
        var style=getComputedStyle(node),rect=node.getBoundingClientRect();return {
        id:id,className:node.className,display:style.display,visibility:style.visibility,
        opacity:style.opacity,background:style.backgroundColor,color:style.color,
        width:Math.round(rect.width),height:Math.round(rect.height),top:Math.round(rect.top),
        left:Math.round(rect.left),clientWidth:node.clientWidth,clientHeight:node.clientHeight};}
        var bodyStyle=document.body?getComputedStyle(document.body):null;
        return JSON.stringify({href:location.href,readyState:document.readyState,
        innerWidth:innerWidth,innerHeight:innerHeight,devicePixelRatio:devicePixelRatio,
        bodyChildren:document.body?document.body.children.length:-1,
        bodyTextLength:document.body?(document.body.innerText||'').length:-1,
        bodyDisplay:bodyStyle?bodyStyle.display:'',bodyVisibility:bodyStyle?bodyStyle.visibility:'',
        bodyOpacity:bodyStyle?bodyStyle.opacity:'',bodyBackground:bodyStyle?bodyStyle.backgroundColor:'',
        styleSheets:Array.prototype.map.call(document.styleSheets,function(sheet){return sheet.href||'inline';}),
        activeScreens:document.querySelectorAll('.screen.active').length,
        stage:inspect('app-stage'),start:inspect('start-screen'),canvas:inspect('game-canvas'),
        visibility:document.visibilityState});
        }catch(e){return 'snapshot-error:'+String(e);}})()
        """
        webView.evaluateJavaScript(snapshot) { [weak self] value, error in
            if let error {
                self?.recordDiagnostic("snapshot-\(label)-failed \(error.localizedDescription)")
            } else {
                self?.recordDiagnostic("snapshot-\(label) \(String(describing: value ?? "<nil>"))")
            }
        }
    }
    #endif

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        recordDiagnostic("started \(webView.url?.absoluteString ?? "<nil>")")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        recordDiagnostic("committed \(webView.url?.absoluteString ?? "<nil>")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        recordDiagnostic("failed \(webView.url?.absoluteString ?? "<nil>") \(error.localizedDescription)")
        NSLog("[PBM-WEB] navigation failed: %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        recordDiagnostic("provisional-failed \(webView.url?.absoluteString ?? "<nil>") \(error.localizedDescription)")
        NSLog("[PBM-WEB] provisional navigation failed: %@", error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        localMusic.pauseAll()
        NSLog("[PBM-WEB] WebContent process terminated, reloading")
        webView.reload()
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if shouldAllow(url), !IOSWebNavigationPolicy.allowsExternal(url) {
                loadTrustedURL(url)
                return nil
            }
            openApprovedExternalURL(url)
        }
        return nil
    }

    func isTrustedTopLevel(_ url: URL) -> Bool {
        IOSWebNavigationPolicy.allowsInWebView(url, onlineGameURL: ShellConfig.onlineGameURL,
                                              localGameDirectory: ShellConfig.localGameDirectory)
    }

    func shouldAllow(_ url: URL) -> Bool {
        isTrustedTopLevel(url)
    }

    func openApprovedExternalURL(_ url: URL) {
        guard IOSWebNavigationPolicy.allowsExternal(url) else {
            rejectNavigation(url)
            return
        }
        if IOSWebNavigationPolicy.isPrivacyPolicyURL(url) {
            onPrivacyPolicyRequested?()
            return
        }
        UIApplication.shared.open(url)
    }

    private func rejectNavigation(_ url: URL) {
        recordDiagnostic("navigation-blocked host=\(url.host ?? "non-https")")
        onNavigationBlocked?()
    }

    private static let consoleBridgeScript = """
    (function(){if(window.__shellConsoleBridgeInstalled){return;}
    window.__shellConsoleBridgeInstalled=true;
    ['log','warn','error'].forEach(function(level){var original=console[level];
    console[level]=function(){var message=Array.prototype.slice.call(arguments).map(function(v){
    try{return typeof v==='object'?JSON.stringify(v):String(v);}catch(e){return String(v);}}).join(' ');
    try{window.webkit.messageHandlers.shellLog.postMessage({level:level,message:message});}catch(e){}
    if(original){try{original.apply(console,arguments);}catch(ignore){}}}});})();
    """

    private static func loadScript(_ name: String) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "js") else {
            return nil
        }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    private func recordDiagnostic(_ message: String) {
        #if DEBUG
        guard let documents = try? FileManager.default.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else { return }
        let file = documents.appendingPathComponent("webview_status.txt")
        let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
        guard let data = line.data(using: .utf8) else { return }
        if !FileManager.default.fileExists(atPath: file.path) {
            try? data.write(to: file, options: .atomic)
            return
        }
        guard let handle = try? FileHandle(forWritingTo: file) else { return }
        defer { try? handle.close() }
        do {
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } catch {
            // Diagnostics must never affect the game flow.
        }
        #endif
    }
}
