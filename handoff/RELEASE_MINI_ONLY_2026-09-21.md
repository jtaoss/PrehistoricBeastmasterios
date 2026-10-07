# Release 仅小游戏构建与导出记录

日期：2026-09-21。版本：1.0.12（49）。

## 当前状态：源码限制已撤回

按用户后续要求，已移除本次新增的 Release 编译标记、主游戏 URL 禁用和内容模式强制降级。Release 与 Debug 均恢复按有效后台配置和各自缓存决定内容模式；已有的默认小游戏模式、缓存隔离、修订号检查、导航及支付保护保持不变。没有修改后台服务或线上配置，也没有接入重定向。

撤回验证：`scripts/test-release-content.cjs` 编译真实配置与导航策略文件，Release 和 Debug 各 35 项断言通过，共 70 项；`git diff --check` 通过。本次未重新 Archive 或导出 IPA。

下文仅记录此前受限构建的历史操作和验证结果。已生成的无签名归档仍包含旧限制，不能作为当前源码的成品；必须重新构建才能包含此次撤回。

## 本次行为

本次新增限制只对 Release 生效。Release 编译条件 `PBM_MINI_ONLY_RELEASE` 将该二进制固定为仅小游戏；后台模式、已有缓存、修订号或日期均不能重新开放它的主游戏。以后需要主游戏时，必须显式调整发布构建配置，生成新的构建，并说明所开放的功能。

Debug 保留本次工作开始时的行为，包括已有的小游戏默认值及按后台配置切换的能力。本次没有编辑 `Config/Debug.xcconfig`、网页源码、后台服务或线上配置，也没有安装手机 App 或提交 App Store。

这是功能限制，未清除包内所有主游戏文案、配置或相关代码；不声称静态扫描只能识别小游戏。

## 修改位置

- `Config/Release.xcconfig`：增加 Release 专用编译条件。
- `PrehistoricBeastmaster/Config/ShellConfig.swift`：编译期内容能力；受限 Release 的 `onlineGameURL` 返回 nil，因此直接网页导航也不能绕过入口限制。
- `PrehistoricBeastmaster/Content/ContentConfig.swift`：在配置构造时限制实际模式，覆盖默认值、旧缓存和新服务器响应；为隔离测试增加可注入的 UserDefaults，生产调用仍默认使用 standard。
- `scripts/test-release-content.cjs`、`scripts/release-content-tests/main.swift`：编译真实生产 Swift 文件，分别验证受限 Release、Debug、继承 Release 标记的 Debug 和显式移除限制后重新编译的配置。

## 验证

- 132 项定向断言通过：受限 Release 36 项，其余三个编译配置各 32 项。覆盖三个内容模式、极大修订号和未来更新时间、旧在线缓存、不同环境缓存隔离、H5 模式、原生 URL 和导航限制、本地游戏及法律链接。
- 资源源码与打包目录校验通过；资源保护脚本的缺失、篡改、多余文件、未打包源文件和软链接用例通过。
- 真机 arm64 Release 无签名 Archive 成功。
- Xcode 有效 Release 编译条件包含 `PBM_MINI_ONLY_RELEASE`，不含 `DEBUG`。
- 成品审计通过：137 个游戏文件，其中 90 个图片/音频等 assets；版本 1.0.12（49）；两个 WebKit 经典脚本入口正确；旧跑酷文件为 0；共享隐私政策已打包。
- 未进行这次新构建的真机安装、登录或真实支付验收。

## 已有产物

目录：`/Users/yukang/Downloads/PrehistoricBeastmaster-main/ios/output/appstore-mini-only-49.1a2C3Z/`

- `PrehistoricBeastmaster-1.0.12-49-unsigned.xcarchive`：无签名归档，不能当作可上传 IPA。
- `archive.log`：归档日志；编译退出码 0。
- `app-audit.json`：成品资源审计结果。
- `export.log`：首次导出失败，缺发布描述文件和签名身份。
- `export-after-profile.log`：恢复描述文件后再次导出，仍缺发布签名身份；退出码 70。
- `recovered-signing/embedded.mobileprovision`：从用户提供的 48 号 IPA 恢复的 App Store 描述文件。

编译后二进制 SHA-256：`c470f24c22c1c99a0998f2919047d8fd9385d70cc222bc0a4eacbf3573c4fa65`。

## 导出阻塞与继续方式

已从 `/Users/yukang/Desktop/PrehistoricBeastmaster-AppStore-1.0.12-48.ipa` 恢复并安装匹配的描述文件：

- 名称：`Primal_Legends_AppStore_YU_KANG_2026`。
- Team：`ADR4GMT9V3`；Bundle ID：`com.stone.primitive.saga`。
- UUID：`59d52560-7b5a-4262-a1a2-5593b825b778`。
- 到期日：2027-09-07（仅核对文件期限，未查询服务器撤销状态）。
- 安装位置：`/Users/yukang/Library/Developer/Xcode/UserData/Provisioning Profiles/59d52560-7b5a-4262-a1a2-5593b825b778.mobileprovision`。

再次导出已不再报告缺少描述文件。当前关键阻塞是钥匙串没有 `Apple Distribution: kang yu (ADR4GMT9V3)` 对应的证书和私钥；本机可用身份只有 Apple Development。描述文件绑定的发布证书 SHA-1 为 `AEFE17C267CEF38A270621D34BD89DF211198128`，私钥不能从 IPA 或描述文件恢复。

需要在本机钥匙串恢复匹配的发布签名身份，例如导入原有且包含私钥的 .p12。若改用新发布证书，也需重新生成匹配描述文件。Xcode 导出日志另有 App Store Connect 账户无 provider 的认证提示；后续导出及提交时需确认正确的团队账户。没有上传或占用构建号，49 是否已在 App Store Connect 使用仍需核对。

恢复签名后可用本项目 `ExportOptions-AppStore.plist` 对上述归档再次导出，或重新签名 Archive；导出后应对最终 IPA 解包后的 .app 再做资源与签名检查。
