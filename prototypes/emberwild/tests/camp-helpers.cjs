// Regression suites position the actor near a site, then use the real UI.
// Actual walking, pathfinding and touch input are covered in camp-browser.test.cjs.
// Non-tutorial suites explicitly model a player who has already graduated.
// Production has no QA exemption from mandatory onboarding.
async function veteran(page){await page.waitForFunction(()=>window.emberwildQA);await page.evaluate(async()=>{const s=emberwildQA.store;if(!s.state.run&&!s.state.profile.tutorialDone){const {offerWeekKey}=await import('./save.mjs');await s.mutate(state=>{state.profile.tutorialDone=true;state.profile.offerPrompts={starterShown:true,weeklyShownWeek:offerWeekKey()};});}});}
async function openVeteran(page,url){
  const {freshState,encode,offerWeekKey,SAVE_KEY,BACKUP_KEY,LEGACY_KEY}=await import('../save.mjs'),state=freshState();state.profile.tutorialDone=true;state.profile.offerPrompts={starterShown:true,weeklyShownWeek:offerWeekKey()};
  const {ACCOUNT_SESSION_KEY}=await import('../account-session.mjs'),now=Date.now(),account=JSON.stringify({version:2,playerId:'qa-player',label:'測試獵人',authenticatedAt:now,accessExpiresAt:now+86400000});
  await page.addInitScript(({key,backup,legacy,raw,accountKey,account})=>{if(!localStorage.getItem(key)&&!localStorage.getItem(backup)&&!localStorage.getItem(legacy))localStorage.setItem(key,raw);localStorage.setItem(accountKey,account);},{key:SAVE_KEY,backup:BACKUP_KEY,legacy:LEGACY_KEY,raw:encode(state),accountKey:ACCOUNT_SESSION_KEY,account});
  await page.goto(url);
}
async function approach(page,id){
  await page.waitForSelector('#camp:not([hidden])');
  await page.evaluate(async id=>{const {CAMP_SITES}=await import('./camp-world.mjs'),s=CAMP_SITES.find(s=>s.id===id),ui=emberwildQA.campUI;ui.clear();ui.walk.restore({x:s.x,y:s.y+110});ui.painter.snap=true;ui.lastFrame=performance.now()-16;ui.frame(performance.now());},id);
  await page.waitForFunction(id=>emberwildQA.campUI.walk.nearest()?.id===id&&!document.querySelector('#camp-interact').disabled,id);
  await page.locator('#camp-interact').click();
}
async function depart(page,{tutorial=false}={}){await approach(page,'gate');await page.locator('#camp-start').click();await page.waitForSelector('#route-map:not([hidden])');await page.locator('.route-node.available,.route-node.active').click({force:true});await page.waitForSelector('#game:not([hidden])');if(!tutorial&&await page.locator('#tutorial-skip').isVisible()){await page.locator('#tutorial-skip').click();await page.waitForFunction(()=>emberwildQA.store.state.profile.tutorialDone);}}
async function advance(page){await page.locator('#next-wave').click();await page.waitForSelector('#route-map:not([hidden])');await page.locator('.route-node.available').click({force:true});}
async function build(page,type,slot){await approach(page,'plot-'+slot);await page.locator(`[data-facility="${type}"]`).click();await page.waitForFunction(()=>!emberwildQA.campUI.busy);}
async function upgrade(page,slot){await approach(page,'plot-'+slot);await page.locator('[data-action="facility-upgrade"]').click();await page.waitForFunction(()=>!emberwildQA.campUI.busy);}
async function relocate(page,from,to){await approach(page,'plot-'+from);await page.locator('[data-action="camp-move-building"]').click();await approach(page,'plot-'+to);await page.locator('[data-action="camp-place-building"]').click();await page.waitForFunction(()=>!emberwildQA.campUI.busy);}
module.exports={approach,depart,advance,build,upgrade,relocate,veteran,openVeteran};
