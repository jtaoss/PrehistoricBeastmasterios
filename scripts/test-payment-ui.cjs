// Static regression guards; native compilation and a real-device run are also required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const game = read('PrehistoricBeastmaster/GameViewController.swift');
const billing = read('PrehistoricBeastmaster/Payment/StoreKitManager.swift');
const diagnostics = read('PrehistoricBeastmaster/Payment/PaymentDiagnosticsViewController.swift');
const project = read('PrehistoricBeastmaster.xcodeproj/project.pbxproj');

function between(source, start, end) {
  const first = source.indexOf(start);
  assert.ok(first >= 0, `Missing ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.ok(last > first, `Missing ${end}`);
  return source.slice(first, last);
}

// This file's DEBUG sections have no #else or nested conditional compilation.
function withoutDebug(source) {
  return source.replace(/^\s*#if DEBUG\n[\s\S]*?^\s*#endif\s*$/gm, '');
}

const toast = between(game, 'private func showToast(', 'private func hideToast(');
assert.doesNotMatch(toast, /UIAlertController|\bpresent\(/);
assert.match(toast, /hideToast\(\)/, 'A new result must replace the old progress toast');
assert.match(toast, /self\.toastView === bubble/, 'An old timer cannot dismiss a newer result');
assert.match(toast, /isUserInteractionEnabled = false/, 'Toast must not block checkout taps');
const hide = between(game, 'private func hideToast(', '#if DEBUG');
assert.match(hide, /toastDismissal\?\.cancel\(\)/);
assert.match(hide, /toastView\?\.removeFromSuperview\(\)/);
assert.match(between(game, 'func onCheckoutStarted(', 'func onSuccess('), /showPaymentProgress\(request/);
assert.match(between(game, 'func onError(', 'private func reportPaymentFailure('), /duration: 5/);
assert.match(game, /正在準備付款/);
assert.match(toast, /guard duration > 0 else \{ return \}/);
const duplicateTap = between(game, 'guard paymentGate.tryStart(request.cpOrder) else {', 'PaymentDebugLog.record("h5-pay-parsed');
assert.match(duplicateTap, /showCurrentPaymentProgress/);
assert.doesNotMatch(duplicateTap, /reportPaymentFailure|onPayFail|onPayCancel|callH5|\.finish\(/);
assert.doesNotMatch(game, /checkingPayments/, 'Removed manual-check state must not block normal purchases');
assert.doesNotMatch(game, /正在開啟 App Store 支付/);
const gameOrderFailure = between(game, 'func onGameOrderFailed(', 'func onRoleReported(');
assert.match(gameOrderFailure, /guard paymentGate.canPresent\(nil\) else/);
assert.match(gameOrderFailure, /尚未發起付款/);
assert.doesNotMatch(gameOrderFailure, /callH5|\.finish\(|billing\./, 'Pre-Apple failure must not mutate a real checkout');

assert.equal(withoutDebug(diagnostics).trim(), '', 'Diagnostics must compile out of Release');
assert.doesNotMatch(withoutDebug(game), /PaymentDiagnostics|PAYMENT_DIAGNOSTICS/);
assert.match(project, /PaymentDiagnosticsViewController\.swift in Sources/);
assert.doesNotMatch(diagnostics, /BackendGateway|\.purchase\(|createPlayOrder|\btransaction\.finish\(/);
const syncHandler = between(diagnostics, '@objc private func syncStore()', 'private func queryProducts(');
assert.match(syncHandler, /try await AppStore\.sync\(\)/);
assert.match(syncHandler, /waitsForAuthentication: true/);
assert.doesNotMatch(syncHandler, /queryProducts\(/, 'Transaction sync is not a catalog refresh');
assert.equal((diagnostics.match(/try await AppStore\.sync\(\)/g) || []).length, 1);
assert.match(diagnostics, /action: #selector\(syncStore\)/);
assert.doesNotMatch(between(diagnostics, 'override func viewDidAppear(', 'private func makeButton('), /syncStore|AppStore\.sync/);
assert.match(diagnostics, /guard isCurrent\(id\) else \{ return \}/);
assert.match(diagnostics, /diagnostic-timeout/);
assert.doesNotMatch(diagnostics, /jwsRepresentation|jsonRepresentation|deviceVerification/);
const missing = between(billing, 'guard let product = try await loadProduct(', 'PaymentDebugLog.record("product-query-success');
assert.match(missing, /PRODUCT_NOT_FOUND/);
assert.match(missing, /return/);
assert.doesNotMatch(missing, /\.purchase\(|onSuccess/);
assert.match(missing, /backendOrderCreated=false/);
const checkout = between(billing, 'private func createOrderAndPurchase(', 'private func purchase(');
assert.ok(checkout.indexOf('loadProduct(expectedProductId)') < checkout.indexOf('backend.createPlayOrder(request)'));
assert.match(checkout, /purchase\(product: product, context:/, 'Reuse the preflight Product');
const purchase = between(billing, 'private func purchase(', 'private func loadProduct(');
assert.doesNotMatch(purchase, /loadProduct\(|Product\.products\(/);
assert.match(purchase, /try Task.checkCancellation\(\)/);
const replay = between(purchase, 'let otherOrder: Bool', '        case .userCancelled:');
assert.match(replay, /case \.alreadyDelivered\(let order\): otherOrder = order != request\.cpOrder/);
assert.match(replay, /case \.delivered\(let order\): otherOrder = order\?\.cpOrder != request\.cpOrder/);
assert.match(replay, /if otherOrder, !isSettlingOrCompleted\(request\)/);
assert.match(replay, /preserveInterrupted\(request\)/);
assert.match(replay, /finishActiveRequest\(request\)/);
assert.match(replay, /onError\(request, code: "STOREKIT_PREVIOUS_TRANSACTION"/);
assert.doesNotMatch(replay, /onSuccess|onCancel|createPlayOrder|\.purchase\(|removeStoredContext/);
const loadProduct = between(billing, 'private func loadProduct(', 'private func handle(');
assert.match(loadProduct, /catch is CancellationError/);
assert.doesNotMatch(loadProduct, /try\? await Task.sleep/);
assert.match(loadProduct, /first\(where: \{ \$0.id == productId \}\)/);

const authTimeout = between(diagnostics, 'if self.waitsForAuthentication {', 'self.append("diagnostic-timeout：未收到');
assert.match(authTimeout, /return/);
assert.doesNotMatch(authTimeout, /\.cancel\(|\.finish\(/, 'Timeout must not release an outstanding Apple authentication');
const close = between(diagnostics, '@objc private func close()', 'private func append(');
assert.match(close, /if !waitsForAuthentication \{\s*operation\?\.cancel\(\)\s*finish\(\)/);
assert.match(diagnostics, /private\(set\) static var authenticationInProgress/);
assert.match(diagnostics, /operation = Task \{ \[self\]/, 'Retain the auth owner until the real completion');
assert.match(diagnostics, /isEnabled = runID == nil && !Self.authenticationInProgress/);
assert.match(billing, /guard !PaymentDiagnosticsViewController.authenticationInProgress/);
assert.doesNotMatch(withoutDebug(billing), /PaymentDiagnosticsViewController/);
const retryUI = between(game, 'private func offerOriginalOrderRetry(', 'private func reportPaymentFailure(');
assert.match(retryUI, /UIAlertAction\(title: "繼續這筆付款"/);
assert.doesNotMatch(retryUI, /UIAlertAction\(title: "查詢結果|這筆付款尚未完成/);
assert.match(retryUI, /original\.price/);
assert.match(retryUI, /billing\.retryOriginal\(original\)/);
assert.match(retryUI, /paymentGate\.tryStart\(original\.cpOrder\)/);
assert.match(retryUI, /paymentSessionRevision == sessionAtPresentation/);
assert.match(retryUI, /presentedViewController == nil/);
assert.match(retryUI, /UIAlertAction\(title: "返回遊戲"/);
const retryButton = between(retryUI, 'alert.addAction(UIAlertAction(title: "繼續這筆付款"', 'self.paymentRetryAlert = alert\n');
assert.match(retryButton, /alert\.dismiss\(animated: true, completion: continueRetry\)/);
assert.match(retryButton, /coordinator.animate\(alongsideTransition: nil\)/);
assert.match(retryButton, /guard !context.isCancelled/);
assert.match(retryButton, /!retrySelected/);
assert.match(retryButton, /continueOriginalOrderRetry/);
assert.doesNotMatch(retryButton, /billing\.retryOriginal|beginGameOrderCheckout|paymentGate\.tryStart/,
  'Button handler must wait for dismissal before acquiring checkout or calling Apple');
const retryContinuation = retryUI.slice(retryUI.indexOf('private func continueOriginalOrderRetry('));
assert.match(retryContinuation, /paymentRetryAlert === alert, paymentRetryOrder == original.cpOrder/);
assert.match(retryContinuation, /billing.retryRequest\(for: original\)\?\.cpOrder == original.cpOrder/);
assert.match(retryContinuation, /guard !billing.isProcessingPayment/);
assert.doesNotMatch(retryUI, /AppStore\.sync|asyncAfter|Timer\(/);
assert.equal((game.match(/billing\.retryOriginal\(/g) || []).length, 1, 'Only the explicit native button can retry a purchase');
assert.doesNotMatch(billing, /AppStore\.sync\(/);
const errorUI = between(game, 'func onError(', 'private func offerOriginalOrderRetry(');
assert.match(errorUI, /hasUnresolvedOrder\(for: request\) \? "onPayPending" : "onPayFail"/);
assert.match(errorUI, /paymentGate\.finish\(request\?\.cpOrder \?\? ""\)/);
assert.match(errorUI, /if code == "PURCHASE_RECOVERY_REQUIRED", billing.retryRequest/);
assert.match(errorUI, /guard showResult else \{ return \}/);
assert.match(errorUI, /hasRetainedOrder: billing.hasUnresolvedOrder\(for: request\)/);
const busyError = between(errorUI, 'if code == "PAYMENT_IN_PROGRESS"', '// A lost Apple reply');
assert.doesNotMatch(busyError, /callH5|onPayFail|onPayCancel/);
for (const [first, last] of [['func onSuccess(', 'func onPending('], ['func onPending(', 'func onCancel('], ['func onCancel(', 'func onError(']]) {
  assert.match(between(game, first, last), /let showResult = paymentGate.canPresent/);
}
assert.match(between(game, 'func onCancel(', 'func onError('), /hasUnresolvedOrder/);
const retryCheckout = between(billing, '            if retryingOriginal {', '            phase = "backend-create-order"');
assert.match(retryCheckout, /boundedRecoverBeforeLaunch/);
assert.doesNotMatch(retryCheckout, /createPlayOrder/);
for (const removed of ['paymentRecoveryButton', 'payment-recovery-button',
  'payment-diagnostics-button', 'installPaymentDiagnosticsButton', 'installPaymentRecoveryButton',
  'checkPaymentRecovery', '#selector(openPaymentDiagnostics)', 'showsPaymentTools']) {
  assert.ok(!game.includes(removed), `Remove the control and tap target, not just hide it: ${removed}`);
}
assert.doesNotMatch(game, /config\.title = "(?:支付診斷|查單／補發)"/);
assert.match(game, /ProcessInfo\.processInfo\.environment\["PBM_PAYMENT_DIAGNOSTICS"\] == "1"/,
  'Diagnostics remain developer-launch-only, not reachable by touching the game');
assert.doesNotMatch(game, /請(?:先查單|查單後|查詢訂單|點「查單)|可點「查單/,
  'Player prompts must not direct users to a hidden button');
assert.match(between(game, '@objc private func recoverPaymentsOnForeground()', '#if DEBUG'), /await billing\.resumePurchases\(\)/);
assert.match(game, /billing\.start\(\)/, 'Hiding tools must not disable transaction recovery');
const autoRecovery = between(billing, 'private func scheduleDeliveryRecovery(', 'private func cancelDeliveryRecovery(');
assert.doesNotMatch(autoRecovery, /createPlayOrder|\.purchase\(|retryOriginal|AppStore\.sync/);
assert.match(autoRecovery, /current\.sdkOrderId == context\.sdkOrderId, current\.transactionId == token/);
assert.match(billing, /deliveryRetryDelays: \[TimeInterval\] = \[2, 5, 15, 30, 60\]/);
const completedCleanup = between(billing, 'private func finishCompletedTransaction(', 'private func recordCompleted(');
assert.match(completedCleanup, /await transaction\.finish\(\)/);
assert.match(completedCleanup, /finishingCompletedTokens\.insert\(token\)/);
assert.match(completedCleanup, /self\.completedFinishJobs\[token\]\?\.id == id/);
assert.match(completedCleanup, /self\.finishingCompletedTokens\.remove\(token\)/);
assert.match(completedCleanup, /trigger != \.manual/);
assert.doesNotMatch(completedCleanup, /onSuccess|onError|createPlayOrder|confirmPurchase|removeStoredContext|finishActiveRequest|\.purchase\(|storeContext/);
const manualCheck = between(billing, 'func checkPendingPayments()', '    /// Isolate game orders');
assert.match(manualCheck, /payment-recovery-check-result/);
assert.match(manualCheck, /return recoveryMessage\(result\)/);
assert.match(manualCheck, /historicalRemaining = remaining\.count/);
assert.doesNotMatch(manualCheck, /\.purchase\(|AppStore\.sync|createPlayOrder|retryOriginal/);
const finishJob = between(billing, 'private func scheduleCompletedFinish(', 'private func recordCompleted(');
assert.match(finishJob, /transactionId == token && \$0.productId == transaction.productID/);
assert.match(finishJob, /\$0.appAccountToken == transaction.appAccountToken/);
assert.doesNotMatch(finishJob, /onSuccess|createPlayOrder|confirmPurchase|\.purchase\(/);
assert.match(purchase, /waitForHistoricalFinish: false/);
const reconcile = between(billing, 'private func reconcileDeliveredOrder(', 'private func findContext(');
for (const requirement of ['status.orderId == context.sdkOrderId', 'status.cpOrder == original.cpOrder',
  'status.productId == context.productId', 'status.isDelivered', 'current.appAccountToken == accountToken',
  'current.transactionId == nil || current.transactionId == status.transactionId']) {
  assert.ok(reconcile.includes(requirement));
}
assert.doesNotMatch(reconcile, /\.purchase\(|createPlayOrder|AppStore\.sync|transaction\.finish/);
assert.ok(reconcile.indexOf('status.isDelivered') < reconcile.indexOf('removeStoredContext(current)'));
const prepare = between(billing, 'func prepareForCheckout()', '/// Called only by the native');
assert.doesNotMatch(prepare, /createPlayOrder|\.purchase\(|AppStore\.sync/);
assert.match(prepare, /!isProcessingPayment/);
assert.match(game, /func onRoleReported[\s\S]*?billing\.prepareForCheckout/);
assert.doesNotMatch(billing, /findContext\(productId:|store\.set\(text, forKey: contextPrefix|pendingContextLifetime/);
assert.match(billing, /private let contextsKey = "ios_purchase_contexts_v2"/);
assert.match(billing, /\$0.appAccountToken == token/);
assert.match(billing, /guard saveContexts\(contexts\) else \{ return nil \}/);
assert.match(game, /paymentSubject\(request\) \+ paymentDisplayMessage/);
assert.match(game, /paymentSubject\(request\) \+ "付款成功/);
const cancelUI = between(game, 'func onCancel(', 'func onError(');
assert.doesNotMatch(cancelUI, /已取消這次付款|用戶取消|使用者取消|USER_ACTION_CANCELLED/);
assert.match(cancelUI, /actualUserAction=unknown/);
assert.match(cancelUI, /App Store 未完成這次付款/);
assert.match(cancelUI, /onPayCancel/); // Preserve the existing H5 contract.
const busyBeforeNewRequest = between(game, 'if let message = billing.checkoutBlockingMessage {', 'let request: PayRequest');
assert.match(busyBeforeNewRequest, /return/);
assert.doesNotMatch(busyBeforeNewRequest, /callH5|billing\.launch|\.finish\(/);
const releasedUI = between(game, 'func onCheckoutReleased(', 'func onSuccess(');
assert.match(releasedUI, /webView.endGameOrderCheckout\(request.cpOrder\)/);
assert.match(between(game, 'func onPayRequested(', 'func onGameOrderFailed('), /beginGameOrderCheckout\(request.cpOrder\)/);
assert.match(retryUI, /beginGameOrderCheckout\(original.cpOrder\)/);
assert.match(releasedUI, /finishingCheckoutOrder == request.cpOrder/);
assert.match(releasedUI, /paymentGate.canPresent\(request.cpOrder\)/);
assert.doesNotMatch(releasedUI, /onPayResult|onPayCancel|onPayFail|callH5|billing\.launch/);
const originalAutoCheck = between(billing, 'private func scheduleInterruptedRecovery(', '/// Public StoreKit cases');
assert.match(originalAutoCheck, /\[1, 3, 8\]/);
assert.match(originalAutoCheck, /findContext\(transaction: transaction\)\?\.sdkOrderId == orderId/);
assert.match(originalAutoCheck, /current.appAccountToken == context.appAccountToken/);
assert.match(originalAutoCheck, /self.applePurchaseOrder == nil, !self.recoveryScanRunning/);
assert.doesNotMatch(originalAutoCheck, /try await .*purchase\(|createPlayOrder|AppStore\.sync\(|removeStoredContext/);
const boundedCheck = between(billing, 'private func boundedRecoverBeforeLaunch(', '/// Isolate game orders');
assert.match(billing, /preflightTimeout: TimeInterval = 8/);
assert.match(boundedCheck, /check.id == id/);
assert.match(boundedCheck, /check\.worker\.cancel\(\)/);
assert.match(boundedCheck, /check\.continuation\.resume\(returning: result\)/);
assert.doesNotMatch(boundedCheck, /\.purchase\(|createPlayOrder|removeStoredContext|removeActiveContext|onCancel/);
assert.match(billing, /canStopPreflight: Bool \{ preflightCheck != nil && applePurchaseOrder == nil \}/);
assert.match(game, /stopPaymentCheckButton\.isHidden = !billing.canStopPreflight/);
assert.match(game, /stop-payment-preflight/);
assert.match(withoutDebug(game), /stopPaymentPreflight/);
const stopCheckUI = between(game, '@objc private func stopPaymentPreflight()', '@objc private func recoverPaymentsOnForeground()');
assert.match(stopCheckUI, /billing.stopWaitingForPreflight\(\)/);
assert.doesNotMatch(stopCheckUI, /purchase|retryOriginal|\.launch\(/);
const reader = billing.slice(billing.indexOf('@MainActor private final class CheckoutTransactionReader'));
assert.match(reader, /withTaskCancellationHandler/);
assert.match(reader, /guard job == nil/);
assert.doesNotMatch(reader, /\.purchase\(|createPlayOrder|confirm\(|onSuccess|storeContext|\.finish\(/);
assert.equal((billing.match(/in Transaction\.unfinished/g) || []).length, 1,
  'Foreground, automatic recovery and preflight must share one Apple history reader');
assert.match(reader, /private func detach\(/);
assert.match(reader, /resume\(returning: nil\)/, 'Timeout is unavailable, not an empty queue');
assert.match(billing, /private enum OrderReconciliation: Equatable/);
assert.match(billing, /case unresolved\(retryEligible: Bool\)/);
assert.match(reconcile, /status.state == "CREATED" && status.transactionId.isEmpty && current.transactionId == nil/);
assert.match(reconcile, /if !force, let checked/);
const preflight = between(billing, 'private func recoverBeforeLaunch(', 'private func createOrderAndPurchase(');
assert.match(preflight, /case \.unavailable:[\s\S]*?ORDER_STATUS_UNAVAILABLE[\s\S]*?return false/);
assert.match(preflight, /case \.unresolved\(retryEligible: false\):[\s\S]*?ORIGINAL_PAYMENT_UNCONFIRMED[\s\S]*?return false/);
assert.match(game, /case "ORDER_STATUS_UNAVAILABLE"/);
assert.match(game, /case "ORIGINAL_PAYMENT_UNCONFIRMED"/);
assert.match(game, /App Store 付款服務暫時中斷/);
console.log('Payment UI and diagnostic safety guards passed (static checks).');
