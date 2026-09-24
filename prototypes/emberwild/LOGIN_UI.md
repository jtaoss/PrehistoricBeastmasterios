# 登录 UI · iOS 真实账号会话

浏览器仅用于界面预览：`http://127.0.0.1:4174/login-preview.html`。真实注册、登录、找回、刷新和退出只允许在 iOS App 的 bundled local main frame 内，经 `window.android.miniAuth` 进入原生层，再由原生 `URLSession` 请求 HTTPS 后端。浏览器没有伪登录或直连后端兜底。

## 界面与行为

- 帐号登录：6–24 位英文/数字/底线帐号、密码显隐、条款勾选、空字段反馈及原生请求加载态。
- 新玩家注册：猎人名称、唯一游戏帐号、8–128 字符密码和重复密码检查；不收集邮箱。
- 找回密码：始终使用不枚举账号的统一成功文案。
- 访客入口：保留本机试玩与存档，但不能发起真实付款。
- 退出账号：服务端吊销会话后清除 iOS Keychain 与页面公开缓存；不删除游戏存档。
- 删除存档：只删除教程、营地、伙伴、资源和远征记录；不等同于注销服务端账号。
- 用户协议、隐私政策和删除账号说明继续使用固定法律 URL 白名单。

## 数据边界

- 密码仅在表单提交瞬间经过原生桥发送，不进入 localStorage、UserDefaults 或日志。
- access/refresh token 只保存在 iOS Keychain，使用 `AfterFirstUnlockThisDeviceOnly`。
- localStorage 的 `emberwild_account_session_v1` 已升级为 version 2，只缓存 `playerId`、显示名和公开时间；不会保存密码或 token。
- 旧 version 1 本机假登录会话不再有效。
- 支付前重新向原生层查询/刷新真实会话；建单使用 access token，服务端玩家 ID 取代随机设备 ID。
- JS 未加载时凭证表单保持禁用，静态 HTML 不会提交密码。

## 文件

- `login-preview.html` / `login-preview.css`：响应式账号页面。
- `login-preview.mjs`：表单、验证、真实原生调用与公开会话渲染。
- `native-auth.mjs`：带 request UUID 精确关联的原生认证桥。
- `account-session.mjs`：不含 token 的公开会话缓存。
- `legal-links.mjs`：法律 URL 白名单与宿主跳转。
- `PrehistoricBeastmaster/Auth/MiniGameAuthService.swift`：HTTPS 请求、刷新与 Keychain。

后端契约位于固定共享目录：`EMBERWILD_IOS_STOREKIT_20260920/给WindowsCodex_小游戏真实账号与支付绑定V1.md`。

## 验证

```powershell
npx --yes --package @playwright/cli playwright-cli -s=emberwild-login-ui open http://127.0.0.1:4174/login-preview.html
npx --yes --package @playwright/cli playwright-cli -s=emberwild-login-ui run-code --filename prototypes/emberwild/tests/login-ui-browser.cli.cjs
```

脚本通过原生桥 mock 验证四种屏幕、登录/注册/找回/退出、公开缓存、访客付费边界、存档隔离和无 JavaScript 安全状态。mock 不会向 HTTP 服务发送凭证，不能替代后端联调和 iPhone 真机验证。
