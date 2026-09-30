import QuartzCore
import UIKit

final class SplashViewController: UIViewController {
    private var hasOpenedGame = false
    private let minimumVisibleDuration: TimeInterval = 0.55

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.024, green: 0.090, blue: 0.078, alpha: 1)
        PaymentDebugLog.record("boot-splash-loaded")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        prepareBundledGame()
    }

    private func prepareBundledGame() {
        guard !hasOpenedGame else { return }
        hasOpenedGame = true

        let startedAt = CACurrentMediaTime()
        let gameController = GameViewController()
        let elapsed = CACurrentMediaTime() - startedAt
        let delay = max(0, minimumVisibleDuration - elapsed)

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, let window = self.view.window else { return }
            PaymentDebugLog.record("boot-open-local-game windowPresent=true")
            UIView.transition(
                with: window,
                duration: 0.18,
                options: [.transitionCrossDissolve, .allowAnimatedContent]
            ) {
                window.rootViewController = gameController
            }
        }
    }
}
