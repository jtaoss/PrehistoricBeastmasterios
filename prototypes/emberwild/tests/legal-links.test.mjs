import assert from 'node:assert/strict';
import {LEGAL_URLS,openLegalURL} from '../legal-links.mjs';

let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}

test('browser fallback opens every approved legal URL in a protected new tab',()=>{
  const calls=[],host={open:(...args)=>calls.push(args)};
  for(const url of Object.values(LEGAL_URLS))assert.equal(openLegalURL(url,host),true);
  assert.deepEqual(calls,Object.values(LEGAL_URLS).map(url=>[url,'_blank','noopener,noreferrer']));
});

test('native host uses the existing sdkToBrowser bridge',()=>{
  const calls=[],host={android:{sdkToBrowser:url=>calls.push(url)},open:()=>assert.fail('browser fallback must not run')};
  assert.equal(openLegalURL(LEGAL_URLS.deletion,host),true);
  assert.deepEqual(calls,[LEGAL_URLS.deletion]);
});

test('unknown destinations fail closed',()=>{
  let called=false;
  assert.equal(openLegalURL('https://example.com/not-approved',{open:()=>{called=true;}}),false);
  assert.equal(called,false);
});

console.log(`\n${passed} legal-link scenarios passed.`);
