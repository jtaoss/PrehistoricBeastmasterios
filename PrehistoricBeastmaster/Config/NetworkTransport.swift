import CryptoKit
import DeviceCheck
import Foundation

public protocol RequestInterceptor: Sendable {
    func adapt(_ request: inout URLRequest) async throws
}

public protocol NetworkTransportProtocol: Sendable {
    func send<T: Decodable>(_ request: URLRequest) async throws -> T
}

public enum NetworkError: LocalizedError, Sendable {
    case invalidURL
    case transportFailure(String)
    case serverRejected(statusCode: Int)
    case decodingFailed(String)
    case attestationUnavailable

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "無效的服務端請求位址"
        case .transportFailure(let msg): return "連線失敗：\(msg)"
        case .serverRejected(let code): return "伺服器拒絕請求 (HTTP \(code))"
        case .decodingFailed(let msg): return "資料解析錯誤：\(msg)"
        case .attestationUnavailable: return "裝置安全認證暫時無法生成"
        }
    }
}

public final class SecurityRequestInterceptor: RequestInterceptor {
    private let bundleId: String
    private let appVersion: String
    private let tokenProvider: @Sendable () async -> String?

    public init(
        bundleId: String,
        appVersion: String,
        tokenProvider: @escaping @Sendable () async -> String? = { nil }
    ) {
        self.bundleId = bundleId
        self.appVersion = appVersion
        self.tokenProvider = tokenProvider
    }

    public func adapt(_ request: inout URLRequest) async throws {
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(bundleId, forHTTPHeaderField: "X-App-Bundle-Id")
        request.setValue(appVersion, forHTTPHeaderField: "X-App-Version")
        request.setValue(UUID().uuidString.lowercased(), forHTTPHeaderField: "X-Request-Nonce")
        request.setValue(String(Int64(Date().timeIntervalSince1970 * 1000)), forHTTPHeaderField: "X-Request-Timestamp")

        if let token = await tokenProvider(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if DCDevice.current.isSupported {
            if let token = try? await DCDevice.current.generateToken() {
                request.setValue(token.base64EncodedString(), forHTTPHeaderField: "X-Client-Attestation")
            }
        }
    }
}

public final class SecureNetworkTransport: NetworkTransportProtocol {
    private let session: URLSession
    private let interceptors: [RequestInterceptor]

    public init(session: URLSession = .shared, interceptors: [RequestInterceptor] = []) {
        self.session = session
        self.interceptors = interceptors
    }

    public func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        var req = request
        for interceptor in interceptors {
            try await interceptor.adapt(&req)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw NetworkError.transportFailure(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw NetworkError.serverRejected(statusCode: 0)
        }

        guard (200...299).contains(http.statusCode) else {
            throw NetworkError.serverRejected(statusCode: http.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw NetworkError.decodingFailed(error.localizedDescription)
        }
    }
}
