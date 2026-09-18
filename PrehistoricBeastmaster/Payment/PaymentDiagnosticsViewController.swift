#if DEBUG
import StoreKit
import UIKit

/// Developer-only diagnostics. No orders, purchases, delivery, or receipt bypass.
@MainActor
final class PaymentDiagnosticsViewController: UIViewController {
    // Process-wide: dismissing/reopening this panel must not start a second
    // Apple authentication while the previous system call is still awaiting.
    private(set) static var authenticationInProgress = false
    private static let authenticationChanged = Notification.Name("PBMPaymentDiagnosticAuthenticationChanged")
    private let output = UITextView()
    private var buttons: [UIButton] = []
    private var operation: Task<Void, Never>?
    private var watchdog: Task<Void, Never>?
    private var runID: UUID?
    private var waitsForAuthentication = false
    private var checkedOnOpen = false

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "支付診斷 · 開發包"
        view.backgroundColor = .systemBackground
        view.tintColor = .systemBlue
        navigationController?.navigationBar.tintColor = .systemBlue
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "返回遊戲", style: .done, target: self, action: #selector(close))
        let note = UILabel()
        note.text = "此頁不會下單或付款。請先檢查商品。同步交易記錄僅用於恢復診斷，不會刷新商品目錄，也不是付款前置步驟；若要求登入，請完成或取消系統視窗。"
        note.font = .preferredFont(forTextStyle: .footnote)
        note.adjustsFontForContentSizeCategory = true
        note.textColor = .secondaryLabel
        note.numberOfLines = 0
        let check = makeButton("檢查商品（不下單）", action: #selector(checkProducts))
        let identity = makeButton("讀取 App 身分（不付款）", action: #selector(checkIdentity))
        let sync = makeButton("同步交易記錄（可能要求登入）", action: #selector(syncStore))
        buttons = [check, identity, sync]
        let controls = UIStackView(arrangedSubviews: [note, check, identity, sync])
        controls.axis = .vertical
        controls.spacing = 10
        controls.translatesAutoresizingMaskIntoConstraints = false
        output.isEditable = false
        output.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        output.adjustsFontForContentSizeCategory = true
        output.accessibilityIdentifier = "payment-diagnostics-output"
        output.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(controls)
        view.addSubview(output)
        NSLayoutConstraint.activate([
            controls.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            controls.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            controls.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            output.topAnchor.constraint(equalTo: controls.bottomAnchor, constant: 12),
            output.leadingAnchor.constraint(equalTo: controls.leadingAnchor),
            output.trailingAnchor.constraint(equalTo: controls.trailingAnchor),
            output.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
        append("bundle=\(Bundle.main.bundleIdentifier ?? "unknown")")
        append("iOS=\(UIDevice.current.systemVersion) build=\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "unknown")")
        append("localStoreKitRequested=\(ProcessInfo.processInfo.environment["PBM_LOCAL_STOREKIT"] == "1")")
        NotificationCenter.default.addObserver(self, selector: #selector(authenticationDidChange), name: Self.authenticationChanged, object: nil)
        updateButtons()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !checkedOnOpen {
            checkedOnOpen = true
            checkProducts()
        }
    }

    private func makeButton(_ title: String, action: Selector) -> UIButton {
        var config = UIButton.Configuration.filled()
        config.title = title
        config.baseForegroundColor = .white
        config.baseBackgroundColor = .systemBlue
        config.titleLineBreakMode = .byWordWrapping
        let button = UIButton(configuration: config)
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    @objc private func checkProducts() {
        run { [weak self] id in await self?.queryProducts(id) }
    }

    @objc private func checkIdentity() {
        run(timeout: 90, waitsForAuthentication: true) { [weak self] id in await self?.queryIdentity(id) }
    }

    @objc private func syncStore() {
        // Apple requires an explicit user action for AppStore.sync(): never invoke
        // it at launch, in a product retry, or on a web callback.
        run(timeout: 90, waitsForAuthentication: true) { [weak self] id in
            guard let self else { return }
            self.append("sync-start：若出現系統登入視窗，請使用沙盒帳號")
            do {
                try await AppStore.sync()
                guard self.isCurrent(id) else { return }
                self.append("sync-success（僅代表交易狀態已同步，非支付成功）")
            } catch {
                guard self.isCurrent(id) else { return }
                self.append("sync-error \(self.errorCode(error))")
            }
        }
    }

    private func queryProducts(_ id: UUID) async {
        let ids = ProductCatalog.allProductIds.sorted()
        append("canMakePayments=\(SKPaymentQueue.canMakePayments()) storefront=\(SKPaymentQueue.default().storefront?.countryCode ?? "unknown")")
        append("products-start count=\(ids.count)")
        let start = Date()
        do {
            let products = try await Product.products(for: ids)
            guard isCurrent(id) else { return }
            let missing = Set(ids).subtracting(products.map(\.id)).sorted()
            append("products-result valid=\(products.count) missing=\(missing.count) elapsed=\(String(format: "%.1f", Date().timeIntervalSince(start)))s")
            for product in products.sorted(by: { $0.id < $1.id }) {
                append("可用：\(product.id) \(product.displayPrice)")
            }
            if !missing.isEmpty {
                append("未返回：\(missing.joined(separator: ", "))")
                append("尚未發起付款。查不到商品不能單憑此結果判定是帳號、裝置或後台設定問題。")
            }
        } catch {
            guard isCurrent(id) else { return }
            append("products-error \(errorCode(error))")
        }
    }

    private func queryIdentity(_ id: UUID) async {
        append("app-identity-start")
        do {
            let result = try await AppTransaction.shared
            guard isCurrent(id) else { return }
            switch result {
            case .verified(let app):
                // Do not log the signed payload, account IDs, or device identifiers.
                append("app-identity-verified bundle=\(app.bundleID) appID=\(app.appID.map(String.init) ?? "not-provided") environment=\(app.environment.rawValue)")
                append("bundleMatches=\(app.bundleID == Bundle.main.bundleIdentifier)")
            case .unverified(_, let error):
                append("app-identity-unverified \(errorCode(error))")
            }
        } catch {
            guard isCurrent(id) else { return }
            append("app-identity-error \(errorCode(error))")
            append("開發包可能無法取得 App 身分；此錯誤本身不等於商品不可購買。")
        }
    }

    private func run(timeout: UInt64 = 30, waitsForAuthentication: Bool = false, action: @escaping @MainActor (UUID) async -> Void) {
        guard runID == nil else { return }
        guard !Self.authenticationInProgress else {
            append("authentication-busy：上一個 App Store 系統請求仍未結束，請先完成或取消登入視窗")
            return
        }
        let id = UUID()
        runID = id
        self.waitsForAuthentication = waitsForAuthentication
        if waitsForAuthentication {
            Self.authenticationInProgress = true
            NotificationCenter.default.post(name: Self.authenticationChanged, object: nil)
        }
        updateButtons()
        // Keep the owner alive until the system call actually returns, even if
        // the panel is dismissed. A Task cancellation cannot dismiss Apple UI.
        operation = Task { [self] in
            await action(id)
            guard self.isCurrent(id) else { return }
            self.finish()
        }
        watchdog = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: timeout * 1_000_000_000) }
            catch { return }
            guard let self, self.isCurrent(id) else { return }
            if self.waitsForAuthentication {
                self.append("diagnostic-timeout：App Store 仍未返回；請完成或取消系統登入。為避免重複登入，暫不開放重試；返回遊戲也不會取消此請求")
                return
            }
            self.append("diagnostic-timeout：未收到完成回應，可返回遊戲；如系統登入視窗仍在，請先完成或取消")
            self.operation?.cancel()
            self.finish()
        }
    }

    private func isCurrent(_ id: UUID) -> Bool { runID == id && !Task.isCancelled }

    private func finish() {
        let completedAuthentication = waitsForAuthentication
        waitsForAuthentication = false
        runID = nil
        watchdog?.cancel()
        watchdog = nil
        operation = nil
        if completedAuthentication {
            Self.authenticationInProgress = false
            NotificationCenter.default.post(name: Self.authenticationChanged, object: nil)
        }
        updateButtons()
    }

    @objc private func authenticationDidChange() {
        updateButtons()
        if !Self.authenticationInProgress, runID == nil {
            append("authentication-finished：系統請求已結束，可重新檢查商品")
        }
    }

    private func updateButtons() {
        buttons.forEach { $0.isEnabled = runID == nil && !Self.authenticationInProgress }
    }

    @objc private func close() {
        if !waitsForAuthentication {
            operation?.cancel()
            finish()
        }
        dismiss(animated: true)
    }

    private func append(_ line: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        output.text += "\(timestamp)\n\(line)\n\n"
        output.scrollRangeToVisible(NSRange(location: output.text.utf16.count, length: 0))
        PaymentDebugLog.record("diagnostic \(line)")
    }

    private func errorCode(_ error: Error) -> String {
        let value = error as NSError
        var codes = ["\(value.domain)(\(value.code))"]
        if let underlying = value.userInfo[NSUnderlyingErrorKey] as? NSError {
            codes.append("underlying=\(underlying.domain)(\(underlying.code))")
        }
        return codes.joined(separator: " ")
    }
}
#endif
