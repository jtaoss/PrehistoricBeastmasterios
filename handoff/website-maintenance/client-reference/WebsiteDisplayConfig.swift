import Foundation

/// Independent of MINI_ONLY/BOTH/ONLINE_ONLY: maintenance never changes the
/// game's normal route, including the temporary mini-only device-test gate.
struct WebsiteDisplayConfig: Codable, Equatable {
    let appId: String
    let packageName: String
    let channel: String
    let websiteOnly: Bool
    let websiteUrl: URL
    let supportUrls: [URL]
    let revision: Int64
    let updatedAt: String

    static var disabled: WebsiteDisplayConfig {
        WebsiteDisplayConfig(appId: ShellConfig.backendAppId, packageName: ShellConfig.bundleId,
                             channel: ShellConfig.channel, websiteOnly: false,
                             websiteUrl: URL(string: "https://safthwyk.antieh.com/")!,
                             supportUrls: [], revision: 0, updatedAt: "")
    }

    func validate() throws {
        guard appId == ShellConfig.backendAppId, packageName == ShellConfig.bundleId,
              channel == ShellConfig.channel, revision >= 0,
              WebsiteNavigationPolicy.isOfficialWebsite(websiteUrl), supportUrls.count <= 10,
              supportUrls.allSatisfy(WebsiteNavigationPolicy.isSupportURL) else {
            throw URLError(.cannotParseResponse)
        }
    }

    static func decodeResponse(_ data: Data) throws -> WebsiteDisplayConfig {
        struct Envelope: Decodable { let code: Int; let data: WebsiteDisplayConfig }
        let envelope = try JSONDecoder().decode(Envelope.self, from: data)
        guard envelope.code == 0 else { throw URLError(.badServerResponse) }
        try envelope.data.validate()
        return envelope.data
    }
}

enum WebsiteNavigationPolicy {
    static func isSafeHTTPS(_ url: URL) -> Bool {
        guard let host = url.host, !host.isEmpty, url.absoluteString.utf8.count <= 2048,
              url.scheme?.lowercased() == "https", url.port == nil || url.port == 443,
              url.user == nil, url.password == nil, !url.path.contains("\\"),
              !url.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return false }
        return true
    }

    static func isOfficialWebsite(_ url: URL) -> Bool {
        isSafeHTTPS(url) && url.host?.lowercased() == "safthwyk.antieh.com"
    }

    static func isSupportURL(_ url: URL) -> Bool {
        guard isSafeHTTPS(url), let host = url.host?.lowercased() else { return false }
        // A support-link setting must not reopen the existing game/payment hosts.
        return !["antieh.com", "xmw520.com", "playstonegame.com"].contains {
            host == $0 || host.hasSuffix("." + $0)
        } || isOfficialWebsite(url)
    }

    static func allowsEmbedded(_ url: URL, config: WebsiteDisplayConfig) -> Bool {
        config.websiteOnly && isOfficialWebsite(url)
            && url.host?.lowercased() == config.websiteUrl.host?.lowercased()
    }

    static func allowsSupport(_ url: URL, config: WebsiteDisplayConfig) -> Bool {
        config.websiteOnly && isSupportURL(url) && config.supportUrls.contains(url)
    }
}

@MainActor
final class WebsiteDisplayConfigManager {
    private let store: UserDefaults
    private let session: URLSession
    private let endpoint: URL?
    private let cacheKey: String
    private var lastRefresh = Date.distantPast
    private var task: Task<Void, Never>?
    private var destroyed = false

    init(store: UserDefaults = .standard, session: URLSession? = nil,
         endpoint: URL? = ShellConfig.websiteDisplayEndpoint) {
        self.store = store
        if let session { self.session = session }
        else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 5
            configuration.timeoutIntervalForResource = 5
            configuration.httpCookieStorage = nil
            configuration.urlCache = nil
            self.session = URLSession(configuration: configuration)
        }
        self.endpoint = endpoint
        let environment = ShellConfig.isDebug ? "debug" : "release"
        cacheKey = "shell_website_display_v1_\(environment)_\(ShellConfig.backendAppId)_\(ShellConfig.bundleId)_\(ShellConfig.channel)"
    }

    func cachedOrDefault() -> WebsiteDisplayConfig {
        guard let data = store.data(forKey: cacheKey),
              let config = try? JSONDecoder().decode(WebsiteDisplayConfig.self, from: data),
              (try? config.validate()) != nil else { return .disabled }
        return config
    }

    /// Same-revision conflicts and old responses cannot undo an operator change.
    /// One encoded value keeps the switch, URL and revision atomic on disk.
    @discardableResult
    func accept(_ config: WebsiteDisplayConfig) throws -> Bool {
        try config.validate()
        let current = cachedOrDefault()
        guard config.revision >= current.revision else { return false }
        if store.data(forKey: cacheKey) != nil, config.revision == current.revision {
            return config == current
        }
        store.set(try JSONEncoder().encode(config), forKey: cacheKey)
        return true
    }

    func refresh(force: Bool = false, completion: @escaping (WebsiteDisplayConfig) -> Void) {
        guard !destroyed, task == nil else { return }
        guard force || Date().timeIntervalSince(lastRefresh) >= 30 else { return }
        lastRefresh = Date()
        guard let endpoint, WebsiteNavigationPolicy.isSafeHTTPS(endpoint),
              var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            completion(cachedOrDefault())
            return
        }
        components.queryItems = [
            URLQueryItem(name: "appId", value: ShellConfig.backendAppId),
            URLQueryItem(name: "packageName", value: ShellConfig.bundleId),
            URLQueryItem(name: "channel", value: ShellConfig.channel),
            URLQueryItem(name: "versionCode", value: ShellConfig.versionCode),
            URLQueryItem(name: "versionName", value: ShellConfig.versionName)
        ]
        guard let url = components.url else { completion(cachedOrDefault()); return }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        task = Task { [weak self] in
            guard let self else { return }
            defer { self.task = nil }
            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                      response.url?.scheme == url.scheme, response.url?.host == url.host,
                      response.url?.path == url.path, data.count <= 32_768 else {
                    throw URLError(.badServerResponse)
                }
                let config = try WebsiteDisplayConfig.decodeResponse(data)
                try Task.checkCancellation()
                if !destroyed { try accept(config) }
            } catch {
                // 404 (backend not installed), offline and invalid replies all
                // preserve the last known setting; never treat errors as OFF.
            }
            guard !destroyed, !Task.isCancelled else { return }
            completion(cachedOrDefault())
        }
    }

    func destroy() {
        destroyed = true
        task?.cancel()
        task = nil
    }
}
