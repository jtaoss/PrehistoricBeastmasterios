# 两款游戏共用 SDK 与运营参数的实施方案

日期：2026-10-01

客户端基线：`d405b03`，分支 `codex/restore-two-games-20261001`。
状态：按用户确认，已实现 iOS 主游戏与小游戏共用支付及埋点 SDK；账号互通和新的后台参数管理页面属于后续范围。

## 本次已完成：统一支付与埋点

用户确认无需取得网页 SDK 本体源码，本次直接复用 iOS 主游戏现有支付、验单和统计集成：

- 唯一公共入口：`PrehistoricBeastmaster/Resources/js/game_sdk.js` 的 `window.pbmGameSDK`。两款游戏均在页面开始加载时注入同一文件。
- 主游戏原来的 `xmwsdk.dopay` / `android.pay` 调用通过兼容桥进入公共实现；小游戏商城改用同一 `purchase()` 接口。
- 小游戏只提交商品 ID 和请求 UUID；原生保留已认证账号下单，并把服务器返回的订单交给同一个 `StoreKitManager`、`BackendGateway` 和苹果验单流程。
- 游戏内发货保留精确请求回调、真实交易号和交易幂等检查。支付请求发送、取消、待确认、错误或重复回调均不直接增加商品。
- 公共 `track()` 复用原生 Meta / Firebase；小游戏补齐进入、加载完成、开局、教学开始与完成、结局、离开和成功注册事件。测试模式与教学练习不计入正式游戏过程统计。
- 原生强制赋予 `game_id=main` 或 `game_id=emberwild`。同一套统计代码分别保存游戏上下文与里程碑；已验证苹果交易继续全局去重，防止切换游戏或补单后重复计算收入。
- `getConfig()` 读取同一原生公共应用与渠道参数。苹果价格、币别和收入来自原生已验证交易。网页无法自行上报充值成功事件。
- 新增 `.gitattributes` 固定资源文本使用 LF，保证在 Windows 修改打包后，Mac 的 Xcode 资源哈希校验能得到相同内容。

本次没有迁移账号，也没有新增后台实时修改支付、统计参数的管理页面。现有内容模式配置仍由原来的 `/admin/ios` 管理。

验证结果：公共桥接 6 组场景、小游戏埋点 5 组场景、主游戏保护支付入口的浏览器回归、小游戏打包页面的支付/取消/旧回调/重复回调/单次发货及正常教学埋点检查、原有 15 组埋点桥回归和 31 组存档/发货回归通过。278 个打包清单项目的哈希和完整资源清单校验通过。所有支付、账号与统计测试均使用本地模拟，不涉及真实扣款或服务端流量。

Windows 没有 Xcode / `xcrun`，新增原生统计测试尚未执行，iOS 工程未编译。发布前需在 Mac 执行 `node scripts/test-analytics-flow.cjs`、Xcode 编译，并完成两款游戏的沙盒付款、发货和 Meta / Firebase 后台到账验收。

## 长期目标

主游戏与 Emberwild 小游戏接入同一份公共 SDK 源码，由同一个运营后台维护公共参数。两款游戏分别维护玩法、存档和商品发货，使用 `gameId` 识别各自的业务。

“一套代码”指公共 SDK 只有一份源码、一个版本和一套接口。它可以由构建流程打包到两款游戏使用的环境，不需要人工维护两份副本。

## 实施前已核对的现状

- `Config/Shared.xcconfig` 已共用应用参数，iOS 应用 ID 为 `1000151`，包名为 `com.stone.primitive.saga`，渠道为 `xmwtwh5sqxssgp1`。
- `ContentConfigManager` 已通过 `/api/v1/content-config` 读取后台的 `MINI_ONLY`、`ONLINE_ONLY`、`BOTH` 模式和主游戏地址。
- 主游戏使用在线页面提供的 `xmwsdk` 登录。该 SDK 的源码不在当前 iOS 仓库内；当前桥接回传 UID 和用户名，未提供供小游戏接口使用的已验证授权凭证。
- 小游戏通过 `MiniGameAuthService` 调用 `/v1/emberwild/auth/`，拥有独立的账号和令牌；小游戏下单使用 `/v1/minigame/orders`。
- 两款游戏的苹果扣款与订单确认共用 `StoreKitManager`、`BackendGateway` 和既有苹果验单流程。
- 原生统计共用应用内的 Meta / Firebase 集成。
- 已找到后台工作副本 `D:/Desktop/shiqixjp_go`。其内容配置已有统一应用规则与 `/admin/ios` 管理入口；旧 SDK 兼容接口处理支付服务，小游戏认证位于独立的 `emberauth` 模块。

## 安卓项目查验

已检查用户指定的 `D:/Desktop/PrehistoricBeastmaster`：

- `app/src/main/java/com/playstonegame/prehistoricbeastmaster/MainActivity.java:546` 提供 `xmwsdk.init`、`logincallback`、`dologin` 接入。SDK 返回数据转发给 H5；交给原生账号桥接的内容为 UID 和用户名。
- `app/src/main/java/com/playstonegame/prehistoricbeastmaster/H5Bridge.java` 定义 `android.login`、`pay`、`account`、`sdkEvent` 等公共入口。
- `BackendGateway.java` 接入 `sdk.pay.fororder` 和 `sdk.pay.notification`，可参考其订单协议和平台适配。
- `docs/SERVER_SDK_CONTRACT.md` 存在登录及支付协议确认单。但其中登录接口标记为“建议路径／等待负责人确认”；当前运行代码实际通过网页 SDK 登录，不能将该建议接口当成已部署的账号服务。
- `docs/CONTENT_MODE_CONTROL.md` 与 `ContentConfigManager.java` 提供后台内容开关及应用／渠道参数管理参考。
- 安卓内置小游戏仍是三线跑酷版本，其 `game.js:273` 和 `game.js:300` 使用本地金币、钻石兑换角色和道具，没有接入主游戏 SDK 的登录及真实充值；它不是当前 iOS 的 Emberwild 小游戏。
- 在项目源码、assets、libs 及本地 AAR/JAR 文件中未找到 `xmwsdk` 本体源码或 SDK 分发包。可复用现有桥接和参数设计，真实公共登录仍需要 SDK 凭证协议与服务端验证接口。

## 后续完整统一方案的参数归属

| 参数 | 管理位置 | 两款游戏的关系 |
| --- | --- | --- |
| 应用 ID、包名、发行渠道 | 应用记录及构建配置 | 共用应用身份；已安装包的身份保持一致 |
| SDK 登录配置、账号会话 | 公共 SDK 与后台账号服务 | 共用同一已验证账号及会话 |
| 支付服务、苹果产品映射 | 同一后台的支付配置 | 共用支付流程，按 `gameId` 选择商品和发货业务 |
| 统计配置 | 公共 SDK 与后台报表 | 共用采集服务，事件携带 `gameId` |
| 游戏开关、入口、展示名称 | 同一后台的游戏配置 | `main`、`mini` 各自一条配置 |
| 商品权益、游戏存档 | 各游戏业务 | 分别管理，避免订单或存档串用 |

后台需要显示“公共 SDK 参数”与“两款游戏参数”。运营修改公共参数一次，两款游戏使用同一份结果；游戏自己的开关、入口和商品在该游戏记录中维护。

## 后续完整账号 SDK 接口设想

建议由两款游戏接入统一的 `GameSDK` 接口，方法名待 SDK 接入资料核对后确定：

```text
GameSDK.init(gameId)
GameSDK.getConfig()
GameSDK.getSession()
GameSDK.login()
GameSDK.logout()
GameSDK.purchase(goodsId)
GameSDK.track(event, fields)
```

公共 SDK 负责登录、会话、购买与统计。游戏负责告诉 SDK 当前选中的商品及业务事件；公共 SDK 和后台负责判定账号、游戏、商品、订单和发货对象。

主游戏现有 `xmwsdk` 调用可以先通过兼容适配接入公共实现。小游戏改为调用相同实现，随后移除小游戏独立的账号接入。旧接口在迁移期间服务已有安装包。

## 账号与订单的必需约定

1. SDK / 账号服务提供可在后台验证的会话凭证；UID 和用户名仅用于标识与展示，不能替代授权。
2. 后台用统一 SDK 账号映射两款游戏中的业务身份。已有小游戏账号需明确绑定、迁移或保留策略，避免已有购买记录丢失。
3. 订单保存应用、账号、`gameId`、商品及游戏订单的对应关系。同价位苹果产品的不同购买仍按各自订单发货。
4. 已验证交易、取消、待确认、重试和补单沿用现有语义，支付成功由服务器验单与发货结果决定。
5. 退出或切换账号同步更新两个游戏的公共会话；进行中的订单按原账号完成或恢复。

## 后续账号互通与后台参数管理的落地顺序

1. 结合已找到的安卓接入代码与协议确认单，补齐主游戏 `xmwsdk` 的真实登录凭证、服务端验证接口、退出和已有账号迁移约定。
2. 在公共 SDK 中统一参数读取与游戏上下文；复用当前后台应用规则，并明确公共参数的客户端下发协议。
3. 后台增加公共参数管理及游戏参数管理；配置带版本、缓存与无效配置处理，客户端请求使用该应用对应的配置。
4. 两款游戏接入同一份 SDK 实现，统一账号授权、下单、回调与统计。
5. 验证登录一次后两款游戏共享账号、退出同步、各游戏发货正确、同价位订单互不串用，以及后台改动公共参数后两款游戏读取一致。
6. 验证旧安装包及原 Android 配置的兼容行为，完成 iOS 真机登录和沙盒购买验收。

支付与埋点统一已经实现，不依赖取得 `xmwsdk` 本体源码。后续如需账号互通，仍要确认可由后台验证的会话凭证协议及已有账号映射；当前修改不代表账号已经互通或新的参数管理接口已经部署。
