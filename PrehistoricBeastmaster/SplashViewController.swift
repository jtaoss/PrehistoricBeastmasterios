import UIKit

final class SplashViewController: UIViewController {
    private var hasOpenedGame = false

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.067, green: 0.094, blue: 0.153, alpha: 1)
        PaymentDebugLog.record("boot-splash-loaded")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        openGame()
    }

    // Legal-document entry points belong to the game. Entering it never grants
    // ATT or agreement acceptance; permission requests happen after game display.
    private func openGame() {
        guard !hasOpenedGame, let window = view.window else { return }
        hasOpenedGame = true
        PaymentDebugLog.record("boot-open-game windowPresent=true")
        window.rootViewController = GameViewController()
    }
}
