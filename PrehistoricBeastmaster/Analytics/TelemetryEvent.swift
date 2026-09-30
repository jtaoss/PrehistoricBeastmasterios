import Foundation

public enum StageResult: String, Codable, Sendable {
    case win
    case fail
    case abandon
}


public enum TelemetryEvent: @unchecked Sendable {
    case appLaunch(osVersion: String? = nil)
    case pageReady(pageName: String, durationMs: Double? = nil)
    case networkRecovered(interfaceType: String? = nil)
    case appForeground
    case appBackground

    case stageStart(stageId: String)
    case stageEnd(stageId: String, result: StageResult, durationSeconds: Int)
    case itemConsume(itemId: String, costPearls: Int, remainingBalance: Int)

    case checkoutInitiate(productId: String, cpOrder: String? = nil)
    case checkoutSuccess(productId: String, orderId: String, transactionId: String)
    case checkoutFailed(productId: String, orderId: String?, code: String, message: String)
    case checkoutCancelled(productId: String)

    case loginSuccess(userId: String, method: String? = nil)
    case logout(userId: String? = nil)
    case attestationGenerated(tokenLength: Int)

    case custom(name: String, category: String = "custom", parameters: [String: Any])
}


public extension TelemetryEvent {
    var name: String {
        switch self {
        case .appLaunch: return "app_launch"
        case .pageReady: return "page_ready"
        case .networkRecovered: return "network_recovered"
        case .appForeground: return "app_foreground"
        case .appBackground: return "app_background"
        case .stageStart: return "stage_start"
        case .stageEnd: return "stage_end"
        case .itemConsume: return "item_consume"
        case .checkoutInitiate: return "checkout_initiate"
        case .checkoutSuccess: return "checkout_success"
        case .checkoutFailed: return "checkout_failed"
        case .checkoutCancelled: return "checkout_cancelled"
        case .loginSuccess: return "login_success"
        case .logout: return "logout"
        case .attestationGenerated: return "attestation_generated"
        case .custom(let name, _, _): return name
        }
    }

    var category: String {
        switch self {
        case .appLaunch, .pageReady, .networkRecovered, .appForeground, .appBackground:
            return "lifecycle"
        case .stageStart, .stageEnd, .itemConsume:
            return "gameplay"
        case .checkoutInitiate, .checkoutSuccess, .checkoutFailed, .checkoutCancelled:
            return "monetization"
        case .loginSuccess, .logout, .attestationGenerated:
            return "security"
        case .custom(_, let category, _):
            return category
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .appLaunch(let osVersion):
            params["os_version"] = osVersion ?? ProcessInfo.processInfo.operatingSystemVersionString

        case .pageReady(let pageName, let durationMs):
            params["page_name"] = pageName
            if let durationMs { params["duration_ms"] = durationMs }

        case .networkRecovered(let interfaceType):
            if let interfaceType { params["interface_type"] = interfaceType }

        case .appForeground, .appBackground:
            break

        case .stageStart(let stageId):
            params["stage_id"] = stageId

        case .stageEnd(let stageId, let result, let durationSeconds):
            params["stage_id"] = stageId
            params["result"] = result.rawValue
            params["duration_seconds"] = max(0, min(durationSeconds, 86_400))

        case .itemConsume(let itemId, let costPearls, let remainingBalance):
            params["item_id"] = itemId
            params["cost_pearls"] = max(0, costPearls)
            params["remaining_balance"] = max(0, remainingBalance)

        case .checkoutInitiate(let productId, let cpOrder):
            params["product_id"] = productId
            if let cpOrder { params["cp_order"] = cpOrder }

        case .checkoutSuccess(let productId, let orderId, let transactionId):
            params["product_id"] = productId
            params["order_id"] = orderId
            params["transaction_id"] = transactionId

        case .checkoutFailed(let productId, let orderId, let code, let message):
            params["product_id"] = productId
            if let orderId { params["order_id"] = orderId }
            params["error_code"] = code
            params["error_message"] = message

        case .checkoutCancelled(let productId):
            params["product_id"] = productId

        case .loginSuccess(let userId, let method):
            params["user_id"] = userId
            if let method { params["method"] = method }

        case .logout(let userId):
            if let userId { params["user_id"] = userId }

        case .attestationGenerated(let tokenLength):
            params["token_length"] = tokenLength

        case .custom(_, _, let customParameters):
            params = customParameters
        }

        return params
    }
}
