const {approach,depart,build,upgrade,relocate}=require('./camp-helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const out=path.resolve(__dirname,'../test-output');fs.mkdirSync(out,{recursive:true});
const errors=[],external=[];
async function load(page){page.on('pageerror',e=>errors.push(e.message));await require('./camp-helpers.cjs').openVeteran(page,url+'/?qa=1');await page.waitForFunction(()=>window.emberwildQA);}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const ctx=await browser.newContext({viewport:{width:1440,height:1100}});
    await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(url).origin)return r.continue();external.push(r.request().url());return r.abort();});
    const p=await ctx.newPage();await load(p);await p.locator('#begin').click();
    assert.equal(await p.locator('#camp-stones').textContent(),'8');
    await build(p,'tent',0);await p.waitForFunction(()=>emberwildQA.store.state.camp.buildings.length===1);assert.equal(await p.locator('#camp-stones').textContent(),'5');
    await upgrade(p,0);await p.waitForFunction(()=>emberwildQA.store.state.camp.buildings[0].level===2);assert.equal(await p.locator('#camp-stones').textContent(),'0');
    await relocate(p,0,4);await p.waitForFunction(()=>emberwildQA.store.state.camp.buildings[0].slot===4);
    await p.reload();await p.locator('#begin').click();assert.equal(await p.evaluate(()=>emberwildQA.store.state.camp.buildings[0].slot),4);assert.equal(await p.locator('#camp-stones').textContent(),'0');
    console.log('PASS camp spatial build/upgrade/move survives page reload with exact resource balance');

    await depart(p);await p.waitForFunction(()=>emberwildQA.game);assert.equal(await p.evaluate(()=>emberwildQA.game.hero.maxHp),120);
    await p.evaluate(async()=>{const g=emberwildQA.game;g.nodes=[];g.placeCard(0,240,420);g.startWave();g.hero.hp=73;g.paused=true;await emberwildQA.checkpoint();});
    const saved=await p.evaluate(()=>{const s=emberwildQA.store.state.run;return{id:s.runId,hp:s.hero.hp,amber:s.amber,buildings:s.buildings,hand:s.hand,queue:s.spawnQueue,rng:s.rngState};});
    await p.reload();await p.locator('#continue-run').click();await p.waitForFunction(()=>emberwildQA.game?.paused);
    const loaded=await p.evaluate(()=>{const s=emberwildQA.game.snapshot();return{id:s.runId,hp:s.hero.hp,amber:s.amber,buildings:s.buildings,hand:s.hand,queue:s.spawnQueue,rng:s.rngState};});assert.deepEqual(loaded,saved);
    assert.equal(await p.locator('#modal-title').textContent(),'歡迎回到荒境');
    await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>emberwildQA.game.hero.hp),73);
    console.log('PASS full battle snapshot restores paused without resetting hero, cards, buildings, queue or RNG');
    await p.locator('[data-action="resume"]').click();await p.locator('#pause').click();await p.locator('[data-action="save-camp"]').click();await p.waitForSelector('#camp:not([hidden])');
    assert.ok(await p.evaluate(()=>!!emberwildQA.store.state.run));assert.equal(await p.evaluate(()=>emberwildQA.store.state.profile.runs),1);
    await depart(p);
    console.log('PASS save-to-camp and continue does not count another expedition');

    await p.evaluate(async()=>{const g=emberwildQA.game;g.enemies=[];g.spawnQueue=[];g.wave=1;g.finishWave();emberwildQA.render();await emberwildQA.checkpoint();});
    const reward=await p.evaluate(()=>({materials:emberwildQA.game.materials,amber:emberwildQA.game.amber}));await p.reload();await p.locator('#continue-run').click();
    assert.equal(await p.locator('[data-upgrade]').count(),0);assert.deepEqual(await p.evaluate(()=>({materials:emberwildQA.game.materials,amber:emberwildQA.game.amber})),reward);
    await p.locator('[data-action="resume"]').click();await p.waitForFunction(()=>emberwildQA.store.state.run?.phase==='prep');assert.equal(await p.evaluate(()=>emberwildQA.game.paused),false);
    console.log('PASS wave reward reload does not reroll cards or issue materials twice');

    await p.evaluate(()=>{const g=emberwildQA.game;g.wave=2;g.stats.waves=1;g.damageTarget(g.base,9999);emberwildQA.render();});
    await p.waitForFunction(()=>emberwildQA.store.state.run===null);assert.equal(await p.evaluate(()=>emberwildQA.store.state.camp.stones),2);await p.locator('[data-action="camp"]').click();
    await p.reload();await p.locator('#begin').click();assert.equal(await p.locator('#camp-stones').textContent(),'2');assert.equal(await p.evaluate(()=>emberwildQA.store.state.run),null);
    console.log('PASS loss settles completed waves once and retains permanent camp after reload');

    const backup=await p.evaluate(()=>emberwildQA.store.export());
    const downloadEvent=p.waitForEvent('download');await p.locator('#camp-export').click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/^emberwild-save-.*\.json$/);
    await p.locator('#save-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await p.waitForFunction(()=>document.querySelector('#camp-message').textContent.includes('匯入失敗'));assert.equal(await p.locator('#camp-stones').textContent(),'2');
    await p.evaluate(async()=>{await emberwildQA.store.mutate(s=>{s.camp.stones=17;});emberwildQA.campUI.render();});
    await p.locator('#save-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await p.locator('[data-action="cancel-camp"]').click();assert.equal(await p.locator('#camp-stones').textContent(),'17');
    await p.locator('#save-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await p.locator('[data-action="import-confirm"]').click();await p.waitForFunction(()=>emberwildQA.store.state.camp.stones===2);
    console.log('PASS export, invalid-import protection and explicit overwrite confirmation');

    await p.evaluate(async()=>{await emberwildQA.store.mutate(s=>{s.camp.stones=20;});emberwildQA.campUI.render();});
    const second=await ctx.newPage();await load(second);await second.locator('#begin').click();
    await p.bringToFront();await build(p,'forge',0);await p.waitForFunction(()=>emberwildQA.store.state.camp.buildings.length===2);
    // QA mode suppresses the passive storage-event modal; a stale tab must
    // still be rejected by the save store's compare-and-swap on its next edit.
    await second.bringToFront();await build(second,'cache',1);await second.waitForSelector('[data-action="reload-save"]');await second.locator('[data-action="reload-save"]').click();assert.equal(await second.evaluate(()=>emberwildQA.store.state.camp.buildings.length),2);
    console.log('PASS second tab pauses on storage conflict and can load current camp');
    await second.close();await p.bringToFront();
    await p.evaluate(async()=>{await emberwildQA.store.mutate(s=>{s.camp.stones=18;});emberwildQA.campUI.render();});
    await p.screenshot({path:path.join(out,'06-camp-desktop.png'),fullPage:true});
    await p.evaluate(()=>localStorage.setItem('emberwild_save_v2','damaged'));await p.reload();await p.locator('#begin').click();assert.match(await p.locator('#camp-message').textContent(),/備份/);assert.equal(await p.evaluate(()=>emberwildQA.store.blocked),false);
    console.log('PASS damaged primary loads previous backup with visible warning');
    await ctx.close();

    const mobile=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await mobile.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(url).origin)return r.continue();external.push(r.request().url());return r.abort();});
    const m=await mobile.newPage();await load(m);await m.locator('#begin').tap();
    await build(m,'nursery',1);await m.waitForFunction(()=>emberwildQA.store.state.camp.buildings.length===1);
    assert.equal(await m.locator('#camp-stones').textContent(),'5');assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await m.screenshot({path:path.join(out,'07-camp-mobile.png'),fullPage:true});
    await m.reload();await m.locator('#begin').tap();assert.equal(await m.evaluate(()=>emberwildQA.store.state.camp.buildings[0].type),'nursery');
    console.log('PASS mobile nearby build, persistent camp and no horizontal overflow');
    const cdp=await mobile.newCDPSession(m);
    await build(m,'tent',0);await m.waitForFunction(()=>emberwildQA.store.state.camp.buildings.length===2);assert.equal(await m.locator('#camp-stones').textContent(),'2');
    await relocate(m,0,3);await m.waitForFunction(()=>emberwildQA.store.state.camp.buildings.find(b=>b.type==='tent').slot===3);assert.equal(await m.locator('#camp-stones').textContent(),'2');
    console.log('PASS mobile spatial construction builds and relocates without unintended charges');
    await approach(m,'plot-3');await m.locator('[data-action="camp-move-building"]').click();await m.keyboard.press('Escape');assert.equal(await m.evaluate(()=>emberwildQA.store.state.camp.buildings.find(b=>b.type==='tent').slot),3);assert.equal(await m.evaluate(()=>emberwildQA.campUI.movingFrom),null);
    console.log('PASS cancelled camp relocation leaves buildings and resources unchanged');
    await mobile.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS no browser errors or external requests');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
