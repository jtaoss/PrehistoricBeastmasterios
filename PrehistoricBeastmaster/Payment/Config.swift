import Foundation

enum Config {
    static var receiptValidationURL: URL? {
        let configured = (Bundle.main.object(forInfoDictionaryKey: "ReceiptValidationURL") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return validatedReceiptURL(configured.isEmpty ? ShellConfig.sdkApiEndpoint : configured)
    }

    static func validatedReceiptURL(_ value: String) -> URL? {
        guard let url = URL(string: value), url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.fragment == nil, url.port == nil || url.port == 443 else { return nil }
        return url
    }

    static func assetID(forActionID id: String) -> String? {
        let asset = id == "tier1" ? "pack-fortify" : id
        return MiniGameProductCatalog.offer(asset) == nil ? nil : asset
    }
}
