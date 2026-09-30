import CryptoKit
import Foundation

@main
enum CatalogTest {
    static func main() {
        MainActor.assumeIsolated {
            runCatalogTests()
        }
    }
}

@MainActor
private func runCatalogTests() {
    let approvedHost = "activity.primitive-saga.com"
    let policy = ModuleAcceptancePolicy(
        approvedHosts: [approvedHost, "events.primitive-saga.com"],
        hmacSecret: "pbm-route-secret-v1",
        appVersion: "1.0.12"
    )

    var passed = 0

    func check(_ name: String, _ condition: Bool) {
        if condition {
            passed += 1
            print("  ✓ [PASS] \(name)")
        } else {
            print("  ✗ [FAIL] \(name)")
            exit(1)
        }
    }

    func catalog(_ json: String) -> ModuleCatalogDecodeResult {
        ModuleCatalogParser.decodeCatalog(Data(json.utf8), policy: policy)
    }

    func signature(for content: String) -> String {
        let code = HMAC<SHA256>.authenticationCode(
            for: Data(content.utf8),
            using: SymmetricKey(data: Data("pbm-route-secret-v1".utf8))
        )
        return code.map { String(format: "%02hhx", $0) }.joined()
    }

    print("=== Hardened Module Catalog Tests ===")

    // 1. Signed valid module
    let amberContent = "season-amber|https://activity.primitive-saga.com/season/amber|2026.09"
    let amberSig = signature(for: amberContent)
    if case .list(let modules) = catalog("""
    {"code":"OK","data":{"modules":[
      {"id":"season-amber","title":"琥珀賽季","summary":"限時遠征","entry_url":"https://activity.primitive-saga.com/season/amber","enabled":true,"revision":"2026.09","min_app_version":"1.0.0","signature":"\(amberSig)"}
    ]}}
    """) {
        check("validly signed approved module becomes an entry", modules.count == 1 && modules[0].id == "season-amber" && modules[0].origin == .remote)
    } else {
        check("validly signed approved module becomes an entry", false)
    }

    // 2. Unsigned module must be dropped (anti-tampering hardening)
    if case .list(let modules) = catalog("""
    {"code":"OK","data":{"modules":[
      {"id":"unsigned-mod","title":"未簽名模組","summary":"無簽名","entry_url":"https://activity.primitive-saga.com/season/unsigned","enabled":true,"revision":"2026.09"}
    ]}}
    """) {
        check("unsigned module is strictly dropped", modules.isEmpty)
    } else {
        check("unsigned module is strictly dropped", false)
    }

    // 3. Empty signature module must be dropped
    if case .list(let modules) = catalog("""
    {"code":"OK","data":{"modules":[
      {"id":"empty-sig","title":"空簽名模組","summary":"空簽名","entry_url":"https://activity.primitive-saga.com/season/empty","enabled":true,"revision":"2026.09","signature":""}
    ]}}
    """) {
        check("empty signature module is strictly dropped", modules.isEmpty)
    } else {
        check("empty signature module is strictly dropped", false)
    }

    // 4. Forged signature must be dropped while valid one is accepted
    let forgedSig = "deadbeef12345678"
    let goodContent = "signed-season|https://activity.primitive-saga.com/season|r1"
    let goodSig = signature(for: goodContent)
    if case .list(let modules) = catalog("""
    {"code":"OK","data":{"modules":[
      {"id":"signed-season","title":"簽章賽季","entry_url":"https://activity.primitive-saga.com/season","revision":"r1","signature":"\(goodSig)"},
      {"id":"forged-season","title":"偽造賽季","entry_url":"https://activity.primitive-saga.com/forged","revision":"r1","signature":"\(forgedSig)"}
    ]}}
    """) {
        check("keeps valid signature and drops forged signature", modules.map(\.id) == ["signed-season"])
    } else {
        check("keeps valid signature and drops forged signature", false)
    }

    // 5. Explicit empty list
    if case .list(let modules) = catalog("""
    {"code":"OK","data":{"modules":[]}}
    """) {
        check("explicit empty list stays empty", modules.isEmpty)
    } else {
        check("explicit empty list stays empty", false)
    }

    // 6. Malformed JSON
    check("malformed payload is unavailable", catalog("{") == .unavailable)

    // 7. Non-whitelisted domain must be rejected even with signature
    let evilContent = "evil-mod|https://evil.example/season|r1"
    let evilSig = signature(for: evilContent)
    if case .list(let modules) = catalog("""
    {"code":"OK","data":{"modules":[
      {"id":"evil-mod","title":"外站","entry_url":"https://evil.example/season","revision":"r1","signature":"\(evilSig)"}
    ]}}
    """) {
        check("rejects non-whitelisted domain even if signed", modules.isEmpty)
    } else {
        check("rejects non-whitelisted domain even if signed", false)
    }

    // 8. ModuleSession home & remote isolation lifecycle
    let home = ModuleSession()
    home.noteHomeReady()
    check("home starts ready", home.phase == .ready && home.foreground.id == GameModule.localDefault.id)
    home.beginRemote(GameModule.remote(id: "season-amber", title: "琥珀賽季", summary: "", entryURL: URL(string: "https://activity.primitive-saga.com/season")!, revision: "1"))
    check("remote presentation suspends the home module", home.isRemoteForeground && home.phase == .loading)
    let restored = home.endRemote()
    check("exit restores the bundled home module", restored.origin == .bundled && !home.isRemoteForeground && home.phase == .ready)

    print("=== \(passed) passed ===")
}
