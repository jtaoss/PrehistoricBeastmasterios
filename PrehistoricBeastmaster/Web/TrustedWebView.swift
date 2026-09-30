import UIKit
import WebKit

protocol H5BridgeHost: AnyObject {
    func onH5Ready()
    func onMiniPurchaseRequested(_ json: String)
    func onPayRequested(_ json: String)
    func onEconomyActionRequested(_ json: String)
    func onGameShopRequested()
    func onMiniAuthRequested(_ json: String)
    func onAnalyticsEvent(_ name: String, json: String?)
    func onAccountSession(_ json: String)
    func onRoleReported(_ json: String)
    func onGameTelemetryEvent(_ json: String)
    func openExternalURL(_ url: String)
}

final class ShellLogBridge: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let level = String(describing: body["level"] ?? "log")
        let text = String(describing: body["message"] ?? "")
        NSLog("[PBM-WEB][%@] %@", level, text)
    }
}

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
        let isTrustedLocalMainFrame = message.frameInfo.isMainFrame
            && (IOSWebNavigationPolicy.isBundledFile(message.frameInfo.request.url, in: ShellConfig.localGameDirectory)
                || IOSWebNavigationPolicy.isApprovedRemoteGameURL(message.frameInfo.request.url))
        let method: String
        let payload: String

        if message.name == "pay" || message.name == "dopay" {
            method = "pay"
            if let dict = message.body as? [String: Any] {
                payload = JSONObject(dict).jsonString()
            } else if let text = message.body as? String {
                payload = text
            } else {
                return
            }
        } else if let body = message.body as? [String: Any] {
            if let m = body["method"] as? String {
                method = m
                payload = String(describing: body["payload"] ?? "")
            } else if body["cpOrder"] != nil || body["goodsId"] != nil || body["productId"] != nil {
                method = "pay"
                payload = JSONObject(body).jsonString()
            } else {
                method = String(describing: body["method"] ?? "")
                payload = String(describing: body["payload"] ?? "")
            }
        } else if let text = message.body as? String {
            if let obj = try? JSONObject(json: text), (obj.has("cpOrder") || obj.has("goodsId") || obj.has("productId")) {
                method = "pay"
                payload = text
            } else {
                method = message.name
                payload = text
            }
        } else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.dispatch(method: method, payload: payload, isTrustedLocalMainFrame: isTrustedLocalMainFrame)
        }
    }

    private func dispatch(method: String, payload: String, isTrustedLocalMainFrame: Bool) {
        switch method {
        case "regsuccess", "loadComplete", "startSDK":
            host?.onH5Ready()
        case "miniPurchase":
            guard isTrustedLocalMainFrame else { return }
            host?.onMiniPurchaseRequested(payload)
        case "dopay", "pay", "purchase", "order":
            guard isTrustedLocalMainFrame else { return }
            host?.onPayRequested(payload)
        case "accountSession", "account", "loginSuccess":
            host?.onAccountSession(payload)
        case "roleReported", "setRole", "uploadRole":
            host?.onRoleReported(payload)
        case "economyAction":
            guard isTrustedLocalMainFrame else { return }
            host?.onEconomyActionRequested(payload)
        case "openGameShop":
            guard isTrustedLocalMainFrame else { return }
            host?.onGameShopRequested()
        case "miniAuth":
            guard isTrustedLocalMainFrame else { return }
            host?.onMiniAuthRequested(payload)
        case "gameTelemetry":
            guard isTrustedLocalMainFrame else { return }
            host?.onGameTelemetryEvent(payload)
        case "sdkEvent":
            let envelope = JSONObject.parse(payload)
            host?.onAnalyticsEvent(envelope.string("name"), json: envelope.string("json"))
        case "AF_Event_Name":
            host?.onAnalyticsEvent("legacy_af_event", json: payload)
        case "sdkToBrowser":
            if payload.hasPrefix("pbm-legal:") {
                let key = String(payload.dropFirst("pbm-legal:".count))
                guard let approved = ShellConfig.legalURL(key) else { return }
                host?.openExternalURL(approved.absoluteString)
            } else {
                host?.openExternalURL(payload)
            }
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
    var onNavigationStarted: (() -> Void)?
    var onPageFinished: ((String) -> Void)?
    var onNavigationFailed: ((String) -> Void)?
    var onNavigationBlocked: (() -> Void)?
    var onPrivacyPolicyRequested: (() -> Void)?
    private let bridge = H5Bridge()
    private let shellLogBridge = ShellLogBridge()
    private let gameHaptics = GameHapticsBridge()
    private let localMusic = LocalMusicPlayer()

    init(host: H5BridgeHost) {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let userContent = config.userContentController
        userContent.addUserScript(WKUserScript(source: Self.consoleBridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        if let nativeBridge = Self.loadScript("native_bridge") {
            userContent.addUserScript(WKUserScript(source: nativeBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let analyticsBridge = Self.loadScript("analytics_bridge") {
            userContent.addUserScript(WKUserScript(source: analyticsBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        userContent.add(bridge, name: "pbmNative")
        userContent.add(bridge, name: "pay")
        userContent.add(bridge, name: "dopay")
        userContent.add(bridge, name: "android")
        userContent.add(shellLogBridge, name: "shellLog")
        userContent.add(gameHaptics, name: "gameHaptics")
        userContent.addScriptMessageHandler(localMusic, contentWorld: .page, name: "localMusic")
        super.init(frame: .zero, configuration: config)
        localMusic.webView = self
        bridge.host = host
        navigationDelegate = self
        uiDelegate = self
        scrollView.bounces = false
        scrollView.contentInsetAdjustmentBehavior = .never
        isOpaque = false
        let launchBackground = UIColor(red: 0.024, green: 0.090, blue: 0.078, alpha: 1)
        backgroundColor = launchBackground
        scrollView.backgroundColor = launchBackground
        if #available(iOS 15.0, *) {
            underPageBackgroundColor = launchBackground
        }
        #if DEBUG
        if #available(iOS 16.4, *) {
            isInspectable = true
        }
        #endif
    }

    deinit {
        let userContent = configuration.userContentController
        userContent.removeScriptMessageHandler(forName: "pbmNative")
        userContent.removeScriptMessageHandler(forName: WebActionSyncHandler.messageName)
        userContent.removeScriptMessageHandler(forName: "shellLog")
        userContent.removeScriptMessageHandler(forName: "gameHaptics")
        userContent.removeScriptMessageHandler(forName: "localMusic", contentWorld: .page)
        localMusic.pauseAll()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func loadLocalGame() {
        guard let fileURL = ShellConfig.localGameURL,
              let directory = ShellConfig.localGameDirectory else {
            onNavigationFailed?("tower-defense game is unavailable")
            return
        }
        localMusic.pauseAll()
        localMusic.prepare()
        recordDiagnostic("load-local \(fileURL.lastPathComponent)")
        loadFileURL(fileURL, allowingReadAccessTo: directory)
    }

    func loadRemoteGame(url: URL) {
        localMusic.pauseAll()
        recordDiagnostic("load-remote \(url.absoluteString)")
        let request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 12)
        load(request)
    }

    func evaluate(_ script: String) {
        evaluateJavaScript(script, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if dispatchSystemScheme(url, navigationType: navigationAction.navigationType) {
            decisionHandler(.cancel)
            return
        }
        if isTrustedTopLevel(url) || shouldAllow(url) {
            decisionHandler(.allow)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame != false
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
        guard let url = navigationResponse.response.url else {
            decisionHandler(.cancel)
            return
        }
        if let httpResponse = navigationResponse.response as? HTTPURLResponse,
           navigationResponse.isForMainFrame,
           !(200...399).contains(httpResponse.statusCode) {
            decisionHandler(.cancel)
            onNavigationFailed?("remote page returned \(httpResponse.statusCode)")
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
        gameBootReady:document.documentElement.dataset.bootReady==='true',
        loginFieldsDisabled:document.getElementById('form-fields')?document.getElementById('form-fields').disabled:null,
        authCallbackInstalled:typeof window.javaCallBack==='function',
        viewportScale:window.visualViewport?window.visualViewport.scale:null,
        viewportWidth:window.visualViewport?window.visualViewport.width:null,
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
                NSLog("[PBM-WEB-CHECK] %@ %@", label, String(describing: value ?? "<nil>"))
            }
        }
    }
    #endif

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        onNavigationStarted?()
        recordDiagnostic("started \(webView.url?.absoluteString ?? "<nil>")")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        recordDiagnostic("committed \(webView.url?.absoluteString ?? "<nil>")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        recordDiagnostic("failed \(webView.url?.absoluteString ?? "<nil>") \(error.localizedDescription)")
        NSLog("[PBM-WEB] navigation failed: %@", error.localizedDescription)
        onNavigationFailed?(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        recordDiagnostic("provisional-failed \(webView.url?.absoluteString ?? "<nil>") \(error.localizedDescription)")
        NSLog("[PBM-WEB] provisional navigation failed: %@", error.localizedDescription)
        onNavigationFailed?(error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[PBM-WEB] WebContent process terminated, reloading")
        webView.reload()
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if shouldAllow(url), !IOSWebNavigationPolicy.allowsExternal(url) {
                load(URLRequest(url: url))
                return nil
            }
            openApprovedExternalURL(url)
        }
        return nil
    }

    func isTrustedTopLevel(_ url: URL) -> Bool {
        IOSWebNavigationPolicy.allowsInWebView(url, localGameDirectory: ShellConfig.localGameDirectory)
    }

    func shouldAllow(_ url: URL) -> Bool {
        isTrustedTopLevel(url)
    }

    private static let externalSystemSchemes: Set<String> = ["mailto", "tel", "sms", "itms-apps"]

    private func dispatchSystemScheme(_ url: URL, navigationType: WKNavigationType) -> Bool {
        guard let scheme = url.scheme?.lowercased(),
              Self.externalSystemSchemes.contains(scheme),
              navigationType == .linkActivated else {
            return false
        }
        UIApplication.shared.open(url)
        return true
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
    try{if(v&&typeof v==='object'&&v.message){return String(v.message)+(v.stack?' '+String(v.stack):'');}
    return typeof v==='object'?JSON.stringify(v):String(v);}catch(e){return String(v);}}).join(' ');
    try{window.webkit.messageHandlers.shellLog.postMessage({level:level,message:message});}catch(e){}
    if(original){try{original.apply(console,arguments);}catch(ignore){}}}});})();
    """

    private static func loadScript(_ name: String, replacements: [String: String] = [:]) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "js") else {
            return nil
        }
        guard var script = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        for (marker, value) in replacements {
            script = script.replacingOccurrences(of: marker, with: value)
        }
        return script
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
        }
        #endif
    }
}
