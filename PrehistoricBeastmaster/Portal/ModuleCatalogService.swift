import Foundation

/// 异步拉取合规远端活动模块目录。所有模块必须具有合法 HMAC-SHA256 签名且域名在白名单内。
@MainActor
final class ModuleCatalogService {
    var timeoutInterval: TimeInterval = 1.5
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchRemoteModules() async -> [GameModule] {
        guard let endpoint = ShellConfig.moduleCatalogEndpoint else {
            return []
        }
        switch await loadCatalog(endpoint: endpoint) {
        case .list(let modules):
            for module in modules {
                if let url = module.entryURL {
                    IOSWebNavigationPolicy.admitRemoteEntry(url)
                }
            }
            return modules
        case .unavailable:
            return []
        }
    }

    private func loadCatalog(endpoint: URL) async -> ModuleCatalogDecodeResult {
        do {
            let data = try await post(endpoint)
            let policy = ModuleAcceptancePolicy(
                approvedHosts: IOSWebNavigationPolicy.approvedBusinessDomains,
                hmacSecret: ShellConfig.moduleHmacSecretKey,
                appVersion: ShellConfig.versionName
            )
            return ModuleCatalogParser.decodeCatalog(data, policy: policy)
        } catch {
            return .unavailable
        }
    }

    private func post(_ endpoint: URL) async throws -> Data {
        var request = URLRequest(url: endpoint, timeoutInterval: timeoutInterval)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(ShellConfig.bundleId, forHTTPHeaderField: "X-App-Bundle-Id")
        request.setValue(ShellConfig.versionName, forHTTPHeaderField: "X-App-Version")
        let body: [String: String] = [
            "bundleId": ShellConfig.bundleId,
            "appVersion": ShellConfig.versionName,
            "buildNumber": ShellConfig.versionCode,
            "locale": Locale.current.identifier
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}
