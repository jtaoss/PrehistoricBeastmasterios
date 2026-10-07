# Game Content and SDK Integration — Operations Review / 遊戲內容與 SDK 串接——營運審閱版

Prepared 2026-09-23; operations edition 2026-09-24. Product: `原始文明：聖獸覺醒`. iOS project version: 1.0.12 (49).

This document describes the implemented game content and SDK integration for operations to review. Before using the review-note draft externally, fill in the real test account and product information and check it against the final signed app.

## English

### 1. Game experience

The app includes a game bundled with iOS and a network-based game. Game switching needs only one user-facing description: users can tap “進入主世界” on the home screen to enter the online game and return to the bundled game from there.

The bundled game has a five-step first-play tutorial and an eight-stage first expedition chapter with different objectives. Its play includes card-based construction, real-time combat, a walkable camp, a merchant for materials and cards, beast companions, and local progress saving. Later chapters labeled “coming soon” are not part of the currently available stages.

### 2. Our game SDK on iOS

**Online-game account SDK.** The H5 game uses `xmwsdk` for its account interface. The page initializes the SDK with the configured app ID and channel, calls `dologin`, and receives the login result through the SDK callback. The iOS shell forwards the resulting game account/session information to the page through the existing JavaScript bridge. The app does not add a separate native social-login SDK for this flow.

**Online-game payment SDK.** When the H5 game requests a purchase through the SDK, the iOS bridge directs that request to native StoreKit 2 rather than the former web-recharge page. The game backend creates an order through `sdk.pay.fororder` and returns the App Store product mapping and account-binding token. After Apple returns a transaction, the client sends its signed transaction to `sdk.pay.notification`; a confirmed result is passed back to the game through `onPayResult`. This describes the integration implemented in source; the final signed build still needs a sandbox purchase and delivery check.

**Bundled-game account and purchases.** The bundled game has its own account service and `miniPurchase` bridge. Its in-game shop defines five supply packs with fixed, displayed card contents: a one-time starter pack, a hire pack, a mixed exploration pack, a weekly-limited pack, and a larger expedition pack. Their product mappings in the source are `pbm_tier_099`, `pbm_tier_199`, `pbm_tier_299`, `pbm_tier_499`, and `pbm_tier_999`. The bundled-game order is created separately and uses the same native StoreKit purchase component; the browser preview does not simulate payment success.

**Event and measurement SDKs.** The native bridge accepts game and role events, including `sdkEvent`, `AF_Event_Name`, `upRole`, and `upLoadAccountInfo`. Supported events are checked and mapped before being sent to Firebase Analytics and Meta App Events. Purchase-success measurement is associated with the verified StoreKit flow. In the current iOS source, native measurement collection is enabled only when iOS tracking authorization permits it. Production H5 scripts and their data behavior should be included in the final SDK inventory.

### 3. Information operations should supply or confirm

- A reviewer account for each game, including server and character details where applicable; provide any required verification method in advance.
- The final online-game URL and a check that its page, game resources, SDK login, and payment callbacks work from the signed iOS app.
- At least one available test product per purchase-enabled game, with its displayed name, product ID, exact in-game entry path, and Apple sandbox purchase/delivery result.
- The SDKs and scripts actually loaded by the production H5 page, and the corresponding privacy-policy and App Store Connect disclosures.
- Screenshots and game descriptions that match the features available in the submitted build.

### 4. English Notes for Review draft

Replace the bracketed fields with verified details. The account and purchase paragraphs should be adjusted to the actual submitted build; do not place real passwords in this repository.

> The app includes a bundled game and an online game; users can tap “進入主世界” on the home screen to enter the online game and return to the bundled game from there.
>
> The bundled game contains a five-step introduction and an eight-stage expedition with card-based construction, real-time combat, a camp, a merchant, beast companions, and locally saved progress.
>
> The online game uses our game web SDK for account login and sends purchase requests through the iOS bridge to native StoreKit 2. Our backend creates the order and confirms the signed App Store transaction before returning the purchase result to the game. The bundled game has a separate account and purchase bridge and offers five fixed-content card-supply packs. [KEEP PAYMENT AND DELIVERY DETAILS ONLY AFTER VERIFYING THEM IN THE FINAL SIGNED BUILD.]
>
> The app integrates Firebase Analytics and Meta App Events for game-event measurement. In the current implementation, native measurement is enabled only when iOS tracking authorization permits it. [VERIFY THE FINAL SDK CONFIGURATION AND H5 DATA FLOWS BEFORE SUBMISSION.]
>
> Bundled-game review account: [ACCOUNT OR GUEST ACCESS]. Online-game review account: [ACCOUNT], password: [PASSWORD], server/character: [DETAILS]. Bundled-game purchase entry and test product: [PATH / PRODUCT ID]. Online-game purchase entry and test product: [PATH / PRODUCT ID]. Account-deletion path: [EXACT STEPS]. Contact through App Store Connect: [CONTACT].

### 5. Source references

Implementation references: [`game/index.html`](../PrehistoricBeastmaster/Resources/game/index.html), [`shop.mjs`](../PrehistoricBeastmaster/Resources/game/shop.mjs), [`InjectedScripts.swift`](../PrehistoricBeastmaster/Web/InjectedScripts.swift), [`BackendGateway.swift`](../PrehistoricBeastmaster/Payment/BackendGateway.swift), [`StoreKitManager.swift`](../PrehistoricBeastmaster/Payment/StoreKitManager.swift), [`TrustedWebView.swift`](../PrehistoricBeastmaster/Web/TrustedWebView.swift), and [`Analytics.swift`](../PrehistoricBeastmaster/Analytics/Analytics.swift). These show the integration in the working source, not a completed purchase in the final IPA.

---

## 繁體中文

編寫日期：2026-09-23；營運版修訂：2026-09-24。產品：`原始文明：聖獸覺醒`。iOS 專案版本：1.0.12 (49)。

本文供營運審閱已實作的遊戲內容與 SDK 串接。對外使用下方審核備註前，須補齊實際測試帳號、商品資訊，並以最終簽署 App 核對。

### 一、遊戲體驗

App 包含隨 iOS 打包的遊戲與需要連網的遊戲。對使用者只需一句話說明切換：可在首頁點「進入主世界」進入線上遊戲，並從線上遊戲返回內建遊戲。

內建遊戲提供五步首次遊玩教學，以及具有不同目標的第一章八關遠征。玩法包括卡牌建造、即時戰鬥、可步行營地、材料與卡牌行商、聖獸夥伴及本機進度存檔。標示「敬請期待」的後續篇章不屬於目前已開放關卡。

### 二、我們在 iOS 上的遊戲 SDK

**線上遊戲帳號 SDK。** H5 遊戲使用 `xmwsdk` 提供帳號介面。頁面以設定的 app ID 與渠道初始化 SDK，呼叫 `dologin`，並透過 SDK 回呼取得登入結果。iOS 容器利用既有 JavaScript 橋接，將遊戲帳號／工作階段資訊交回頁面；此流程沒有另外加入原生社群登入 SDK。

**線上遊戲支付 SDK。** H5 遊戲經 SDK 發起購買時，iOS 橋接將請求交給原生 StoreKit 2，而非舊網頁充值頁。遊戲後端透過 `sdk.pay.fororder` 建單，回傳 App Store 商品對應與帳號綁定 token。Apple 回傳交易後，客戶端把已簽署交易送至 `sdk.pay.notification`；確認後，透過 `onPayResult` 將結果交回遊戲。這是原始碼中的串接設計，最終簽署包仍須進行沙盒購買與發貨驗證。

**內建遊戲帳號與購買。** 內建遊戲使用自己的帳號服務與 `miniPurchase` 橋。遊戲商店定義五種內容與卡牌數量固定且有顯示的補給包：一次性新手包、傭兵包、混合探索包、每週限購包及大型遠征包。原始碼中的商品對應為 `pbm_tier_099`、`pbm_tier_199`、`pbm_tier_299`、`pbm_tier_499`、`pbm_tier_999`。內建遊戲另行建立訂單，並共用原生 StoreKit 購買元件；瀏覽器預覽不會模擬付款成功。

**事件與成效衡量 SDK。** 原生橋接接收 `sdkEvent`、`AF_Event_Name`、`upRole`、`upLoadAccountInfo` 等遊戲與角色事件。支援的事件經檢查與對應後，送至 Firebase Analytics 與 Meta App Events；購買成功衡量與已驗證的 StoreKit 流程相連。目前 iOS 原始碼只在系統追蹤授權允許時啟用原生衡量收集。正式 H5 頁面實際載入的腳本及資料行為，仍應納入最終 SDK 清單。

### 三、請營運提供或確認的資料

- 兩款遊戲各自可用的審核帳號；若涉及區服、角色或額外驗證，請預先提供完整資訊。
- 最終線上遊戲網址，以及簽署 iOS App 中頁面、遊戲資源、SDK 登入和支付回呼的測試結果。
- 每款具購買功能的遊戲至少一項可測商品，包括顯示名稱、商品 ID、遊戲內進入路徑，以及 Apple 沙盒購買與發貨結果。
- 正式 H5 頁面實際載入的 SDK／腳本，以及相對應的隱私政策與 App Store Connect 資料揭露。
- 與送審版本實際功能一致的截圖及遊戲說明。

### 四、繁體中文審核備註對照稿

方括號請以核實資料取代；帳號及購買段落須配合實際送審包調整。真實密碼勿寫入此儲存庫。

> App 包含內建遊戲與線上遊戲；使用者可在首頁點「進入主世界」進入線上遊戲，並從線上遊戲返回內建遊戲。
>
> 內建遊戲包含五步入門教學及八關遠征，提供卡牌建造、即時戰鬥、營地、行商、聖獸夥伴與本機進度存檔。
>
> 線上遊戲使用我們的遊戲網頁 SDK 處理帳號登入，並經 iOS 橋接把購買請求交給原生 StoreKit 2。遊戲後端建單、確認已簽署的 App Store 交易，再將購買結果交回遊戲。內建遊戲使用獨立帳號與購買橋，商店提供五種固定內容的卡牌補給包。[支付與發貨細節須在最終簽署包驗證後保留。]
>
> App 整合 Firebase Analytics 與 Meta App Events 作遊戲事件衡量；目前實作只在 iOS 追蹤授權允許時啟用原生衡量。[送審前須確認最終 SDK 設定與 H5 資料流。]
>
> 內建遊戲審核帳號：[帳號或訪客進入方式]。線上遊戲審核帳號：[帳號]，密碼：[密碼]，區服／角色：[資訊]。內建遊戲購買入口及測試商品：[路徑／商品 ID]。線上遊戲購買入口及測試商品：[路徑／商品 ID]。刪除帳號路徑：[具體步驟]。App Store Connect 聯絡方式：[聯絡人]。

### 五、原始碼參照

實作依據：[`game/index.html`](../PrehistoricBeastmaster/Resources/game/index.html)、[`shop.mjs`](../PrehistoricBeastmaster/Resources/game/shop.mjs)、[`InjectedScripts.swift`](../PrehistoricBeastmaster/Web/InjectedScripts.swift)、[`BackendGateway.swift`](../PrehistoricBeastmaster/Payment/BackendGateway.swift)、[`StoreKitManager.swift`](../PrehistoricBeastmaster/Payment/StoreKitManager.swift)、[`TrustedWebView.swift`](../PrehistoricBeastmaster/Web/TrustedWebView.swift) 與 [`Analytics.swift`](../PrehistoricBeastmaster/Analytics/Analytics.swift)。這些反映目前工作目錄的串接，並非最終 IPA 已完成付款的證據。
