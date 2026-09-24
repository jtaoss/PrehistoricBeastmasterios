# iOS 官网维护开关（客户端契约与 Windows 接入说明）

## 当前范围

本次完成 iOS 客户端和本地回归测试，已将 Debug 1.0.12 (49) 覆盖安装到 iPhone X（iOS 16.7.16）并确认首页正常、已有远征入口仍在。完整原生签名检查通过。尚未完成真实后台 ON/OFF 联调，没有修改线上开关或上传 App。

2026-09-22 用户重新授权通过共享文件夹交接。接入包目录为 `IOS_WEBSITE_MAINTENANCE_20260922_V1`；Windows 端应从当前真实 SVN 工作副本接入，不要使用 Mac 上旧的后端快照覆盖现有服务。文件交付不等于后台已实现或已上线。

后台页面和接口需要 Windows 端在其当前服务源码上接入。仅改后台不能让已安装的旧 App 获得此能力；需先发布并安装包含本功能的新版客户端。

## 后台希望看到的控件

在已有 iOS 管理页 `/admin/ios` 中增加独立的「维护期间显示内容」区域：

- 「只显示网站」：`websiteOnly = true`。
- 「不显示网站，恢复游戏」：`websiteOnly = false`，默认值。
- 官网地址：默认 `https://safthwyk.antieh.com/`，目前客户端仅允许该 HTTPS 域名、默认 443 端口。
- 客服链接：`supportUrls`，最多 10 个完整 HTTPS 地址。站内客服页可以直接打开；外站客服链接需在这里逐项登记，用户点击后在系统浏览器打开。精确匹配完整地址，包括路径、查询和片段，不接受通配符。
- 展示当前修订号、更新时间和状态，提交成功后重新读取服务端结果，不把保存失败显示为成功。

该开关独立于原有 `MINI_ONLY` / `BOTH` / `ONLINE_ONLY` 和内容版本阈值。关闭维护时恢复原先游戏路由，不修改这些字段；当前源码中的临时 `miniOnlyTestGate` 仍然生效。

## 客户端已经使用的接口

```http
GET /api/v1/ios/website-display?appId=1000151&packageName=com.stone.primitive.saga&channel=xmwtwh5sqxssgp1&versionCode=49&versionName=1.0.12
Accept: application/json
Cache-Control: no-cache
```

当前基址来自 `ShellSdkApiEndpoint`：`https://safthwysdk.antieh.com/`。`versionCode` 与 `versionName` 取实际构建信息；示例中的 49 不是新发布版本承诺。版本字段供兼容性和诊断使用，不作为审核身份判断条件。

必须 HTTP 200，全部字段必须存在且类型正确：

```json
{
  "code": 0,
  "data": {
    "appId": "1000151",
    "packageName": "com.stone.primitive.saga",
    "channel": "xmwtwh5sqxssgp1",
    "websiteOnly": true,
    "websiteUrl": "https://safthwyk.antieh.com/",
    "supportUrls": [],
    "revision": 1,
    "updatedAt": "2026-09-22T07:00:00Z"
  }
}
```

关闭时返回 `websiteOnly: false`，并将 `revision` 增大。`revision` 必须是非负整数；同一作用域中的每次有效修改均递增（包括客服 URL 修改），相同修订号必须始终返回相同内容。推荐保存事务中加锁或乐观并发检查，不能仅使用秒级时间戳做修订号。删除规则时应写入更高修订号的 OFF 墓碑，不能退回 revision 0，否则设备会保留较新的 ON。

响应设置 `Cache-Control: no-store`。不使用 302 跳转；客户端会拒绝返回到不同主机或路径的配置响应。

## Windows 端待实现内容

1. 在现有受登录和 CSRF 保护的 iOS 管理 API 中增加 GET/PUT，例如 `/admin/api/ios/website-display`；公共 GET 只读，不接收更改开关的请求。
2. 使用独立表或明确隔离的 iOS 配置记录，按 `appId/packageName/channel` 精确匹配。默认 OFF；不修改 Android 的任何配置、修订号和数据库记录，不使用跨平台通配规则。
3. 后台校验官网固定域名、HTTPS、禁止账号密码和非 443 端口；客服地址只接受明确的客服用途，拒绝游戏/充值目的地。客户端不开放 `saftcdn.antieh.com` 等原游戏域名作为官网，也不把维护网站加入游戏浏览器白名单。
4. 持久化状态、官网 URL、客服 URL、修订号和更新时间为同一事务；记录操作人及开关变更审计日志。PUT 使用当前 revision 防止旧页面覆盖新操作。
5. 迁移与部署默认 OFF；网站及客服正式可用前不启用。现有共享网站回执只证明 Windows 已提交站点源码，不证明站点已部署。
6. 加入服务端测试：默认 OFF、ON/OFF 往返、重启持久化、并发更新、版本号不影响维护状态、Android 隔离、权限与 CSRF、非法 URL 拒绝、修订号不倒退。

此文档不是已上线后台的说明。Windows 接入结果、测试、SVN revision 与部署状态须分别记录在共享包中的回执内；未经另行确认，不部署生产、不打开正式维护开关。

## 客户端行为

- 启动优先使用缓存；缓存 ON 时不先闪现游戏。首次/缓存 OFF 时等待一次有界配置读取，正常请求总时限 5 秒。没有接口、断网或响应不合法则使用缓存；首次没有缓存时进入原游戏。
- 前台期间每 30 秒检查一次，回到前台或网络恢复时刷新配置。后台挂起时不轮询；官网界面不再添加原生刷新按钮。
- 较旧修订号、相同修订号但内容冲突、身份不匹配和缺失开关字段都不会覆盖缓存。网络错误不是 OFF；恢复游戏需要收到明确的新 OFF。
- 原生付款、建单、账号操作、页面切换和弹窗尚未完成时等待；本地游戏还会确认网页付款/发奖、教程和营地操作已完成且存档成功。
- 进入维护后保留游戏 WebView 及本机存档，暂停游戏时钟和媒体，在 App 内展示独立、无原生游戏桥接的 WKWebView 官网原页面，不启动 Safari。App 不添加标题、提示、按钮、加载动画、错误页或弹窗，不注入或修改官网 HTML/CSS/JavaScript；公告、客服、加载和错误交互都由官网负责。恢复时显示原游戏，战斗保持暂停，玩家主动继续。
- 官网采用临时网页存储，不共享游戏 cookies、登录 token 或原生付款桥接；不改变现有游戏导航白名单。
- 官网自己的 HTTP 错误页面也保持原样显示；断网或初次请求失败时不添加原生错误文案、重试按钮或替代页面，可能保留原页面或空白。不会因此开放游戏。网站跨域跳转仍受原白名单限制；已登记的客服链接通过用户点击在系统浏览器打开。

## 验证入口

```sh
node scripts/test-website-display.cjs
node prototypes/emberwild/tests/website-display-browser.test.cjs
node scripts/test-privacy-startup.cjs
node scripts/test-payment-presentation.cjs
node scripts/test-ios-payment-only.cjs
node scripts/test-release-content.cjs
```

浏览器专项依赖 Playwright 和 Chrome，会自动创建隔离的临时浏览器上下文及本地服务器，不使用玩家资料。还需完成真实 iPhone 与正式后台的端到端验收，特别是官网、客服目标页和 App Store 付款期间的显示效果。

### 本次本地验证结果

- Debug / Release 真机 arm64 目标无签名编译通过，构建日志分别在 `/tmp/pbm-website-display-build.log`、`/tmp/pbm-website-display-release.log`。
- 新增配置、缓存、网络与导航策略测试：Release/Debug 各 45 项；原生切换与付款/存档回调竞争 31 项；JavaScript 存档准备 12 个场景通过。
- 浏览器真实游戏检查通过：营地冻结/恢复、战斗保存并保持同一远征、存储失败拒绝切换，无网页脚本错误。
- 既有付款展示 44 项、原生导航 301 项、支付桥接 7 个场景、内容模式 Release/Debug 各 36 项、ATT 启动 28 个场景通过；旧测试替身补齐此前新增的内容路由接口和临时小游戏开关。
- 资源清单防护检查通过；实际打包的 `game/index.html` 在隔离的 macOS WKWebView `loadFileURL` 启动成功，`ready=true`、无 bootError。
- `git diff --check` 通过。以上验证不等于 iPhone 真机验收或正式后台已接入。

### 真机安装补充

- Debug 开发签名构建通过；8 个原生代码文件同团队签名及 App 资源封印验证通过。
- 已覆盖安装并独立启动到 iPhone X，实际截图显示游戏首页及「繼續遠征 · 第 3 波」入口。未卸载 App 或清理玩家数据。
- 真机只验证了安装、启动及当前游戏首页；后台未接入，尚未验证真实配置驱动的维护 ON/OFF、客服和付款期间切换。

## 可直接使用的功能说明

应用包含服务维护显示功能。运营开启维护时，应用在 App 内原样展示固定官方 HTTPS 网站，公告与客服说明由官网提供；维护结束后恢复原有游戏。客户端不添加原生维护标题、提示或操作栏。该功能不会下载替代游戏，也不通过官网执行原生游戏内购。切换前会保存游戏进度并等待正在进行的账号及付款操作完成。请结合实际后台测试方式补充演示步骤；不要向审核人员提供后台管理员凭证。
