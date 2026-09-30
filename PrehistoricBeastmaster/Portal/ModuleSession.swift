import Foundation

/// 记录大厅当前前台模块。打开远端容器时挂起本地模块，退出后恢复，不销毁本地页面。
@MainActor
final class ModuleSession {
    let home: GameModule
    private(set) var foreground: GameModule
    private(set) var phase: ModulePhase

    init(home: GameModule = .localDefault) {
        self.home = home
        self.foreground = home
        self.phase = .idle
    }

    var isRemoteForeground: Bool {
        foreground.origin == .remote
    }

    func noteHomeReady() {
        guard !isRemoteForeground else { return }
        phase = .ready
    }

    func beginRemote(_ module: GameModule) {
        foreground = module
        phase = .loading
    }

    func markReady() {
        phase = .ready
    }

    func markFailed() {
        phase = .failed
    }

    @discardableResult
    func endRemote() -> GameModule {
        foreground = home
        phase = .ready
        return home
    }
}
