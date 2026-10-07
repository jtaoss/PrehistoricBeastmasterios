import Foundation
import WebKit

@MainActor final class GameAPIProxy: NSObject, WKScriptMessageHandlerWithReply {
    private let orderGate = GameOrderRequestGate()
    var onlineGameURL: URL?
    var onCheckoutBusy: (() -> Void)?

    func beginCheckout(_ cpOrder: String) -> Bool { orderGate.beginCheckout(cpOrder) }
    func endCheckout(_ cpOrder: String) { orderGate.endCheckout(cpOrder) }
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 15
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return URLSession(
            configuration: configuration,
            delegate: GameAPIProxySessionDelegate.shared,
            delegateQueue: nil
        )
    }()

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let body = message.body as? [String: Any] else {
            replyHandler(nil, "invalid proxy payload")
            return
        }
        let urlString = String(describing: body["url"] ?? "")
        let method = String(describing: body["method"] ?? "GET")
        let rawHeaders = body["headers"] as? [String: Any] ?? [:]
        let headers = rawHeaders.reduce(into: [String: String]()) { result, item in
            result[item.key] = String(describing: item.value)
        }
        let userAgent = String(describing: body["userAgent"] ?? "")
        let referer = String(describing: body["referer"] ?? "")
        let act = URL(string: urlString)?.queryValue("act") ?? "unknown"
        Task {
            do {
                let response = try await fetch(
                    urlString: urlString,
                    method: method,
                    headers: headers,
                    userAgent: userAgent,
                    referer: referer
                )
                NSLog(
                    "[PBM-GAME-API] event=proxy_success act=%@ status=%@",
                    act,
                    String(describing: response["status"] ?? 0)
                )
                replyHandler(response, nil)
            } catch {
                let nsError = error as NSError
                let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError
                let failingURL = (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
                    ?? (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String).flatMap(URL.init(string:))
                NSLog(
                    "[PBM-GAME-API] event=proxy_failure act=%@ domain=%@ code=%d underlying_domain=%@ underlying_code=%d failing_scheme=%@ failing_host=%@ failing_path=%@",
                    act,
                    nsError.domain,
                    nsError.code,
                    underlying?.domain ?? "none",
                    underlying?.code ?? 0,
                    failingURL?.scheme ?? "none",
                    failingURL?.host ?? "none",
                    failingURL?.path ?? "none"
                )
                replyHandler(nil, "game API proxy failed (\(nsError.code))")
            }
        }
    }

    private func fetch(
        urlString: String,
        method: String,
        headers: [String: String],
        userAgent: String,
        referer: String
    ) async throws -> [String: Any] {
        guard method.uppercased() == "GET" else {
            NSLog("[PBM-GAME-API] event=proxy_rejected reason=method")
            throw URLError(.unsupportedURL)
        }
        guard let source = normalizedNetworkURL(urlString) else {
            NSLog("[PBM-GAME-API] event=proxy_rejected reason=url_parse length=%d", urlString.utf8.count)
            throw URLError(.unsupportedURL)
        }
        guard shouldProxy(source) else {
            NSLog(
                "[PBM-GAME-API] event=proxy_rejected reason=endpoint scheme=%@ host=%@ path=%@ port=%@",
                source.scheme ?? "none",
                source.host ?? "none",
                source.path,
                source.port.map(String.init) ?? "default"
            )
            throw URLError(.unsupportedURL)
        }
        let target = GameOrderEndpointRouter.rewrite(source, orderPlatform: ShellConfig.gameOrderPlatform)
        if source.lastPathComponent.caseInsensitiveCompare("createOrder.php") == .orderedSame {
            let result = try await orderGate.response(for: target.absoluteString) { [self] in
                // Record actual sends only, without account IDs/signatures.
                let serverID = GameOrderEndpointRouter.serverID(in: source)
                let server = serverID.flatMap(Int32.init).map(String.init) ?? "invalid"
                let routed = GameOrderEndpointRouter.resolve(serverID) != nil
                    && !ShellConfig.gameOrderPlatform.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                PaymentDebugLog.record("game-order-route server=\(server) routed=\(routed) host=\(target.host ?? "none") path=\(target.path)")
                return try await performFetch(target: target, headers: headers, userAgent: userAgent, referer: referer)
            }
            if result["shellCheckoutBusy"] as? Bool == true {
                PaymentDebugLog.record("game-order-blocked reason=checkout-active networkRequest=false")
                onCheckoutBusy?()
            } else if result["shellOrderCoalesced"] as? Bool == true {
                PaymentDebugLog.record("game-order-coalesced networkRequest=false")
            }
            return result
        }
        return try await performFetch(target: target, headers: headers, userAgent: userAgent, referer: referer)
    }

    private func performFetch(target: URL, headers: [String: String], userAgent: String,
                              referer: String) async throws -> [String: Any] {
        NSLog(
            "[PBM-GAME-API] event=proxy_start act=%@ host=%@ path=%@ port=%@ url_bytes=%d query_bytes=%d headers=%d",
            target.queryValue("act") ?? "unknown",
            target.host ?? "none",
            target.path,
            target.port.map(String.init) ?? "default",
            target.absoluteString.utf8.count,
            target.query?.utf8.count ?? 0,
            headers.count
        )
        var request = URLRequest(url: target, timeoutInterval: 15)
        request.httpMethod = "GET"
        for (name, value) in headers {
            if !isSafeHeader(name: name, value: value) {
                continue
            }
            request.setValue(value, forHTTPHeaderField: name)
        }
        if let origin = onlineGameURL {
            request.setValue(originHost(origin), forHTTPHeaderField: "Origin")
        }
        if isSafeHeaderValue(userAgent) {
            request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        }
        if isSafeHeaderValue(referer), let refererURL = normalizedNetworkURL(referer) {
            request.setValue(refererURL.absoluteString, forHTTPHeaderField: "Referer")
        }
        let (data, response) = try await session.data(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        let contentType = http?.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
        return [
            "status": status,
            "body": String(data: data, encoding: .utf8) ?? "",
            "contentType": contentType
        ]
    }

    private func normalizedNetworkURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              var components = URLComponents(string: trimmed),
              components.scheme?.caseInsensitiveCompare("https") == .orderedSame,
              let host = components.host,
              !host.isEmpty else {
            return nil
        }
        components.scheme = "https"
        components.host = host.lowercased()
        return components.url
    }

    private func isSafeHeader(name: String, value: String) -> Bool {
        let blocked = [
            "Host", "Connection", "Content-Length", "Origin", "Referer", "User-Agent",
            "Cookie", "Authorization", "Proxy-Authorization", "Transfer-Encoding"
        ]
        guard !blocked.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }),
              !name.isEmpty,
              name.unicodeScalars.allSatisfy({ scalar in
                  scalar.value > 32 && scalar.value < 127 && !"():<>@,;\\\"/[]?={}\t".unicodeScalars.contains(scalar)
              }) else {
            return false
        }
        return isSafeHeaderValue(value)
    }

    private func isSafeHeaderValue(_ value: String) -> Bool {
        !value.isEmpty && value.unicodeScalars.allSatisfy { scalar in
            scalar.value != 0 && scalar.value != 10 && scalar.value != 13
        }
    }

    private func shouldProxy(_ uri: URL) -> Bool {
        guard uri.scheme?.caseInsensitiveCompare("https") == .orderedSame else { return false }
        let host = uri.host ?? ""
        let path = uri.path.lowercased()
        if host.caseInsensitiveCompare("safthwy.antieh.com") == .orderedSame
            && (path == "/audit" || path.hasPrefix("/audit/")
                || path == "/fx" || path.hasPrefix("/fx/")) {
            return true
        }
        guard let order = URL(string: ShellConfig.gameOrderEndpoint), isApprovedOrderEndpoint(order) else {
            return false
        }
        return host.caseInsensitiveCompare(order.host ?? "") == .orderedSame
            && uri.port == order.port
            && path.caseInsensitiveCompare(order.path) == .orderedSame
    }

    private func isApprovedOrderEndpoint(_ uri: URL) -> Bool {
        uri.scheme?.caseInsensitiveCompare("https") == .orderedSame
            && !(uri.host ?? "").isEmpty
            && uri.user == nil
            && uri.fragment == nil
            && uri.lastPathComponent.caseInsensitiveCompare("createOrder.php") == .orderedSame
    }

    private func originHost(_ url: URL) -> String {
        var origin = "\(url.scheme ?? "https")://\(url.host ?? "")"
        if let port = url.port {
            origin += ":\(port)"
        }
        return origin
    }
}

/// One game-order request per checkout, shared across XHR/fetch and all frames in
/// this WKWebView. This gate precedes the state-changing PHP request, not merely
/// the later StoreKit call. It is not a substitute for server idempotency.
@MainActor final class GameOrderRequestGate {
    typealias Response = [String: Any]
    private struct Attempt {
        let id: UUID
        let key: String?
        let task: Task<Response, Error>?
        var cpOrder: String?
        var nativeStarted = false
        var responseAt: TimeInterval?
    }
    private var active: Attempt?
    private let now: () -> TimeInterval
    init(now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.now = now }

    func response(for key: String, start: @escaping () async throws -> Response) async throws -> Response {
        // Only an unclaimed H5 response can expire. A native checkout (including
        // product lookup, backend creation and Apple UI) NEVER unlocks on a timer.
        // This prevents an aborted/navigated-away XHR from permanently locking UI.
        if let current = active, !current.nativeStarted, let at = current.responseAt, now() - at >= 15 {
            active = nil
        }
        if let current = active {
            guard !current.nativeStarted, current.key == key, let task = current.task else { return ["shellCheckoutBusy": true] }
            do {
                var response = settle(try await task.value, id: current.id)
                response["shellOrderCoalesced"] = true
                return response
            } catch {
                if active?.id == current.id { active = nil }
                throw error
            }
        }
        let id = UUID()
        let task = Task { try await start() }
        active = Attempt(id: id, key: key, task: task)
        do {
            return settle(try await task.value, id: id)
        } catch {
            if active?.id == id { active = nil }
            throw error
        }
    }

    private func settle(_ response: Response, id: UUID) -> Response {
        guard active?.id == id, active?.nativeStarted == false else { return ["shellCheckoutBusy": true] }
        if let cpOrder = Self.orderID(response) {
            active?.cpOrder = cpOrder
            if active?.responseAt == nil { active?.responseAt = now() }
        } else { active = nil }
        return response
    }

    @discardableResult
    func beginCheckout(_ cpOrder: String) -> Bool {
        guard !cpOrder.isEmpty else { return false }
        if var current = active {
            guard current.cpOrder == cpOrder else { return false }
            current.nativeStarted = true
            active = current
            return true
        }
        // Direct/original checkout is allowed only when no earlier intent owns
        // the gate. A late bridge message must never supersede a newer selection.
        active = Attempt(id: UUID(), key: nil, task: nil, cpOrder: cpOrder, nativeStarted: true)
        return true
    }

    func endCheckout(_ cpOrder: String) {
        guard !cpOrder.isEmpty, active?.cpOrder == cpOrder else { return }
        active = nil
    }

    private static func orderID(_ response: Response) -> String? {
        guard let status = response["status"] as? Int, (200...299).contains(status),
              let body = response["body"] as? String, let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let business = json["status"], String(describing: business).trimmingCharacters(in: .whitespacesAndNewlines) == "0",
              let raw = json["cpOrder"], raw is String || raw is NSNumber else { return nil }
        let cpOrder = String(describing: raw).trimmingCharacters(in: .whitespacesAndNewlines)
        return cpOrder.isEmpty ? nil : cpOrder
    }
}

private final class GameAPIProxySessionDelegate: NSObject, URLSessionTaskDelegate {
    static let shared = GameAPIProxySessionDelegate()

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        let target = request.url
        NSLog(
            "[PBM-GAME-API] event=proxy_redirect status=%d scheme=%@ host=%@ path=%@ followed=false",
            response.statusCode,
            target?.scheme ?? "none",
            target?.host ?? "none",
            target?.path ?? "none"
        )
        // Match Android's proven request path. The Android proxy deliberately
        // returns the first HTTP response instead of letting the native client
        // follow an API redirect to an invalid or unsupported URL.
        completionHandler(nil)
    }
}

private extension URL {
    func queryValue(_ name: String) -> String? {
        URLComponents(url: self, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == name })?
            .value
    }
}
