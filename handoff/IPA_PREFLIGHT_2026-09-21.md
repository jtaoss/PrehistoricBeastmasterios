# IPA 成品检查与当前阻塞

日期：2026-09-21。候选版本：1.0.12（49）。

## 结论

重新生成了当前源码的 arm64 Release 无签名归档，资源及配置预检通过。没有导出正式签名 IPA、上传 App Store、安装手机、创建账号或发起购买。**这不是审核通过保证，也不是 4.3 或 2.3.1 已解决的证明。**

本次仅新增成品检查脚本和测试，没有改变游戏路由、生产后台、主游戏地址或支付实现，也没有恢复之前撤回的 Release 仅小游戏硬限制。

## 新增可重复检查

- `scripts/audit-release-package.mjs`：对实际 `.app` 检查 Bundle ID/版本、真机平台及 arm64、编译后的图标、生产 HTTPS 地址、未展开构建变量、ATS、StoreKit 配置、默认关闭的统计采集、Firebase Bundle ID、隐私清单以及调试配置/签名材料误入包。
- 复用现有资源审计，逐项检查小游戏资源哈希、HTML 入口、旧跑酷资源残留及共享隐私政策。
- 默认检查代码签名及发布签名身份、签名 entitlements、描述文件团队/应用/有效期；拒绝开发、Ad Hoc、企业描述文件。签名检查不等于 Apple 服务端验证，也未查询证书撤销状态。
- 只有显式指定 `--unsigned-check` 才允许无签名预检；结果为 `UNSIGNED_PREFLIGHT_PASS`，不会标记为可上传或审核通过。
- 当前生产地址白名单依据现有项目配置。将来正式迁移地址时需同步复核此检查，不能仅为使检查通过而修改白名单。
- 检查不输出配置中的 token、完整 plist 或证书私钥。

Node 可用路径：`/Users/yukang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。将该目录加入 PATH 后：

```sh
node --test scripts/test-release-package.mjs
# 将导出的 IPA 解包后，对 Payload 内的 .app 执行（默认必须有发布签名）：
node scripts/audit-release-package.mjs /absolute/path/Payload/PrehistoricBeastmaster.app 1.0.12 49
# 无签名归档只能预检：
node scripts/audit-release-package.mjs /absolute/path/Archive.xcarchive/Products/Applications/PrehistoricBeastmaster.app 1.0.12 49 --unsigned-check
```

这是手动调用的成品检查，不会自行导出、上传或更改 App Store Connect 状态。

## 本轮验证

- 新检查脚本：33 项模拟配置、资源清单、签名信息用例通过；包括错误配置拒绝和错误信息不泄露凭据。
- 真实归档：arm64；137 个游戏文件；19 份 app/SDK 隐私清单可解析；资源与源码打包清单一致。隐私清单解析通过不代表声明内容已与所有 SDK 实际行为逐项核验。
- 默认发布签名检查正确拒绝本次无签名归档。
- 资源一致性脚本和缺失/篡改/额外文件等负向测试通过。
- Release/Debug 内容配置各 35 项检查通过，后台内容模式仍有效。
- 小游戏 22 个 `.test.mjs` 文件通过。
- 原生 ATT 25 个场景、隐私政策 7 项检查、导航策略 299 项、支付桥 7 个场景通过。
- 支付状态机 178 项、网关解析 27 项、诊断生命周期 4 项通过；全部采用隔离替身，没有真实订单/购买。
- macOS WebKit 使用新归档的本地文件入口启动：游戏、登录页均 `ready=true`、回调已安装、无启动错误；登录表单可用。此项不代表真机完整游戏流程、网络登录或支付验收。

产物目录：`/Users/yukang/Downloads/PrehistoricBeastmaster-main/ios/output/ipa-guard-49.EdlZhd/`。

- `PrehistoricBeastmaster-1.0.12-49-unsigned.xcarchive`：本轮归档，不包含已撤回的 Release 硬限制。
- `archive.log`、`package-audit.json`、`signed-gate.log`：构建及成品检查记录。
- `core.log`、`privacy-payment.log`、`release-package-tests.log`：回归测试记录。
- `webkit-game.log`、`webkit-login.log`：隔离 WebKit 启动记录。

## 未完成与需要输入

1. 本机仍缺 `Apple Distribution: kang yu (ADR4GMT9V3)` 对应的发布签名身份及私钥。匹配的描述文件已存在，但不能替代私钥。需要恢复发布签名后导出正式 IPA，并重新运行默认签名检查及真机验收。
2. 未核对 App Store Connect 的 49 构建号占用、隐私标签、截图、评级、IAP 商品状态，也未执行 Apple 服务端验证。
3. 代码初次启动无有效配置时默认小游戏，配置获取失败保留缓存；这不等于所有离线场景均可玩。例如缓存为 ONLINE_ONLY 时仍会尝试主游戏，导航失败目前主要提示重试。本轮未改该策略或宣称网络故障体验已全部修复。
4. 用户补充上一包因 4.3 被拒，打包方解释为“苹果知道有两个包”。目前没有 Apple 拒审原文，也未明确“两个包”是两个 App/Bundle ID 还是一个 App 内两套游戏，不能据此确定根因。需要拒审原文/截图；若涉及另一 App，再对比产品、玩法、资源及商店信息。

Apple 4.3(a) 针对同一 App 多 Bundle ID，4.3(b) 涉及缺少实质区别的同类应用。单纯提高包质量或移除字符串不能证明该问题已解决。参考：[App Review Guidelines 4.3](https://developer.apple.com/app-store/review/guidelines/#spam)。
