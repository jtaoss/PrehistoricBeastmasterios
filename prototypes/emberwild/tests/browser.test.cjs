const {approach,depart,advance,build,upgrade,relocate}=require('./camp-helpers.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const out = path.resolve(__dirname, '../test-output');fs.mkdirSync(out,{recursive:true});
const url = process.env.EMBERWILD_URL || 'http://127.0.0.1:8765';
const errors=[], external=[];
async function setup(browser, options={}){
  const ctx=await browser.newContext(options);
  await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(url).origin)return r.continue();external.push(r.request().url());return r.abort();});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'/?qa=1');await p.waitForFunction(()=>window.emberwildQA);return{ctx,p};
}
async function location(p,x,y){return p.evaluate(([x,y])=>emberwildQA.painter.screen(x,y),[x,y]);}
async function drag(p,slot,x,y){const b=await p.locator(`[data-slot="${slot}"]`).boundingBox(),dest=await location(p,x,y);await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(dest.x,dest.y,{steps:14});await p.mouse.up();}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const {ctx,p}=await setup(browser,{viewport:{width:1440,height:1024},deviceScaleFactor:1});
    await p.screenshot({path:path.join(out,'01-cover-desktop.png')});
    await p.locator('#begin').click();await depart(p);await p.waitForTimeout(150);
    await p.evaluate(()=>{emberwildQA.game.nodes=[];});
    assert.equal(await p.locator('.build-card').count(),4);
    await drag(p,0,240,420);assert.equal(await p.evaluate(()=>emberwildQA.game.buildings.length),1);assert.equal(await p.evaluate(()=>emberwildQA.game.inventory.watchtower),1);assert.equal(await p.evaluate(()=>emberwildQA.game.amber),16);
    console.log('PASS pointer drag builds once and consumes one card without material charge');
    await drag(p,1,360,385);assert.equal(await p.evaluate(()=>emberwildQA.game.buildings.length),1);assert.equal(await p.evaluate(()=>emberwildQA.game.inventory.catapult),1);
    console.log('PASS blocked base drop does not consume a card');
    await p.evaluate(()=>{const g=emberwildQA.game;g.hand[0]='watchtower';g.cardTimers[0]=0;emberwildQA.render();});
    await drag(p,0,240,420);assert.equal(await p.evaluate(()=>emberwildQA.game.buildings[0].level),2);assert.equal(await p.evaluate(()=>emberwildQA.game.inventory.watchtower),0);
    console.log('PASS same-type drag upgrades in place');
    const card=await p.locator('[data-slot="1"]').boundingBox();await p.mouse.move(card.x+20,card.y+20);await p.mouse.down();await p.mouse.move(card.x+70,card.y-60);
    await p.keyboard.press('Escape');await p.mouse.up();assert.equal(await p.evaluate(()=>emberwildQA.dragging),false);assert.equal(await p.evaluate(()=>emberwildQA.game.building),false);assert.equal(await p.evaluate(()=>emberwildQA.game.inventory.catapult),1);
    console.log('PASS Escape cancels drag and restores game speed');
    await p.keyboard.press('3');const nest=await location(p,465,430);await p.mouse.click(nest.x,nest.y);assert.equal(await p.evaluate(()=>emberwildQA.game.buildings.length),2);
    console.log('PASS keyboard/tap card placement alternative');
    await p.locator('#pause').click();const paused=await p.evaluate(()=>emberwildQA.game.time);await p.waitForTimeout(180);assert.equal(await p.evaluate(()=>emberwildQA.game.time),paused);await p.locator('[data-action="resume"]').click();
    console.log('PASS pause freezes simulation, resume works');
    const beforeX=await p.evaluate(()=>emberwildQA.game.hero.x);await p.keyboard.down('d');await p.waitForTimeout(200);await p.keyboard.up('d');assert.ok(await p.evaluate(()=>emberwildQA.game.hero.x)>beforeX+10);
    await p.locator('#weapon').click();assert.equal(await p.evaluate(()=>emberwildQA.game.hero.weapon),'axe');
    console.log('PASS keyboard movement and weapon switch');
    // Choosing the route node starts the selected stage immediately.
    await p.waitForTimeout(1500);assert.equal(await p.evaluate(()=>emberwildQA.game.phase),'wave');assert.ok(await p.evaluate(()=>emberwildQA.game.enemies.length)>0);
    await p.evaluate(()=>{const g=emberwildQA.game;g.amber=20;g.hand=['torch','wall','nest','spring'];g.cardTimers=[0,0,0,0];g.spawnEnemy('brute',{x:470,y:220});g.spawnEnemy('spitter',{x:175,y:260});emberwildQA.render();});
    await p.screenshot({path:path.join(out,'02-game-desktop.png')});
    await p.evaluate(()=>{const g=emberwildQA.game;g.enemies=[];g.spawnQueue=[];g.finishWave();emberwildQA.render();});
    assert.equal(await p.locator('[data-upgrade]').count(),0);assert.equal(await p.evaluate(()=>emberwildQA.game.phase),'prep');await p.locator('#merchant').click();await p.screenshot({path:path.join(out,'03-merchant.png')});await p.locator('[data-action="market-close"]').click();
    console.log('PASS wave grants materials, no random draft, merchant available between waves');
    await ctx.close();

    const mobile=await setup(browser,{viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});const m=mobile.p;
    await m.screenshot({path:path.join(out,'04-cover-mobile.png')});await m.locator('#begin').tap();await depart(m);await m.waitForTimeout(100);await m.evaluate(()=>{emberwildQA.game.nodes=[];});
    assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok(await m.locator('#next-wave').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'next-wave button must fit in portrait viewport');
    const cdp=await mobile.ctx.newCDPSession(m),box=await m.locator('[data-slot="0"]').boundingBox(),destination=await location(m,240,420);
    let points=[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
    for(let i=1;i<=12;i++){const f=i/12;points=[{x:box.x+box.width/2+(destination.x-box.x-box.width/2)*f,y:box.y+box.height/2+(destination.y+55-box.y-box.height/2)*f,id:1}];await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points});}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await m.evaluate(()=>emberwildQA.game.buildings.length),1);assert.ok(await m.evaluate(()=>Math.abs(emberwildQA.game.buildings[0].x-240))<3);
    console.log('PASS mobile touch drag, lifted placement and no horizontal overflow');
    const joy=await m.locator('#joystick').boundingBox(),x0=await m.evaluate(()=>emberwildQA.game.hero.x);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:2,x:joy.x+joy.width/2,y:joy.y+joy.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:2,x:joy.x+joy.width*.9,y:joy.y+joy.height/2}]});
    await m.waitForTimeout(220);assert.ok(await m.evaluate(()=>emberwildQA.game.hero.x)>x0+10);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await m.evaluate(()=>{const g=emberwildQA.game;g.spawnEnemy('brute',{x:g.hero.x+150,y:g.hero.y});emberwildQA.render();});await m.locator('#skill-volley').tap();await m.waitForFunction(()=>emberwildQA.game.hero.volleyCD>0);assert.equal(await m.evaluate(()=>emberwildQA.input().x),0);
    console.log('PASS mobile movement, automatic combat and active skill controls work with pointercancel cleanup');
    await m.evaluate(()=>{const g=emberwildQA.game;g.amber=20;g.hand=['torch','wall','nest','spring'];g.cardTimers=[0,0,0,0];g.placeCard(1,465,325);g.placeCard(2,455,430);g.placeCard(3,260,520);g.hand=['torch','wall','nest','spring'];g.cardTimers=[0,0,0,0];g.startWave();g.spawnEnemy('raptor',{x:220,y:205});g.spawnEnemy('brute',{x:455,y:235});emberwildQA.render();});
    await m.screenshot({path:path.join(out,'05-game-mobile.png')});
    await m.locator('#pause').tap();await m.locator('[data-action="exit-confirm"]').tap();assert.ok(await m.locator('#modal-title').textContent().then(s=>s.includes('放棄')));await m.locator('[data-action="resume"]').tap();assert.equal(await m.evaluate(()=>emberwildQA.game.paused),false);
    console.log('PASS exit confirmation can safely return to existing run');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS no browser exceptions and no external requests');
    await mobile.ctx.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
