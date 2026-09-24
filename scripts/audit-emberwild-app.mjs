// Inspect the actual compiled app, not just the source/resource directory.
// Usage: node scripts/audit-emberwild-app.mjs /path/to/App.app 1.0.12 49
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const [app,version,build]=process.argv.slice(2);
assert.ok(app?.endsWith('.app')&&version&&build,'Supply .app path, expected marketing version and build number');
const plist=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
assert.equal(plist.CFBundleIdentifier,'com.stone.primitive.saga');
assert.equal(plist.CFBundleShortVersionString,version);assert.equal(plist.CFBundleVersion,build);
const prefix='PrehistoricBeastmaster/Resources/game/';
const manifest=(await readFile(path.join(root,'scripts/emberwild-resources.sha256'),'utf8')).trim().split('\n');
const expected=new Map(manifest.map(line=>line.split('  ')).filter(([,name])=>name.startsWith(prefix)).map(([hash,name])=>[name.slice(prefix.length),hash]));
async function list(directory,relative=''){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    assert.ok(!entry.isSymbolicLink(),`Unexpected symlink: ${entry.name}`);
    if(entry.name==='.DS_Store')continue;
    const name=path.posix.join(relative,entry.name);
    if(entry.isDirectory())files.push(...await list(path.join(directory,entry.name),name));else files.push(name);
  }
  return files.sort();
}
const actual=await list(path.join(app,'game'));
assert.deepEqual(actual,[...expected.keys()].sort(),'Compiled game has extra/missing resources');
for(const [name,hash] of expected){
  const data=await readFile(path.join(app,'game',name));
  assert.equal(createHash('sha256').update(data).digest('hex'),hash,`Compiled resource differs: ${name}`);
}
for(const [html,entry] of [['index.html','app'],['login-preview.html','login-preview']]){
  const text=await readFile(path.join(app,'game',html),'utf8');
  assert.ok(text.includes(`<script defer src="${entry}.bundle.js"></script>`),`Wrong native entry: ${html}`);
  assert.ok(!text.includes('type="module"'),`File-origin module in ${html}`);
}
assert.ok(!actual.some(name=>/^(audio\/|sprites\/dino-|dino-sprites|dino-sprite-data|runner-hero|tutorial-comic|(?:game|game-sfx|sfx-data|menu-music|native-music)\.js$|styles\.css$)/.test(name)),'Old runner resource reappeared');
// The native legal reader is shared by both games; it must survive retiring the runner.
const legalPath='legal/privacy-policy.html';
assert.deepEqual(await readFile(path.join(app,legalPath)),await readFile(path.join(root,'PrehistoricBeastmaster/Resources',legalPath)),
  'Shared privacy policy missing or stale in compiled app');
const privacyReader=await readFile(path.join(root,'PrehistoricBeastmaster/PrivacyPolicyViewController.swift'),'utf8');
assert.ok(privacyReader.includes('subdirectory: "legal"'),'Privacy reader still depends on the retired runner directory');
const music=await readFile(path.join(root,'PrehistoricBeastmaster/Web/LocalMusicPlayer.swift'),'utf8');
assert.ok(!music.includes('canopy-afternoon')&&!music.includes('canopy-hop'),'Native player still references removed runner audio');
for(const [,audio] of music.matchAll(/"(assets\/audio\/[^"\n]+)"/g))assert.ok(expected.has(audio),`Native audio is not packaged: ${audio}`);
const binary=await readFile(path.join(app,plist.CFBundleExecutable));
// Debug uses an injected dylib; Release stores the code in the main executable.
const code=await readFile(path.join(app,`${plist.CFBundleExecutable}.debug.dylib`)).catch(error=>{if(error.code==='ENOENT')return binary;throw error;});
assert.ok(!code.includes(Buffer.from('canopy-afternoon.mp3'))&&!code.includes(Buffer.from('canopy-hop.m4a')),'Compiled native code still references old runner music');
const binaryHash=createHash('sha256').update(binary).digest('hex');
console.log(JSON.stringify({app:path.resolve(app),bundleId:plist.CFBundleIdentifier,version,build,
  checkedGameFiles:actual.length,checkedArtAndAudio:actual.filter(name=>name.startsWith('assets/')).length,
  entry:'game/index.html -> app.bundle.js',loginEntry:'game/login-preview.html -> login-preview.bundle.js',
  oldRunnerFiles:0,privacyPolicy:legalPath,binarySHA256:binaryHash,result:'PASS',
  scope:'Resource identity/entry/version only; this does not validate signing, backend delivery, or App Review acceptance.'},null,2));
