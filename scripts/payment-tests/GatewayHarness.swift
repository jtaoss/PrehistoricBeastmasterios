import Foundation

// Compile the REAL BackendGateway and JSONObject alongside these configuration
// and request doubles. Tests call only pure response parsers; never the network.
enum ShellConfig {
    static let sdkApiEndpoint = "https://example.invalid/"
    static let webSdkChannel = "test"
    static let payChannel = "24"
    static let payType = "apple"
    static let bundleId = "com.stone.primitive.saga"
    static let backendAppId = "1000151"
    static let paymentApiToken = ""
}
struct PayRequest {
    let uid = "test-uid", username = "test-username", price = "0.99", cpOrder = "test-order"
    let channel = "", serverId = "", serverName = "", goodsId = "", goodsName = "", payTypeId = ""
    let roleId = "", roleName = "", roleLevel = "", notifyUrl = ""
    func legacyExtension() -> String { "" }
}

@main enum GatewayHarness {
    static let expected = UUID(uuidString: "00112233-4455-8677-8899-AABBCCDDEEFF")!
    static func order(_ fields: [String: Any]) -> JSONObject {
        var data: [String: Any] = ["order_id": "original-order", "applesku": "pbm_tier_099"]
        for (key, value) in fields { data[key] = value }
        return JSONObject(["stateCode": 1, "data": data])
    }
    static func reject(_ fields: [String: Any], code: String) {
        do {
            _ = try BackendGateway.parsePlayOrder(order(fields))
            preconditionFailure("Invalid order/token accepted")
        } catch let error as BackendGateway.GatewayError {
            precondition(error.code == code, "Unexpected error: \(error.code)")
            precondition(!error.localizedDescription.contains(expected.uuidString), "Token leaked")
        } catch { preconditionFailure("Unexpected error type") }
    }
    static func main() throws {
        for fields in [
            ["appAccountToken": expected.uuidString],
            ["appAccountToken": expected.uuidString.lowercased()],
            ["app_account_token": expected.uuidString],
            ["appAccountToken": expected.uuidString, "app_account_token": expected.uuidString.lowercased()]
        ] {
            let parsed = try BackendGateway.parsePlayOrder(order(fields))
            precondition(parsed.appAccountToken == expected && parsed.orderId == "original-order")
        }
        reject([:], code: "APP_ACCOUNT_TOKEN_MISSING")
        for value in ["", "not-a-uuid", "00000000-0000-0000-0000-000000000000"] {
            reject(["appAccountToken": value], code: "INVALID_APP_ACCOUNT_TOKEN")
        }
        reject(["appAccountToken": NSNull()], code: "INVALID_APP_ACCOUNT_TOKEN")
        reject(["appAccountToken": expected.uuidString, "app_account_token": "11223344-5566-8778-899A-BBCCDDEEFF00"], code: "INVALID_APP_ACCOUNT_TOKEN")
        reject(["appAccountToken": "invalid", "app_account_token": expected.uuidString], code: "INVALID_APP_ACCOUNT_TOKEN")
        let accepted = try BackendGateway.parseConfirmation(JSONObject(["stateCode": 1, "data": ["consume": true]]))
        precondition(accepted.consume)
        for response in [
            JSONObject(["stateCode": 1]),
            JSONObject(["stateCode": 1, "data": [:]]),
            JSONObject(["stateCode": 1, "data": ["consume": false]])
        ] {
            let result = try BackendGateway.parseConfirmation(response)
            precondition(!result.consume, "Missing/false consume must not finish")
        }
        do {
            _ = try BackendGateway.parseConfirmation(JSONObject(["stateCode": 0, "data": ["consume": true]]))
            preconditionFailure("Server rejection accepted")
        } catch is BackendGateway.GatewayError { }
        var statusFields: [String: Any] = ["order_id": "original-order", "cp_order": "original-cp", "product_id": "pbm_tier_099",
                                           "state": "CONSUMED", "store": "app_store", "transaction_id": "2000001234401266"]
        let delivered = try BackendGateway.parseOrderStatus(JSONObject(["code": "OK", "data": statusFields]))
        precondition(delivered.isDelivered && delivered.cpOrder == "original-cp")
        for (field, value) in [("state", "CREATED"), ("state", "PENDING"), ("state", "DELIVERY_FAILED"),
                                ("store", "google_play"), ("transaction_id", ""), ("transaction_id", "0"), ("transaction_id", "invalid")] {
            var fields = statusFields; fields[field] = value
            let status = try BackendGateway.parseOrderStatus(JSONObject(["code": "OK", "data": fields]))
            precondition(!status.isDelivered)
        }
        statusFields.removeValue(forKey: "cp_order")
        for response in [JSONObject(["code": "OK", "data": statusFields]), JSONObject(["code": "ERROR"]), JSONObject(["code": "OK"])] {
            do {
                _ = try BackendGateway.parseOrderStatus(response)
                preconditionFailure("Incomplete server delivery identity accepted")
            } catch is BackendGateway.GatewayError { }
        }
        print("27 real Gateway parser assertions passed (no network/payment).")
    }
}
