// Execute production presentation methods with deterministic UIKit/billing doubles.
// This validates orchestration, not UIKit animations or Apple's payment service.
// No device, account, network, real order or persistent user defaults is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/GameViewController.swift'), 'utf8');
function between(start, end) {
  const first = game.indexOf(start);
  const last = game.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing source boundaries: ${start} / ${end}`);
  return game.slice(first, last);
}
const methods = [
  between('    func onCancel(', '    private func reportPaymentFailure('),
  between('    private func paymentDisplayMessage(', '    private func initializeContentRoute('),
  between('    func onCheckoutReleased(', '    func onSuccess('),
].join('\n');
const requestSource = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Payment/PayRequest.swift'), 'utf8');
const gateMarker = 'final class PaymentRequestGate';
assert.ok(requestSource.includes(gateMarker));
const fixture = fs.readFileSync(path.join(__dirname, 'payment-tests/PaymentPresentationHarness.swift'), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-presentation-tests-'));
try {
  const swift = path.join(scratch, 'PresentationTests.swift');
  const binary = path.join(scratch, 'presentation-tests');
  fs.writeFileSync(swift, fixture.replace('/*__PRODUCTION_METHODS__*/', methods) + '\n' +
    requestSource.slice(requestSource.indexOf(gateMarker)));
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library', swift, '-o', binary], { stdio: 'inherit' });
  execFileSync(binary, [], { stdio: 'inherit', timeout: 15000 });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
