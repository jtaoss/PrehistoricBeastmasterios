import StoreKit
import UIKit

@MainActor
protocol GameShopViewControllerDelegate: AnyObject {
    func gameShop(_ controller: GameShopViewController, purchase offer: MiniGameProductCatalog.Offer)
}

@MainActor
final class GameShopViewController: UIViewController {
    weak var delegate: GameShopViewControllerDelegate?

    private let economy: GameEconomyManager
    private let offers = MiniGameProductCatalog.pearlOffers
    private let card = UIView()
    private let balanceLabel = UILabel()
    private let statusLabel = UILabel()
    private let productsStack = UIStackView()
    private var rows: [String: ProductRow] = [:]
    private var productTask: Task<Void, Never>?
    private var activeOfferId: String?
    private var toastView: UIView?

    init(economy: GameEconomyManager? = nil) {
        self.economy = economy ?? .shared
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .overFullScreen
        modalTransitionStyle = .crossDissolve
    }

    required init?(coder: NSCoder) {
        economy = .shared
        super.init(coder: coder)
        modalPresentationStyle = .overFullScreen
        modalTransitionStyle = .crossDissolve
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        buildInterface()
        refreshBalance()
        NotificationCenter.default.addObserver(
            self, selector: #selector(economyChanged),
            name: .gameEconomyDidChange, object: economy
        )
        loadProducts()
    }

    deinit {
        productTask?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    func purchaseDidSucceed(offer: MiniGameProductCatalog.Offer, wasNewCredit: Bool) {
        guard activeOfferId == nil || activeOfferId == offer.id else { return }
        activeOfferId = nil
        updatePurchaseAvailability()
        refreshBalance()
        let detail = wasNewCredit
            ? "購買成功，已到賬 \(offer.pearlAmount) 原始珍珠"
            : "這筆交易已經入賬，未重複增加珍珠"
        statusLabel.text = detail
        showToast(detail)
    }

    func purchaseDidBecomePending(offer: MiniGameProductCatalog.Offer, message: String) {
        guard activeOfferId == nil || activeOfferId == offer.id else { return }
        activeOfferId = offer.id
        updatePurchaseAvailability()
        statusLabel.text = message
    }

    func purchaseDidFail(offer: MiniGameProductCatalog.Offer, message: String) {
        guard activeOfferId == nil || activeOfferId == offer.id else { return }
        activeOfferId = nil
        updatePurchaseAvailability()
        statusLabel.text = message
        showToast(message)
    }

    private func buildInterface() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.68)

        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = UIColor(red: 0.12, green: 0.16, blue: 0.12, alpha: 1)
        card.layer.cornerRadius = 24
        card.layer.borderWidth = 2
        card.layer.borderColor = UIColor(red: 0.49, green: 0.39, blue: 0.22, alpha: 1).cgColor
        card.layer.shadowColor = UIColor.black.cgColor
        card.layer.shadowOpacity = 0.45
        card.layer.shadowRadius = 18
        view.addSubview(card)

        let title = UILabel()
        title.text = "原始珍珠商店"
        title.font = .preferredFont(forTextStyle: .title2).bold()
        title.adjustsFontForContentSizeCategory = true
        title.textColor = UIColor(red: 0.96, green: 0.88, blue: 0.65, alpha: 1)

        var closeConfiguration = UIButton.Configuration.plain()
        closeConfiguration.image = UIImage(systemName: "xmark.circle.fill")
        closeConfiguration.baseForegroundColor = .white
        let closeButton = UIButton(configuration: closeConfiguration)
        closeButton.accessibilityLabel = "關閉商城"
        closeButton.addTarget(self, action: #selector(closeShop), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        closeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true

        let header = UIStackView(arrangedSubviews: [title, closeButton])
        header.axis = .horizontal
        header.alignment = .center
        header.spacing = 12

        balanceLabel.font = .preferredFont(forTextStyle: .headline).bold()
        balanceLabel.adjustsFontForContentSizeCategory = true
        balanceLabel.textColor = UIColor(red: 0.78, green: 0.95, blue: 0.92, alpha: 1)
        balanceLabel.accessibilityIdentifier = "game-shop-pearl-balance"

        let explanation = UILabel()
        explanation.text = "原始珍珠可用於戰敗復活與外觀解鎖。價格由 App Store 提供。"
        explanation.font = .preferredFont(forTextStyle: .footnote)
        explanation.adjustsFontForContentSizeCategory = true
        explanation.textColor = UIColor.white.withAlphaComponent(0.72)
        explanation.numberOfLines = 0

        productsStack.axis = .vertical
        productsStack.spacing = 12
        for offer in offers {
            let row = ProductRow(offer: offer)
            row.onPurchase = { [weak self] in self?.beginPurchase(offer) }
            rows[offer.productId] = row
            productsStack.addArrangedSubview(row)
        }

        statusLabel.text = "正在讀取 App Store 商品…"
        statusLabel.font = .preferredFont(forTextStyle: .footnote)
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.textColor = UIColor.white.withAlphaComponent(0.75)
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center
        statusLabel.accessibilityIdentifier = "game-shop-status"

        let content = UIStackView(arrangedSubviews: [header, balanceLabel, explanation, productsStack, statusLabel])
        content.axis = .vertical
        content.spacing = 15
        content.translatesAutoresizingMaskIntoConstraints = false
        let scrollView = UIScrollView()
        scrollView.alwaysBounceVertical = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(scrollView)
        scrollView.addSubview(content)
        let preferredWidth = card.widthAnchor.constraint(
            equalTo: view.safeAreaLayoutGuide.widthAnchor,
            constant: -32
        )
        preferredWidth.priority = .defaultHigh
        preferredWidth.isActive = true
        let fittingHeight = card.heightAnchor.constraint(equalTo: content.heightAnchor, constant: 40)
        fittingHeight.priority = .defaultHigh
        fittingHeight.isActive = true

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.topAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            card.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            card.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            card.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 560),
            card.heightAnchor.constraint(greaterThanOrEqualToConstant: 280),
            scrollView.topAnchor.constraint(equalTo: card.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            content.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 20),
            content.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 20),
            content.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -20),
            content.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -20),
            content.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -40)
        ])
    }

    private func loadProducts() {
        productTask?.cancel()
        let productIds = offers.map(\.productId)
        productTask = Task { [weak self] in
            guard let self else { return }
            do {
                let products = try await Product.products(for: productIds)
                guard !Task.isCancelled else { return }
                let byId = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
                for offer in offers {
                    rows[offer.productId]?.setProduct(byId[offer.productId])
                }
                statusLabel.text = products.count == offers.count
                    ? "付款完成並經伺服器驗證後，珍珠才會入賬。"
                    : "部分商品暫時無法從 App Store 讀取，請稍後再試。"
                updatePurchaseAvailability()
            } catch {
                guard !Task.isCancelled else { return }
                rows.values.forEach { $0.setProduct(nil) }
                statusLabel.text = "無法連接 App Store，已到賬珍珠仍可離線使用。"
            }
        }
    }

    private func beginPurchase(_ offer: MiniGameProductCatalog.Offer) {
        guard activeOfferId == nil, rows[offer.productId]?.hasProduct == true else { return }
        activeOfferId = offer.id
        statusLabel.text = "正在建立訂單，請勿重複點擊…"
        updatePurchaseAvailability()
        delegate?.gameShop(self, purchase: offer)
    }

    private func updatePurchaseAvailability() {
        for offer in offers {
            rows[offer.productId]?.isPurchaseEnabled = activeOfferId == nil
        }
    }

    private func refreshBalance() {
        balanceLabel.text = "目前餘額：\(economy.balance) 原始珍珠"
        balanceLabel.accessibilityLabel = "目前有 \(economy.balance) 原始珍珠"
    }

    @objc private func economyChanged(_ notification: Notification) {
        refreshBalance()
    }

    @objc private func closeShop() {
        dismiss(animated: true)
    }

    private func showToast(_ message: String) {
        toastView?.removeFromSuperview()
        let label = PaddingLabel()
        label.text = message
        label.textColor = .white
        label.backgroundColor = UIColor.black.withAlphaComponent(0.88)
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.adjustsFontForContentSizeCategory = true
        label.textAlignment = .center
        label.numberOfLines = 0
        label.layer.cornerRadius = 12
        label.clipsToBounds = true
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            label.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24)
        ])
        toastView = label
        UIAccessibility.post(notification: .announcement, argument: message)
        UIView.animate(withDuration: 0.2, delay: 2.8, options: []) {
            label.alpha = 0
        } completion: { [weak self, weak label] _ in
            guard let self, self.toastView === label else { return }
            label?.removeFromSuperview()
            self.toastView = nil
        }
    }
}

private final class ProductRow: UIView {
    let offer: MiniGameProductCatalog.Offer
    var onPurchase: (() -> Void)?
    private let priceButton = UIButton(type: .system)
    private(set) var hasProduct = false

    var isPurchaseEnabled = true {
        didSet { priceButton.isEnabled = isPurchaseEnabled && hasProduct }
    }

    init(offer: MiniGameProductCatalog.Offer) {
        self.offer = offer
        super.init(frame: .zero)
        backgroundColor = UIColor(red: 0.18, green: 0.22, blue: 0.16, alpha: 1)
        layer.cornerRadius = 16
        layer.borderWidth = 1
        layer.borderColor = UIColor(red: 0.38, green: 0.33, blue: 0.20, alpha: 1).cgColor

        let symbol = UILabel()
        symbol.text = "◈"
        symbol.font = .systemFont(ofSize: 34, weight: .bold)
        symbol.textColor = UIColor(red: 0.46, green: 0.91, blue: 0.85, alpha: 1)
        symbol.setContentHuggingPriority(.required, for: .horizontal)

        let title = UILabel()
        title.text = offer.grantsLimitedSkin
            ? "\(offer.pearlAmount) 原始珍珠 + 限定恐龍皮膚"
            : "\(offer.pearlAmount) 原始珍珠"
        title.font = .preferredFont(forTextStyle: .headline)
        title.adjustsFontForContentSizeCategory = true
        title.textColor = .white
        title.numberOfLines = 0

        let subtitle = UILabel()
        subtitle.text = offer.grantsLimitedSkin ? "珍珠立即入賬，並解鎖限定外觀" : "適合補充復活與外觀所需珍珠"
        subtitle.font = .preferredFont(forTextStyle: .caption1)
        subtitle.adjustsFontForContentSizeCategory = true
        subtitle.textColor = UIColor.white.withAlphaComponent(0.66)
        subtitle.numberOfLines = 0

        let labels = UIStackView(arrangedSubviews: [title, subtitle])
        labels.axis = .vertical
        labels.spacing = 3

        var buttonConfiguration = UIButton.Configuration.filled()
        buttonConfiguration.title = "讀取價格…"
        buttonConfiguration.baseBackgroundColor = UIColor(red: 0.52, green: 0.35, blue: 0.12, alpha: 1)
        buttonConfiguration.baseForegroundColor = .white
        buttonConfiguration.cornerStyle = .capsule
        priceButton.configuration = buttonConfiguration
        priceButton.isEnabled = false
        priceButton.accessibilityIdentifier = "buy-\(offer.productId)"
        priceButton.addTarget(self, action: #selector(purchase), for: .touchUpInside)
        priceButton.setContentCompressionResistancePriority(.required, for: .horizontal)

        let row = UIStackView(arrangedSubviews: [symbol, labels, priceButton])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 12
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
            priceButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setProduct(_ product: Product?) {
        hasProduct = product != nil
        var configuration = priceButton.configuration
        configuration?.title = product?.displayPrice ?? "暫不可用"
        priceButton.configuration = configuration
        priceButton.isEnabled = hasProduct && isPurchaseEnabled
        priceButton.accessibilityLabel = product.map {
            "購買 \(offer.pearlAmount) 原始珍珠，價格 \($0.displayPrice)"
        } ?? "商品暫不可用"
    }

    @objc private func purchase() {
        onPurchase?()
    }
}

private final class PaddingLabel: UILabel {
    private let insets = UIEdgeInsets(top: 11, left: 15, bottom: 11, right: 15)

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + insets.left + insets.right,
                      height: size.height + insets.top + insets.bottom)
    }
}

private extension UIFont {
    func bold() -> UIFont {
        UIFont(descriptor: fontDescriptor.withSymbolicTraits(.traitBold) ?? fontDescriptor, size: pointSize)
    }
}
