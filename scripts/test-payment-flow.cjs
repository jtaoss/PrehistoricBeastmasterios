// Execute the real StoreKitManager body with in-memory SDK/backend doubles.
// No Apple sign-in, real order, user defaults, or phone is used by these tests.
// Native compilation and real-device testing remain separate checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Payment/StoreKitManager.swift'), 'utf8');
const marker = '@MainActor\nfinal class StoreKitManager';
assert.ok(source.includes(marker));
// Exclude only imports and the file-based debug logger, replaced by a test logger.
const manager = source.slice(source.indexOf(marker));
const requests = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Payment/PayRequest.swift'), 'utf8');
const gateMarker = 'final class PaymentRequestGate';
assert.ok(requests.includes(gateMarker));
const gate = requests.slice(requests.indexOf(gateMarker));
const fixture = fs.readFileSync(path.join(__dirname, 'payment-tests/FlowHarness.swift'), 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-flow-tests-'));
try {
  const swift = path.join(scratch, 'FlowTests.swift');
  const binary = path.join(scratch, 'flow-tests');
  fs.writeFileSync(swift, fixture + '\n' + manager + '\n' + gate + '\n' +
    fs.readFileSync(path.join(__dirname, 'payment-tests/OrderIsolationTests.swift'), 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, 'payment-tests/CheckoutResilienceTests.swift'), 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, 'payment-tests/PreflightDeadlineTests.swift'), 'utf8') + '\n' +
    fs.readFileSync(path.join(__dirname, 'payment-tests/SharedRecoverySafetyTests.swift'), 'utf8'));
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-D', 'DEBUG', '-parse-as-library', swift, '-o', binary], { stdio: 'inherit' });
  execFileSync(binary, [], { stdio: 'inherit', timeout: 30000 });
  const gatewayBinary = path.join(scratch, 'gateway-tests');
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library',
    path.join(__dirname, 'payment-tests/GatewayHarness.swift'),
    path.join(root, 'PrehistoricBeastmaster/Config/JSONObject.swift'),
    path.join(root, 'PrehistoricBeastmaster/Payment/BackendGateway.swift'),
    '-o', gatewayBinary], { stdio: 'inherit' });
  execFileSync(gatewayBinary, [], { stdio: 'inherit', timeout: 15000 });
  const diagnostics = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Payment/PaymentDiagnosticsViewController.swift'), 'utf8');
  const start = diagnostics.indexOf('    private func run(');
  const end = diagnostics.indexOf('    private func append(', start);
  assert.ok(start >= 0 && end > start);
  // The lifecycle code uses only Task, NotificationCenter and lightweight UI
  // actions. Substitute the UI surface, not its control flow or timeouts.
  const operations = diagnostics.slice(start, end).replaceAll('@objc ', '');
  const diagnosticFixture = fs.readFileSync(path.join(__dirname, 'payment-tests/DiagnosticHarness.swift'), 'utf8');
  const diagnosticSwift = path.join(scratch, 'DiagnosticTests.swift');
  const diagnosticBinary = path.join(scratch, 'diagnostic-tests');
  fs.writeFileSync(diagnosticSwift, diagnosticFixture.replace('/*__OPERATIONS__*/', operations));
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library', diagnosticSwift, '-o', diagnosticBinary], { stdio: 'inherit' });
  execFileSync(diagnosticBinary, [], { stdio: 'inherit', timeout: 15000 });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
