import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateResponse, readPublicResponse} from './verify-public-config.mjs';

const fixture = name => readFile(new URL(`./examples/${name}.json`, import.meta.url), 'utf8').then(JSON.parse);
const valid = await fixture('default-off');
const changed = updates => ({...valid, data: {...valid.data, ...updates}});
const endpoint = 'https://safthwysdk.antieh.com/api/v1/ios/website-display?appId=1000151&packageName=com.stone.primitive.saga&channel=xmwtwh5sqxssgp1&versionCode=49&versionName=1.0.12';

test('three complete examples and increasing revisions', async () => {
  let previous = -1;
  for (const [name, expected] of [['default-off', 'off'], ['maintenance-on', 'on'], ['restored-off', 'off']]) {
    const data = validateResponse(await fixture(name), expected);
    assert.ok(data.revision > previous);
    previous = data.revision;
  }
});

test('missing fields, wrong types, scope and revision rejected', () => {
  for (const key of Object.keys(valid.data)) {
    const body = changed({});
    delete body.data[key];
    assert.throws(() => validateResponse(body), key);
  }
  for (const update of [
    {appId:'1000150'}, {channel:'*'}, {packageName:'com.studio.dino.stone.saga'},
    {websiteOnly:'false'}, {websiteOnly:0}, {supportUrls:null}, {supportUrls:new Array(11).fill('https://support.example.com/')},
    {revision:-1}, {revision:1.5}, {revision:'1'}, {revision:Number.MAX_SAFE_INTEGER + 1}, {updatedAt:null},
  ]) assert.throws(() => validateResponse(changed(update)));
  assert.throws(() => validateResponse({...valid, code:'0'}));
  assert.throws(() => validateResponse(valid, 'on'));
});

test('official website and support URL restrictions', () => {
  for (const websiteUrl of [
    'http://safthwyk.antieh.com/', 'https://safthwyk.antieh.com.evil.example/',
    'https://user:pass@safthwyk.antieh.com/', 'https://safthwyk.antieh.com:8443/',
    'https://safthwyk.antieh.com/a/../game', 'https://safthwyk.antieh.com/%2e%2e/game',
    'https://safthwyk.antieh.com/a\\game', ' https://safthwyk.antieh.com/',
  ]) assert.throws(() => validateResponse(changed({websiteUrl})));
  for (const url of ['https://saftcdn.antieh.com/', 'https://pay.playstonegame.com/', 'https://xmw520.com/', 'javascript:alert(1)']) {
    assert.throws(() => validateResponse(changed({supportUrls:[url]})));
  }
  validateResponse(changed({supportUrls:['https://safthwyk.antieh.com/support', 'https://support.example.com/contact?id=1']}));
});

test('GET only, no redirects, caching and bounded body (mock network)', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.href, endpoint);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      return new Response(JSON.stringify(valid), {headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
    };
    validateResponse(await readPublicResponse(endpoint), 'off');
    for (const response of [
      new Response('not found', {status:404}),
      new Response(JSON.stringify(valid), {headers:{'Content-Type':'text/html', 'Cache-Control':'no-store'}}),
      new Response(JSON.stringify(valid), {headers:{'Content-Type':'application/json'}}),
      new Response('x'.repeat(32769), {headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}}),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(() => readPublicResponse(endpoint));
    }
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error('should not be called'); };
    await assert.rejects(() => readPublicResponse(endpoint.replace('/api/v1/ios/', '/admin/api/ios/')));
    await assert.rejects(() => readPublicResponse(endpoint.replace('1000151', '1000150')));
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});
