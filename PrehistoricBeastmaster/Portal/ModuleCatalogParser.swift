import CryptoKit
import Foundation

enum ModuleCatalogDecodeResult: Equatable, Sendable {
    /// 服务端明确返回了列表。空列表表示当前没有可进入的远端模块。
    case list([GameModule])
    /// 响应无法作为目录使用。
    case unavailable
}

enum ModuleCatalogParser {
    static let maximumModules = 6

    static func decodeCatalog(_ data: Data, policy: ModuleAcceptancePolicy) -> ModuleCatalogDecodeResult {
        guard let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let code = envelope["code"] as? String,
              code.uppercased() == "OK",
              let payload = envelope["data"] as? [String: Any] else {
            return .unavailable
        }
        let rows = payload["modules"] as? [[String: Any]] ?? []
        return .list(accept(rows, policy: policy))
    }

    private static func accept(_ rows: [[String: Any]], policy: ModuleAcceptancePolicy) -> [GameModule] {
        var seen = Set<String>()
        var modules: [GameModule] = []
        for row in rows {
            guard modules.count < maximumModules else { break }
            if let enabled = row["enabled"] as? Bool, !enabled { continue }
            let id = text(row, "id").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = text(row, "title").trimmingCharacters(in: .whitespacesAndNewlines)
            let entry = text(row, "entryUrl", "entry_url")
            let revision = text(row, "revision")
            guard isSafeIdentifier(id), !title.isEmpty, seen.insert(id).inserted else { continue }
            guard isVersion(policy.appVersion, atLeast: text(row, "minAppVersion", "min_app_version")) else { continue }
            guard let url = URL(string: entry), policy.allows(url) else { continue }

            // 移除“签名为空跳过 HMAC”的漏洞逻辑，无合法签名的模块直接丢弃
            let signature = text(row, "signature").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !signature.isEmpty else { continue }
            let content = "\(id)|\(entry)|\(revision)"
            guard signatureMatches(content: content, signature: signature, secret: policy.hmacSecret) else { continue }

            modules.append(GameModule.remote(
                id: id,
                title: String(title.prefix(32)),
                summary: String(text(row, "summary").prefix(80)),
                entryURL: url,
                revision: revision
            ))
        }
        return modules
    }

    private static func text(_ row: [String: Any], _ keys: String...) -> String {
        for key in keys {
            if let value = row[key] as? String {
                return value
            }
        }
        return ""
    }

    static func isSafeIdentifier(_ id: String) -> Bool {
        guard (1...64).contains(id.count) else { return false }
        return id.unicodeScalars.allSatisfy { scalar in
            CharacterSet.moduleIdentifiers.contains(scalar)
        }
    }

    static func isVersion(_ current: String, atLeast minimum: String) -> Bool {
        let required = minimum.trimmingCharacters(in: .whitespacesAndNewlines)
        if required.isEmpty { return true }
        let left = versionParts(current)
        let right = versionParts(required)
        let count = max(left.count, right.count)
        for index in 0..<count {
            let a = index < left.count ? left[index] : 0
            let b = index < right.count ? right[index] : 0
            if a != b { return a > b }
        }
        return true
    }

    static func signatureMatches(content: String, signature: String, secret: String) -> Bool {
        guard !secret.isEmpty,
              let keyData = secret.data(using: .utf8),
              let contentData = content.data(using: .utf8) else {
            return false
        }
        let code = HMAC<SHA256>.authenticationCode(for: contentData, using: SymmetricKey(data: keyData))
        let computed = code.map { String(format: "%02hhx", $0) }.joined()
        return computed.caseInsensitiveCompare(signature) == .orderedSame
    }

    private static func versionParts(_ value: String) -> [Int] {
        value.split(separator: ".").map { Int($0) ?? 0 }
    }
}

private extension CharacterSet {
    static let moduleIdentifiers = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
}
