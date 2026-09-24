// Run the existing isolated native-auth UI scenarios without a real account.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),origin=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const context=await browser.newContext();
    const page=await context.newPage();
    const code=fs.readFileSync(path.join(root,'prototypes/emberwild/tests/login-ui-browser.cli.cjs'),'utf8').replaceAll('http://127.0.0.1:4174',origin);
    const scenario=eval('('+code+'\n)');
    console.log(JSON.stringify(await scenario(page),null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
