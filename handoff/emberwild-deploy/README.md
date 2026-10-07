# Emberwild 小游戏部署交接

本次只准备代码及发布包，不上传服务器、不改线上配置。本地源码 `prototypes/emberwild` 和 iOS 内置资源 `PrehistoricBeastmaster/Resources/game` 均保留。

## 重新构建

在仓库根目录执行：

```text
cd prototypes/emberwild
pnpm install --frozen-lockfile
pnpm build:web
pnpm build:ios
```

也可以安装锁定的 esbuild 后在根目录执行 `node scripts/build-emberwild-web.mjs`。构建不要求运维服务器安装 Node；Node 只用于产生静态发布包。

`output/emberwild-deploy/` 包含一个带版本号的 `.tar.gz`、压缩包校验文件，以及同版本展开目录。展开目录中 `public/` 是网站文件，`ops/` 是本说明、Nginx 示例和发布脚本，`VERSION` 是发布编号，`release.json` 和 `manifest.sha256` 是版本与文件校验清单。打包不会删除或覆盖 iOS 内置游戏。

## 运维发布与回滚

以下命令由运维在正式安排发布时执行。本次未执行发布。使用已配置证书的 HTTPS 站点，选一个固定路径，例如 `https://游戏域名/emberwild/current/index.html`。

```bash
sha256sum --check emberwild-web-发布编号.tar.gz.sha256
tar -xzf emberwild-web-发布编号.tar.gz
cd emberwild-web-发布编号
bash ops/deploy.sh verify
bash ops/deploy.sh publish /srv/emberwild
```

将 `ops/nginx-location.conf` 合并到已有 HTTPS `server`，按实际目录和 URL 修改 `alias` / `location`。先执行 `nginx -t`，确认后由运维按原有流程 reload。无需启动小游戏后端进程。

```bash
curl --fail https://游戏域名/emberwild/current/health.txt
curl --fail https://游戏域名/emberwild/current/release.json
```

应返回 `emberwild-ok` 和本次发布编号。检查 `index.html`、`login-preview.html`、两个 bundle、样式、图片和音频均为 200；JS/CSS 使用正确 MIME，未被服务器登录页、404 页或 SPA 回退替换。CDN 如在该路径前方，沿用响应的缓存策略并检查新版本是否已生效。

版本保存在 `/srv/emberwild/releases/发布编号`。发布只在复制、哈希验证完成后原子切换 `current`，不会删除旧版本。回滚：

```bash
bash ops/deploy.sh rollback /srv/emberwild 旧发布编号
```

保持 URL 的域名与路径不变，后续发布和回滚均复用该入口；已有页面下次重新加载时读取对应版本。修改域名或目录需同步 iOS 配置。

## iOS 接入：默认仍加载本地

`Config/Shared.xcconfig` 的 `MINI_GAME_REMOTE_BASE_URL` 默认空值。没有部署地址时，两个游戏的既有入口逻辑保持正常，小游戏继续读取包内资源。确定上线后，在构建配置填写实际 HTTPS 目录，以 `/` 结束，例如：

```text
MINI_GAME_REMOTE_BASE_URL = https:/$()/游戏域名/emberwild/current/
```

`/$()/` 是 xcconfig 对 `//` 的写法。新配置要随包含本次改动的新 IPA 发布；旧安装包不会自动获得远程小游戏能力。两款游戏的显示模式仍由原有内容配置接口决定。

App 只允许该目录内的 `index.html` 和 `login-preview.html` 使用小游戏原生桥接。远程小游戏继续使用同一份 App 内公共支付、埋点 SDK 和 Keychain 认证，真实充值走苹果 StoreKit 与服务器验单。公开网站本身不包含令牌、支付密钥或苹果 SDK；普通浏览器不能代替 App 完成登录或充值。

启用后，远程导航失败、非成功 HTTP 响应或 12 秒内未完成游戏启动会回到内置版本。本次启动内不反复尝试故障入口，重新启动 App 后可再次尝试。回退不会删除游戏文件、账号或苹果订单；仍需真机测试离线、页面 404、缺失 bundle 和支付过程。

## 存档与启用前验收

远程 HTTPS 页与包内文件是不同的存储来源，不能假设浏览器 `localStorage` 中的存档自动共享。内置版本的原存档会保留；首次启用远程版本前，应使用游戏现有存档导出/导入功能迁移或另行实现账号存档同步。自动回退会使用本地已有进度，不会覆盖远程进度。运营需向验收人员明确这一点，避免把旧本地进度当成最新在线进度。

本次没有新增账号或存档后端，也没有改变线上配置。发布前在 Mac 编译 App，执行 `node scripts/test-remote-mini-game.cjs`、`node scripts/test-ios-payment-only.cjs` 和 `node scripts/test-analytics-flow.cjs`，并在真机确认：本地仍可玩、远程正常启动、账号可用、小游戏与主游戏各自发货正确、统计带 `game_id`、取消及重复回调不重复发货、故障回退和存档迁移符合预期。Windows 的浏览器模拟不等于真机 StoreKit 或后台到账验收。
