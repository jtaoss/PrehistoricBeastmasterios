import Foundation

enum ShellConfig {
    static let onlineGameURL = URL(string: "https://saftcdn.antieh.com/stoneage_tw/index_web_xmwtwh5sqxssgp1_https.html?os=ios_wk")
    static let localGameDirectory = URL(fileURLWithPath: "/fixture/App.app/game", isDirectory: true)
}
enum WKNavigationActionPolicy { case allow, cancel }
enum WKNavigationResponsePolicy { case allow, cancel }
struct WKFrameInfo { var isMainFrame: Bool }
struct WKNavigationAction { var request: URLRequest; var targetFrame: WKFrameInfo? }
struct WKNavigationResponse { var response: URLResponse; var isForMainFrame: Bool }
struct WKWebViewConfiguration {}
struct WKWindowFeatures {}
class WKWebView {
    var loads: [URL] = []
    func load(_ request: URLRequest) { loads.append(request.url!) }
}
final class UIApplication {
    static let shared = UIApplication()
    var opened: [URL] = []
    func open(_ url: URL) { opened.append(url) }
}
final class FakeMusic { func pauseAll() {} }
/* POLICY */
final class TrustedWebView: WKWebView {
    let localMusic = FakeMusic()
    var onNavigationBlocked: (() -> Void)?
    var onPrivacyPolicyRequested: (() -> Void)?
    func recordDiagnostic(_ message: String) {}
    /* LOAD */
    /* NAVIGATION */
    /* POPUP */
    /* HELPERS */
}
var checks = 0
func expect(_ value: @autoclosure () -> Bool, _ name: String) {
    checks += 1; guard value() else { fatalError(name) }
}
let web = TrustedWebView()
var blocked = 0
var privacyOpened = 0
web.onPrivacyPolicyRequested = { privacyOpened += 1 }
web.onNavigationBlocked = { blocked += 1 }
func action(_ url: URL, main: Bool?) -> WKNavigationActionPolicy? {
    var answer: WKNavigationActionPolicy?
    web.webView(web, decidePolicyFor: WKNavigationAction(request: URLRequest(url:url), targetFrame: main.map{WKFrameInfo(isMainFrame:$0)})) { answer = $0 }
    return answer
}
func response(_ url: URL, main: Bool) -> WKNavigationResponsePolicy? {
    var answer: WKNavigationResponsePolicy?
    web.webView(web, decidePolicyFor: WKNavigationResponse(response: URLResponse(url:url,mimeType:"text/html",expectedContentLength:0,textEncodingName:nil),isForMainFrame:main)) {answer = $0}
    return answer
}
let disallowed = [
    "https://www.playstonegame.com/payform/", "https://playstonegame.com/payform",
    "https://WWW.PLAYSTONEGAME.COM/payform/?sid=1", "https://www.playstonegame.com/payform/provider.php",
    "https://www.playstonegame.com/checkout", "https://imp.playstonegame.com/pay",
    "https://www.playstonegame.com/h5sdk/", "https://www.playstonegame.com/%70ayform/",
    "https://www.playstonegame.com/%2570ayform/", "https://www.playstonegame.com/h5sdk/../payform/",
    "https://www.paypal.com/checkoutnow", "https://checkout.stripe.com/c/pay/fixture",
    "https://payments.example.invalid/", "https://saftcdn.antieh.com/stoneage_tw/pay.html",
    "https://saftcdn.antieh.com/redirect?url=https%3A%2F%2Fwww.paypal.com",
    "https://d1udhm4c9vjzph.cloudfront.net/payform/",
    "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html?redirect=https://pay.example.invalid",
    "https://accounts.google.com.evil.invalid/o/oauth2/auth", "https://evil.invalid@accounts.google.com/o/oauth2/auth",
    "https://evil.invalid/?next=https://accounts.google.com/", "https://accounts.google.com:444/o/oauth2/auth",
    "https://appleid.apple.com/pay/", "https://www.facebook.com/payments/", "https://www.facebook.com/marketplace/",
    "https://appleid.apple.com/auth/../pay/", "https://appleid.apple.com/auth/%2e%2e/pay/",
    "https://www.facebook.com/dialog/oauth/../../payments/",
    "https://play.google.com/store/apps/details?id=game", "https://gift.onelink.me/Ri6O/fixture",
    "http://www.playstonegame.com/payform/", "alipays://platformapi/startapp", "weixin://wap/pay",
    "javascript:alert('fixture')", "data:text/html,pay", "file:///fixture/App.app/Info.plist"
]
for text in disallowed {
    let url = URL(string:text)!
    let initialOpened = UIApplication.shared.opened.count, initialLoads = web.loads.count
    let initialPrivacy = privacyOpened
    expect(!web.shouldAllow(url), "web deny \(text)")
    web.openApprovedExternalURL(url)
    web.loadTrustedURL(url)
    expect(action(url,main:true) == .cancel, "main action deny \(text)")
    expect(action(url,main:false) == .cancel, "iframe deny \(text)")
    expect(action(url,main:nil) == .cancel, "target blank deny \(text)")
    expect(response(url,main:true) == .cancel, "redirect response deny \(text)")
    expect(response(url,main:false) == .cancel, "iframe response deny \(text)")
    let popup = web.webView(web,createWebViewWith:WKWebViewConfiguration(),for:WKNavigationAction(request:URLRequest(url:url),targetFrame:nil),windowFeatures:WKWindowFeatures())
    expect(popup == nil && UIApplication.shared.opened.count == initialOpened && web.loads.count == initialLoads, "no escape through native load or Safari \(text)")
    expect(privacyOpened == initialPrivacy, "untrusted link cannot impersonate privacy entry \(text)")
}
let game = ShellConfig.onlineGameURL!
expect(action(game,main:true) == .allow && response(game,main:true) == .allow, "main game preserved")
expect(web.shouldAllow(URL(string:game.absoluteString+"&pf=fixture#role")!), "game query/fragment preserved")
let local = ShellConfig.localGameDirectory.appendingPathComponent("index.html")
expect(web.shouldAllow(local), "local runner preserved")
expect(!web.shouldAllow(URL(fileURLWithPath:"/fixture/other/game/index.html")), "other local game folder not trusted")
expect(!web.shouldAllow(URL(fileURLWithPath:"/fixture/App.app/game/../Info.plist")), "local path escape denied")
for name in ["terms-of-service", "privacy-policy", "account-deletion"] {
    let url = URL(string:"https://d1udhm4c9vjzph.cloudfront.net/ios-legal/\(name).html")!
    let before = UIApplication.shared.opened.count
    let privacyBefore = privacyOpened
    web.openApprovedExternalURL(url)
    if name == "privacy-policy" {
        expect(UIApplication.shared.opened.count == before && privacyOpened == privacyBefore + 1, "privacy uses bundled reader, not stale website")
    } else {
        expect(UIApplication.shared.opened.count == before + 1 && privacyOpened == privacyBefore, "other legal links unchanged")
    }
}
for text in ["https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture", "https://appleid.apple.com/auth/authorize",
             "https://www.facebook.com/dialog/oauth", "https://m.facebook.com/login.php"] {
    let url = URL(string:text)!
    expect(web.shouldAllow(url) && IOSWebNavigationPolicy.allowsExternal(url), "login usable \(text)")
    expect(response(url,main:true) == .allow, "login document allowed")
}
expect(action(URL(string:"about:blank")!,main:false) == .allow, "empty child frame preserved")
expect(response(URL(string:"about:blank")!,main:false) == .allow, "empty child response preserved")
expect(blocked > 0, "blocked navigation reports a non-payment UI message")
print("PASS \(checks) production Swift navigation checks; no browser, network, orders or purchases")
