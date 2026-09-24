import Foundation
import Security

private final class RejectHTTPRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        // Auth credentials and StoreKit order identity must never be replayed to
        // a redirect destination. Production API URLs must be canonical.
        completionHandler(nil)
    }
}

enum SecureAPIURLSession {
    private static let redirectDelegate = RejectHTTPRedirects()
    static let shared: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config, delegate: redirectDelegate, delegateQueue: nil)
    }()
}

/// Authentication for the bundled Emberwild mini-game. Credentials are sent
/// only to the configured HTTPS API and are never written to WebKit storage,
/// UserDefaults or logs. Tokens are kept in the iOS Keychain.
final class MiniGameAuthService {
    struct PaymentIdentity {
        let playerId: String
        let accessToken: String
    }

    enum AuthError: LocalizedError {
        case message(code: String, message: String)

        var code: String {
            switch self {
            case .message(let code, _): return code
            }
        }

        var errorDescription: String? {
            switch self {
            case .message(_, let message): return message
            }
        }
    }

    private struct StoredSession: Codable {
        let playerId: String
        let displayName: String
        let accessToken: String
        let accessExpiresAt: Int64
        let refreshToken: String
        let refreshExpiresAt: Int64
        let authenticatedAt: Int64
    }

    private let sessionAccount = "emberwild-session-v1"
    private let deviceAccount = "emberwild-device-v1"
    private let keychainService = "\(ShellConfig.bundleId).emberwild.auth"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var isConfigured: Bool { Self.approvedBaseURL() != nil }

    func status() async throws -> JSONObject {
        guard isConfigured else {
            throw AuthError.message(code: "AUTH_NOT_CONFIGURED", message: "帳號服務尚未完成設定")
        }
        guard let session = try await validSession(requiredLifetime: 0) else {
            return publicResult(nil)
        }
        return publicResult(session)
    }

    func login(account: String, password: String) async throws -> JSONObject {
        guard let account = Self.normalizedAccount(account), (8...128).contains(password.count) else {
            throw AuthError.message(code: "INVALID_CREDENTIALS", message: "帳號或密碼格式不正確")
        }
        var payload = commonPayload()
        payload.put("account", account)
        payload.put("password", password)
        let response = try await request(path: "login", payload: payload)
        let session = try parseAndStoreSession(response)
        return publicResult(session)
    }

    func register(account rawAccount: String, password: String, nickname: String, acceptedTermsVersion: String) async throws -> JSONObject {
        guard let account = Self.normalizedAccount(rawAccount) else {
            throw AuthError.message(code: "INVALID_ACCOUNT", message: "帳號須為 6–24 位英文字母、數字或底線")
        }
        let nickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (8...128).contains(password.count),
              (1...20).contains(nickname.count), !acceptedTermsVersion.isEmpty else {
            throw AuthError.message(code: "INVALID_REGISTRATION", message: "註冊資料格式不正確")
        }
        var payload = commonPayload()
        payload.put("account", account)
        payload.put("password", password)
        payload.put("nickname", nickname)
        payload.put("accepted_terms_version", acceptedTermsVersion)
        let response = try await request(path: "register", payload: payload)
        let session = try parseAndStoreSession(response)
        return publicResult(session)
    }

    func recover(account rawAccount: String) async throws -> JSONObject {
        guard let account = Self.normalizedAccount(rawAccount) else {
            throw AuthError.message(code: "INVALID_ACCOUNT", message: "帳號須為 6–24 位英文字母、數字或底線")
        }
        var payload = commonPayload()
        payload.put("account", account)
        _ = try await request(path: "recover", payload: payload)
        var result = JSONObject()
        result.put("accepted", true)
        return result
    }

    func logout() async throws -> JSONObject {
        let session = loadSession()
        defer { deleteSession() }
        if let session, session.refreshExpiresAt > Self.now() {
            var payload = commonPayload()
            payload.put("refresh_token", session.refreshToken)
            // A network/server failure must not trap a player in a local account.
            _ = try? await request(path: "logout", payload: payload, bearer: session.accessToken)
        }
        return publicResult(nil)
    }

    func deleteAccount() async throws -> JSONObject {
        guard let session = try await validSession(requiredLifetime: 90) else {
            throw AuthError.message(code: "LOGIN_REQUIRED", message: "登入已過期，請重新登入後再刪除帳號")
        }
        var payload = commonPayload()
        payload.put("refresh_token", session.refreshToken)
        let response = try await request(path: "delete", payload: payload, bearer: session.accessToken)
        guard response.jsonObject("data")?.bool("deleted") == true else {
            throw AuthError.message(code: "ACCOUNT_DELETE_REJECTED", message: "帳號尚未刪除，請稍後再試")
        }
        deleteSession()
        return publicResult(nil)
    }

    func paymentIdentity() async throws -> PaymentIdentity {
        guard isConfigured else {
            throw AuthError.message(code: "AUTH_NOT_CONFIGURED", message: "帳號服務尚未完成設定")
        }
        guard let session = try await validSession(requiredLifetime: 90) else {
            throw AuthError.message(code: "LOGIN_REQUIRED", message: "請先登入帳號再購買")
        }
        return PaymentIdentity(playerId: session.playerId, accessToken: session.accessToken)
    }

    private func validSession(requiredLifetime: Int64) async throws -> StoredSession? {
        guard let current = loadSession() else { return nil }
        let now = Self.now()
        if current.accessExpiresAt > now + requiredLifetime { return current }
        guard current.refreshExpiresAt > now + 30, !current.refreshToken.isEmpty else {
            deleteSession()
            return nil
        }
        var payload = commonPayload()
        payload.put("refresh_token", current.refreshToken)
        do {
            let response = try await request(path: "refresh", payload: payload)
            return try parseAndStoreSession(response)
        } catch let error as AuthError where error.code == "AUTH_EXPIRED" || error.code == "HTTP_401" {
            deleteSession()
            return nil
        }
    }

    private func parseAndStoreSession(_ response: JSONObject) throws -> StoredSession {
        guard response.string("code") == "OK", let data = response.jsonObject("data") else {
            throw serverError(response)
        }
        let playerId = data.string("player_id").trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = data.string("display_name").trimmingCharacters(in: .whitespacesAndNewlines)
        let accessToken = data.string("access_token").trimmingCharacters(in: .whitespacesAndNewlines)
        let refreshToken = data.string("refresh_token").trimmingCharacters(in: .whitespacesAndNewlines)
        let accessExpiresAt = data.int64("access_expires_at")
        let refreshExpiresAt = data.int64("refresh_expires_at")
        let now = Self.now()
        guard (1...128).contains(playerId.count), (1...20).contains(displayName.count),
              (20...4096).contains(accessToken.count), (20...4096).contains(refreshToken.count),
              accessExpiresAt > now + 30, refreshExpiresAt > accessExpiresAt,
              !Self.containsControlCharacters(playerId + displayName + accessToken + refreshToken) else {
            throw AuthError.message(code: "INVALID_AUTH_RESPONSE", message: "帳號服務回傳的登入資料不完整")
        }
        let session = StoredSession(playerId: playerId, displayName: displayName,
                                    accessToken: accessToken, accessExpiresAt: accessExpiresAt,
                                    refreshToken: refreshToken, refreshExpiresAt: refreshExpiresAt,
                                    authenticatedAt: now)
        guard let encoded = try? encoder.encode(session), saveKeychain(encoded, account: sessionAccount) else {
            throw AuthError.message(code: "SECURE_STORAGE_FAILED", message: "無法安全保存登入狀態")
        }
        return session
    }

    private func publicResult(_ session: StoredSession?) -> JSONObject {
        var result = JSONObject()
        result.put("authenticated", session != nil)
        if let session {
            result.put("playerId", session.playerId)
            result.put("displayName", session.displayName)
            result.put("accessExpiresAt", session.accessExpiresAt)
            result.put("authenticatedAt", session.authenticatedAt)
        }
        return result
    }

    private func request(path: String, payload: JSONObject, bearer: String? = nil) async throws -> JSONObject {
        guard let base = Self.approvedBaseURL(), let url = URL(string: path, relativeTo: base)?.absoluteURL,
              url.scheme?.lowercased() == "https", url.host?.lowercased() == base.host?.lowercased() else {
            throw AuthError.message(code: "AUTH_NOT_CONFIGURED", message: "帳號服務尚未完成設定")
        }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpBody = Data(payload.jsonString().utf8)
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("zh-Hant", forHTTPHeaderField: "Accept-Language")
        if let bearer, !bearer.isEmpty {
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await SecureAPIURLSession.shared.data(for: request)
        } catch {
            throw AuthError.message(code: "AUTH_NETWORK_ERROR", message: "暫時無法連接帳號服務，請檢查網路後再試")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONObject(json: String(decoding: data, as: UTF8.self))) ?? JSONObject()
        guard (200..<300).contains(status) else {
            let serverCode = json.string("code").trimmingCharacters(in: .whitespacesAndNewlines)
            if Self.allowedServerCodes.contains(serverCode) {
                throw AuthError.message(code: serverCode, message: Self.localizedMessage(for: serverCode, response: json))
            }
            let code = status == 401 ? "HTTP_401" : "HTTP_\(status)"
            throw AuthError.message(code: code, message: Self.safeServerMessage(json, fallback: status == 429 ? "操作太頻繁，請稍後再試" : "帳號服務暫時無法完成請求"))
        }
        guard json.string("code") == "OK" else { throw serverError(json) }
        return json
    }

    private func serverError(_ response: JSONObject) -> AuthError {
        let rawCode = response.string("code").trimmingCharacters(in: .whitespacesAndNewlines)
        let code = Self.allowedServerCodes.contains(rawCode) ? rawCode : "AUTH_REJECTED"
        return .message(code: code, message: Self.localizedMessage(for: code, response: response))
    }

    private func commonPayload() -> JSONObject {
        var value = JSONObject()
        value.put("request_id", UUID().uuidString.lowercased())
        value.put("device_id", deviceId())
        value.put("bundle_id", ShellConfig.bundleId)
        value.put("version", ShellConfig.versionName)
        value.put("build", ShellConfig.versionCode)
        value.put("platform", "ios")
        return value
    }

    private func loadSession() -> StoredSession? {
        guard let data = readKeychain(account: sessionAccount), let value = try? decoder.decode(StoredSession.self, from: data) else {
            if readKeychain(account: sessionAccount) != nil { deleteSession() }
            return nil
        }
        return value
    }

    private func deleteSession() {
        SecItemDelete(keychainQuery(account: sessionAccount) as CFDictionary)
    }

    private func deviceId() -> String {
        if let data = readKeychain(account: deviceAccount), let value = String(data: data, encoding: .utf8),
           UUID(uuidString: value) != nil { return value.lowercased() }
        let created = UUID().uuidString.lowercased()
        _ = saveKeychain(Data(created.utf8), account: deviceAccount)
        return created
    }

    private func keychainQuery(account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: keychainService,
         kSecAttrAccount as String: account]
    }

    private func readKeychain(account: String) -> Data? {
        var query = keychainQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private func saveKeychain(_ data: Data, account: String) -> Bool {
        let query = keychainQuery(account: account)
        let update: [String: Any] = [kSecValueData as String: data,
                                     kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var insert = query
        insert.merge(update) { _, new in new }
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    private static func approvedBaseURL() -> URL? {
        let raw = ShellConfig.miniGameAuthBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: raw), components.scheme?.lowercased() == "https",
              components.user == nil, components.password == nil, components.query == nil,
              components.fragment == nil, let host = components.host, !host.isEmpty,
              components.port == nil || components.port == 443 else { return nil }
        if !components.path.hasSuffix("/") { components.path += "/" }
        return components.url
    }

    private static func safeServerMessage(_ response: JSONObject, fallback: String) -> String {
        let value = response.string("message").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.count <= 120, !containsControlCharacters(value) else { return fallback }
        return value
    }

    private static let allowedServerCodes: Set<String> = [
        "INVALID_CREDENTIALS", "ACCOUNT_LOCKED", "ACCOUNT_TAKEN", "INVALID_ACCOUNT",
        "WEAK_PASSWORD", "AUTH_EXPIRED", "RATE_LIMITED", "RECOVERY_UNAVAILABLE"
    ]

    private static func localizedMessage(for code: String, response: JSONObject) -> String {
        switch code {
        case "INVALID_CREDENTIALS": return "帳號或密碼不正確"
        case "ACCOUNT_LOCKED": return "登入嘗試過多，請稍後再試"
        case "ACCOUNT_TAKEN": return "這個帳號已被使用，請換一個帳號"
        case "INVALID_ACCOUNT": return "帳號須為 6–24 位英文字母、數字或底線"
        case "WEAK_PASSWORD": return "密碼至少需要 8 個字元"
        case "AUTH_EXPIRED": return "登入已過期，請重新登入"
        case "RATE_LIMITED": return "操作太頻繁，請稍後再試"
        case "RECOVERY_UNAVAILABLE": return "暫不支援自助找回密碼，請聯絡客服"
        default: return safeServerMessage(response, fallback: "帳號服務未能完成請求")
        }
    }

    private static func containsControlCharacters(_ value: String) -> Bool {
        value.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) }
    }

    private static func now() -> Int64 { Int64(Date().timeIntervalSince1970) }

    private static func normalizedAccount(_ rawValue: String) -> String? {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard value.range(of: #"^[a-z0-9][a-z0-9_]{5,23}$"#, options: .regularExpression) != nil else {
            return nil
        }
        return value
    }
}
