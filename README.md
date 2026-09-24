# PrehistoricBeastmaster iOS shell

iOS WKWebView shell for **原始文明：聖獸覺醒**. The Android project in this repo is a **protocol and behavior reference** only — iOS does not ship Google Play Billing or native Google/Facebook login. Firebase is used only for Analytics when its iOS configuration file is present.

## Game entry control

The iOS app loads the bundled Emberwild mini-game and the configured online game according to the effective `mode` returned by `GET /api/v1/content-config`. `MINI_ONLY` shows the bundled game, `BOTH` exposes both entries, and `ONLINE_ONLY` opens the online game. The backend also supplies `onlineGameURL` whenever it enables the online game; a response that enables it without a valid URL is ignored. The client reads the last valid response at startup, defaults to `MINI_ONLY` without a cache, and refreshes at startup and when returning to the foreground. Checkout and account operations defer a route switch until they finish. The bundled game files remain in the IPA.

The endpoint is set by `CONTENT_CONFIG_ENDPOINT` in `Config/Debug.xcconfig` and `Config/Release.xcconfig`. The backend rule is keyed by iOS app ID `1000151`, bundle ID `com.stone.primitive.saga`, and channel `xmwtwh5sqxssgp1`. The client permits only a validated HTTPS URL on the approved game origin with the expected `ios_wk` bridge and channel parameters. See `../docs/CONTENT_MODE_CONTROL.md` for the management flow. A new IPA is required before an installed older build can use this behavior. A remotely returned URL is visible to anyone who reads the public API or observes game traffic; moving it out of the bundle is not access control.

## Login model (iOS)

Login is **Web SDK only**:

1. H5 calls `android.login()` (bridged from `window.android`).
2. Shell injects `xmwsdk.init` + `xmwsdk.dologin()`.
3. Web SDK handles account UI and provider flow in the page.
4. Result returns to H5 via `javaCallBack({func:"loginSuccess", ...})`.

No Firebase Auth, Sign in with Apple SDK, or native OAuth SDK is required on iOS for this game. Provider tokens stay inside the Web SDK; the shell only forwards the resulting `uid` / `user_name` / `session` fields.

The Meta App Events SDK and Firebase Analytics event pipeline are integrated on iOS. `sdkEvent`,
`AF_Event_Name`, `upRole`, and `upLoadAccountInfo` are bridged to native event validation and
deduplication. Payment events are emitted only from the verified StoreKit flow.

## Parity with Android (protocol only)

| Area | Android | iOS |
| --- | --- | --- |
| JS bridge name | `window.android` | `window.android` (via WKWebView message handler) |
| Login | Web SDK `xmwsdk` | Same |
| Payment | Google Play Billing | StoreKit 2 |
| Backend order | `sdk.pay.fororder` | Same (`type=apple`, `payChannel=24`) |
| Backend confirm | `sdk.pay.notification` | Same (signed App Store transaction JWS) |
| Content mode | Remote `content-config` | Same |
| Bundle / channel | `com.studio.dino.stone.saga` / `xmwtwh5sqxssgp1` | `com.stone.primitive.saga` / same channel |
| App ID | `1000150` | `1000151` |

Product IDs reuse the approved `pbm_tier_*` price tiers. The backend must return `applesku` (or `iossku`) from `sdk.pay.fororder`.

## App Store payment only (build 42 candidate)

iOS uses StoreKit 2 exclusively. `ShellConfig.payType` is fixed to `apple`. The legacy web-recharge screen, return button, role-prefill state, configuration and `payform_bridge.js` resource have been removed, not merely hidden. Existing Apple verification, delivery recovery, checkout gates and server routing are preserved.

The document-start payment bridge protects `xmwsdk.dopay` before the vendor SDK assigns it, including subsequent SDK replacement/reload. It dispatches to the native Apple handler only; missing native support does not fall back to web billing. Historical `android`/Google-named H5 bridge aliases are compatibility names, not Google Play Billing implementations.

Document navigation, final navigation responses/redirects, popups, native URL loads and `sdkToBrowser` share an allowlist in `IOSWebNavigationPolicy`. Only the configured main-game entry/local game and explicit authentication routes may load in the web view; external opening is limited to the three legal pages and approved authentication routes. Unknown destinations, including the old recharge host, fail closed. SDK scripts, images and game/API requests are not affected by this document policy. New legitimate support/authentication destinations require deliberate allowlist review, not a whole-domain payment exception.

Run `node scripts/test-ios-payment-only.cjs` for the real bridge and Swift navigation-method tests, and `node scripts/test-ios-payment-browser.cjs` with Playwright available for isolated browser/Window semantics tests. These tests do not purchase anything or contact a payment provider. Real-device login/checkout and the live game's banners/links still need final acceptance testing before distribution.

## URL and SDK parameters

iOS uses the production H5 entry with the same distribution parameters as Android. Its `os` value is intentionally `ios_wk`, because the H5 client uses that value to call the WKWebView message handlers implemented by this shell.

| Parameter | Android | iOS |
| --- | --- | --- |
| Debug online game | `index_tw_https.html?os=x5_android&pf=xmwtwh5sqxssgp1&td_channelid=xmwtwh5sqxssgp1` | `index_web_xmwtwh5sqxssgp1_https.html?os=ios_wk&pf=...&td_channelid=...` |
| Release online game | `index_web_xmwtwh5sqxssgp1_https.html?os=web&pf=...&td_channelid=...` | `index_web_xmwtwh5sqxssgp1_https.html?os=ios_wk&pf=...&td_channelid=...` |
| Distribution channel (`pf`) | `xmwtwh5sqxssgp1` | Same |
| Backend app ID | `1000150` | `1000151` |
| Web SDK `xmwsdk.init` channel | `10000` | Same |
| Payment backend | `https://safthwysdk.antieh.com/` | Same |
| Game order endpoint | Per-server router in current Windows source | Same mapping in `GameOrderEndpointRouter.swift` |
| Game order `platformType` | `xmwh5xsqsdtt` | Same |

Test payment callback (`saft.antieh.com/audit/callbk.php`) and `playstonegame.com/h5sdk/js/js.js` are owned by the H5/game server; the shell loads the game URL and does not configure them separately.

Game orders resolve the first nonempty `sid` / `serverId` / `server_id` / `sercerId` using the Windows Android reference at commit `30dc87b1cfbc5c046aa948fc3df196cbd3e8255a` (received 2026-09-11). Region is integer division `sid / 1000 + 1`, for IDs 1–8999. Region 1 uses `safthwy.antieh.com/fx/createOrder.php`; region 3 uses `safthwy02.antieh.com/fx16/createOrder.php`; other regions use `safthwy0N.antieh.com/fx/createOrder.php`. Preserve query parameters and override only `platformType`. Missing/invalid/out-of-range IDs retain the normalized original URL, matching Android; they never fall back to region 9. `GAME_ORDER_ENDPOINT` is retained only for legacy URL interception, not as a fixed destination. Login and server-list rewriting are unchanged. `node scripts/test-game-order-router.cjs` compiles the production Swift router and checks all supported IDs, aliases, query preservation and invalid-ID handling without making network requests or orders. The supplied Android source/test result does not prove which code is in an already-installed Android binary.

## Open in Xcode

```bash
open ios/PrehistoricBeastmaster.xcodeproj
```

Select your Team, then run on a device or simulator. The shared scheme leaves StoreKit configuration unset so development-signed device builds use Apple's sandbox. To use Xcode's local StoreKit environment, select `Products.storekit` temporarily in **Edit Scheme → Run → Options**.

For repeatable local payment testing, choose the shared `PrehistoricBeastmaster-LocalStoreKit` scheme. It loads `Products.storekit` only for Debug runs and is not used for Release archives.

Keep Xcode DerivedData and Swift Package Manager checkouts outside this repository. Use Xcode's default DerivedData location, or pass an external temporary path to `-derivedDataPath`; do not point it at `ios/build`. Only the package declarations and `Package.resolved` version lock belong in source control.

Before installing any manually signed device build, run `bash ios/scripts/verify-device-signatures.sh /absolute/path/PrehistoricBeastmaster.app`. Sign every embedded framework and root-level dylib (including `PrehistoricBeastmaster.debug.dylib` and `__preview.dylib`) with the app's identity **before** signing the enclosing app. A successful installation or top-level `codesign --verify --deep` alone is not a launch check. After installation, launch the app without a debugger and confirm the new build's startup log and visible screen.

Regenerate the Xcode project after adding Swift files:

```bash
python3 ios/tools/generate_xcodeproj.py
```

## Configuration

Build settings live in `ios/Config/`:

| File | Purpose |
| --- | --- |
| `Shared.xcconfig` | Bundle ID, app ID, channel, SDK endpoint defaults |
| `Debug.xcconfig` | Debug game URL, local content-config HTTP |
| `Release.xcconfig` | Production game URL and HTTPS content-config |
| `Secrets.xcconfig.example` | Template for `PAYMENT_API_TOKEN` |

For Release / TestFlight builds, copy the example and include it from `Release.xcconfig`:

```text
#include "Secrets.xcconfig"
PAYMENT_API_TOKEN = <operations CLIENT_API_TOKEN>
```

Never commit `Secrets.xcconfig`.

## Analytics

Swift Package Manager pins Meta `FacebookCore` 18.1.1 and Firebase 12.18.0. Meta App Events is configured from `Shared.xcconfig` and disables automatic event and advertiser-ID collection. Build 45 conservatively gates both native measurement SDKs on live system ATT authorization, not the old `privacy_accepted` preference. Firebase collection defaults to disabled in `Info.plist` and is enabled only after ATT authorization and matching-bundle initialization. Events submitted before authorization/initialization or while permission is denied are discarded, not queued for later replay.

Disabling IDFA is **not** proof that ATT is unnecessary. Operations must still check actual cross-company advertising/measurement uses of Meta, Firebase and the web SDKs, and align the published privacy policy and App Store privacy disclosures. ATT grants tracking permission, not acceptance of user agreements or blanket consent for unrelated data use. Blocking both SDKs without ATT is this app's conservative policy; Apple does not require ATT for every form of nontracking analytics.

## Native ATT flow (build 45 candidate — not installed)

The native startup agreement/consent UI introduced in build 41 has been removed,
including its buttons and action handlers, not merely hidden. Startup enters the
game once the window is attached, retaining the existing content-mode routing.
The mini-game's user-agreement and privacy-policy buttons/URLs are unchanged.
Opening the game or reading either document never writes `privacy_accepted`.

The game appears before calling `ATTrackingManager.requestTrackingAuthorization`.
Requests require an active app, a visible game view, no presented modal and no
active/finishing checkout. There is one request attempt per process, only for
`.notDetermined`; denial, restriction or a missing callback never block gameplay,
login or payment and never trigger a prompt loop. `NSUserTrackingUsageDescription`
explains native Firebase/Meta usage in Traditional Chinese. The existing agreement
buttons do not grant ATT, and old accepted users need an actual system grant too.

Authorization initializes each SDK once. Launch options survive the permission
wait; activation follows the app lifecycle. Foreground changes in Settings are
re-read, including revocation. Revocation stops app event submissions, disables
Firebase collection and switches Meta to explicit-only flushing; the app never
manually flushes while denied. Meta's iOS 16 tracking flag is updated; iOS 17+
uses the SDK's system-ATT handling. Reauthorization resumes collection without
initializing another SDK instance. This is not a guarantee that an SDK request
already in flight can be recalled; denied/authorized network behavior still
needs real-device capture.

The native manifest now declares tracking for the existing measurement data;
`ep1.facebook.com` comes from the pinned Meta SDK's manifest, not a guessed list
of authentication domains. SDK manifests remain bundled. Operations must review
the merged privacy report, all actual SDK data uses and App Store Connect labels.
Remote H5 TalkingData/Fundebug or other vendor scripts are not controlled by this
native SDK gate and still need a separate privacy audit; do not call this full
app-wide ATT compliance. No login, game-progress or payment journals are cleared.

`node scripts/test-privacy-startup.cjs` checks 25 isolated ATT/startup scenarios,
including old agreement records, restrictions, denied/stale/missing callbacks,
modal/payment conflicts, revocation/re-enabling, iOS 16/17 Meta settings and
unchanged mini-game legal links. Debug/Release compilation passed for build 45.
No system permission was answered by the agent, no real payment was made, and
this candidate has not been signed or installed.

Run `node scripts/test-privacy-startup.cjs` for production-method tests using SDK/UI doubles. These tests do not contact an analytics backend, sign in to Apple, delete accounts, use a simulator or install anything. Native Debug/Release compilation and real-device UI/network verification are separate checks.

Account deletion still needs an end-to-end check in the online game's account settings. The local legal-link button alone is not proof of a working deletion flow. See `handoff/APP_REVIEW_READINESS.md` for remaining review work; this startup patch does not certify App Review approval.

## Firebase configuration

The supplied `GoogleService-Info.plist` for `com.stone.primitive.saga` is now included in the app's Copy Bundle Resources. Initialization checks its bundle ID before configuring Firebase. To replace it for another authorized Firebase app:

1. Register the case-sensitive iOS bundle ID `com.stone.primitive.saga` in the existing Firebase project.
2. Download its `GoogleService-Info.plist` to `ios/PrehistoricBeastmaster/GoogleService-Info.plist`.
3. Keep the file in Copy Bundle Resources. It is already registered in the current Xcode project; do not regenerate the entire project just to replace its contents.

Without a matching file, Firebase remains disabled and the app continues normally. SDK initialization or enqueue logs do not prove dashboard delivery. Validate a development build with the launch argument `-FIRDebugEnabled`, then have operations confirm the events in Firebase Analytics DebugView; use `-FIRDebugDisabled` afterwards. Do not bake debug arguments into distribution schemes. `3_days_login` and `7_days_login` are renamed only on the Firebase stream to satisfy its event-name rules; Meta preserves the operations keys.

All custom payment events, including operations price tiers, reject direct H5 submissions. Purchase/tier events are emitted after the native payment success callback, require transaction ID and complete StoreKit product information, and deduplicate by transaction across role changes and restarts. Revenue uses StoreKit's actual amount and currency; the game's USD cumulative milestone uses the verified SKU's reference USD tier, never adds a TWD payment to a USD total. `node scripts/test-analytics-flow.cjs` validates these guards without contacting analytics or creating purchases.

The iOS bridge forwards the game's `NewRole_5minute` task event and also keeps an Android-compatible five-minute fallback after `NewRole_Tutorial`. The fallback is scoped and persisted per role, retries a failed bridge delivery, and cannot attach an old timer to a different role. The stone milestone reports the first eligible loaded balance once per role, including an initial balance already at 300,000. First-day month-card reporting additionally requires verified SKU `pbm_tier_499`, regardless of its localized price. Nonpayment role events arriving before role identity are held in memory (up to 64 events / 5 minutes), replayed in order for a compatible role, and cleared on logout/account change; tutorial duration retains the original event times. Run `node scripts/test-analytics-bridge.cjs` and `node scripts/test-analytics-flow.cjs` for the bridge and native regression checks. Android's operations event names, Firebase retention aliases and parameter allowlists were compared read-only and remain compatible.

The follow-up fixes passed 21 native analytics, 15 JavaScript bridge and 19 payment/diagnostic isolated tests. Development build 1.0.12 (19) was signed, installed over the existing iPhone X app without uninstalling, and launched with Firebase debug mode disabled. This checks the local implementation and startup, not all 16 events in the operations dashboard or a successful real sandbox purchase.

Device check (2026-09-09 UTC, iPhone X / iOS 16.7.16, development build 1.0.12 (18)): Firebase initialized and its upload endpoint returned HTTP 204; real `view_content` and `Loading_completed` events reached the native SDK pipeline. Debug mode was disabled afterwards. Dashboard visibility remains for operations to confirm; real sandbox payment and purchase analytics are not yet accepted. The 11 analytics and 19 payment/diagnostic behavioral checks passed using test doubles, not real purchases.

## Payment flow

### Recovery safety (2026-09-14, build 43 candidate — not installed)

Foreground recovery, checkout preflight, interrupted-order checks and manual
rechecks now share a single in-flight `Transaction.unfinished` enumeration. Each
reader can time out or cancel independently. A timeout is not an empty queue;
later callers do not start more enumerations while the original read is hung.
Completed snapshots are not cached for a later checkout.

Original-order status reconciliation distinguishes delivered, matched unresolved,
and unavailable results. Network/HTTP/parser failures, identity mismatches and
unknown/paid server states cannot authorize another payment. An explicit original
retry requires fresh Apple checks plus a matched `CREATED` status without a bound
transaction; it reuses the original order and account token. `CREATED` is not proof
that Apple never charged: a customer who confirmed payment or received a debit
notice should not retry. No recovery task invokes `purchase()` automatically.

When a repeat tap recovers an older order for the same item, it stops after that
recovery instead of proceeding into another purchase. Tests cover weekly gift
goods `900412` / SKU `pbm_tier_4999`, preserving original goods, account, role,
server, order and token. Different gifts sharing that SKU retain separate orders.
The server remains authoritative for weekly eligibility and reward delivery;
these tests do not verify the live weekly-limit rule or change its reset time.

`NSCocoaErrorDomain` 4097 is described as an interrupted App Store payment service,
not a proven network outage. The captured incident showed `storekitd` being killed
for a high-water memory limit. Coalescing reduces redundant client checks but
cannot guarantee that the OS service never terminates again.

Run `node scripts/test-payment-flow.cjs`, `node scripts/test-payment-ui.cjs` and
`node scripts/test-payment-account-binding.cjs` for isolated regression checks.
Debug/Release compilation and SDK/backend-double tests are not real sandbox
acceptance. This candidate has not been installed or used for a real purchase.
It preserves the build 41/42 privacy and App-Store-only changes; no Go/Android
code or online configuration is changed by this patch.

Order isolation (prepared 2026-09-11, build 36): unfinished contexts are stored in
`ios_purchase_contexts_v2`, keyed by SDK order ID, not Apple price tier. Legacy
per-SKU contexts migrate only after journal write/readback succeeds. Never clear
an ambiguous order on a timer. Different game items can retain independent
orders at the same price; repeating the same item/account/role still requires
explicit original-order recovery. Signed transactions match a unique original
context by SKU and server-issued `appAccountToken`, then transaction ID. All
verification, delivery, cleanup and late callbacks stay scoped to that order.

**Deployment dependency:** the device audit found the old interrupted order and
33 completed transactions sharing one token. The Go service must persist a
distinct binding token for each NEW Apple order, reuse it for idempotent retries,
and verify against that order's saved token while retaining old-order compatibility.
This is our application protocol, not an Apple requirement for token uniqueness
per order. The client rejects ambiguous reuse across unresolved same-SKU orders
with `ORDER_IDENTITY_CONFLICT`; do not remove this safety gate. Existing shared
tokens across different SKUs remain distinguishable. Backend work was handed off
through `给WindowsCodex_同价商品旧单阻塞_按订单绑定_20260911.md` in the shared folder.
Device rollout (2026-09-11 09:27 UTC): the live `/healthz` GET returned HTTP 200
and `X-Payment-Release: 20260911-apple-order-token-v2`. Build 36 was fully signed
(all 8 Mach-O files verified), installed over build 35 on the iPhone X without
uninstalling, and launched without a debugger. Startup log confirms build 36;
the main-game entry screen is visible. The one interrupted legacy monthly-card
order migrated to the order-keyed journal with its entire context unchanged.
No new purchase was initiated by the agent. The user's following batch produced
three server-delivered transactions with three different binding tokens on device,
confirming new-order binding for that batch. Two Apple cancellation results and
one XPC interruption still exposed checkout UX issues; this is not acceptance of
every payment path. See `output/build36-multiorder-audit-20260911.md` for the audit.
`node scripts/test-payment-flow.cjs` includes the actual failed-4.99 / successful-0.99 /
different-4.99 / late-old-receipt regression using SDK/backend doubles, alongside
restart migration, wrong binding, duplicate delivery and storage failure tests.

Checkout resilience (2026-09-11, build 37): Apple's cancellation result is presented
as an incomplete payment, not an assertion that the player pressed Cancel. The
existing H5 cancellation contract remains unchanged. If StoreKit exposes a nested
payment-sheet failure, authentication/HTTP failure, or NSCocoaErrorDomain 4097/4099,
the original order is retained and safely classified. Only error domains/numeric
codes are logged, never account credentials or full error payloads. A bare StoreKit
cancellation cannot reveal the hidden authentication failure seen in system logs;
the app does not pretend it can infer a password error or the player's actions.

Recognized interruptions schedule at most three original-order checks (backoffs
1/3/8 seconds), using the saved order/token and signed transaction or matching
backend delivery status. They never open authentication, create orders or purchase
automatically, and do not compete with an active Apple checkout or existing scan.
Unresolved records remain after the check budget, and explicit original-order retry
remains available. Catalog cache is invalidated after these interruptions.

The single Apple checkout lock stays until the actual call returns. Server delivery
immediately notifies H5/analytics once, but the UI explains that rewards have arrived
while Apple is finishing; new taps cannot start another native order in this gap.
The owning checkout's release callback changes that message to ready for further
purchases, without sending a second success/failure callback or affecting a new
checkout. `CheckoutResilienceTests.swift` covers these races and bounded recovery.
These changes cannot prevent Apple's HTTP 502 responses or iOS terminating storekitd.

Build 37 verification: 145 payment-flow behavioral cases, 27 real gateway parser
assertions, 4 diagnostic lifecycle cases and static UI/account-binding guards pass.
The unchanged regional routes pass 9,105 Swift checks and 10 browser proxy checks;
analytics pass 23 native and 15 bridge checks. Debug and Release device-target
builds succeeded (no simulator or live purchase in tests). With user approval,
the development build was signed and installed over the existing iPhone X app;
all 8 Mach-O signatures passed. At 2026-09-11 09:54:19 UTC its launch log reports
build 37 and product preflight succeeds; a screenshot confirms the game menu.
Before/after device comparisons show the pending journal (1 order) and completed
journal (37 records) are byte-for-byte unchanged. No payment was initiated by the
agent. The new runtime checkout UX still needs the user's real sandbox regression.

Double-tap protection (2026-09-11, build 38): device build 37 received two H5
`createOrder.php` requests at 09:56:28–30 UTC, before its native checkout guard.
Both returned game orders, but only one SDK order and one Apple purchase call
were logged. Its subsequent NSCocoaErrorDomain 4097 interruption is a separate
problem; there is no evidence of two Apple charges in that trace.

`GameOrderRequestGate` now serializes the state-changing PHP request itself,
shared by XHR/fetch and frames in the same WebView. Identical in-flight requests
share one transport task and the same response. Different selections, or further
requests during native checkout, perform no HTTP request and show a busy prompt;
the JS bridge aborts the ignored request without manufacturing a business error
or an order for another item. The full routed URL is the coalescing key, retaining
account, role, server and item parameters. Native ownership is checked before
checkout, and only the matching completion releases it. It never expires while
native checkout runs. An unclaimed H5 response can expire after 15 seconds so an
aborted XHR cannot permanently lock the screen. A completed checkout permits a
new intentional purchase of the same item. Existing pending/completed journals,
Apple error recovery, verification and server delivery rules are unchanged.

Build 38 verification: 24 production-Swift gate assertions include 20 concurrent
duplicate requests, other-tier blocking, late responses/completions, timeout and
next-purchase cases. The 145 payment-flow cases, 27 gateway checks, 4 diagnostic
lifecycle cases, static UI/account-binding guards, 12 browser proxy assertions,
9,105 regional routing checks and 23 native/15 JS analytics checks also pass.
Debug and Release device-target builds succeeded. These are isolated tests, not
a real purchase or a substitute for server idempotency across devices/restarts.
With user approval, build 38 was signed (all 8 Mach-O checks passed) and installed
over build 37 on the iPhone X without uninstalling. Installation completed and
the app launched at 2026-09-11 10:18:36 UTC; the device reports build 38 (not a
placeholder), and a screenshot confirms the game login page. Before/after
installation comparisons show both journals byte-for-byte unchanged: 2 pending
orders and 37 completed records. Evidence is in `output/build38-install-hNDyzn/`.
No purchase was initiated by the agent. The user's subsequent real-device
double-tap trace is described below.

Build 38 follow-up: the user's device trace at 10:19:08–34 UTC contains one actual
PHP order request and 27 subsequent blocked taps (`networkRequest=false`). The
later delay was a separate 46,462 ms checkout preflight. Device system logs show
Apple history/download-queue requests timing out with NSURLErrorDomain -1001;
the SDK backend status read took 301 ms. The explicit original-order retry then
returned AMSErrorDomain 6, "Payment Sheet Failed", with neither an error nor a
result from the sheet; this is not evidence the player intentionally cancelled.
Evidence: `output/build38-sheet-check-BLce4K/` (private device diagnostics).

Bounded preflight (2026-09-11, build 39): each purchase-before-launch recovery
check now has an 8-second UI wait budget, including the second check before an
explicit original-order retry. "Stop waiting" is available only during that
preflight, not catalog loading, SDK order creation or an active Apple purchase.
Timeout/manual stop returns PAYMENT_CHECK_TIMEOUT/PAYMENT_CHECK_STOPPED and
releases the matching checkout after its caller resumes. It retains original
orders, does not call purchase, does not infer non-payment, and never retries
automatically. Existing historical Apple cleanup and transaction-ownership checks
are preserved, not bypassed to make another purchase faster.

The StoreKit snapshot reader coalesces concurrent checkout reads. Cancelling a
waiter detaches its continuation promptly without assuming StoreKit cancelled
the underlying read; a late snapshot alone cannot mutate orders or open payment.
Preflight workers check cancellation after each suspension before proceeding,
and completion/deadline callbacks are scoped by run ID. A valid delivery result
for an old transaction can still be recorded by the existing verification path;
ending this wait does not discard genuine late payments or shared cleanup jobs.

Build 39 verification: 153 behavioral payment tests (8 new preflight regressions),
27 gateway assertions, 4 diagnostic lifecycle cases, 24 pre-order gate checks,
12 browser proxy checks, 9,105 routing checks, 23 native/15 bridge analytics
checks, and static UI/account-binding guards pass. Tests exercise never-returning
history, repeat waits sharing one read, manual stop, late backend results, a live
Apple call exceeding the preflight deadline, retry's second preflight, late
snapshot ownership, historical cleanup and destruction. Debug and Release builds
targeting physical iOS devices succeeded. No real purchase was made in these
tests. With user approval, development build 39 was signed (all 8 Mach-O files
verified), installed over build 38, and launched on the iPhone X at 10:40:06 UTC.
The device reports build 39, the launch screenshot shows the game login page,
and catalog preflight returns 19 products. Pending/completed journals remain
byte-for-byte unchanged across installation (2 pending, 37 completed). Evidence:
`output/build39-install-cuor3x/`. No payment was initiated by the agent; the new
timeout/stop UI still needs the user's real-device payment regression.

Player UI cleanup (2026-09-14, build 40): removed the in-game payment diagnostic
and order-check/re-delivery buttons, their view creation/layout, accessibility
identifiers and tap handlers. This is not a transparent/hidden overlay. Removed
the now-unused manual-check UI state and prompts directing players to that
button. Debug diagnostics remain available only through the explicit
`PBM_PAYMENT_DIAGNOSTICS=1` developer launch environment, not an in-game target.
The temporary preflight "stop waiting" control and automatic foreground/network
transaction recovery remain. StoreKitManager, BackendGateway, PayRequest, the
order router/proxy and payment bridge are byte-for-byte unchanged.

Build 40 verification: static UI guards, 153 payment-flow cases, 27 gateway
assertions, 4 diagnostic lifecycle cases, 24 order-gate assertions and 12 browser
proxy assertions passed; Debug and Release device builds succeeded. The signed
Debug binary also contains none of the removed button identifiers or selectors;
all 8 Mach-O signatures were verified. Covered the existing iPhone X install
without uninstalling, and its log confirms build 40 launched. The retained order
is unchanged and all 45 prior completion records are preserved; the post-launch
snapshot additionally contains two new checkout completions (47 total). No
purchase was initiated by the agent. Evidence: `output/build40-hide-payment-tools-xQ1K8F/`.

1. H5 calls `xmwsdk.dopay(...)` → bridged to `android.pay(json)`.
2. Shell posts `sdk.pay.fororder` with `type=apple`.
3. Backend returns `order_id` + App Store `productId`.
4. StoreKit 2 purchase runs.
5. Shell posts `sdk.pay.notification` with the signed transaction.
6. After server delivery, transaction is finished and H5 receives `javaCallBack({func:"onPayResult", ...})`.

Real App Store verification requires TestFlight or a signed device build with Sandbox Tester accounts and products created in App Store Connect.

## Local content-mode testing

1. Start `paymentd` from `shiqixjp_go` (see repo README).
2. Debug builds default to `http://127.0.0.1:8080/api/v1/content-config`.
3. On a physical device, point `CONTENT_CONFIG_ENDPOINT` in `Debug.xcconfig` to your Mac LAN IP.

## Project layout

```text
ios/
├── Config/                     xcconfig build settings
├── PrehistoricBeastmaster/     app target
│   ├── Web/                    WKWebView, JS bridge, API proxy
│   ├── Payment/                StoreKit + backend gateway
│   ├── Content/                remote content mode
│   ├── Analytics/              Meta/Firebase event validation and milestones
│   └── Resources/
│       ├── game/               offline mini-game (from Android assets)
│       └── js/                 JS bridge scripts
├── Products.storekit           local IAP catalog (19 tiers)
└── tools/generate_xcodeproj.py
```
