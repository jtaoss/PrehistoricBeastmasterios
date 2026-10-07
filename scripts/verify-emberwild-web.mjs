import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function verifyWebRelease(directory){
  const root=path.resolve(directory),manifest=await readFile(path.join(root,'manifest.sha256'),'utf8');
  const expected=new Set(['manifest.sha256']);
  for(const line of manifest.trim().split('\n')){
    const match=line.match(/^([a-f0-9]{64})  (.+)$/);
    if(!match)throw new Error('Invalid manifest record');
    const[,hash,name]=match;
    if(name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(name)||expected.has(name))throw new Error('Invalid manifest path');
    expected.add(name);const file=path.join(root,name);
    if(!(await lstat(file)).isFile())throw new Error(`Unexpected file type: ${name}`);
    if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error(`Hash mismatch: ${name}`);
  }
  async function walk(dir,prefix=''){
    for(const item of await readdir(dir,{withFileTypes:true})){
      const name=path.posix.join(prefix,item.name);
      if(item.isSymbolicLink())throw new Error(`Unexpected symlink: ${name}`);
      if(item.isDirectory())await walk(path.join(dir,item.name),name);
      else if(!expected.delete(name))throw new Error(`Unexpected package file: ${name}`);
    }
  }
  await walk(root);if(expected.size)throw new Error('Missing package files');
  const release=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
  if(release.gameId!=='emberwild'||!/^[a-f0-9]{16}$/.test(release.version))throw new Error('Invalid release identity');
  if((await readFile(path.join(root,'VERSION'),'utf8')).trim()!==release.version)throw new Error('Version mismatch');
  for(const entry of ['index','login-preview']){
    const html=await readFile(path.join(root,'public',entry+'.html'),'utf8');
    if(!html.includes(`<script defer src="${entry==='index'?'app':entry}.bundle.js"></script>`)||html.includes('type="module"'))throw new Error(`Invalid static entry: ${entry}`);
  }
  if((await readFile(path.join(root,'public','health.txt'),'utf8')).trim()!=='emberwild-ok')throw new Error('Invalid health response');
  return release;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw new Error('Usage: node scripts/verify-emberwild-web.mjs RELEASE_DIRECTORY');
  const release=await verifyWebRelease(process.argv[2]);console.log(`Verified Emberwild web release ${release.version}`);
}
