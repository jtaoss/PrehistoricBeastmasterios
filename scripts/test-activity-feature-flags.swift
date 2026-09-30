import Foundation

// MARK: - Unit Test Harness for Remote Activity Feature Flags

struct MockProfileResponse: Encodable {
    let code: String
    let data: MockData?

    struct MockData: Encodable {
        let accountStatus: String?
        let featureFlags: MockFeatureFlags?
    }

    struct MockFeatureFlags: Encodable {
        let noticeUrl: String?
    }
}

final class MockURLProtocol: URLProtocol {
    static var responseHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.responseHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

// MARK: - Validation Logic Mirrors

func isApprovedNoticeURL(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "https",
          let host = url.host, !host.isEmpty,
          url.port == nil || url.port == 443,
          url.user == nil, url.password == nil,
          !url.path.isEmpty, url.path != "/" else {
        return false
    }
    return true
}

func parseNoticeURL(from jsonData: Data) -> URL? {
    struct SyncProfileResponse: Decodable {
        let code: String?
        let data: ProfileData?

        struct ProfileData: Decodable {
            let accountStatus: String?
            let status: String?
            let featureFlags: FeatureFlags?
        }

        struct FeatureFlags: Decodable {
            let noticeUrl: String?
            let activityUrl: String?
        }
    }

    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    guard let response = try? decoder.decode(SyncProfileResponse.self, from: jsonData),
          response.code?.uppercased() == "OK",
          let data = response.data,
          (data.accountStatus?.uppercased() == "ACTIVE" || data.status?.uppercased() == "ACTIVE"),
          let rawURL = data.featureFlags?.noticeUrl ?? data.featureFlags?.activityUrl,
          let url = URL(string: rawURL),
          isApprovedNoticeURL(url) else {
        return nil
    }
    return url
}

// MARK: - Run Assertions

var testCount = 0
func assertTest(_ name: String, _ condition: Bool) {
    testCount += 1
    if condition {
        print("  ✓ [PASS] \(name)")
    } else {
        print("  ✗ [FAIL] \(name)")
        exit(1)
    }
}

print("=== Running Activity Feature Flags Unit Tests ===")

// Test 1: ACTIVE account status with valid semantic HTTPS notice URL
do {
    let mock = MockProfileResponse(
        code: "OK",
        data: .init(
            accountStatus: "ACTIVE",
            featureFlags: .init(noticeUrl: "https://activity.primitive-saga.com/spring-festival/entry?user=123")
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario A1: ACTIVE + Valid Semantic Notice URL yields non-nil URL", url != nil)
    assertTest("Scenario A2: Extracted host and path match expected payload",
               url?.host == "activity.primitive-saga.com" && url?.path == "/spring-festival/entry")
}

// Test 2: ACTIVE account status with bare domain URL (forbidden: missing semantic path)
do {
    let mock = MockProfileResponse(
        code: "OK",
        data: .init(
            accountStatus: "ACTIVE",
            featureFlags: .init(noticeUrl: "https://activity.primitive-saga.com")
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario D1: Bare domain without path is rejected", url == nil)
}

// Test 3: ACTIVE account status with bare root slash domain URL (forbidden)
do {
    let mock = MockProfileResponse(
        code: "OK",
        data: .init(
            accountStatus: "ACTIVE",
            featureFlags: .init(noticeUrl: "https://activity.primitive-saga.com/")
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario D2: Bare domain with root slash only is rejected", url == nil)
}

// Test 4: Insecure HTTP protocol (forbidden: must be HTTPS)
do {
    let mock = MockProfileResponse(
        code: "OK",
        data: .init(
            accountStatus: "ACTIVE",
            featureFlags: .init(noticeUrl: "http://activity.primitive-saga.com/events/carnival")
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario E1: Non-HTTPS (HTTP) URL is rejected", url == nil)
}

// Test 5: Inactive / Suspended account status
do {
    let mock = MockProfileResponse(
        code: "OK",
        data: .init(
            accountStatus: "SUSPENDED",
            featureFlags: .init(noticeUrl: "https://activity.primitive-saga.com/events/carnival")
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario B1: Non-ACTIVE account status (SUSPENDED) yields nil URL", url == nil)
}

// Test 6: Missing / null noticeUrl in featureFlags
do {
    let mock = MockProfileResponse(
        code: "OK",
        data: .init(
            accountStatus: "ACTIVE",
            featureFlags: .init(noticeUrl: nil)
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario C1: Null noticeUrl yields nil URL", url == nil)
}

// Test 7: Error code from server (code != "OK")
do {
    let mock = MockProfileResponse(
        code: "INTERNAL_ERROR",
        data: .init(
            accountStatus: "ACTIVE",
            featureFlags: .init(noticeUrl: "https://activity.primitive-saga.com/events/carnival")
        )
    )
    let data = try JSONEncoder().encode(mock)
    let url = parseNoticeURL(from: data)
    assertTest("Scenario F1: Error response (code != OK) yields nil URL", url == nil)
}

// Test 8: Empty / malformed JSON response
do {
    let data = "{}".data(using: .utf8)!
    let url = parseNoticeURL(from: data)
    assertTest("Scenario F2: Malformed JSON payload yields nil URL without throwing", url == nil)
}

print("=== All \(testCount) unit tests passed successfully! ===")
