# iOS 渠道与小游戏后端交付说明

## 目标

在现有服务中新增独立的 iOS 渠道管理能力。现有 Android 配置必须保持原样，不允许覆盖、改模式、改修订号或删除。

## iOS 应用参数

- 平台：`ios`
- 后台 App ID：`1000151`
- Bundle ID：`com.stone.primitive.saga`
- Apple App Store ID：`6807295253`
- Apple Team ID / App ID Prefix：`ADR4GMT9V3`
- App Store SKU：`PRIMAL-SAGA-IOS-TW-001`
- 渠道：`xmwtwh5sqxssgp1`
- `pf`：`xmwtwh5sqxssgp1`
- `td_channelid`：`xmwtwh5sqxssgp1`
- Web SDK channel：`10000`
- 内容模式：`BOTH`
- 支付类型：`apple`
- 支付渠道：`24`
- 游戏订单 `platformType`：`xmwh5xsqsdtt`

## 地址

- Release 主游戏：`https://saftcdn.antieh.com/stoneage_tw/index_web_xmwtwh5sqxssgp1_https.html?os=ios_wk&pf=xmwtwh5sqxssgp1&td_channelid=xmwtwh5sqxssgp1`
- 内容配置接口：`https://safthwysdk.antieh.com/api/v1/content-config`
- 支付服务：`https://safthwysdk.antieh.com/`
- 游戏订单接口：`https://safthwy09.antieh.com/fx/createOrder.php`
- 用户协议：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html`
- 隐私政策：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html`
- 账号删除：`https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html`

## 小游戏文件

小游戏位于本交付包的 `game/` 目录，入口是 `game/index.html`。必须保持相对目录结构，不要只复制 HTML。

包含：

- `game/index.html`
- `game/styles.css`
- `game/game.js`
- `game/runner-hero-v2.png`
- `game/tutorial-comic.png`

iOS App 当前将小游戏作为本地资源加载。若后端另行提供静态托管，必须保证 HTTPS、正确 MIME 类型和同目录相对路径可用；不要因此删除 App 内置副本。

## 后端实现要求

1. 保留现有 Android 精确规则，不得修改：
   - App ID：`1000150`
   - 包名：`com.studio.dino.stone.saga`
   - 渠道：`xmwtwh5sqxssgp1`
   - 模式：`MINI_ONLY`
2. 新增清晰标识为 iOS 的独立管理入口，例如 `/admin/ios`；现有 `/admin` Android/APK 页面及默认值保持不变。
3. iOS 管理入口默认填写 `1000151 / com.stone.primitive.saga / xmwtwh5sqxssgp1`，页面文案使用 iOS/App，不使用 APK。
4. 保存 iOS 规则时只 Upsert iOS 的三元键，默认模式为 `BOTH`。不得使用 Android 的默认 App ID 或包名。
5. 内容解析保持向后兼容。iOS 客户端会请求：

   `GET /api/v1/content-config?appId=1000151&packageName=com.stone.primitive.saga&channel=xmwtwh5sqxssgp1&versionCode=<build>&versionName=<version>`

6. 增加回归测试，证明新增/更新 iOS 规则不会改变 Android 规则；同时验证 Android 与 iOS 均返回 `source=EXACT`。
7. 部署前运行 `go test ./...`、`go vet ./...`，重新构建 Linux `deploy/paymentd`，更新 `deploy/BUILDINFO.txt` 与 `deploy/SHA256SUMS`。
8. 只把源码、迁移、测试、部署脚本和正式二进制提交 SVN。不要提交 `.env`、`CLIENT_API_TOKEN`、Apple 账号、证书、描述文件、沙盒账号或任何密钥。

## 部署后验收

Android 必须仍返回 `MINI_ONLY`：

```bash
curl -fsS 'https://safthwysdk.antieh.com/api/v1/content-config?appId=1000150&packageName=com.studio.dino.stone.saga&channel=xmwtwh5sqxssgp1'
```

iOS 必须返回 `BOTH`，并且 `source` 为 `EXACT`：

```bash
curl -fsS 'https://safthwysdk.antieh.com/api/v1/content-config?appId=1000151&packageName=com.stone.primitive.saga&channel=xmwtwh5sqxssgp1'
```

后台列表中应能同时看到 Android 和 iOS 两条记录，且 Android 的模式和修订号没有变化。

## 当前线上注意事项

此前从 Android/APK 页面误新增过一条 `1000151 / com.stone.primitive.saga / xmwtwh5sqxssgp1` 的 `MINI_ONLY` 规则。部署新 iOS 管理入口后，应在新入口将该 iOS 精确规则更新为 `BOTH`；不要删除或修改 Android 规则。
