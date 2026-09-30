import Foundation
import os

#if canImport(FirebaseAnalytics)
import FirebaseAnalytics
#endif


public protocol TelemetryProvider: AnyObject, Sendable {
    var name: String { get }

    var isEnabled: Bool { get }

    func initialize()

    func track(event: String, category: String, parameters: [String: Any])
}

public extension TelemetryProvider {
    var isEnabled: Bool { true }
    func initialize() {}
}


public final class BackendTelemetryProvider: TelemetryProvider, @unchecked Sendable {
    public let name = "backend"
    public var isEnabled: Bool = true

    private let transport: NetworkTransportProtocol
    private let endpoint: URL?
    private let appVersion: String

    public init(
        transport: NetworkTransportProtocol? = nil,
        endpoint: URL? = nil,
        bundleId: String? = nil,
        appVersion: String? = nil
    ) {
        let resolvedAppVersion = appVersion ?? ShellConfig.versionName
        let resolvedBundleId = bundleId ?? ShellConfig.bundleId
        self.appVersion = resolvedAppVersion
        self.endpoint = endpoint ?? URL(string: ShellConfig.sdkApiEndpoint)?.appendingPathComponent("v1/telemetry/events")
        let interceptor = SecurityRequestInterceptor(
            bundleId: resolvedBundleId,
            appVersion: resolvedAppVersion
        )
        self.transport = transport ?? SecureNetworkTransport(session: .shared, interceptors: [interceptor])
    }

    public func track(event: String, category: String, parameters: [String: Any]) {
        guard isEnabled, AnalyticsSDK.isCollectionAllowed, let url = endpoint else { return }

        var metadata: [String: String] = [:]
        for (key, value) in parameters {
            metadata[key] = String(describing: value)
        }

        let record = TelemetryIngestRecord(
            eventId: UUID().uuidString.lowercased(),
            category: category,
            name: event,
            timestamp: Date().timeIntervalSince1970 * 1000,
            deviceId: parameters["deviceId"] as? String ?? (parameters["device_id"] as? String ?? "unknown"),
            appVersion: appVersion,
            metadata: metadata
        )

        Task.detached(priority: .utility) { [weak self, transport = self.transport] in
            guard let self, self.isEnabled, AnalyticsSDK.isCollectionAllowed else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(record)

            struct EmptyDTO: Decodable {}
            do {
                let _: EmptyDTO = try await transport.send(request)
            } catch {
                #if DEBUG
                os_log(.debug, "BackendTelemetryProvider transport failed: %{public}@", error.localizedDescription)
                #endif
            }
        }
    }
}


public final class FirebaseTelemetryProvider: TelemetryProvider, @unchecked Sendable {
    public let name = "firebase"
    public var isEnabled: Bool = true

    public init() {}

    public func initialize() {
        #if DEBUG
        os_log(.info, "FirebaseTelemetryProvider initialized")
        #endif
    }

    public func track(event: String, category: String, parameters: [String: Any]) {
        guard isEnabled, AnalyticsSDK.isCollectionAllowed else { return }

        let normalizedEvent = normalizeFirebaseName(event)

        var sanitizedParams: [String: Any] = [:]
        for (key, value) in parameters {
            let sanitizedKey = normalizeFirebaseName(key)
            if let str = value as? String {
                sanitizedParams[sanitizedKey] = str.prefix(100)
            } else if let num = value as? NSNumber {
                sanitizedParams[sanitizedKey] = num
            } else if let boolVal = value as? Bool {
                sanitizedParams[sanitizedKey] = boolVal ? 1 : 0
            } else {
                sanitizedParams[sanitizedKey] = String(describing: value).prefix(100)
            }
        }

        #if canImport(FirebaseAnalytics)
        Analytics.logEvent(normalizedEvent, parameters: sanitizedParams)
        #else
        #if DEBUG
        os_log(.debug, "[Firebase Mock] Tracked %{public}@: %{public}@", normalizedEvent, String(describing: sanitizedParams))
        #endif
        #endif
    }

    private func normalizeFirebaseName(_ raw: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_"))
        let cleaned = raw.components(separatedBy: allowed.inverted).joined(separator: "_")
        let trimmed = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return String(trimmed.prefix(40))
    }
}


public final class ConsoleTelemetryProvider: TelemetryProvider, @unchecked Sendable {
    public let name = "console"
    public var isEnabled: Bool

    private let printJSON: Bool

    public init(isEnabled: Bool = true, printJSON: Bool = false) {
        #if DEBUG
        self.isEnabled = isEnabled
        #else
        self.isEnabled = false
        #endif
        self.printJSON = printJSON
    }

    public func track(event: String, category: String, parameters: [String: Any]) {
        guard isEnabled else { return }

        let timestamp = ISO8601DateFormatter().string(from: Date())
        var output = "📡 [Telemetry][\(category.uppercased())] \(event) @ \(timestamp)\n"

        if printJSON,
           JSONSerialization.isValidJSONObject(parameters),
           let data = try? JSONSerialization.data(withJSONObject: parameters, options: [.prettyPrinted, .sortedKeys]),
           let jsonStr = String(data: data, encoding: .utf8) {
            output += "   Payload: \(jsonStr)"
        } else {
            let sortedKeys = parameters.keys.sorted()
            let formattedParams = sortedKeys.map { "   ├─ \($0): \(parameters[$0] ?? "")" }.joined(separator: "\n")
            output += formattedParams.isEmpty ? "   (No Parameters)" : formattedParams
        }

        print(output)
    }
}
