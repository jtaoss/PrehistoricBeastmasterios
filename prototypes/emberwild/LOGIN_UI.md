# 登录 UI · 本机前端会话

预览：`http://127.0.0.1:4174/login-preview.html`。也可用本目录的 `node serve.cjs`，改为对应端口。

当前登录是本机前端会话，不是云端账号服务，没有账号库、验证码、找回邮件或云存档。登录或注册后仅在 localStorage 保存经过清理的显示名称，不保存账号原文和密码；首页右上角显示当前猎人，并可进入账号管理退出。此逻辑不改变“开始/继续训练”，也不绕过强制新手引导。

## 界面

- 帐号登录：帐号/邮箱、密码显隐、条款勾选、空字段反馈、加载态和本机会话。
- 新玩家注册：猎人名称、邮箱格式、演示密码长度、重复密码检查。
- 找回密码：邮箱字段、发送状态的明确演示，不实际寄信。
- 访客入口：先说明本机进度边界，经点击链接返回现有游戏。
- 退出账号：登录页和游戏账号管理均可退出，只清本机会话，完整保留游戏存档和偏好设置。
- 删除存档：游戏设置内二次确认，只删除教程、营地、伙伴、资源和远征记录；账号会话及声音、画质、操作设置保留。
- 用户协议、隐私政策、删除账号：登录勾选区、登录页底部、游戏首页和游戏设置均提供入口，直接跳转到另一个小游戏正在使用的三条 CloudFront 正式地址。
- App 宿主内优先调用既有 `window.android.sdkToBrowser(url)`；普通浏览器使用受保护的新标签页。三个 URL 使用固定白名单，其他地址不会被跳转模块打开。
- 支持桌面、手机竖屏、小屏和手机横屏；注册表单可以正常滚动；支持键盘 Tab/方向键、原生对话框焦点管理及减少动态效果偏好。

地址加 `?view=register` 或 `?view=recover` 可直达对应设计；这不是登录状态。

## 数据边界

- 不发送任何登录/注册/邮件请求，不保存密码、账号原文、Cookie 或伪造令牌。
- localStorage 只保存本机显示名称和登录时间；界面明确说明尚未连接云端账号服务。
- 「删除账号」只负责跳转到现有账号删除说明页；当前登录 UI 不伪造服务端注销结果，也不自行清理游戏存档。
- 登录或注册后建立本机会话并清空密码字段；找回密码仍只演示界面，不实际寄信。
- JS 未加载时表单保持禁用，避免静态页面意外提交凭据。页面明确提示不要使用真实密码。

## 素材与文件

三张本地工具生成的 PNG 见 [assets/login-v1/PROMPTS.md](assets/login-v1/PROMPTS.md)，提示词全文在同目录 `generation.json`。

- `login-preview.html`：三个表单状态和对话框。
- `login-preview.css`：响应式布局、图片图层及控件状态。
- `login-preview.mjs`：仅本页演示逻辑，完全不依赖主游戏模块。
- `legal-links.mjs`：三条正式 URL 的白名单、iOS 宿主桥接和浏览器跳转兜底。
- `generate-login-ui.mjs`：使用既有本地生图网关；已有图片拒绝覆盖。

## 验证方式

在仓库根目录使用 Playwright CLI：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=emberwild-login-ui open http://127.0.0.1:4174/login-preview.html
npx --yes --package @playwright/cli playwright-cli -s=emberwild-login-ui run-code --filename prototypes/emberwild/tests/login-ui-browser.cli.cjs
```

脚本在独立浏览器上下文验证布局、三种流程、三条跳转、浏览器/宿主桥接分流、没有凭据请求、存储不变及 JS 不可用的安全行为；截图输出到仓库 `output/playwright/`。手机触控模拟不等同于 iPhone 真机验证。
