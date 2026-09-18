import Foundation

// Shadow Foundation.UserDefaults so tests cannot affect app or host state.
final class UserDefaults {
    static let standard = UserDefaults()
    var values: [String: Any] = [:]
    func bool(forKey key: String) -> Bool { values[key] as? Bool ?? false }
    func double(forKey key: String) -> Double { values[key] as? Double ?? 0 }
    func object(forKey key: String) -> Any? { values[key] }
    func set(_ value: Any, forKey key: String) { values[key] = value }
}
enum PaymentDebugLog { static func record(_ message: String) {} }
enum StoreKitManager {
    struct ProductInfo {
        let productId: String
        let priceAmountMicros: Int64
        let currencyCode: String
    }
}
final class AnalyticsManager {
    static var events: [(String, JSONObject)] = []
    var isFirebaseConfigured: Bool { true }
    var isFacebookConfigured: Bool { true }
    func logEvent(_ name: String, json: String?) {
        guard AnalyticsNames.allowed.contains(name) else { return }
        Self.events.append((name, JSONObject.parse(json)))
    }
}

var passed = 0
func check(_ name: String, _ test: () throws -> Void) rethrows {
    UserDefaults.standard.values = [:]
    AnalyticsManager.events = []
    try test()
    passed += 1
    print("PASS: \(name)")
}
let twd = StoreKitManager.ProductInfo(productId: "pbm_tier_099", priceAmountMicros: 30_000_000, currencyCode: "TWD")
let usd = StoreKitManager.ProductInfo(productId: "pbm_tier_2999", priceAmountMicros: 29_990_000, currencyCode: "USD")
func names() -> [String] { AnalyticsManager.events.map { $0.0 } }
func success(_ flow: AnalyticsEventCoordinator, id: String = "unit-transaction", info: StoreKitManager.ProductInfo = twd) {
    flow.onPurchaseSuccess(nil, orderId: "unit-order", transactionId: id, productInfo: info)
}

check("H5 cannot submit any payment alias or tier") {
    let flow = AnalyticsEventCoordinator()
    let payment = AnalyticsNames.allowed.filter { AnalyticsNames.requiresNativePayment($0) }
    for event in payment {
        flow.onH5Event(event, json: "{}")
        flow.onH5Event(AnalyticsNames.operationsName(event), json: "{}")
        flow.onH5Event("legacy_af_event", json: JSONObject(["type": AnalyticsNames.operationsName(event)]).jsonString())
    }
    precondition(AnalyticsManager.events.isEmpty)
}
check("non-payment events still pass; loading event deduplicates") {
    let flow = AnalyticsEventCoordinator()
    flow.onH5Event("mini_game_open", json: "{}")
    flow.onH5Event("Loading_completed", json: "{}")
    flow.onH5Event("Loading_completed", json: "{}")
    precondition(names() == ["mini_game_open", "game_loading_complete"])
}
check("checkout is not purchase success") {
    let flow = AnalyticsEventCoordinator()
    let request = try! PayRequest(json: "{\"cpOrder\":\"unit-order\",\"price\":\"0.99\"}")
    flow.onCheckoutStarted(request, twd)
    precondition(names() == ["begin_checkout"])
}
check("verified transaction emits purchase and SKU tier with real TWD amount") {
    success(AnalyticsEventCoordinator())
    precondition(names() == ["game_purchase", "purchase_tier_0_99"])
    let fields = AnalyticsManager.events[0].1
    precondition(fields.double("revenue") == 30 && fields.string("currency") == "TWD")
}
check("duplicate receipt remains deduplicated after role change or coordinator recreation") {
    let flow = AnalyticsEventCoordinator()
    success(flow)
    flow.onRoleReported("{\"uid\":\"unit-user\",\"role_id\":\"other-role\"}")
    success(flow)
    success(AnalyticsEventCoordinator())
    precondition(names().count == 2)
    success(flow, id: "unit-second-transaction")
    precondition(names().count == 4)
}
check("legacy receipt marker is preserved") {
    let scope = "purchase||unit-transaction"
    UserDefaults.standard.set(true, forKey: "analytics_event_\(ShellText.sha256Hex(scope))_verified_purchase")
    success(AnalyticsEventCoordinator())
    precondition(names().isEmpty)
}
check("missing transaction ID cannot become a purchase") {
    success(AnalyticsEventCoordinator(), id: " ")
    precondition(names().isEmpty)
}
check("missing currency or price does not fabricate USD revenue") {
    success(AnalyticsEventCoordinator(), info: .init(productId: "pbm_tier_099", priceAmountMicros: 30_000_000, currencyCode: ""))
    success(AnalyticsEventCoordinator(), info: .init(productId: "pbm_tier_099", priceAmountMicros: 0, currencyCode: "TWD"))
    precondition(names().isEmpty)
}
check("unmapped operations tier does not invent a new event") {
    success(AnalyticsEventCoordinator(), info: .init(productId: "pbm_tier_30000", priceAmountMicros: 300_000_000, currencyCode: "USD"))
    precondition(names() == ["game_purchase"])
}
check("USD cumulative threshold does not consume a TWD amount") {
    let request = try! PayRequest(json: "{\"cpOrder\":\"unit-order\",\"roleID\":\"role\",\"roleDay\":1,\"roleTotalAmount\":0,\"price\":\"0.99\"}")
    let flow = AnalyticsEventCoordinator()
    flow.onPurchaseSuccess(request, orderId: "unit-order", transactionId: "unit-twd", productInfo: twd)
    precondition(!names().contains("first_day_purchase"))
    let localizedPack = StoreKitManager.ProductInfo(productId: "pbm_tier_2999", priceAmountMicros: 990_000_000, currencyCode: "TWD")
    flow.onPurchaseSuccess(request, orderId: "unit-order", transactionId: "unit-localized-pack", productInfo: localizedPack)
    precondition(names().contains("first_day_purchase"))
    let pack = AnalyticsManager.events.first { $0.0 == "first_day_purchase" }!.1
    precondition(pack.double("total_amount") == 29.99 && pack.string("currency") == "USD")
    let revenues = AnalyticsManager.events.filter { $0.0 == "game_purchase" }.map { $0.1.double("revenue") }
    precondition(revenues == [30, 990])
}
check("all approved tiers map to allowed events; Firebase names are valid") {
    for (sku, event) in AnalyticsNames.purchaseTiers {
        precondition(ProductCatalog.contains(sku) && AnalyticsNames.allowed.contains(event))
    }
    for event in AnalyticsNames.allowed {
        let name = AnalyticsNames.firebaseName(event)
        precondition(name.range(of: "^[A-Za-z][A-Za-z0-9_]{0,39}$", options: .regularExpression) != nil)
    }
}
check("first-day month card requires verified 4.99 SKU, not localized amount or name alone") {
    func buy(_ id: String, day: Int, goods: Int, name: String, info: StoreKitManager.ProductInfo) {
        let request = try! PayRequest(json: JSONObject([
            "cpOrder": id, "roleID": id, "roleDay": day, "roleTotalAmount": 0,
            "goodsId": goods, "goodsName": name, "price": "4.99"
        ]).jsonString())
        AnalyticsEventCoordinator().onPurchaseSuccess(request, orderId: id, transactionId: id, productInfo: info)
    }
    let card = StoreKitManager.ProductInfo(productId: "pbm_tier_499", priceAmountMicros: 150_000_000, currencyCode: "TWD")
    buy("wrong-tier-name", day: 1, goods: 0, name: "月卡", info: twd)
    buy("wrong-tier-id", day: 1, goods: 910007, name: "", info: twd)
    buy("wrong-day", day: 2, goods: 910007, name: "月卡", info: card)
    buy("not-card", day: 1, goods: 123, name: "普通礼包", info: card)
    precondition(!names().contains("month_card_purchase"))
    buy("correct-id", day: 1, goods: 910007, name: "", info: card)
    buy("legacy-name", day: 1, goods: 0, name: "Monthly Card", info: card)
    precondition(names().filter { $0 == "month_card_purchase" }.count == 2)
    let lastPurchase = AnalyticsManager.events.last { $0.0 == "game_purchase" }!.1
    precondition(lastPurchase.double("revenue") == 150 && lastPurchase.string("currency") == "TWD")
}
check("early role events replay once after identity arrives, keeping fields and order") {
    let flow = AnalyticsEventCoordinator()
    flow.onH5Event("complete_avatar", json: "{\"role_name\":\"Test Role\"}")
    flow.onH5Event("NewRole_5minute", json: "{\"current_step\":8}")
    flow.onH5Event("complete_avatar", json: "{\"role_name\":\"Test Role\"}")
    flow.onH5Event("view_content", json: "{}")
    precondition(names().isEmpty)
    flow.onRoleReported("{\"uid\":\"unit-user\",\"role_id\":\"role\",\"server_id\":\"1\",\"role_name\":\"Test Role\"}")
    precondition(names() == ["complete_avatar", "new_role_5minute", "view_content"])
    precondition(AnalyticsManager.events[1].1.int("current_step") == 8)
    precondition(AnalyticsManager.events[2].1.string("server_id") == "1")
    flow.onRoleReported("{\"role_id\":\"role\"}")
    flow.onH5Event("complete_avatar", json: "{}")
    precondition(names().count == 3)
}
check("a later H5 event carrying identity also flushes the pending queue") {
    let flow = AnalyticsEventCoordinator()
    flow.onH5Event("complete_avatar", json: "{}")
    flow.onH5Event("view_content", json: "{\"role_id\":\"role\",\"server_id\":\"1\"}")
    precondition(names() == ["complete_avatar", "view_content"])
}
check("queued tutorial duration uses occurrence time, not delayed replay time") {
    var time: TimeInterval = 1000
    let flow = AnalyticsEventCoordinator(now: { time })
    flow.onH5Event("NewRole_Tutorial", json: "{}")
    time = 1042
    flow.onH5Event("tutorial_complete", json: "{}")
    time = 1100
    flow.onRoleReported("{\"role_id\":\"role\"}")
    precondition(names() == ["tutorial_begin", "tutorial_complete"])
    precondition(AnalyticsManager.events[1].1.int("time_spent") == 42)
}
check("retention aliases queue with correct day offsets") {
    let flow = AnalyticsEventCoordinator()
    for day in [2, 3, 7] {
        flow.onH5Event("KeepEvent", json: JSONObject(["data": day]).jsonString())
    }
    flow.onRoleReported("{\"roleID\":\"role\"}")
    precondition(names() == ["next_day_login", "three_day_login", "seven_day_login"])
    precondition(AnalyticsManager.events.map { $0.1.int("days_diff") } == [1, 2, 6])
}
check("logout and account switches discard unresolved events") {
    let flow = AnalyticsEventCoordinator()
    flow.onAccountSession("{\"uid\":\"account-a\"}")
    flow.onH5Event("complete_avatar", json: "{}")
    flow.onAccountSession("{\"uid\":\"account-b\"}")
    flow.onRoleReported("{\"role_id\":\"role-b\"}")
    precondition(names().isEmpty)
    flow.onLogout()
    flow.onH5Event("tutorial_complete", json: "{}")
    flow.onLogout()
    flow.onRoleReported("{\"role_id\":\"role-c\"}")
    precondition(names().isEmpty)
}
check("late events cannot attach to a different hinted account, server or role name") {
    let flow = AnalyticsEventCoordinator()
    flow.onH5Event("complete_avatar", json: "{\"uid\":\"a\",\"server_id\":\"1\",\"role_name\":\"Old\"}")
    flow.onRoleReported("{\"uid\":\"b\",\"server_id\":\"2\",\"role_id\":\"new\",\"role_name\":\"New\"}")
    precondition(names().isEmpty)
}
check("partial role switches do not inherit the previous role ID") {
    let flow = AnalyticsEventCoordinator()
    flow.onRoleReported("{\"uid\":\"user\",\"server_id\":\"1\",\"role_id\":\"a\",\"role_name\":\"A\"}")
    flow.onH5Event("complete_avatar", json: "{\"role_name\":\"B\"}")
    precondition(names().isEmpty)
    flow.onRoleReported("{\"role_id\":\"b\",\"role_name\":\"B\"}")
    precondition(names() == ["complete_avatar"])
    flow.onRoleReported("{\"role_id\":\"a\",\"role_name\":\"A\"}")
    flow.onH5Event("complete_avatar", json: "{}")
    precondition(names().count == 2)
}
check("expired unidentified events are not assigned to a later unrelated role") {
    var time: TimeInterval = 1000
    let flow = AnalyticsEventCoordinator(now: { time })
    flow.onH5Event("complete_avatar", json: "{}")
    time = 1301
    flow.onRoleReported("{\"role_id\":\"later-role\"}")
    precondition(names().isEmpty)
}
check("stone milestone is still deduplicated across native coordinator restarts") {
    let payload = "{\"uid\":\"user\",\"server_id\":\"1\",\"role_id\":\"role\",\"current_balance\":350000}"
    AnalyticsEventCoordinator().onH5Event("have_300_thousand", json: payload)
    AnalyticsEventCoordinator().onH5Event("have_300_thousand", json: payload)
    precondition(names() == ["have_300_thousand"])
}
check("legacy migration recognizes only the exact native verified transaction") {
    precondition(!AnalyticsEventCoordinator.hasLegacyVerifiedPurchase(transactionId: "unit-transaction"))
    success(AnalyticsEventCoordinator())
    precondition(AnalyticsEventCoordinator.hasLegacyVerifiedPurchase(transactionId: "unit-transaction"))
    precondition(!AnalyticsEventCoordinator.hasLegacyVerifiedPurchase(transactionId: "another-transaction"))
}
check("H5 payment events and checkout cannot create a legacy delivery marker") {
    let flow = AnalyticsEventCoordinator()
    let payload = "{\"transaction_id\":\"unit-transaction\",\"product_id\":\"pbm_tier_099\"}"
    flow.onH5Event("af_purchase", json: payload)
    flow.onH5Event("verified_purchase", json: payload)
    flow.onCheckoutStarted(try! PayRequest(json: "{\"cpOrder\":\"unit-order\",\"price\":\"0.99\"}"), twd)
    precondition(!AnalyticsEventCoordinator.hasLegacyVerifiedPurchase(transactionId: "unit-transaction"))
}
print("Analytics tests passed: \(passed)")
