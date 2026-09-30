import UIKit

/// 远端模块入口条。没有可用模块时保持隐藏，不挡住本地游戏。
final class ModuleDockView: UIView {
    var onSelect: ((GameModule) -> Void)?

    private let scrollView = UIScrollView()
    private let stack = UIStackView()
    private var modules: [GameModule] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        accessibilityIdentifier = "module-dock"
        isHidden = true
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.alwaysBounceHorizontal = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.spacing = 8
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scrollView)
        scrollView.addSubview(stack)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            stack.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor)
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setModules(_ modules: [GameModule]) {
        self.modules = modules
        stack.arrangedSubviews.forEach {
            stack.removeArrangedSubview($0)
            $0.removeFromSuperview()
        }
        isHidden = modules.isEmpty
        for module in modules {
            stack.addArrangedSubview(makeButton(module))
        }
    }

    private func makeButton(_ module: GameModule) -> UIButton {
        var configuration = UIButton.Configuration.tinted()
        configuration.title = module.title
        configuration.image = UIImage(systemName: "sparkles")
        configuration.imagePlacement = .leading
        configuration.imagePadding = 6
        configuration.baseForegroundColor = .white
        configuration.baseBackgroundColor = UIColor(white: 0.08, alpha: 0.82)
        configuration.cornerStyle = .capsule
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
        let button = UIButton(type: .system)
        button.configuration = configuration
        button.accessibilityIdentifier = "module-entry-\(module.id)"
        button.accessibilityLabel = module.summary.isEmpty ? "進入\(module.title)" : "進入\(module.title)，\(module.summary)"
        button.addAction(UIAction { [weak self] _ in
            self?.onSelect?(module)
        }, for: .touchUpInside)
        return button
    }
}
