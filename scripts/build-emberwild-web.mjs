// Produce an independent operations bundle. Never mutate the source or iOS game.
import {build} from '../prototypes/emberwild/node_modules/esbuild/lib/main.js';
import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyWebRelease} from './verify-emberwild-web.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),source=path.join(root,'prototypes/emberwild');
const ops=path.join(root,'handoff/emberwild-deploy');
async function files(dir,prefix=''){
  const result=[];
  for(const item of await readdir(dir,{withFileTypes:true})){
    const name=path.posix.join(prefix,item.name);
    if(item.name==='.DS_Store')continue;
    if(item.isSymbolicLink())throw new Error(`Source symlink is not deployable: ${name}`);
    if(item.isDirectory())result.push(...await files(path.join(dir,item.name),name));
    else result.push(name);
  }
  return result.sort();
}
const modules=(await readdir(source)).filter(n=>/\.(mjs|js|css|html)$/.test(n)&&!n.startsWith('generate-')).sort();
const assets=(await files(path.join(source,'assets'))).map(n=>'assets/'+n),opsNames=await files(ops);
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const hash=createHash('sha256').update(commit);
for(const name of [...modules,...assets])hash.update(name+'\0').update(await readFile(path.join(source,name)));
for(const name of opsNames)hash.update(name+'\0').update(await readFile(path.join(ops,name)));
for(const name of ['scripts/build-emberwild-web.mjs','scripts/verify-emberwild-web.mjs','prototypes/emberwild/package.json'])hash.update(name+'\0').update(await readFile(path.join(root,name)));
const version=hash.digest('hex').slice(0,16),folder='emberwild-web-'+version;
const output=path.join(root,'output/emberwild-deploy'),destination=path.join(output,folder),publicRoot=path.join(destination,'public');
await mkdir(publicRoot,{recursive:true});
const staticNames=modules.filter(n=>n.endsWith('.css')||n.endsWith('.js'));
for(const name of staticNames)await cp(path.join(source,name),path.join(publicRoot,name));
await cp(path.join(source,'assets'),path.join(publicRoot,'assets'),{recursive:true});
for(const [html,entry] of [['index.html','app'],['login-preview.html','login-preview']]){
  await build({entryPoints:[path.join(source,entry+'.mjs')],bundle:true,format:'iife',platform:'browser',target:'safari15',charset:'utf8',
    outfile:path.join(publicRoot,entry+'.bundle.js'),define:{'import.meta.url':'document.baseURI'},logLevel:'warning'});
  const content=await readFile(path.join(source,html),'utf8'),tag=`<script type="module" src="${entry}.mjs"></script>`;
  if(!content.includes(tag))throw new Error(`Missing entry script: ${html}`);
  await writeFile(path.join(publicRoot,html),content.replace(tag,`<script defer src="${entry}.bundle.js"></script>`));
}
const release={gameId:'emberwild',version,sourceCommit:commit,requiresNativeSDK:'1.0',entry:'index.html',loginEntry:'login-preview.html',deployment:'static-https',localBundlePreserved:true};
await writeFile(path.join(publicRoot,'health.txt'),'emberwild-ok\n');
await writeFile(path.join(publicRoot,'release.json'),JSON.stringify(release,null,2)+'\n');
await writeFile(path.join(destination,'release.json'),JSON.stringify(release,null,2)+'\n');
await writeFile(path.join(destination,'VERSION'),version+'\n');
await cp(ops,path.join(destination,'ops'),{recursive:true});
const expected=[...staticNames,...assets,'index.html','login-preview.html','app.bundle.js','login-preview.bundle.js','health.txt','release.json'].map(n=>'public/'+n)
  .concat(opsNames.map(n=>'ops/'+n),['VERSION','release.json']).sort();
const extra=(await files(destination)).filter(n=>n!=='manifest.sha256'&&!expected.includes(n));
if(extra.length)throw new Error('Unfamiliar output files were preserved: '+extra.join(', '));
const manifest=[];
for(const name of expected)manifest.push(`${createHash('sha256').update(await readFile(path.join(destination,name))).digest('hex')}  ${name}`);
await writeFile(path.join(destination,'manifest.sha256'),manifest.join('\n')+'\n');
await verifyWebRelease(destination);
const archive=path.join(output,folder+'.tar.gz');
execFileSync('tar',['-czf',archive,'-C',output,folder],{stdio:'inherit'});
await writeFile(archive+'.sha256',`${createHash('sha256').update(await readFile(archive)).digest('hex')}  ${path.basename(archive)}\n`);
await writeFile(path.join(output,'latest.json'),JSON.stringify({version,releaseDirectory:folder,archive:path.basename(archive)},null,2)+'\n');
console.log(JSON.stringify({version,releaseDirectory:destination,archive,localBundlePreserved:true},null,2));
