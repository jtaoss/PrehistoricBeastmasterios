// Validate the actual artifact and exercise corruption/missing/extra checks in
// a disposable miniature release. No game state or deployment host is touched.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyWebRelease} from './verify-emberwild-web.mjs';
if(!process.argv[2])throw new Error('Pass the built web release directory');
const actual=await verifyWebRelease(process.argv[2]);
const scratch=await mkdtemp(path.join(tmpdir(),'emberwild-web-package-'));
try{
  await mkdir(path.join(scratch,'public'));
  const version='0123456789abcdef';
  const fixtures={
    'VERSION':version+'\n',
    'release.json':JSON.stringify({gameId:'emberwild',version}),
    'public/index.html':'<script defer src="app.bundle.js"></script>',
    'public/login-preview.html':'<script defer src="login-preview.bundle.js"></script>',
    'public/app.bundle.js':'fixture',
    'public/login-preview.bundle.js':'fixture',
    'public/health.txt':'emberwild-ok\n'
  };
  for(const[name,data]of Object.entries(fixtures))await writeFile(path.join(scratch,name),data);
  const manifest=Object.entries(fixtures).map(([name,data])=>`${createHash('sha256').update(data).digest('hex')}  ${name}`).join('\n')+'\n';
  await writeFile(path.join(scratch,'manifest.sha256'),manifest);await verifyWebRelease(scratch);
  const bundle=path.join(scratch,'public/app.bundle.js');
  await writeFile(bundle,'corrupted');await assert.rejects(verifyWebRelease(scratch),/Hash mismatch/);
  await rm(bundle);await assert.rejects(verifyWebRelease(scratch),/ENOENT/);
  await writeFile(bundle,fixtures['public/app.bundle.js']);
  const extra=path.join(scratch,'public/stale.js');await writeFile(extra,'old release');
  await assert.rejects(verifyWebRelease(scratch),/Unexpected package file/);await rm(extra);
  await writeFile(path.join(scratch,'manifest.sha256'),manifest+`${'0'.repeat(64)}  ../outside\n`);
  await assert.rejects(verifyWebRelease(scratch),/Invalid manifest path/);
  await writeFile(path.join(scratch,'manifest.sha256'),manifest);await verifyWebRelease(scratch);
  console.log(`PASS actual release ${actual.version}; changed, missing, extra and escaping manifest paths rejected; restored release accepted`);
}finally{
  const target=path.resolve(scratch),allowed=path.resolve(tmpdir())+path.sep;
  if(!target.startsWith(allowed)||!path.basename(target).startsWith('emberwild-web-package-'))throw new Error('Refuse unexpected cleanup path');
  await rm(target,{recursive:true,force:true});
}
