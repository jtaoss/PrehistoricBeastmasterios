// Browser-only regression tests. Every URL and native reply is mocked; no order
// is created, and no device, Apple account or production endpoint is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../PrehistoricBeastmaster/Resources/js/game_api_proxy.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PBM_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  let assertions = 0;
  const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Local proxy tests</title>' }));
    await page.goto('https://proxy-tests.invalid/');
    await page.evaluate(() => {
      window.requests = [];
      window.messages = [];
      window.webkit = { messageHandlers: {
        gameApiProxy: { postMessage: payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject })) },
        android: { postMessage: message => messages.push(message) }
      }};
    });
    await page.addScriptTag({ content: source });
    const results = await page.evaluate(async () => {
      const flush = () => new Promise(resolve => setTimeout(resolve, 0));
      const url = 'https://safthwy.antieh.com/fx/createOrder.php?sid=1&id=100&uid=private-test-user';
      const result = {};
      const reply = { status: 200, body: JSON.stringify({ status: 0, cpOrder: 'private-test-order', price: 0.99 }) };
      let done = 0, load = 0;
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = () => { if (xhr.readyState === 4) done++; };
      xhr.onload = () => load++;
      xhr.open('GET', url); xhr.send(); requests.at(-1).resolve(reply); await flush();
      result.singleCompletion = [done, load, xhr.status, xhr.responseText];
      xhr.open('GET', url);
      result.reopened = [xhr.readyState, xhr.status, xhr.responseText];

      let cancelledLoads = 0, aborts = 0;
      const cancelled = new XMLHttpRequest();
      cancelled.onload = () => cancelledLoads++;
      cancelled.onabort = () => aborts++;
      cancelled.open('GET', url); cancelled.send(); const old = requests.at(-1);
      cancelled.abort(); old.resolve(reply); await flush();
      result.abort = [cancelledLoads, aborts, cancelled.readyState, cancelled.status];

      let reusedLoads = 0;
      const reused = new XMLHttpRequest(); reused.onload = () => reusedLoads++;
      reused.open('GET', url); reused.send(); const previous = requests.at(-1);
      reused.open('GET', url + '&second=1'); reused.send(); const current = requests.at(-1);
      previous.resolve(reply); await flush();
      result.stale = [reusedLoads, reused.readyState];
      current.resolve(reply); await flush(); result.current = reusedLoads;

      const failuresBefore = messages.filter(x => x.method === 'gameOrderFailed').length;
      const failed = new XMLHttpRequest(); let failedLoads = 0;
      failed.onload = () => failedLoads++;
      failed.open('GET', url); failed.send();
      requests.at(-1).resolve({ status: 200, body: '{"status":17,"message":"private backend message"}' });
      await flush();
      result.businessFailure = [failedLoads, messages.filter(x => x.method === 'gameOrderFailed').length - failuresBefore];

      const broken = new XMLHttpRequest(); let errors = 0;
      broken.onerror = () => errors++;
      broken.open('GET', url); broken.send(); requests.at(-1).reject(new Error('native network error'));
      await flush(); result.networkFailure = [errors, broken.readyState, broken.status];

      const json = new XMLHttpRequest();
      json.open('GET', url); json.responseType = 'json'; json.send();
      requests.at(-1).resolve(reply); await flush(); result.jsonResponse = json.response;

      const failureMessages = messages.filter(x => x.method === 'gameOrderFailed').length;
      let busyLoads = 0, busyErrors = 0, busyAborts = 0;
      const busy = new XMLHttpRequest();
      busy.onload = () => busyLoads++; busy.onerror = () => busyErrors++; busy.onabort = () => busyAborts++;
      busy.open('GET', url); busy.send(); requests.at(-1).resolve({ shellCheckoutBusy: true }); await flush();
      result.busyXHR = [busyLoads, busyErrors, busyAborts, busy.readyState,
        messages.filter(x => x.method === 'gameOrderFailed').length - failureMessages];
      const fetched = fetch(url).catch(error => error.name);
      requests.at(-1).resolve({ shellCheckoutBusy: true });
      result.busyFetch = await fetched;

      const ordinary = new XMLHttpRequest();
      ordinary.open('GET', 'https://proxy-tests.invalid/unproxied');
      await new Promise(resolve => { ordinary.onload = resolve; ordinary.send(); });
      result.unproxied = [ordinary.status, ordinary.readyState];
      result.logs = JSON.stringify(messages);
      return result;
    });
    equal(results.singleCompletion.slice(0, 3), [1, 1, 200], 'completion callback fires exactly once');
    equal(results.reopened, [1, 0, ''], 'open restores native OPENED state and clears old response');
    equal(results.abort, [0, 1, 0, 0], 'aborted reply cannot dispatch payment');
    equal(results.stale, [0, 1], 'previous reply cannot complete reused request');
    equal(results.current, 1, 'current reply completes once');
    equal(results.businessFailure, [1, 1], 'business rejection is delivered unchanged and shown once');
    equal(results.networkFailure, [1, 4, 0], 'network error completes with status zero');
    equal(results.jsonResponse, { status: 0, cpOrder: 'private-test-order', price: 0.99 }, 'responseType=json is respected');
    equal(results.busyXHR, [0, 0, 1, 0, 0], 'busy selection cannot dispatch payment or false order-failure callbacks');
    equal(results.busyFetch, 'AbortError', 'busy fetch aborts without manufacturing another item order');
    equal(results.unproxied, [200, 4], 'unrelated requests retain native behavior');
    equal(/private-test-user|private-test-order|private backend message/.test(results.logs), false, 'diagnostics do not leak account, order or raw response');
    console.log(`PASS: ${assertions} browser proxy assertions`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
