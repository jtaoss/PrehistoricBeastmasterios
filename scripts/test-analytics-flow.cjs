// Executes production normalization/coordinator logic with an in-memory sink.
// No SDK, network request, real receipt, or user preferences are used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const analytics = read('PrehistoricBeastmaster/Analytics/Analytics.swift');
const names = analytics.slice(analytics.indexOf('enum AnalyticsNames'), analytics.indexOf('final class AnalyticsManager'));
const flow = analytics.slice(analytics.indexOf('enum AnalyticsMilestoneRules'));
assert.ok(names.includes('requiresNativePayment'));
assert.ok(flow.includes('final class AnalyticsEventCoordinator'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-analytics-tests-'));
try {
  const file = path.join(scratch, 'main.swift');
  fs.writeFileSync(file, [read('PrehistoricBeastmaster/Config/JSONObject.swift'),
    read('PrehistoricBeastmaster/Payment/PayRequest.swift'),
    read('scripts/analytics-tests/Harness.swift'), names, flow].join('\n'));
  const executable = path.join(scratch, 'analytics-tests');
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', file, '-o', executable], {stdio:'inherit'});
  execFileSync(executable, [], {stdio:'inherit', timeout:15000});
} finally {
  fs.rmSync(scratch, {recursive:true, force:true});
}
