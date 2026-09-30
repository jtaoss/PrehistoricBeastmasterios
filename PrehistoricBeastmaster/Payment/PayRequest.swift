import Foundation

enum PaymentDestination: String {
    case localAssets
    case webActions
}

enum PaymentCallback: String {
    case legacy
    case actionSync
}

struct PayRequest {
    let rawJSON: String
    let price: String
    let roleLevel: String
    let roleDay: Int
    let roleTotalAmount: Double
    let cpOrder: String
    let goodsId: Int
    let serverId: String
    let serverName: String
    let roleId: String
    let roleName: String
    let goodsName: String
    let notifyUrl: String
    let productId: String
    let payTypeId: String
    let uid: String
    let username: String
    let channel: String
    let extra: String
    let extensionValue: String
    let callbackInfo: String
    let clientRequestId: String
    let destination: PaymentDestination
    let paymentCallback: PaymentCallback
    let resultAccountId: String
    let callbackRequestId: String

    init(json: String, fallbackUsername: String = "") throws {
        var source = try JSONObject(json: json)
        let resolvedUsername = ShellText.firstNonBlank(
            source.string("username"),
            source.string("user_name"),
            source.string("userName"),
            fallbackUsername
        )
        if !resolvedUsername.isEmpty {
            source.put("username", resolvedUsername)
        }
        rawJSON = source.jsonString()
        price = ShellText.firstNonBlank(source.string("price"), source.string("amount"), source.string("money"))
        roleLevel = source.string("roleLevel")
        roleDay = max(0, source.has("roleDay") ? source.int("roleDay") : source.int("role_day"))
        let total = source.has("roleTotalAmount")
            ? source.double("roleTotalAmount", -1)
            : source.double("role_total_amount", -1)
        roleTotalAmount = total.isFinite && total >= 0 ? total : -1
        cpOrder = ShellText.firstNonBlank(
            source.string("cpOrder"),
            source.string("cp_order"),
            source.string("orderId"),
            source.string("order_id"),
            source.string("orderNo"),
            source.string("order_no"),
            source.string("clientRequestId")
        )
        goodsId = source.has("goodsId") ? source.int("goodsId") : (source.has("goodsID") ? source.int("goodsID") : source.int("goods_id"))
        serverId = ShellText.firstNonBlank(source.string("sercerId"), source.string("serverId"), source.string("server_id"))
        serverName = ShellText.firstNonBlank(source.string("serverName"), source.string("server_name"))
        roleId = ShellText.firstNonBlank(source.string("roleID"), source.string("roleId"), source.string("role_id"))
        roleName = ShellText.firstNonBlank(source.string("roleName"), source.string("role_name"))
        goodsName = ShellText.firstNonBlank(source.string("goodsName"), source.string("goods_name"))
        notifyUrl = ShellText.firstNonBlank(source.string("notify_url"), source.string("notifyUrl"))
        productId = ShellText.firstNonBlank(
            source.string("productId"),
            source.string("product_id"),
            source.string("payType_id"),
            source.string("payTypeId")
        )
        payTypeId = ShellText.firstNonBlank(source.string("payType_id"), source.string("payTypeId"))
        uid = source.string("uid")
        username = resolvedUsername
        channel = source.string("channel")
        extra = source.string("extra")
        extensionValue = ShellText.firstNonBlank(source.string("extension"), source.string("ext"))
        callbackInfo = source.string("callbackInfo")
        clientRequestId = source.string("clientRequestId")
        guard !source.has("nativePaymentDestination") || PaymentDestination(rawValue: source.string("nativePaymentDestination")) != nil,
              !source.has("nativePaymentCallback") || PaymentCallback(rawValue: source.string("nativePaymentCallback")) != nil else {
            throw URLError(.cannotParseResponse)
        }
        let historicalLocal = UUID(uuidString: clientRequestId) != nil
            && MiniGameProductCatalog.matches(goodsId: goodsId, productId: productId)
        destination = PaymentDestination(rawValue: source.string("nativePaymentDestination"))
            ?? (historicalLocal ? .localAssets : .webActions)
        paymentCallback = PaymentCallback(rawValue: source.string("nativePaymentCallback")) ?? .legacy
        resultAccountId = source.string("nativePaymentAccount")
        callbackRequestId = source.string("nativePaymentRequestId")
        if cpOrder.isEmpty {
            throw URLError(.cannotParseResponse)
        }
    }

    func routed(to destination: PaymentDestination, accountId: String,
                callback: PaymentCallback = .legacy, requestId: String = "") throws -> PayRequest {
        var source = try JSONObject(json: rawJSON)
        source.put("nativePaymentDestination", destination.rawValue)
        source.put("nativePaymentAccount", accountId)
        source.put("nativePaymentCallback", callback.rawValue)
        source.put("nativePaymentRequestId", requestId)
        return try PayRequest(json: source.jsonString())
    }


    func resolvedProductId() -> String {
        if ProductCatalog.contains(productId) {
            return productId
        }
        return ProductCatalog.productId(forPrice: price)
    }

    func legacyExtension() -> String {
        ShellText.firstNonBlank(extensionValue, extra, callbackInfo)
    }
}

enum MiniGameProductCatalog {
    struct Offer {
        let id: String
        let productId: String
        let goodsId: Int
        let pearlAmount: Int
        let grantsLimitedSkin: Bool

        init(id: String, productId: String, goodsId: Int,
             pearlAmount: Int = 0, grantsLimitedSkin: Bool = false) {
            self.id = id
            self.productId = productId
            self.goodsId = goodsId
            self.pearlAmount = pearlAmount
            self.grantsLimitedSkin = grantsLimitedSkin
        }
    }

    private static let offers: [String: Offer] = [
        "pack-fortify": Offer(id: "pack-fortify", productId: "pbm_tier_099", goodsId: 910001),
        "pack-relic": Offer(id: "pack-relic", productId: "pbm_tier_499", goodsId: 910002),
        "pack-hire": Offer(id: "pack-hire", productId: "pbm_tier_199", goodsId: 910003),
        "pack-scout": Offer(id: "pack-scout", productId: "pbm_tier_299", goodsId: 910004),
        "pack-titan": Offer(id: "pack-titan", productId: "pbm_tier_999", goodsId: 910005),
        "pearl-pouch-60": Offer(id: "pearl-pouch-60", productId: "pbm_tier_099", goodsId: 920001, pearlAmount: 60),
        "pearl-cache-350-skin": Offer(id: "pearl-cache-350-skin", productId: "pbm_tier_499", goodsId: 920002, pearlAmount: 350, grantsLimitedSkin: true)
    ]

    static func offer(_ id: String) -> Offer? {
        offers[id.trimmingCharacters(in: .whitespacesAndNewlines)]
    }

    static func matches(goodsId: Int, productId: String) -> Bool {
        offers.values.contains { $0.goodsId == goodsId && $0.productId == productId }
    }

    static var pearlOffers: [Offer] {
        offers.values.filter { $0.pearlAmount > 0 }.sorted { $0.pearlAmount < $1.pearlAmount }
    }

    static func pearlOffer(goodsId: Int, productId: String) -> Offer? {
        offers.values.first {
            $0.pearlAmount > 0 && $0.goodsId == goodsId && $0.productId == productId
        }
    }
}

enum ProductCatalog {
    private static let productsByCents: [Int64: String] = [
        99: "pbm_tier_099",
        199: "pbm_tier_199",
        299: "pbm_tier_299",
        399: "pbm_tier_399",
        499: "pbm_tier_499",
        999: "pbm_tier_999",
        1499: "pbm_tier_1499",
        1999: "pbm_tier_1999",
        2499: "pbm_tier_2499",
        2999: "pbm_tier_2999",
        3499: "pbm_tier_3499",
        4999: "pbm_tier_4999",
        5999: "pbm_tier_5999",
        8999: "pbm_tier_8999",
        9999: "pbm_tier_9999",
        12999: "pbm_tier_12999",
        30000: "pbm_tier_30000",
        50000: "pbm_tier_50000",
        99999: "pbm_tier_100000"
    ]

    static var allProductIds: [String] {
        Array(productsByCents.values)
    }

    static func referenceUSD(forProductId productId: String) -> Double? {
        productsByCents.first(where: { $0.value == productId }).map { Double($0.key) / 100 }
    }

    static func productId(forPrice rawPrice: String) -> String {
        let trimmed = rawPrice.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let amount = Decimal(string: trimmed) else {
            return ""
        }
        var cents = amount * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &cents, 0, .plain)
        let centsValue = NSDecimalNumber(decimal: rounded).int64Value
        return productsByCents[centsValue] ?? ""
    }

    static func contains(_ productId: String) -> Bool {
        let trimmed = productId.trimmingCharacters(in: .whitespacesAndNewlines)
        return productsByCents.values.contains(trimmed)
    }
}

final class PaymentRequestGate {
    private let lock = NSLock()
    private var inFlight = false
    private var cpOrder = ""

    func tryStart(_ nextCpOrder: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if inFlight {
            return false
        }
        inFlight = true
        cpOrder = nextCpOrder.trimmingCharacters(in: .whitespacesAndNewlines)
        return true
    }

    func finish(_ finishedCpOrder: String) {
        lock.lock()
        defer { lock.unlock() }
        guard inFlight else { return }
        let normalized = finishedCpOrder.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.isEmpty && !cpOrder.isEmpty {
            return
        }
        if !normalized.isEmpty && !cpOrder.isEmpty && cpOrder != normalized {
            return
        }
        inFlight = false
        cpOrder = ""
    }

    func canPresent(_ order: String?) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return !inFlight || cpOrder == (order ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
