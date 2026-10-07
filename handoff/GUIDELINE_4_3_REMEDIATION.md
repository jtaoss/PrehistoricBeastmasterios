# Guideline 4.3(a) 退回：证据、待证假设与下一步

日期：2026-09-17（第二版，修正第一版的多处误判）。

**本文范围：只处理 4.3(a)。** 其他条款（5.1.1(v) 账号删除、4.8 Sign in with Apple、3.1.1 外部充值、
5.2.1 卖家名称、隐私披露）不在本文范围，见 `APP_REVIEW_READINESS.md`。

**证据来源与本文的效力边界：**
本文的「已核实」部分来自对本仓库源码与归档包的直接检查，可复现。
「待证假设」部分来自公开检索，其中相当一部分出自可靠性不明的第三方博客与论坛帖，
**不能作为改动生产代码的依据**。两类内容在文中分节标注，不要混用。
本文不是苹果预审结论，也不保证下次通过。

## 0. 需要先在 App Store Connect 确认的两件事

1. **被拒的构建号。** 本仓库无法证明。`output/appstore-1.0.12-47-20260914/交付说明.txt` 与
   `output/appstore-1.0.12-48-20260914/交付说明.txt` 都写明「本次仅出包，没有上传、提交审核」，
   因此归档目录不能推断实际提交的是哪一版。本文的包体证据取自 **`appstore-1.0.12-48-20260914`
   归档中的 1.0.12(48)**，因为交付说明写明「后续请使用第 48 版」。
   若实际被拒的是其他构建，本文第 2 节需按该构建重新核对。
   （第一版本文档误用了桌面上 2026-09-07 的 1.0.12(17) 归档，已更正。）
2. **退回原文中是否点名了对比对象。** 若 Resolution Center 消息里有更具体的表述，
   它的信息量高于本文所有推断，应优先据此判断。

## 1. 判定性质

4.3 判的是「这个包看起来像什么」，不是「这个包有什么 bug」。
此前 42/45/46 针对 3.1.1、5.1.1、隐私做的修复，对 4.3(a) 不产生作用。

退回原文的关键句是「shares a similar binary, metadata, and/or concept as apps submitted to the App Store
by you or other developers」。三个可能的匹配面 —— 二进制、元数据、概念 —— 苹果没有说是哪一个。
**本文无法确定是哪一个，任何声称已确定的表述都是推断。**

随附的 Extended Review 段落是升级警告：同一形态反复提交会延长审核，并可能影响开发者计划资格。
因此在拿到更具体的说明之前，不提交新构建。

## 2. 已核实的事实（可复现，扫 1.0.12(48) 归档与当前源码得出）

### 2.1 已排除的三条重嫌疑

- **不是跨多账号提交。** Apple 侧只有一个开发者账号，本作只从该账号提交。
- **不是商业模板包，不涉及 4.2.6。** 本壳由 Codex 依据本方自有安卓工程编写，
  非购买模板、非第三方代理生成。`ios/README.md` 记录安卓工程仅作协议与行为参考。
- **不是他人产品被重新打包。** 本作自研自发；Google Play 版本同属本方，
  只是该平台使用了另一个账号注册，因此显示的发行商名称为 Unicorn Studio (UNI)。
  4.3(a) 的比对集合是「已提交到 App Store 的应用」，Google Play 不在其中。

### 2.2 二进制中残留安卓桥命名

1.0.12(48) 主二进制中存在以下字符串：

- `window.android.pay`
- `window.android.account`
- `window.android.returnToGameCenter`
- `window.android.sendToNative`

成因是 Codex 依据自有安卓工程编写时沿用了原命名。这是可核实的事实。
**但「这个命名触发了 4.3(a) 判定」是推断，没有证据**，见第 3.2 节。

### 2.3 导航策略实际上是单一 URL 锁定（更正第一版的错误判断）

第一版称「白名单里并列两个不同域的 CDN，是一壳多游戏的直接证据」。**这个判断是错的，现更正。**

实际情况：`IOSWebNavigationPolicy.allowsInWebView` 只允许三类目标 ——
包内 `game/` 目录下的本地文件、登录 URL、以及**与 `ShellOnlineGameURL` 的 host、port、path 完全相同**的 URL。
`TrustedWebView.shouldAllow` 现在就等于 `isTrustedTopLevel`，没有额外放宽。
1.0.12(48) 的 `ShellOnlineGameURL` 是一个具体页面：

```
https://saftcdn.antieh.com/stoneage_tw/index_web_xmwtwh5sqxssgp1_https.html?os=ios_wk&pf=xmwtwh5sqxssgp1&td_channelid=xmwtwh5sqxssgp1
```

即：**这个壳在导航层面只能进入一个页面，无法被切换到另一款游戏。**

`xundaocdn.xmw520.com` 在二进制中出现 2 次，均为**页面加载完成后的宿主判断**，不是导航许可：

- `InjectedScripts.loadingRecovery`（第 12 行）：仅当页面 host 是这两个之一时才安装加载重试逻辑；
- `GameViewController.onWebPageFinished`（第 564 行）：据 host 决定是否隐藏调试 UI、注入支付桥、加返回按钮。

因此「一壳多游戏」的说法不成立。仍值得确认 `xmw520` 的归属并在无关时清理，
但这属于代码整洁，**不是已证实的 4.3 成因**。

### 2.4 远程内容开关可改变主功能形态

`Content/ContentConfig.swift` 的 `MINI_ONLY / ONLINE_ONLY / BOTH` 由后台下发。
这是事实。它与 4.3(a) 的关联是推断，见第 3.2 节。`APP_REVIEW_READINESS.md` 记录后台当前读取为 `BOTH`。

### 2.5 支付桥字段与多家 H5 渠道聚合 SDK 的公开文档同构

`nativePay(amount, cpOrder, channel, serverId, serverName, goodsID, goodsName, roleID, roleName, roleLevel, payTypeId)`
与 QuickSDK、坚果游戏开放平台、U8SDK、17m3 开放平台公开文档中的下单字段一一对应。
已确认本方未接入上述任何 SDK，字段来自自有安卓工程沿用的通用下单结构。

**这只是一个命名同构的观察。「因此落入同一二进制指纹簇」是推断，没有证据支持，
不足以作为批量改动支付桥的依据。** 支付桥改名一事暂缓，见第 5 节。

### 2.6 没有任何原生差异化能力

原生层 18 个 Swift 文件、5751 行：

| 模块 | 行数 | 用户可感知 |
| --- | --- | --- |
| `Payment/*`（StoreKit、网关、下单路由、诊断） | 2446 | 否 |
| `Analytics/Analytics.swift` | 721 | 否 |
| `Web/*`（WebView、注入、API 代理、音乐） | 1443 | 否 |
| `GameViewController.swift` | 789 | 否 |
| 其余（配置、内容开关、隐私阅读页） | 352 | 部分 |

全量检索 `UIImpactFeedbackGenerator`、`UINotificationFeedbackGenerator`、`CoreHaptics`、
`GameKit`/`GKLocalPlayer`、`UNUserNotificationCenter`、`CoreMotion`/`CMMotionManager`、
`WidgetKit`、`ActivityKit`、`SKStoreReview`：**零命中**。

### 2.7 本地小游戏是真实的离线内容（申诉主证据）

1.0.12(48) 包体 32MB，其中 `game/` 占 17MB：

- `game.js` 2215 行，含关卡模式与无尽模式、商店与皮肤购买装备、排行榜与个人纪录、
  教学漫画、粒子与地图主题；
- 音频 `canopy-hop.m4a` 4.3MB、`canopy-afternoon.mp3` 2.2MB、`sfx-data.js` 372KB；
- 美术 `tutorial-comic.png` 2.1MB、4 张 1.7MB 恐龙贴图、`runner-hero-v2.png` 325KB。

资源全部本地打包，**飞行模式下可完整游玩**。这是本文中唯一无需依赖推断即可向审核员演示的差异化事实。

### 2.8 二进制中没有模板残留字符串

扫 `template|boilerplate|starter kit|placeholder|TODO|sample` 等关键词，
命中项全部是 Firebase / GoogleAppMeasurement 内部符号（`APMMonitoringSampledData`、`FIRLoggerWrapper` 等）。

## 3. 待证假设（不可作为改动依据）

### 3.1 检索到的资料的可靠性分级

- **可靠（苹果自有）：** 审核指南原文；Resolution Center 回复机制与操作路径；
  App Review 一对一预约的存在（`developer.apple.com/events`）；App Review Board 申诉表单。
- **仅为个案陈述（开发者论坛、Reddit，真实但无法验证普适性）：**
  Notes to Reviewer 被反复强调、有人删掉独特性说明后 4.3(a) 复发、有人通过电话沟通打破循环。
  这些值得参考，但不能当作机制说明。
- **可靠性不明（第三方博客／SEO 内容站）：** 关于「三层指纹」「自动层比对近期被拒 spam 包」
  「AI／低代码应用命中率最高」等描述，均出自此类来源，苹果未做过对应表述。
  第一版文档把其中若干条写成了定论，现全部降级为待证。

### 3.2 具体假设清单，及各自的证据状态

| 假设 | 证据状态 |
| --- | --- |
| `window.android.*` 命名触发了判定 | 无证据。命名残留是事实，因果关系是推测 |
| 支付字段同构导致二进制指纹匹配 | 无证据。同构是事实，指纹匹配是推测 |
| 首次提交、账号无信誉记录会加重判定 | 无证据，仅见于可靠性不明来源 |
| Firebase / Facebook SDK 属于「苹果白名单」不计入内容判定 | **无证据。此说法出自 uni-app 厂商文档，非苹果表述。第一版误当作事实，现更正** |
| AI 辅助生成的代码在 4.3 上风险更高 | 无证据，仅见于 SEO 内容站 |
| 零原生差异化会被判为「网页壳」 | 与 4.2 相关有指南依据；与 4.3(a) 的因果关系无证据 |
| 恐龙跑酷属饱和品类会加重判定 | 属 4.3(b) 语境，本次退回为 4.3(a)，关联性未证实 |

**唯一能确定的是：苹果认为存在相似性，但没有说明相似于什么。** 因此下一步的首要目标是问清楚，
而不是按上表任一行去改代码。

## 4. 下一步：先请求说明，不提交构建，不正式申诉

顺序如下：

1. **通过 App Store Connect 的 App Review 消息请求说明。**
   路径见苹果帮助文档「Reply to App Review messages」。此操作不需要新构建、不消耗提交次数。
   目标是问出苹果比对的是二进制、元数据还是概念，以及是否可指明对比对象。文案见第 6.1 节。
2. **同时准备演示材料**：飞行模式下把本地小游戏从头玩到尾的屏录、逐步操作路径、审核账号，
   以及证明 Play 侧账号同属本方的材料（营业执照或商业登记、Play Console 该游戏的开发者页面截图、
   `playstonegame.com` 官网主体信息）。这些材料无论走哪条路都要用。
3. **电话沟通作为备用手段**，在文字往来无法问出具体信息时使用。
   拒信底部有预约链接，也可在 `developer.apple.com/events` 筛 "App Review"，名额时有时无。
4. **暂不向 App Review Board 正式申诉。** 在不知道对比对象的情况下正式申诉，
   既无法举证也无法反驳，且会消耗一次升级机会。

## 5. 暂缓执行的改动

在第 4 节问出更具体信息之前，以下改动**不执行**：

- **支付桥批量改名（原 P0）暂缓。** 依据仅为第 2.5 节的命名同构观察，因果关系未证实；
  该改动涉及支付链路与远程 H5 的联调，风险与收益不成比例。
- **删除 `xundaocdn.xmw520.com` 判断**：可作为代码整洁项排期，但按第 2.3 节，
  它不是「一壳多游戏」的证据，不必作为 4.3 措施紧急处理。
- **重命名贴图、压缩图片**：无证据表明与 4.3 判定有关，不列为整改项。

以下改动的性质需要说清楚：

- **`window.android.*` 改名**：低风险、低成本，且能消除「安卓移植壳」的直观印象。
  可以做，但**理由是代码表达清晰，不能宣称这是 4.3 的解决办法**。
- **Game Center 排行榜、触感反馈**：属于产品体验优化，能给「这个 App 比网页多了什么」
  提供具体答案。**但没有证据表明做够几项就能通过 4.3(a)**，不设「至少两项」这类指标。
  若决定做，按产品价值排期，不按审核指标排期。
- **远程内容开关写死**：需要产品与运营权衡，不因本文推断而决定。

## 6. 文案

### 6.1 请求说明（英文，可粘贴到 App Review 消息，方括号处替换）

> Hello, and thank you for the review.
>
> We would like to understand the similarity finding better so that we can address it correctly, and we would rather ask than guess and resubmit the wrong change.
>
> **Could you tell us which aspect the finding refers to — the binary, the metadata, or the app concept?** If you are able to indicate what our submission was compared against, we will address it directly.
>
> Some context that may help:
>
> - We developed this game, 原始文明：聖獸覺醒, in house. The Android version on Google Play is also ours; it appears under the developer name Unicorn Studio because that account was registered separately from our Apple Developer account. We have attached [营业执照或商业登记] and a screenshot of our Google Play Console for this title. This is the only app submitted from our Apple Developer account, and we hold only this one account.
> - The app was not built from an app template, an app-generation service, or a purchased boilerplate, and it was not submitted on behalf of a third party. The iOS client was written against our own existing Android project.
> - The build includes a complete arcade game bundled inside the binary, playable with no network at all. In Airplane Mode the reviewer can play it end to end: [N] stages plus an endless mode, a shop with equippable character skins, local per-stage records and a leaderboard, and an illustrated tutorial. The artwork and audio were produced for this title. Offline path: [逐步点击路径]. A screen recording is attached.
> - The app also provides our online game, which loads from a single fixed URL configured in the build; the app cannot navigate to any other game.
>
> Demo account: [account] / [password].
>
> If it would be easier to go through the app together, we would welcome an App Review appointment — a short walkthrough may resolve this faster than written exchanges.
>
> Thank you for your time.

使用须知：

- 本次沟通聚焦 4.3。其他事项单独记录和核实；提交前仍须保证功能完整可访问、审核资料与隐私披露真实完整。
  **不以「避免被检查」为理由隐瞒任何实际功能** —— 苹果要求提供完整访问与准确元数据。
- 附件必须真的附上。只写文字不附材料没有说服力。
- 方括号内容必须与实际情况一致，`[N]` 需先数准关卡数。

### 6.2 Notes to Reviewer

多个开发者个案提到审核员会读 Notes、而可能略过商店描述，其中一例称删掉独特性说明后 4.3(a) 复发。
这是个案陈述而非机制，但成本极低，值得照做：在 Notes 顶部固定一段说明 App 独特之处，
新版本说明写在其下方，不要覆盖。内容只写构建里真实存在的东西：

> This app ships a complete offline arcade game inside the binary: [N] stages plus an endless mode,
> a shop with equippable skins, local records and a leaderboard, and an illustrated tutorial —
> all playable in Airplane Mode with no network. Artwork, audio and game logic were produced for this title.
> The online portion loads from a single fixed URL configured in the build.
>
> Offline verification path: enable Airplane Mode, then [逐步点击路径].
>
> Ownership: we developed this title in house. The Google Play version, listed under the developer name
> Unicorn Studio, is also ours — a separately registered account for that platform.
>
> Demo account: [account] / [password]

## 7. 不要做的事

- 不要为降低相似度做代码混淆、塞无用代码、改包名重提。
- 不要新开开发者账号。这会把单次 4.3 升级为账号层面的 spam 模式认定。
- 不要在没有新信息的情况下重复提交同一形态的构建。
- 不要为审核单独切换 `content-config`，让审核员看到与线上不同的 App。
- 不要为 4.3 拆掉 Firebase / Facebook SDK。注意：「这些 SDK 在苹果白名单内」的说法本身未经证实，
  但同样没有证据表明拆掉它们会改变 4.3 判定，因此不作为整改项。
- 不要把本文第 3 节的待证假设当作已确认原因去改生产代码。

## 8. 待确认

1. **被拒的构建号**（App Store Connect，第 0 节）。若不是 1.0.12(48)，第 2 节需重新核对。
2. 退回消息中是否有比本文更具体的表述。
3. 本地小游戏的关卡数确切数字，用于第 6 节的 `[N]`。
4. 飞行模式下进入本地小游戏的逐步点击路径。
5. 提供给审核员的账号。
6. `xundaocdn.xmw520.com` 的归属（代码整洁项，非紧急）。

## 参考

- App Store Review Guidelines：<https://developer.apple.com/cn/app-store/review/guidelines/>
- 回复 App Review 消息：<https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/reply-to-app-review-messages/>
- 预约 App Review 一对一：<https://developer.apple.com/events/>
- App Review Board 申诉表单（暂不使用）：<https://developer.apple.com/contact/app-store/>
