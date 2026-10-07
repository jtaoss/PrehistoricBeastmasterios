const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';

(async()=>{
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser=await chromium.launch({headless:true,executablePath});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
    window.__mainGameOpenCount=0;
    window.__shellSdkStatus=JSON.stringify({contentMode:'BOTH'});
    window.android={
      getSdkStatus(){return window.__shellSdkStatus;},
      openMainGame(){window.__mainGameOpenCount+=1;}
    };
  });
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.bootReady==='true');

  const entry=page.locator('#landing-main-game');
  assert.equal(await entry.count(),1,'homepage exposes the online-game entry');
  assert.equal(await entry.isVisible(),true,'BOTH mode shows the main-game entry');
  await entry.click();
  assert.equal(await page.locator('#modal-title').textContent(),'前往主世界？','homepage entry opens the save confirmation');
  await page.locator('[data-action="content-switch-cancel"]').click();
  await page.evaluate(()=>window.setShellContentMode('mini_only'));
  assert.equal(await entry.isVisible(),false,'MINI_ONLY hides the main-game entry if explicitly set in a test');

  await page.evaluate(()=>{
    window.setShellContentMode('both');
    document.getElementById('landing-settings').hidden=false;
    document.getElementById('landing-settings').click();
  });
  assert.equal(await page.locator('.settings-data-row.content-switch').count(),1,'settings expose the second entry');
  await page.locator('.settings-data-row.content-switch button').click();
  assert.equal(await page.locator('#modal-title').textContent(),'前往主世界？','settings entry opens the save confirmation');
  await page.locator('[data-action="content-switch-confirm"]').click();
  await page.waitForFunction(()=>window.__mainGameOpenCount===1);
  assert.equal(await page.evaluate(()=>window.__mainGameOpenCount),1,'the native main-game bridge receives the switch');
  await page.evaluate(()=>window.setShellContentMode('mini_only'));
  assert.equal(await page.locator('.settings-data-row.content-switch').count(),0,'the settings entry honors a mode change');

  await browser.close();
  console.log('PASS restored online-game entry: homepage, settings, and native bridge');
})().catch(error=>{console.error(error);process.exitCode=1;});
