import Foundation

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

    init(json: String, fallbackUsername: String = "") throws {
        var source = try JSONObject(json: json)
        let resolvedUsername = ShellText.firstNonBlank(
            source.string("username"),
            source.string("user_name"),
            source.string("userName"),
            fallbackUsername
        )
        if !resolvedUsername.isEmpty {
            // Persist the resolved account in the recovery context. Some historical H5 builds
            // omit it from dopay even though the SDK login callback already supplied it.
            source.put("username", resolvedUsername)
        }
        rawJSON = source.jsonString()
        price = ShellText.firstNonBlank(source.string("price"), source.string("amount"))
        roleLevel = source.string("roleLevel")
        roleDay = max(0, source.has("roleDay") ? source.int("roleDay") : source.int("role_day"))
        let total = source.has("roleTotalAmount")
            ? source.double("roleTotalAmount", -1)
            : source.double("role_total_amount", -1)
        roleTotalAmount = total.isFinite && total >= 0 ? total : -1
        cpOrder = source.string("cpOrder")
        goodsId = source.has("goodsId") ? source.int("goodsId") : source.int("goodsID")
        serverId = ShellText.firstNonBlank(source.string("sercerId"), source.string("serverId"))
        serverName = source.string("serverName")
        roleId = ShellText.firstNonBlank(source.string("roleID"), source.string("roleId"))
        roleName = source.string("roleName")
        goodsName = source.string("goodsName")
        notifyUrl = source.string("notify_url")
        productId = ShellText.firstNonBlank(source.string("productId"), source.string("payType_id"))
        payTypeId = source.string("payType_id")
        uid = source.string("uid")
        username = resolvedUsername
        channel = source.string("channel")
        extra = source.string("extra")
        extensionValue = source.string("extension")
        callbackInfo = source.string("callbackInfo")
        clientRequestId = source.string("clientRequestId")
        if cpOrder.isEmpty {
            throw URLError(.cannotParseResponse)
        }
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
    }

    private static let offers: [String: Offer] = [
        "pack-fortify": Offer(id: "pack-fortify", productId: "pbm_tier_099", goodsId: 910001),
        "pack-relic": Offer(id: "pack-relic", productId: "pbm_tier_499", goodsId: 910002),
        "pack-hire": Offer(id: "pack-hire", productId: "pbm_tier_199", goodsId: 910003),
        "pack-scout": Offer(id: "pack-scout", productId: "pbm_tier_299", goodsId: 910004),
        "pack-titan": Offer(id: "pack-titan", productId: "pbm_tier_999", goodsId: 910005)
    ]

    static func offer(_ id: String) -> Offer? {
        offers[id.trimmingCharacters(in: .whitespacesAndNewlines)]
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

    /// The game's reference USD tier, not the amount charged in the storefront's currency.
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

    /// A background old-order callback must not replace the current checkout UI.
    func canPresent(_ order: String?) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return !inFlight || cpOrder == (order ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
