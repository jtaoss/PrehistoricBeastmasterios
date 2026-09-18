import Foundation

/// Mirrors Android GameOrderEndpointRouter at 30dc87b1 (Windows reference,
/// 2026-09-11). The configured legacy endpoint is NOT a routing fallback:
/// sending an unknown server to region 9 can create an order in the wrong region.
enum GameOrderEndpointRouter {
    static func resolve(_ serverID: String?) -> URL? {
        guard let value = serverID?.trimmingCharacters(in: .whitespacesAndNewlines),
              let numericID = Int32(value), numericID > 0 else { return nil }
        let region = numericID / 1000 + 1
        guard (1...9).contains(region) else { return nil }
        if region == 1 {
            return URL(string: "https://safthwy.antieh.com/fx/createOrder.php")
        }
        if region == 3 {
            // Region 3 belongs to region 2's fx16 service, not safthwy03.
            return URL(string: "https://safthwy02.antieh.com/fx16/createOrder.php")
        }
        return URL(string: "https://safthwy0\(region).antieh.com/fx/createOrder.php")
    }

    static func serverID(in url: URL) -> String? {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        for name in ["sid", "serverId", "server_id", "sercerId"] {
            if let value = items.first(where: { $0.name == name })?.value?
                .trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
                return value
            }
        }
        return nil
    }

    static func rewrite(_ source: URL, orderPlatform: String) -> URL {
        // Normalize only the URL path, never matching text inside a query value.
        guard var components = URLComponents(url: source, resolvingAgainstBaseURL: false) else {
            return source
        }
        if components.host?.lowercased() == "safthwy.antieh.com" {
            components.percentEncodedPath = components.percentEncodedPath.replacingOccurrences(
                of: #"^/(audit|fx)/+"#, with: "/fx/", options: .regularExpression
            )
        }
        guard let normalized = components.url else { return source }
        if normalized.lastPathComponent.caseInsensitiveCompare("createOrder.php") == .orderedSame {
            let platform = orderPlatform.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let endpoint = resolve(serverID(in: normalized)), !platform.isEmpty else {
                // Match Android: retain the normalized source for invalid IDs.
                // Never silently route missing/out-of-range IDs to another region.
                return normalized
            }
            return copyQuery(from: normalized, to: endpoint, name: "platformType", value: platform)
        }
        if components.queryItems?.first(where: { $0.name == "act" })?.value == "getServerList" {
            return copyQuery(from: normalized, to: normalized, name: "platformType", value: "xmwh5sqxss")
        }
        return normalized
    }

    private static func copyQuery(from source: URL, to target: URL, name: String, value: String) -> URL {
        guard var components = URLComponents(url: target, resolvingAgainstBaseURL: false) else {
            return source
        }
        let sourceItems = URLComponents(url: source, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var overridden = false
        var items: [URLQueryItem] = []
        for item in sourceItems {
            if item.name == name {
                if !overridden { items.append(URLQueryItem(name: name, value: value)) }
                overridden = true
            } else {
                items.append(item)
            }
        }
        if !overridden { items.append(URLQueryItem(name: name, value: value)) }
        components.queryItems = items
        return components.url ?? source
    }
}
