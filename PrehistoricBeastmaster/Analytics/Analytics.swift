import AppTrackingTransparency
import FBSDKCoreKit
import FirebaseAnalytics
import FirebaseCore
import Foundation
import UIKit

enum AnalyticsSDK {
    // This is the app's sole initialization path. Reading Firebase's app()/allApps
    // before configure() produces a misleading error even during a healthy boot.
    private(set) static var isFirebaseConfigured = false
    private(set) static var isConfigured = false
    private static var collectionEnabled = false

    static var isCollectionAllowed: Bool {
        isConfigured && collectionEnabled && ATTrackingManager.trackingAuthorizationStatus == .authorized
    }

    @discardableResult
    static func configure(
        application: UIApplication,
        launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Conservative app policy: both native measurement SDKs require ATT.
        // ATT is not agreement acceptance; never infer it from privacy_accepted.
        guard ATTrackingManager.trackingAuthorizationStatus == .authorized else {
            updateCollection(false)
            return false
        }
        guard !isConfigured else {
            updateCollection(true)
            return false
        }
        // This entry point is used only by the UIApplication lifecycle/ATT flow.
        precondition(Thread.isMainThread)
        // Disabling IDFA is not an ATT exemption. Cross-company tracking must
        // still be assessed separately against the actual SDK/backend data use.
        Settings.shared.isAutoLogAppEventsEnabled = false
        Settings.shared.isAdvertiserIDCollectionEnabled = false
        updateMetaTrackingAuthorization(true)
        _ = ApplicationDelegate.shared.application(
            application,
            didFinishLaunchingWithOptions: launchOptions
        )

        // Never initialize against a different app's Firebase configuration.
        if !isFirebaseConfigured,
           let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path),
           options.bundleID == Bundle.main.bundleIdentifier {
            FirebaseApp.configure(options: options)
            isFirebaseConfigured = true
        }
        isConfigured = true
        updateCollection(true)
        PaymentDebugLog.record("analytics-config firebase=\(isFirebaseConfigured) meta=\(AnalyticsManager().isFacebookConfigured)")
        return true
    }

    private static func updateMetaTrackingAuthorization(_ allowed: Bool) {
        // FBSDK 18 reads ATT itself on iOS 17+; iOS 16 still needs this flag.
        if #available(iOS 17.0, *) { return }
        Settings.shared.isAdvertiserTrackingEnabled = allowed
    }

    private static func updateCollection(_ allowed: Bool) {
        // Before first authorization, do not even touch SDK singleton objects.
        guard isConfigured, collectionEnabled != allowed else { return }
        collectionEnabled = allowed
        updateMetaTrackingAuthorization(allowed)
        AppEvents.shared.flushBehavior = allowed ? .auto : .explicitOnly
        if isFirebaseConfigured { Analytics.setAnalyticsCollectionEnabled(allowed) }
        PaymentDebugLog.record("analytics-collection enabled=\(allowed)")
    }

    static func activate() {
        guard isCollectionAllowed else { return }
        AppEvents.shared.activateApp()
    }
}

enum AnalyticsNames {
    // These are the existing operations tiers, identified by SKU, not by the
    // localized price (e.g. a 0.99 USD tier may cost NT$30 in the TW storefront).
    static let purchaseTiers: [String: String] = [
        "pbm_tier_099": "purchase_tier_0_99", "pbm_tier_199": "purchase_tier_1_99",
        "pbm_tier_299": "purchase_tier_2_99", "pbm_tier_499": "purchase_tier_4_99",
        "pbm_tier_999": "purchase_tier_9_99", "pbm_tier_1499": "purchase_tier_14_99",
        "pbm_tier_1999": "purchase_tier_19_99", "pbm_tier_2499": "purchase_tier_24_99",
        "pbm_tier_2999": "purchase_tier_29_99", "pbm_tier_4999": "purchase_tier_49_99",
        "pbm_tier_5999": "purchase_tier_59_99", "pbm_tier_8999": "purchase_tier_89_99",
        "pbm_tier_9999": "purchase_tier_99_99", "pbm_tier_12999": "purchase_tier_129_99"
    ]

    static func requiresNativePayment(_ normalized: String) -> Bool {
        ["game_purchase", "begin_checkout", "first_purchase", "first_day_purchase",
         "month_card_purchase"].contains(normalized) || normalized.hasPrefix("purchase_tier_")
    }

    static let allowed: Set<String> = [
        "mini_game_open", "mini_game_start", "mini_game_leave", "mini_game_complete",
        "mini_game_leaderboard_open", "online_game_open", "game_loading_complete",
        "complete_registration", "view_content", "complete_avatar", "tutorial_begin",
        "new_role_5minute", "tutorial_complete", "first_purchase", "game_purchase",
        "begin_checkout", "first_day_purchase", "retention_login", "next_day_login",
        "three_day_login", "seven_day_login", "month_card_purchase",
        "have_300_thousand", "add_to_wishlist", "purchase_tier_0_99",
        "purchase_tier_1_99", "purchase_tier_2_99", "purchase_tier_4_99",
        "purchase_tier_9_99", "purchase_tier_14_99", "purchase_tier_19_99",
        "purchase_tier_24_99", "purchase_tier_29_99", "purchase_tier_49_99",
        "purchase_tier_59_99", "purchase_tier_89_99", "purchase_tier_99_99",
        "purchase_tier_129_99"
    ]

    static func normalize(_ eventName: String) -> String {
        switch eventName.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "Loading_completed": return "game_loading_complete"
        case "View_Content", "view_content": return "view_content"
        case "NewRole_Tutorial": return "tutorial_begin"
        case "NewRole_5minute": return "new_role_5minute"
        case "Tutorial_Completed", "tutorial_complete": return "tutorial_complete"
        case "af_purchase": return "game_purchase"
        case "Initiate_Checkout": return "begin_checkout"
        case "NewRole_Pack": return "first_day_purchase"
        case "KeepEvent": return "retention_login"
        case "3_days_login": return "three_day_login"
        case "7_days_login": return "seven_day_login"
        case "NewRole_Month": return "month_card_purchase"
        case "Add_To_Wishlist": return "add_to_wishlist"
        case "pay0_99": return "purchase_tier_0_99"
        case "pay1_99": return "purchase_tier_1_99"
        case "pay2_99": return "purchase_tier_2_99"
        case "pay4_99": return "purchase_tier_4_99"
        case "pay9_99": return "purchase_tier_9_99"
        case "pay14_99": return "purchase_tier_14_99"
        case "pay19_99": return "purchase_tier_19_99"
        case "pay24_99": return "purchase_tier_24_99"
        case "pay29_99": return "purchase_tier_29_99"
        case "pay49_99": return "purchase_tier_49_99"
        case "pay59_99": return "purchase_tier_59_99"
        case "pay89_99": return "purchase_tier_89_99"
        case "pay99_99": return "purchase_tier_99_99"
        case "PAY129_99": return "purchase_tier_129_99"
        default: return eventName.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    static func operationsName(_ eventName: String) -> String {
        switch eventName {
        case "game_loading_complete": return "Loading_completed"
        case "tutorial_begin": return "NewRole_Tutorial"
        case "new_role_5minute": return "NewRole_5minute"
        case "game_purchase": return "af_purchase"
        case "begin_checkout": return "Initiate_Checkout"
        case "first_day_purchase": return "NewRole_Pack"
        case "three_day_login": return "3_days_login"
        case "seven_day_login": return "7_days_login"
        case "month_card_purchase": return "NewRole_Month"
        case "add_to_wishlist": return "Add_To_Wishlist"
        case "purchase_tier_0_99": return "pay0_99"
        case "purchase_tier_1_99": return "pay1_99"
        case "purchase_tier_2_99": return "pay2_99"
        case "purchase_tier_4_99": return "pay4_99"
        case "purchase_tier_9_99": return "pay9_99"
        case "purchase_tier_14_99": return "pay14_99"
        case "purchase_tier_19_99": return "pay19_99"
        case "purchase_tier_24_99": return "pay24_99"
        case "purchase_tier_29_99": return "pay29_99"
        case "purchase_tier_49_99": return "pay49_99"
        case "purchase_tier_59_99": return "pay59_99"
        case "purchase_tier_89_99": return "pay89_99"
        case "purchase_tier_99_99": return "pay99_99"
        case "purchase_tier_129_99": return "PAY129_99"
        default: return eventName
        }
    }

    static func firebaseName(_ eventName: String) -> String {
        switch eventName {
        case "three_day_login": return "day_3_login"
        case "seven_day_login": return "day_7_login"
        default: return operationsName(eventName)
        }
    }
}

final class AnalyticsManager {
    private static let longFields: Set<String> = [
        "duration", "score", "elapsed", "eggs", "best", "step_id", "current_step",
        "time_spent", "days_diff", "current_balance"
    ]
    private static let doubleFields: Set<String> = ["revenue", "price", "total_amount", "value"]
    private static let stringFields: Set<String> = [
        "method", "server_id", "role_name", "product_id", "transaction_id", "currency"
    ]

    var isFirebaseConfigured: Bool { AnalyticsSDK.isFirebaseConfigured }
    var isFacebookConfigured: Bool {
        !(Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func logEvent(_ suppliedName: String, json: String?) {
        // Do not enqueue or replay events generated before consent.
        guard AnalyticsSDK.isCollectionAllowed else { return }
        var eventName = suppliedName
        let source = JSONObject.parse(json)
        if suppliedName == "legacy_af_event" {
            eventName = source.string("type")
        }
        let normalized = AnalyticsNames.normalize(eventName)
        guard AnalyticsNames.allowed.contains(normalized) else {
            NSLog("[PBM-ANALYTICS] Dropped event outside allowlist: %@", safeName(normalized))
            return
        }

        let fields = safeFields(source)
        if isFirebaseConfigured {
            Analytics.logEvent(AnalyticsNames.firebaseName(normalized), parameters: fields)
        }
        if isFacebookConfigured {
            logFacebook(normalized, fields: fields)
        }
        NSLog("[PBM-ANALYTICS] event=%@", AnalyticsNames.operationsName(normalized))
        // Local diagnostics record routing only, never user fields or credentials.
        // SDK submission is not proof of dashboard delivery.
        PaymentDebugLog.record("analytics-enqueued event=\(AnalyticsNames.operationsName(normalized)) firebase=\(isFirebaseConfigured) meta=\(isFacebookConfigured)")
    }

    private func logFacebook(_ eventName: String, fields: [String: Any]) {
        let custom = typedFacebookParameters(fields)
        AppEvents.shared.logEvent(
            AppEvents.Name(AnalyticsNames.operationsName(eventName)),
            parameters: custom
        )

        let standard = facebookStandardParameters(eventName, fields: fields)
        switch eventName {
        case "complete_registration":
            AppEvents.shared.logEvent(.completedRegistration, parameters: standard)
        case "view_content":
            AppEvents.shared.logEvent(.viewedContent, parameters: standard)
        case "tutorial_complete":
            AppEvents.shared.logEvent(.completedTutorial, parameters: standard)
        case "add_to_wishlist":
            AppEvents.shared.logEvent(.addedToWishlist, parameters: standard)
        case "begin_checkout":
            AppEvents.shared.logEvent(
                .initiatedCheckout,
                valueToSum: metric(fields, "price", "value") ?? 0,
                parameters: standard
            )
        case "game_purchase":
            AppEvents.shared.logEvent(
                .purchased,
                valueToSum: metric(fields, "revenue", "value") ?? 0,
                parameters: standard
            )
        default:
            break
        }
        AppEvents.shared.flush()
    }

    private func facebookStandardParameters(
        _ eventName: String,
        fields: [String: Any]
    ) -> [AppEvents.ParameterName: Any] {
        var result: [AppEvents.ParameterName: Any] = [:]
        if let productId = fields["product_id"] as? String {
            result[AppEvents.ParameterName("fb_content_id")] = productId
            result[AppEvents.ParameterName("fb_content_type")] = "product"
        }
        if let currency = fields["currency"] as? String {
            result[AppEvents.ParameterName("fb_currency")] = currency.uppercased()
        }
        if let transactionId = fields["transaction_id"] as? String {
            result[AppEvents.ParameterName("fb_order_id")] = transactionId
        }
        if eventName == "complete_registration", let method = fields["method"] as? String {
            result[AppEvents.ParameterName("fb_registration_method")] = method
        }
        if eventName == "tutorial_complete" {
            result[AppEvents.ParameterName("fb_success")] = "1"
        }
        return result
    }

    private func typedFacebookParameters(_ fields: [String: Any]) -> [AppEvents.ParameterName: Any] {
        Dictionary(uniqueKeysWithValues: fields.map { (AppEvents.ParameterName($0.key), $0.value) })
    }

    private func metric(_ fields: [String: Any], _ keys: String...) -> Double? {
        for key in keys {
            if let number = fields[key] as? NSNumber {
                let value = number.doubleValue
                if value.isFinite && value >= 0 { return value }
            }
        }
        return nil
    }

    private func safeFields(_ source: JSONObject) -> [String: Any] {
        var result: [String: Any] = [:]
        for key in Self.longFields where source.has(key) {
            let value = max(0, min(1_000_000_000_000, source.int64(key)))
            result[key] = value
        }
        for key in Self.doubleFields where source.has(key) {
            let value = source.double(key)
            if value.isFinite && value >= 0 {
                result[key] = min(1_000_000_000, value)
            }
        }
        for key in Self.stringFields {
            let value = source.string(key).trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty {
                result[key] = String(value.prefix(100))
            }
        }
        if source.has("is_first_day") {
            result["is_first_day"] = source.bool("is_first_day") ? 1 : 0
        }
        return result
    }

    private func safeName(_ value: String) -> String {
        String(value.filter { $0.isLetter || $0.isNumber || $0 == "_" }.prefix(40))
    }
}

enum AnalyticsMilestoneRules {
    static let firstDayPackUSD = 29.99
    static let monthCardGoodsId = 910_007

    static func isFirstPurchase(_ previousTotal: Double) -> Bool {
        previousTotal.isFinite && previousTotal >= 0 && previousTotal < 0.005
    }

    static func crossesFirstDayPack(previousTotal: Double, paidAmount: Double, roleDay: Int) -> Bool {
        roleDay == 1 && previousTotal.isFinite && previousTotal >= 0 && paidAmount.isFinite
            && paidAmount > 0 && previousTotal + 0.0001 < firstDayPackUSD
            && previousTotal + paidAmount + 0.0001 >= firstDayPackUSD
    }

    static func isFirstDayMonthCard(roleDay: Int, goodsId: Int, goodsName: String, productId: String) -> Bool {
        // Match the verified reference SKU, not its localized TWD price or H5 price.
        guard roleDay == 1, productId == "pbm_tier_499" else { return false }
        if goodsId == monthCardGoodsId { return true }
        let normalized = goodsName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized.contains("monthcard") || normalized.contains("month card")
            || normalized.contains("monthly card") || normalized.contains("月卡")
    }
}

final class AnalyticsEventCoordinator {
    /// Upgrade bridge for builds before the payment completion journal existed.
    /// This exact native flag is written only by onPurchaseSuccess, after the
    /// backend confirms consume=true. Generic H5 events/SDK queues are NOT proof.
    /// Consumers may suppress/re-finish that transaction, never grant content.
    static func hasLegacyVerifiedPurchase(transactionId: String) -> Bool {
        guard !transactionId.isEmpty else { return false }
        let key = "analytics_event_\(ShellText.sha256Hex("purchase|\(transactionId)"))_verified_purchase"
        return UserDefaults.standard.bool(forKey: key)
    }

    private let manager = AnalyticsManager()
    private let store = UserDefaults.standard
    private var sessionEvents = Set<String>()
    private var currentRole = RoleContext()
    private var currentAccount = ""
    private var sessionAccount = ""
    private let now: () -> TimeInterval
    private var pendingRoleEvents: [PendingRoleEvent] = []
    private static let pendingLifetime: TimeInterval = 300
    private static let roleEventNames: Set<String> = [
        "view_content", "complete_avatar", "new_role_5minute", "next_day_login",
        "three_day_login", "seven_day_login", "tutorial_complete", "tutorial_begin",
        "have_300_thousand"
    ]

    init(now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
        self.now = now
    }

    func onLogout() {
        currentRole = RoleContext()
        currentAccount = ""
        sessionAccount = ""
        pendingRoleEvents.removeAll()
        sessionEvents.removeAll()
    }

    var isFirebaseConfigured: Bool { manager.isFirebaseConfigured }
    var isFacebookConfigured: Bool { manager.isFacebookConfigured }

    func onAccountSession(_ json: String) {
        let source = JSONObject.parse(json)
        let account = ShellText.firstNonBlank(
            source.string("uid"), source.string("account_id"), source.string("user_name"),
            source.string("username"), source.string("userName")
        )
        guard !account.isEmpty else { return }
        if (!sessionAccount.isEmpty && sessionAccount != account)
            || (!source.string("uid").isEmpty && !currentRole.uid.isEmpty
                && source.string("uid") != currentRole.uid) {
            onLogout()
        }
        sessionAccount = account
        currentAccount = account
    }

    func onRoleReported(_ json: String) {
        updateRole(JSONObject.parse(json))
    }

    func onH5Event(_ suppliedName: String, json: String?) {
        let fields = JSONObject.parse(json)
        var eventName = suppliedName.trimmingCharacters(in: .whitespacesAndNewlines)
        if eventName == "legacy_af_event" { eventName = fields.string("type") }
        guard !eventName.isEmpty else { return }
        let normalized = AnalyticsNames.normalize(eventName)

        guard !AnalyticsNames.requiresNativePayment(normalized) else {
            PaymentDebugLog.record("analytics-blocked source=h5 reason=native-payment-required")
            return
        }
        guard AnalyticsNames.allowed.contains(normalized) else { return }
        updateRole(fields)
        processH5Event(normalized, fields: fields, occurredAt: now())
    }

    private func processH5Event(_ normalized: String, fields suppliedFields: JSONObject, occurredAt: TimeInterval) {
        var fields = suppliedFields
        if Self.roleEventNames.contains(normalized), !currentRole.hasIdentity {
            pendingRoleEvents.removeAll { now() - $0.occurredAt > Self.pendingLifetime }
            if pendingRoleEvents.count >= 64 { pendingRoleEvents.removeFirst() }
            pendingRoleEvents.append(PendingRoleEvent(
                name: normalized, fields: fields, occurredAt: occurredAt,
                roleHint: RoleContext(fields, fallback: currentRole), account: sessionAccount
            ))
            return
        }

        switch normalized {
        case "game_loading_complete":
            emitSessionOnce(normalized, fields: fields)
        case "complete_registration":
            fields.put("method", registrationMethod(fields.string("method")))
            let account = ShellText.firstNonBlank(fields.string("account_id"), currentAccount)
            emitOnce(scope: account.isEmpty ? "session-registration" : "account|\(account)",
                     eventName: normalized, fields: fields)
        case "view_content":
            mergeCurrentRole(&fields)
            emitSessionOnce("\(normalized)|\(currentRole.scope)", eventName: normalized, fields: fields)
        case "complete_avatar", "new_role_5minute", "next_day_login", "three_day_login",
             "seven_day_login", "tutorial_complete", "tutorial_begin", "have_300_thousand":
            mergeCurrentRole(&fields)
            applyDefaults(normalized, fields: &fields, occurredAt: occurredAt)
            if normalized != "have_300_thousand" || fields.double("current_balance") >= 300_000 {
                emitRoleOnce(normalized, fields: fields)
            }
        case "retention_login":
            emitRetention(fields, occurredAt: occurredAt)
        default:
            emit(normalized, fields: fields)
        }
    }

    func onCheckoutStarted(_ request: PayRequest, _ productInfo: StoreKitManager.ProductInfo) {
        updateRole(request)
        emit("begin_checkout", fields: purchaseFields(request, productInfo, transactionId: "", completed: false))
    }

    func onPurchaseSuccess(
        _ request: PayRequest?,
        orderId: String,
        transactionId: String,
        productInfo: StoreKitManager.ProductInfo
    ) {
        if let request { updateRole(request) }
        let resolvedId = transactionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !resolvedId.isEmpty else { return }
        guard productInfo.priceAmountMicros > 0,
              productInfo.currencyCode.count == 3,
              ProductCatalog.contains(productInfo.productId) else {
            PaymentDebugLog.record("analytics-purchase-skipped reason=incomplete-product-info")
            return
        }
        // A recovered transaction must not be counted again after changing roles.
        let scope = "purchase|\(resolvedId)"
        guard markOnce(scope: scope, eventName: "verified_purchase") else { return }
        // Respect receipts already counted by the previous role-scoped version.
        let legacyScope = "purchase|\(ShellText.firstNonBlank(currentRole.scope, currentAccount, request?.username))|\(resolvedId)"
        guard !store.bool(forKey: stateKey(scope: legacyScope, eventName: "verified_purchase")) else { return }
        let purchase = purchaseFields(request, productInfo, transactionId: resolvedId, completed: true)
        emit("game_purchase", fields: purchase)
        if let tier = AnalyticsNames.purchaseTiers[productInfo.productId] {
            emit(tier, fields: purchase)
        }

        guard let request, currentRole.hasIdentity else { return }
        let previousTotal = request.roleTotalAmount
        if AnalyticsMilestoneRules.isFirstPurchase(previousTotal) {
            var first = purchase
            first.remove("transaction_id")
            emitRoleOnce("first_purchase", fields: first)
        }
        // Revenue retains the actual storefront amount/currency. The game's
        // USD milestone instead uses the verified SKU's fixed reference tier.
        if let referenceUSD = ProductCatalog.referenceUSD(forProductId: productInfo.productId), AnalyticsMilestoneRules.crossesFirstDayPack(
            previousTotal: previousTotal, paidAmount: referenceUSD, roleDay: request.roleDay
        ) {
            var pack = roleFields()
            pack.put("total_amount", roundMoney(previousTotal + referenceUSD))
            pack.put("currency", "USD")
            emitRoleOnce("first_day_purchase", fields: pack)
        }
        if AnalyticsMilestoneRules.isFirstDayMonthCard(
            roleDay: request.roleDay, goodsId: request.goodsId, goodsName: request.goodsName,
            productId: productInfo.productId
        ) {
            var month = roleFields()
            month.put("is_first_day", true)
            emitRoleOnce("month_card_purchase", fields: month)
        }
    }

    private func purchaseFields(
        _ request: PayRequest?,
        _ productInfo: StoreKitManager.ProductInfo,
        transactionId: String,
        completed: Bool
    ) -> JSONObject {
        var fields = JSONObject()
        fields.put("product_id", ShellText.firstNonBlank(productInfo.productId, request?.resolvedProductId()))
        let amount = productInfo.priceAmountMicros > 0
            ? Double(productInfo.priceAmountMicros) / 1_000_000
            : parseAmount(request?.price ?? "")
        if amount >= 0 { fields.put(completed ? "revenue" : "price", roundMoney(amount)) }
        fields.put("currency", ShellText.firstNonBlank(productInfo.currencyCode, amount >= 0 ? "USD" : ""))
        fields.put("transaction_id", transactionId)
        mergeCurrentRole(&fields)
        return fields
    }

    private func applyDefaults(_ eventName: String, fields: inout JSONObject, occurredAt: TimeInterval) {
        switch eventName {
        case "tutorial_begin":
            if !fields.has("step_id") { fields.put("step_id", 1) }
            if currentRole.hasIdentity {
                let key = stateKey(scope: currentRole.scope, eventName: "tutorial_start_ms")
                if store.object(forKey: key) == nil { store.set(occurredAt, forKey: key) }
            }
        case "new_role_5minute":
            if !fields.has("current_step") { fields.put("current_step", 0) }
        case "tutorial_complete":
            if !fields.has("time_spent"), currentRole.hasIdentity {
                let key = stateKey(scope: currentRole.scope, eventName: "tutorial_start_ms")
                let started = store.double(forKey: key)
                if started > 0 { fields.put("time_spent", max(0, Int(occurredAt - started))) }
            }
            if !fields.has("time_spent") { fields.put("time_spent", 0) }
        case "next_day_login": if !fields.has("days_diff") { fields.put("days_diff", 1) }
        case "three_day_login": if !fields.has("days_diff") { fields.put("days_diff", 2) }
        case "seven_day_login": if !fields.has("days_diff") { fields.put("days_diff", 6) }
        default: break
        }
    }

    private func emitRetention(_ fields: JSONObject, occurredAt: TimeInterval) {
        let day = Int((fields.has("data") ? fields.double("data") : fields.double("value")).rounded())
        let mapping = [2: ("next_day_login", 1), 3: ("three_day_login", 2), 7: ("seven_day_login", 6)]
        guard let (name, diff) = mapping[day] else { return }
        var next = fields
        next.put("days_diff", diff)
        processH5Event(name, fields: next, occurredAt: occurredAt)
    }

    private func updateRole(_ source: JSONObject) {
        let candidate = RoleContext(source, fallback: currentRole)
        // Keep partial identity while loading; never inherit another role's ID/name.
        currentRole = candidate
        let account = ShellText.firstNonBlank(
            source.string("account_id"), source.string("uid"), source.string("user_name"),
            source.string("username")
        )
        if !account.isEmpty { currentAccount = account }
        flushPendingRoleEvents()
    }

    private func flushPendingRoleEvents() {
        guard currentRole.hasIdentity else { return }
        let pending = pendingRoleEvents
        pendingRoleEvents.removeAll()
        for event in pending {
            guard now() - event.occurredAt <= Self.pendingLifetime else { continue }
            guard event.account.isEmpty || event.account == sessionAccount else { continue }
            guard event.roleHint.isCompatible(with: currentRole) else { continue }
            processH5Event(event.name, fields: event.fields, occurredAt: event.occurredAt)
        }
    }

    private func updateRole(_ request: PayRequest) {
        var fields = JSONObject()
        fields.put("uid", request.uid)
        fields.put("server_id", request.serverId)
        fields.put("server_name", request.serverName)
        fields.put("role_id", request.roleId)
        fields.put("role_name", request.roleName)
        updateRole(fields)
        if !request.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            currentAccount = request.username.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private func mergeCurrentRole(_ fields: inout JSONObject) {
        guard currentRole.hasIdentity else { return }
        if fields.string("server_id").isEmpty { fields.put("server_id", currentRole.serverId) }
        if fields.string("role_name").isEmpty { fields.put("role_name", currentRole.roleName) }
        if fields.string("server_name").isEmpty { fields.put("server_name", currentRole.serverName) }
    }

    private func roleFields() -> JSONObject {
        var fields = JSONObject()
        mergeCurrentRole(&fields)
        return fields
    }

    private func emitSessionOnce(_ key: String, eventName: String? = nil, fields: JSONObject) {
        guard sessionEvents.insert(key).inserted else { return }
        emit(eventName ?? key, fields: fields)
    }

    private func emitRoleOnce(_ eventName: String, fields: JSONObject) {
        guard currentRole.hasIdentity else { return }
        emitOnce(scope: currentRole.scope, eventName: eventName, fields: fields)
    }

    private func emitOnce(scope: String, eventName: String, fields: JSONObject) {
        if markOnce(scope: scope, eventName: eventName) { emit(eventName, fields: fields) }
    }

    private func markOnce(scope: String, eventName: String) -> Bool {
        let key = stateKey(scope: scope, eventName: eventName)
        if store.bool(forKey: key) { return false }
        store.set(true, forKey: key)
        return true
    }

    private func emit(_ eventName: String, fields: JSONObject) {
        manager.logEvent(eventName, json: fields.jsonString())
    }

    private func stateKey(scope: String, eventName: String) -> String {
        "analytics_event_\(ShellText.sha256Hex(scope.isEmpty ? "session" : scope))_\(eventName)"
    }

    private func registrationMethod(_ raw: String) -> String {
        let value = raw.lowercased()
        if value.contains("facebook") || value == "fb" { return "FB" }
        if value.contains("google") { return "Google" }
        if value.contains("apple") || value.contains("ios") { return "Apple" }
        return "Guest"
    }

    private func parseAmount(_ raw: String) -> Double {
        let cleaned = raw.filter { $0.isNumber || $0 == "." }
        guard let value = Double(cleaned), value.isFinite, value >= 0 else { return -1 }
        return value
    }

    private func roundMoney(_ value: Double) -> Double { (value * 100).rounded() / 100 }

    private struct PendingRoleEvent {
        let name: String
        let fields: JSONObject
        let occurredAt: TimeInterval
        let roleHint: RoleContext
        let account: String
    }

    private struct RoleContext {
        let uid: String
        let serverId: String
        let serverName: String
        let roleId: String
        let roleName: String

        init() { uid = ""; serverId = ""; serverName = ""; roleId = ""; roleName = "" }

        init(_ source: JSONObject, fallback: RoleContext) {
            let nextUID = ShellText.firstNonBlank(source.string("uid"))
            let nextServer = ShellText.firstNonBlank(source.string("server_id"), source.string("serverId"), source.string("sercerId"))
            let nextID = ShellText.firstNonBlank(source.string("role_id"), source.string("roleID"), source.string("roleId"))
            let nextName = ShellText.firstNonBlank(source.string("role_name"), source.string("roleName"))
            let changedAccount = !nextUID.isEmpty && !fallback.uid.isEmpty && nextUID != fallback.uid
            let changedServer = !nextServer.isEmpty && !fallback.serverId.isEmpty && nextServer != fallback.serverId
            let changedID = !nextID.isEmpty && !fallback.roleId.isEmpty && nextID != fallback.roleId
            let awaitingDifferentRole = nextID.isEmpty && !nextName.isEmpty
                && !fallback.roleName.isEmpty && nextName != fallback.roleName
            let changedRole = changedAccount || changedServer || changedID || awaitingDifferentRole
            uid = ShellText.firstNonBlank(nextUID, fallback.uid)
            serverId = ShellText.firstNonBlank(nextServer, changedAccount ? "" : fallback.serverId)
            serverName = ShellText.firstNonBlank(source.string("server_name"), source.string("serverName"),
                                                changedAccount || changedServer ? "" : fallback.serverName)
            roleId = ShellText.firstNonBlank(nextID, changedRole ? "" : fallback.roleId)
            roleName = ShellText.firstNonBlank(nextName, changedRole ? "" : fallback.roleName)
        }

        func isCompatible(with other: RoleContext) -> Bool {
            let pairs = [(uid, other.uid), (serverId, other.serverId), (roleId, other.roleId)]
            guard pairs.allSatisfy({ $0.0.isEmpty || $0.1.isEmpty || $0.0 == $0.1 }) else { return false }
            // Names are only a loading-time hint, never a replacement for a role ID.
            return hasIdentity || roleName.isEmpty || other.roleName.isEmpty || roleName == other.roleName
        }

        var hasIdentity: Bool { !roleId.isEmpty }
        var scope: String { hasIdentity ? "\(uid)|\(serverId)|\(roleId)" : "" }
    }
}
