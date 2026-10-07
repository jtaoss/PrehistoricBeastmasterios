// Package classic scripts for WKWebView.loadFileURL. ES modules work over HTTP
// in the prototype, but WebKit rejects the module resource from a file origin.
import {build} from '../prototypes/emberwild/node_modules/esbuild/lib/main.js';
import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'prototypes/emberwild');
const destination=path.join(root,'PrehistoricBeastmaster/Resources/game');
async function filesIn(directory,prefix=''){
  const result=[];
  for(const item of await readdir(directory,{withFileTypes:true})){
    if(item.name==='.DS_Store')continue;
    const relative=path.posix.join(prefix,item.name);
    if(item.isSymbolicLink())throw new Error(`Unexpected resource symlink: ${relative}`);
    if(item.isDirectory())result.push(...await filesIn(path.join(directory,item.name),relative));
    else if(item.isFile())result.push(relative);
  }
  return result.sort();
}
await mkdir(destination,{recursive:true});
const names=(await readdir(source)).filter(name=>/\.(mjs|js|css|html)$/.test(name)&&!name.startsWith('generate-'));
for(const name of names)await cp(path.join(source,name),path.join(destination,name));
await cp(path.join(source,'assets'),path.join(destination,'assets'),{recursive:true});
for(const [html,entry] of [['index.html','app'],['login-preview.html','login-preview']]){
  await build({entryPoints:[path.join(source,`${entry}.mjs`)],bundle:true,format:'iife',platform:'browser',
    target:'safari15',charset:'utf8',outfile:path.join(destination,`${entry}.bundle.js`),
    // Audio URLs are relative to the same root as both HTML entry points.
    define:{'import.meta.url':'document.baseURI'},logLevel:'warning'});
  const content=await readFile(path.join(source,html),'utf8');
  const tag=`<script type="module" src="${entry}.mjs"></script>`;
  if(!content.includes(tag))throw new Error(`Missing entry tag: ${html}`);
  await writeFile(path.join(destination,html),content.replace(tag,`<script defer src="${entry}.bundle.js"></script>`));
}
// Xcode verifies this manifest before compiling, so a later source edit or raw
// folder copy cannot silently ship stale bundles or module-only HTML again.
const assets=(await filesIn(path.join(source,'assets'))).map(name=>`assets/${name}`);
const resourceNames=[...names,...assets,'app.bundle.js','login-preview.bundle.js'].sort();
const extra=(await filesIn(destination)).filter(name=>!resourceNames.includes(name));
// Do not silently erase unfamiliar files: a developer must establish whether
// they are obsolete, and preserve them outside the shipping folder if needed.
if(extra.length)throw new Error(`Unexpected packaged files; review before removing: ${extra.join(', ')}`);
const tracked=[...[...names,...assets].map(name=>`prototypes/emberwild/${name}`),
  ...resourceNames.map(name=>`PrehistoricBeastmaster/Resources/game/${name}`),
  'scripts/build-emberwild-ios.mjs','scripts/verify-emberwild-ios.sh',
  'prototypes/emberwild/package.json','prototypes/emberwild/pnpm-lock.yaml'];
const lines=[];
for(const name of tracked.sort())lines.push(`${createHash('sha256').update(await readFile(path.join(root,name))).digest('hex')}  ${name}`);
await writeFile(path.join(root,'scripts/emberwild-resources.sha256'),lines.join('\n')+'\n');
await writeFile(path.join(root,'scripts/emberwild-resources.xcfilelist'),tracked.sort().map(name=>`$(SRCROOT)/${name}`).join('\n')+'\n');
console.log('Packaged Emberwild: classic WebKit bundles + checked source/resource manifest.');
