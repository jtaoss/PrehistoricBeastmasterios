const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:4174';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {freshState,encode}=await import('../save.mjs'),state=freshState();state.profile.tutorialDone=true;state.profile.runs=27;state.camp.stones=123;const old=encode(state);
    await context.addInitScript(raw=>{if(!localStorage.getItem('fixture-seeded')){localStorage.setItem('emberwild_save_v2',raw);localStorage.setItem('emberwild_save_v2_backup',raw);localStorage.setItem('emberwild_prototype_v1','{"runs":99}');localStorage.setItem('other-app','keep');localStorage.setItem('emberwild_experience_v1','{"volume":0.2}');localStorage.setItem('fixture-seeded','yes');}},old);
    const request={enabled:true,id:'acceptance-browser-test',origin:url,expiresAt:Date.now()+60000};
    await page.route('**/acceptance-reset.json',r=>r.fulfill({json:request}));
    await page.goto(url);await page.waitForFunction(()=>document.querySelector('#begin').textContent.includes('新手訓練'));
    const saved=await page.evaluate(()=>({primary:localStorage.getItem('emberwild_save_v2'),backup:JSON.parse(localStorage.getItem('emberwild_acceptance_backup_acceptance-browser-test')),other:localStorage.getItem('other-app'),settings:localStorage.getItem('emberwild_experience_v1')}));
    assert.equal(saved.primary,null);assert.equal(saved.backup.records.emberwild_save_v2,old);assert.equal(saved.other,'keep');assert.equal(JSON.parse(saved.settings).volume,.2);
    assert.equal(await page.locator('#tutorial-replay').isVisible(),false);await page.locator('#begin').click();await page.locator('#tutorial-next').waitFor();await page.locator('#tutorial-next').click();await page.keyboard.down('d');await page.waitForFunction(()=>document.querySelector('#tutorial-title').textContent.includes('移動完成'));await page.keyboard.up('d');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('emberwild_save_v2')).state.run.tutorial.awaiting);
    const run=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwild_save_v2')).state.run);await page.reload();await page.locator('#begin').click();await page.locator('[data-action="resume"]').click();assert.match(await page.locator('#tutorial-title').textContent(),/移動完成/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('emberwild_save_v2')).state.run.runId),run.runId);
    assert.equal(await page.locator('#tutorial-skip').isVisible(),false);await page.locator('#pause').click();assert.equal(await page.locator('[data-action="save-camp"],[data-action="abandon"],[data-action="exit-confirm"]').count(),0);assert.deepEqual(errors,[]);
    console.log('PASS real non-QA entry: backs up and clears only game progress once; reload preserves mandatory tutorial confirmation; pause offers no bypass');await context.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
