// Negative tests only touch a disposable fixture, never the working game/save.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=await mkdtemp(path.join(tmpdir(),'emberwild-package-test-'));
const source='prototypes/emberwild',dest='PrehistoricBeastmaster/Resources/game';
const fixture=['scripts/verify-emberwild-ios.sh',`${source}/app.mjs`,`${source}/assets/egg.png`,`${dest}/app.mjs`,`${dest}/assets/egg.png`];
try{
  for(const name of fixture){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),'fixture');}
  await copyFile(new URL('./verify-emberwild-ios.sh',import.meta.url),path.join(root,fixture[0]));
  const entries=await Promise.all(fixture.map(async name=>`${createHash('sha256').update(await readFile(path.join(root,name))).digest('hex')}  ${name}`));
  await writeFile(path.join(root,'scripts/emberwild-resources.sha256'),entries.join('\n')+'\n');
  const check=()=>spawnSync('/bin/sh',[path.join(root,fixture[0])],{encoding:'utf8'});
  assert.equal(check().status,0,'matching resources');
  const asset=path.join(root,dest,'assets/egg.png');
  await writeFile(asset,'stale');assert.notEqual(check().status,0,'changed art must fail');
  await rm(asset);assert.notEqual(check().status,0,'missing art must fail');
  await writeFile(asset,'fixture');
  const extra=path.join(root,dest,'old-runner.js');
  await writeFile(extra,'unused');assert.match(check().stderr,/inventory differs/);
  await rm(extra);
  const added=path.join(root,source,'assets/new.png');
  await writeFile(added,'new');assert.match(check().stderr,/Source inventory changed/);
  await rm(added);
  const link=path.join(root,dest,'unexpected-link');
  await symlink(asset,link);assert.match(check().stderr,/symlink/);await rm(link);
  assert.equal(check().status,0,'restored fixture');
  console.log('PASS package guard: matching, changed, missing, extra, unbuilt source, symlink, restored');
}finally{await rm(root,{recursive:true,force:true});}
