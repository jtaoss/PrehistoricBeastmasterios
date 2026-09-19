const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const out=path.resolve(__dirname,'../../../output/playwright');
fs.mkdirSync(out,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(url).origin)return route.continue();external.push(route.request().url());return route.abort();});
  try{
    await require('./camp-helpers.cjs').openVeteran(page,`${url}/?qa=events`);await page.waitForFunction(()=>window.emberwildQA?.game?.eventPlan?.filter(event=>event.status==='active').length===5);
    const initial=await page.evaluate(()=>({types:emberwildQA.game.eventPlan.map(event=>event.type).sort(),nearby:emberwildQA.game.nearbyMapEvent()?.type,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.deepEqual(initial.types,['chest','elite','hunter','merchant','ruin']);assert.equal(initial.nearby,'chest');assert.equal(initial.overflow,false);
    await page.locator('#event-interact').waitFor({state:'visible'});assert.match(await page.locator('#event-interact').textContent(),/荒野寶箱.*開啟寶箱/s);
    await page.screenshot({path:path.join(out,'map-events-mobile.png'),fullPage:true,animations:'disabled'});
    const before=await page.evaluate(()=>({amber:emberwildQA.game.amber,materials:{...emberwildQA.game.materials}}));
    await page.evaluate(()=>{emberwildQA.game.paused=false;});await page.locator('#event-interact').click();await page.waitForFunction(()=>emberwildQA.game.eventPlan.find(event=>event.type==='chest').status==='completed');
    const claimed=await page.evaluate(()=>({amber:emberwildQA.game.amber,materials:{...emberwildQA.game.materials},buttonHidden:document.querySelector('#event-interact').hidden}));
    assert.ok(claimed.amber>before.amber&&claimed.materials.wood>=before.materials.wood&&claimed.materials.bone>=before.materials.bone);assert.equal(claimed.buttonHidden,true);
    await page.evaluate(async()=>{emberwildQA.game.paused=true;emberwildQA.game.eventPlan.forEach((event,index)=>{event.stage=index+1;});await emberwildQA.showRoute('game');});await page.waitForSelector('#route-map:not([hidden])');
    assert.equal(await page.locator('.route-event-badge').count(),5);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,'map-events-route-mobile.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS five seeded map events render, interact once, persist state and mark the mobile route without overflow');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
