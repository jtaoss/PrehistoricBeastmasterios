import UIKit
import WebKit

/// A bundled, script-free reader: it never starts SDKs or accepts any consent.
final class PrivacyPolicyViewController: UIViewController, WKNavigationDelegate {
    private var reader: WKWebView!
    private var documentURL: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "隱私政策"
        view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "完成", style: .done,
                                                            target: self, action: #selector(closeReader))
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "系統設定", style: .plain,
                                                           target: self, action: #selector(openSystemSettings))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        reader = WKWebView(frame: .zero, configuration: configuration)
        reader.navigationDelegate = self
        reader.isOpaque = false
        reader.backgroundColor = .systemBackground
        reader.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(reader)
        NSLayoutConstraint.activate([
            reader.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            reader.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            reader.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            reader.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        documentURL = Bundle.main.url(forResource: "privacy-policy", withExtension: "html", subdirectory: "legal")
        guard let documentURL else {
            let error = UILabel()
            error.text = "隱私政策檔案無法讀取，請更新 App，或聯繫 fushengridi@gmail.com。"
            error.font = .preferredFont(forTextStyle: .body)
            error.adjustsFontForContentSizeCategory = true
            error.numberOfLines = 0
            error.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(error)
            NSLayoutConstraint.activate([
                error.centerYAnchor.constraint(equalTo: view.centerYAnchor),
                error.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
                error.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
            ])
            return
        }
        reader.loadFileURL(documentURL, allowingReadAccessTo: documentURL)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, url.isFileURL,
              let documentURL,
              url.standardizedFileURL.path == documentURL.standardizedFileURL.path else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    @objc private func closeReader() {
        dismiss(animated: true)
    }

    @objc private func openSystemSettings() {
        // Only the public App Settings URL; never change ATT or open a private deep link.
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
