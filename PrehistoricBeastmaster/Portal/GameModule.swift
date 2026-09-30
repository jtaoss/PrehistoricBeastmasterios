import Foundation

enum ModuleOrigin: String, Codable, Sendable {
    case bundled
    case remote
}

enum ModulePhase: String, Sendable {
    case idle
    case loading
    case ready
    case suspended
    case failed
    case released
}

/// 大厅里的一个可玩模块。本地模块没有远端地址；远端模块必须带已审核的 HTTPS 入口。
struct GameModule: Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let summary: String
    let origin: ModuleOrigin
    let entryURL: URL?
    let revision: String

    static let localDefault = GameModule(
        id: "prehistoric-beastmaster",
        title: "原始文明：聖獸覺醒",
        summary: "離線營地與遠征",
        origin: .bundled,
        entryURL: nil,
        revision: "bundled"
    )

    static func remote(id: String, title: String, summary: String, entryURL: URL, revision: String) -> GameModule {
        GameModule(
            id: id,
            title: title,
            summary: summary,
            origin: .remote,
            entryURL: entryURL,
            revision: revision
        )
    }
}

struct ModuleAcceptancePolicy: Sendable {
    var approvedHosts: Set<String>
    var hmacSecret: String
    var appVersion: String

    func allows(_ url: URL) -> Bool {
        let segments = url.path.split(separator: "/")
        guard !segments.contains("."), !segments.contains(".."), !url.path.contains("\\") else { return false }
        guard url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              approvedHosts.contains(host),
              url.user == nil,
              url.password == nil,
              (url.port ?? 443) == 443 else {
            return false
        }
        return true
    }
}
