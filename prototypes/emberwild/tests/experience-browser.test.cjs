const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.__haptics=[];
    window.webkit={messageHandlers:{gameHaptics:{postMessage:message=>window.__haptics.push(message)}}};
  });
  try{
    await page.goto(`${url}/?qa=stage1`);await page.waitForFunction(()=>window.emberwildQA?.game);
    await page.evaluate(()=>emberwildQA.game.paused=false);
    await page.locator('#game-settings').tap();await page.waitForSelector('.settings-panel');
    assert.equal(await page.locator('.setting-row').count(),5,'all native-experience settings are present');

    await page.locator('[data-setting="fontSize"][data-setting-value="large"]').tap();
    await page.locator('input[data-setting="volume"]').fill('35');
    await page.locator('button[data-setting="powerSaver"]').tap();
    await page.locator('[data-setting="quality"][data-setting-value="high"]').tap();
    const applied=await page.evaluate(()=>({
      settings:emberwildQA.experience.settings,
      font:document.documentElement.dataset.fontSize,
      lowPower:document.documentElement.dataset.lowPower,
      quality:document.documentElement.dataset.quality,
      dpr:emberwildQA.painter.dpr,
      haptics:window.__haptics
    }));
    assert.equal(applied.settings.volume,.35);assert.equal(applied.font,'large');assert.equal(applied.lowPower,'true');assert.equal(applied.quality,'high');
    assert.equal(applied.dpr,1,'power saver lowers canvas backing resolution');
    assert.ok(applied.haptics.length>=2,'controls call the native haptics bridge');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'large text does not cause horizontal overflow');

    await page.locator('[data-action="settings-close"]').tap();
    assert.equal(await page.evaluate(()=>emberwildQA.game.paused),false,'closing settings resumes only the game it paused');
    await page.evaluate(()=>window.setShellAppActive(false));await page.waitForSelector('#modal:not([hidden])');
    assert.match(await page.locator('#modal-title').textContent(),/暫停/);
    await page.evaluate(()=>window.setShellAppActive(true));
    assert.equal(await page.evaluate(()=>emberwildQA.game.paused),true,'foreground return never resumes combat without player confirmation');
    await page.locator('[data-action="resume"]').tap();assert.equal(await page.evaluate(()=>emberwildQA.game.paused),false);

    await page.reload();await page.waitForFunction(()=>window.emberwildQA?.game);
    const restored=await page.evaluate(()=>emberwildQA.experience.settings);
    assert.equal(restored.volume,.35);assert.equal(restored.fontSize,'large');assert.equal(restored.powerSaver,true);assert.equal(restored.quality,'high');
    await page.evaluate(()=>{emberwildQA.experience.update({powerSaver:false,quality:'auto'});window.setShellLowPowerMode(true);});
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.lowPower),'true','native iOS low-power callback activates automatic reduced rendering');
    assert.deepEqual(errors,[]);
    console.log('PASS persisted volume/text/quality, native haptics, lifecycle pause and low-power rendering');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
