const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {approach}=require('./camp-helpers.cjs');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:4174',out=path.resolve(__dirname,'../../../output/playwright');fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await require('./camp-helpers.cjs').openVeteran(page,url+'/?qa=1');await page.locator('#begin').tap();
  await page.evaluate(async()=>{await emberwildQA.store.mutate(s=>{s.camp.buildings=[{type:'tent',slot:0,level:2},{type:'forge',slot:1,level:3},{type:'cache',slot:2,level:2},{type:'nursery',slot:3,level:2}];s.camp.production={tent:8,forge:3,cache:4,nursery:6};s.camp.tasks.porter={progress:1,goal:1,ready:true,cycles:0};s.camp.tasks.hunter={progress:12,goal:20,ready:false,cycles:0};});emberwildQA.campUI.render();});
  await approach(page,'plot-0');assert.match(await page.locator('.facility-output').textContent(),/木材 ×8/);await page.locator('[data-action="facility-collect"]').tap();await page.waitForFunction(()=>emberwildQA.store.state.camp.stockpile.wood===8);assert.equal(await page.evaluate(()=>emberwildQA.store.state.camp.production.tent),0);
  console.log('PASS produced facility resources are visible, claimable and persist in camp stock');
  await page.locator('#camp-loadout').tap();assert.equal(await page.locator('[data-loadout-weapon="hammer"]').isEnabled(),true);await page.locator('[data-action="loadout-close"]').tap();
  console.log('PASS level-three forge unlocks the hammer in real expedition configuration UI');
  await page.evaluate(()=>{const ui=emberwildQA.campUI,actor=ui.painter.residents.actors.find(entry=>entry.type==='porter');actor.walk.restore({x:ui.walk.x+45,y:ui.walk.y,angle:0});actor.wait=999;ui.lastFrame=performance.now()-16;ui.frame(performance.now());});await page.waitForFunction(()=>emberwildQA.campUI.canInteractResident('porter'));await page.locator('#camp-interact').tap();assert.match(await page.locator('#modal-title').textContent(),/搬運工阿拓/);assert.match(await page.locator('.camp-task-card').textContent(),/等待交付/);await page.screenshot({path:path.join(out,'camp-growth-mobile.png'),fullPage:true});const stones=await page.evaluate(()=>emberwildQA.store.state.camp.stones);await page.locator('[data-action="camp-task-claim"]').tap();await page.waitForFunction(previous=>emberwildQA.store.state.camp.stones===previous+1,stones);assert.equal(await page.evaluate(()=>emberwildQA.store.state.camp.tasks.porter.ready),false);
  console.log('PASS moving resident offers and settles a repeatable camp task through proximity interaction');
  await approach(page,'plot-3');assert.match(await page.locator('.facility-output').textContent(),/孵化熱度 ×6/);await page.locator('[data-action="facility-collect"]').tap();await page.waitForFunction(()=>emberwildQA.store.state.camp.stockpile.warmth===6);
  await page.locator('#camp-companion').tap();assert.match(await page.locator('.camp-stockline').textContent(),/6/);assert.equal(await page.locator('[data-companion="stoneback"]').isEnabled(),true);await page.screenshot({path:path.join(out,'camp-hatchery-mobile.png'),fullPage:true});
  console.log('PASS nursery level and produced warmth unlock advanced partner hatching on mobile');
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
