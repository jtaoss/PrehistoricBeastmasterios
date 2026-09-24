// macOS WebKit regression host. Uses loadFileURL, not a localhost server, and
// an ephemeral data store: it never reads or changes a player's save or account.
// swiftc scripts/emberwild-webkit-smoke.swift -o /tmp/EmberwildWebKitCheck
// /tmp/EmberwildWebKitCheck /absolute/path/to/game/login-preview.html
// Add --interactive for manual UI testing with a fake native auth bridge.
import AppKit
import WebKit

final class WebKitCheck: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var web: WKWebView!
    var window: NSWindow?
    let interactive = CommandLine.arguments.contains("--interactive")
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        print("WEBKIT: \(message.body)")
    }
    func start() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "testLog")
        config.userContentController.addUserScript(WKUserScript(source: """
        window.addEventListener('error',function(e){window.webkit.messageHandlers.testLog.postMessage({event:'error',message:e.message||'resource failed',source:e.filename||e.target.src||'',line:e.lineno||0});},true);
        window.addEventListener('unhandledrejection',function(e){window.webkit.messageHandlers.testLog.postMessage({event:'rejection',message:String(e.reason)});});
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if interactive {
            if let fixture = CommandLine.arguments.first(where: { $0.hasPrefix("--save-fixture=") }),
               let raw = try? String(contentsOfFile: String(fixture.dropFirst("--save-fixture=".count)), encoding: .utf8),
               let encoded = try? JSONSerialization.data(withJSONObject: [raw]),
               let json = String(data: encoded, encoding: .utf8) {
                config.userContentController.addUserScript(WKUserScript(source:
                    "if(!sessionStorage.getItem('test-save-seeded')){localStorage.setItem('emberwild_save_v2',\(json)[0]);sessionStorage.setItem('test-save-seeded','yes');}",
                    injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
            // Explicitly fake. No HTTP, Keychain, real registration or payment.
            config.userContentController.addUserScript(WKUserScript(source: """
            window.android={miniAuth:function(raw){var p=JSON.parse(raw);setTimeout(function(){
              if(p.action==='login'||p.action==='register')sessionStorage.setItem('test-auth','yes');
              if(p.action==='logout')sessionStorage.removeItem('test-auth');
              var now=Date.now()/1000,ok=sessionStorage.getItem('test-auth')==='yes';
              window.javaCallBack({func:'onMiniAuthResult',code:'OK',action:p.action,requestId:p.requestId,data:{authenticated:ok,playerId:'webkit-test',displayName:'測試獵人',authenticatedAt:now,accessExpiresAt:now+3600}});
            },50);}};
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        web = WKWebView(frame: NSRect(x:0,y:0,width:390,height:760), configuration: config)
        web.navigationDelegate = self
        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        if interactive {
            NSApplication.shared.setActivationPolicy(.regular)
            window = NSWindow(contentRect:web.frame,styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
            window!.title = "Emberwild · Isolated WebKit Test (Fake Account)"
            window!.contentView = web
            window!.makeKeyAndOrderFront(nil)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now()+15) { print("FAIL: boot timeout"); exit(2) }
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now()+1) {
            webView.evaluateJavaScript("JSON.stringify({ready:document.documentElement.dataset.bootReady==='true',disabled:document.getElementById('form-fields')?.disabled,title:document.getElementById('submit-label')?.textContent,callback:typeof window.javaCallBack,bootError:!!document.getElementById('boot-error')})") { value,error in
                let result = value as? String ?? "{}"
                print("RESULT: \(result) \(error?.localizedDescription ?? "")")
                if !self.interactive { exit(result.contains("\"ready\":true") && !result.contains("\"disabled\":true") && !result.contains("\"bootError\":true") ? 0 : 1) }
            }
        }
    }
}
let check = WebKitCheck()
_ = NSApplication.shared
check.start()
NSApplication.shared.run()
