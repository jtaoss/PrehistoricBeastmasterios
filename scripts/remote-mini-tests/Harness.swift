import Foundation

enum ShellConfig {
    static let channel = "xmwtwh5sqxssgp1"
    static let localGameDirectory: URL? = URL(fileURLWithPath: "/fixture/App.app/game", isDirectory: true)
    static let localGameURL: URL? = localGameDirectory?.appendingPathComponent("index.html")
    static var miniGameRemoteBaseURL: URL? = nil
}
final class FakeMusic { func pauseAll() {} ; func prepare() {} }
/* POLICY */
final class TrustedWebView {
    private var remoteMiniWatchdog: DispatchWorkItem?
    private var remoteMiniLoadToken: UUID?
    private(set) var remoteMiniGameUnavailable = false
    var url: URL?
    var loads: [URL] = []
    var onPageFinished: ((String) -> Void)?
    let localMusic = FakeMusic()
    var ready = true
    func recordDiagnostic(_ value: String) {}
    func stopLoading() {}
    func loadFileURL(_ url: URL, allowingReadAccessTo: URL) { self.url = url; loads.append(url) }
    func loadTrustedURL(_ url: URL) { self.url = url; loads.append(url); armRemoteMiniGameLoad() }
    func evaluateJavaScript(_ script: String, completionHandler: @escaping (Any?, Error?) -> Void) { completionHandler(ready, nil) }
    /* MINI_LOADER */
}
var count = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    precondition(condition(), message); count += 1
}
let base = IOSWebNavigationPolicy.validatedMiniGameBaseURL("https://games.example.invalid/emberwild/current/")!
let page = base.appendingPathComponent("index.html")
let login = base.appendingPathComponent("login-preview.html")
check(IOSWebNavigationPolicy.isRemoteMiniGameURL(page, baseURL: base), "Configured game entry is recognized")
check(IOSWebNavigationPolicy.isRemoteMiniGameURL(login, baseURL: base), "Configured account page is recognized")
check(IOSWebNavigationPolicy.isRemoteMiniGameURL(URL(string: login.absoluteString+"?mode=register")!, baseURL: base), "Account page query remains usable")
for raw in ["http://games.example.invalid/emberwild/current/index.html", "https://evil.invalid/emberwild/current/index.html",
            "https://games.example.invalid/other/index.html", "https://games.example.invalid/emberwild/current/index.html/evil",
            "https://games.example.invalid/emberwild/current/%69ndex.html", "https://games.example.invalid/emberwild/current/../index.html",
            "https://user:password@games.example.invalid/emberwild/current/index.html", "https://games.example.invalid:444/emberwild/current/index.html"] {
    check(!IOSWebNavigationPolicy.isRemoteMiniGameURL(URL(string: raw)!, baseURL: base), "Reject \(raw)")
}
for raw in ["", "http://games.example.invalid/game/", "https://games.example.invalid/game", "https://games.example.invalid/game/?token=x",
            "https://games.example.invalid/game/#x", "https://games.example.invalid/%67ame/", "https://games.example.invalid/a/../game/"] {
    check(IOSWebNavigationPolicy.validatedMiniGameBaseURL(raw) == nil, "Reject invalid base")
}
check(!IOSWebNavigationPolicy.allowsInWebView(page, onlineGameURL: nil, localGameDirectory: ShellConfig.localGameDirectory), "Remote mini-game is off by default")
check(IOSWebNavigationPolicy.allowsInWebView(page, onlineGameURL: nil, localGameDirectory: ShellConfig.localGameDirectory, miniGameBaseURL: base), "Only opt-in enables remote game")
check(IOSWebNavigationPolicy.isMiniGameURL(ShellConfig.localGameURL!, localGameDirectory: ShellConfig.localGameDirectory, remoteBaseURL: base), "Local game remains trusted")
let local = TrustedWebView(); local.loadMiniGame()
check(local.loads == [ShellConfig.localGameURL!], "Default still opens the bundled game")
ShellConfig.miniGameRemoteBaseURL = base
let healthy = TrustedWebView(); var finished = 0; healthy.onPageFinished = { _ in finished += 1 }
healthy.loadMiniGame(); check(healthy.loads == [page], "Opt-in opens the configured remote entry")
healthy.checkMiniGameReady(); check(finished == 1, "Boot-ready confirms remote game")
check(!healthy.fallBackToLocalMiniGame(), "A late navigation error cannot displace a booted game")
let failed = TrustedWebView(); failed.ready = false; failed.loadMiniGame(); failed.checkMiniGameReady()
check(failed.fallBackToLocalMiniGame(), "An unfinished remote boot falls back")
check(failed.loads == [page, ShellConfig.localGameURL!], "Fallback uses preserved local resources")
check(failed.remoteMiniGameUnavailable, "Do not retry a failed remote release in the same session")
failed.loadMiniGame(); check(failed.loads.last == ShellConfig.localGameURL, "Subsequent entry remains local")
print("PASS remote mini-game policy and production loader: \(count) checks")
