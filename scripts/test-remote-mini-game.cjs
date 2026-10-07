// Compile real URL policy and mini-game loading/fallback methods with an
// in-memory WebView stand-in. Run on macOS; no server or app storage is used.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const config=read('PrehistoricBeastmaster/Config/ShellConfig.swift'),web=read('PrehistoricBeastmaster/Web/TrustedWebView.swift');
const start=web.indexOf('    func isMiniGamePage('),end=web.indexOf('    @discardableResult func configureOnlineGameURL',start);
assert.ok(start>=0&&end>start);
const source=read('scripts/remote-mini-tests/Harness.swift').replace('/* POLICY */',config.slice(config.indexOf('enum IOSWebNavigationPolicy')))
  .replace('/* MINI_LOADER */',web.slice(start,end));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbm-remote-mini-'));
try{
  const file=path.join(scratch,'main.swift'),executable=path.join(scratch,'tests');fs.writeFileSync(file,source);
  execFileSync('xcrun',['swiftc','-swift-version','5',file,'-o',executable],{stdio:'inherit'});
  execFileSync(executable,[],{stdio:'inherit',timeout:15000});
}finally{
  const target=path.resolve(scratch);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(target).startsWith('pbm-remote-mini-'))throw new Error('Unexpected cleanup target');
  fs.rmSync(target,{recursive:true,force:true});
}
