const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const{chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const out=path.resolve(__dirname,'../test-output');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const context=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));await require('./camp-helpers.cjs').openVeteran(p,url+'/?qa=offensive-cards');
 await p.evaluate(()=>emberwildQA.start());await p.waitForFunction(()=>emberwildQA.game);
 if(await p.locator('#tutorial-skip').isVisible())await p.locator('#tutorial-skip').click();await p.waitForFunction(()=>emberwildQA.store.state.profile.tutorialDone);
 await p.evaluate(async()=>{await(await import('./painted-art.mjs')).preloadArt();const g=emberwildQA.game;g.nodes=[];g.placeCard(0,190,365);g.placeCard(1,520,365);g.phase='wave';g.wave=1;g.spawnQueue=[];g.spawnTimer=99;g.spawnEnemy('brute',{x:300,y:270});g.spawnEnemy('brute',{x:510,y:245});g.spawnEnemy('raptor',{x:548,y:255});emberwildQA.render();});
 await p.waitForTimeout(900);
 const state=await p.evaluate(()=>({hand:emberwildQA.game.hand,types:emberwildQA.game.buildings.map(b=>b.type),damage:emberwildQA.game.stats.damage,labels:[...document.querySelectorAll('.build-card .card-name')].map(e=>e.textContent),fits:document.documentElement.scrollWidth<=innerWidth,errors:[] }));
 assert.deepEqual(state.hand,['watchtower','catapult','wall',null]);assert.deepEqual(state.types,['watchtower','catapult']);assert.deepEqual(state.labels,['獵脊弩台','琥珀投獸器','裂骨牆','旅伴席位']);assert.ok(state.damage>0);assert.equal(state.fits,true);assert.deepEqual(errors,[]);
 await p.screenshot({path:path.join(out,'30-offensive-building-cards-mobile.png'),fullPage:true});
 console.log('PASS three-card construction loadout renders, deploys and damages enemies on mobile');await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
