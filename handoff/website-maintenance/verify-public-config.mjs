// Node 18+. Read-only response-contract check; never calls the admin API.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const limit = 32_768;
const scope = {
  appId: '1000151',
  packageName: 'com.stone.primitive.saga',
  channel: 'xmwtwh5sqxssgp1',
};

function safeURL(value) {
  assert.equal(typeof value, 'string', 'URL must be a string');
  assert.ok(Buffer.byteLength(value) <= 2048, 'URL exceeds 2048 bytes');
  assert.ok(/^https:\/\//i.test(value) && !/[\s\\]/.test(value), 'URL must be unambiguous HTTPS');
  // Check before URL normalization removes dot segments.
  const rawPath = value.replace(/^https:\/\/[^/?#]*/i, '').split(/[?#]/)[0];
  const decoded = decodeURIComponent(rawPath);
  assert.ok(!decoded.includes('\\') && !decoded.split('/').some(x => x === '.' || x === '..'),
    'URL path must not contain traversal');
  const url = new URL(value);
  assert.ok(url.hostname && url.protocol === 'https:' && !url.username && !url.password,
    'URL requires an HTTPS host without credentials');
  assert.ok(!url.port || url.port === '443', 'URL must use port 443');
  return url;
}

export function validateResponse(body, expected) {
  assert.ok(body && typeof body === 'object' && !Array.isArray(body), 'response must be an object');
  assert.equal(body.code, 0, 'code must be numeric 0');
  const config = body.data;
  assert.ok(config && typeof config === 'object' && !Array.isArray(config), 'data must be an object');
  for (const [key, value] of Object.entries(scope)) assert.equal(config[key], value, `${key} scope mismatch`);
  assert.equal(typeof config.websiteOnly, 'boolean', 'websiteOnly must be a boolean');
  assert.equal(safeURL(config.websiteUrl).hostname, 'safthwyk.antieh.com', 'website must use the official host');
  assert.ok(Array.isArray(config.supportUrls) && config.supportUrls.length <= 10,
    'supportUrls must be an array of at most 10 URLs');
  for (const value of config.supportUrls) {
    const {hostname} = safeURL(value);
    const blocked = ['antieh.com', 'xmw520.com', 'playstonegame.com']
      .some(host => hostname === host || hostname.endsWith(`.${host}`));
    assert.ok(hostname === 'safthwyk.antieh.com' || !blocked, 'support link uses a blocked game/payment host');
  }
  // Safe integers are deliberately stricter than Swift Int64 to avoid JS rounding.
  assert.ok(Number.isSafeInteger(config.revision) && config.revision >= 0,
    'revision must be a nonnegative safe integer');
  assert.equal(typeof config.updatedAt, 'string', 'updatedAt must be a string');
  if (expected !== undefined) {
    assert.ok(expected === 'on' || expected === 'off', '--expect must be on or off');
    assert.equal(config.websiteOnly, expected === 'on', `expected ${expected}`);
  }
  return {websiteOnly: config.websiteOnly, revision: config.revision, updatedAt: config.updatedAt};
}

export async function readPublicResponse(urlString) {
  const url = safeURL(urlString);
  assert.equal(url.pathname, '/api/v1/ios/website-display', 'only the public read-only endpoint is supported');
  assert.ok(!url.hash, 'endpoint must not have a fragment');
  for (const [key, value] of Object.entries(scope)) {
    assert.deepEqual(url.searchParams.getAll(key), [value], `${key} query mismatch`);
  }
  const response = await fetch(url, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'},
  });
  assert.equal(response.status, 200, `public endpoint HTTP ${response.status} (expected 200)`);
  assert.ok(/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || ''),
    'response must be application/json');
  assert.ok((response.headers.get('cache-control') || '').split(',')
    .some(value => value.trim().toLowerCase() === 'no-store'), 'response requires Cache-Control: no-store');
  assert.ok(response.body, 'response body is missing');
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      assert.ok(length <= limit, 'response exceeds 32768 bytes');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    assert.ok(['--file', '--url', '--expect'].includes(key) && args[i + 1] && !(key in options),
      'Usage: node verify-public-config.mjs (--file response.json | --url HTTPS_URL) [--expect off|on]');
    options[key] = args[i + 1];
  }
  assert.ok(Boolean(options['--file']) !== Boolean(options['--url']), 'provide exactly one --file or --url');
  if (options['--expect'] !== undefined) assert.ok(['on', 'off'].includes(options['--expect']), '--expect must be on or off');
  let body;
  if (options['--file']) {
    const bytes = await readFile(options['--file']);
    assert.ok(bytes.length <= limit, 'response exceeds 32768 bytes');
    body = JSON.parse(bytes.toString('utf8'));
  } else body = await readPublicResponse(options['--url']);
  console.log('PASS public contract:', JSON.stringify(validateResponse(body, options['--expect'])));
  console.log('Read-only check only; this does not prove admin, persistence, concurrency or device switching.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    // Do not dump server bodies or URLs that may contain private diagnostics.
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
