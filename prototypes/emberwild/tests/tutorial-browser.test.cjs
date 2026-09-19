const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {veteran}=require('./camp-helpers.cjs');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:4174';
const out=path.resolve(__dirname,'../../../output/playwright');fs.mkdirSync(out,{recursive:true});
async function step(page,name){await page.waitForFunction(name=>emberwildQA.game?.tutorial?.step===name&&!emberwildQA.game.tutorial.awaiting,name);await page.waitForFunction(name=>document.querySelector('#tutorial').dataset.step===name,name);}
async function completed(page){await page.waitForFunction(()=>emberwildQA.game.tutorial.awaiting);const before=await page.evaluate(()=>({hero:emberwildQA.game.hero.x,time:emberwildQA.game.time}));await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>({hero:emberwildQA.game.hero.x,time:emberwildQA.game.time})),before);await page.locator('#tutorial-next').click();}
async function touchDrag(context,page,from,to){
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
  for(let i=1;i<=15;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:from.x+(to.x-from.x)*i/15,y:from.y+(to.y-from.y)*i/15}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    for(const viewport of [{width:393,height:852},{width:1440,height:1024},{width:375,height:667},{width:844,height:390}]){
      const mobile=viewport.width<800||viewport.height<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));await page.goto(url+'/?qa=1');assert.equal(await page.locator('#tutorial-replay').isVisible(),false);await page.locator('#begin').click();await step(page,'move');assert.equal(await page.locator('#camp').isVisible(),false);assert.equal(await page.locator('#tutorial-skip').isVisible(),false);assert.equal(await page.locator('#return-camp').isVisible(),false);assert.equal(await page.evaluate(()=>emberwildQA.game.skipTutorial()),false);await page.locator('#tutorial-next').click();
      const startPoint=await page.evaluate(()=>({x:emberwildQA.game.hero.x,y:emberwildQA.game.hero.y}));await page.keyboard.down('a');await page.keyboard.down('w');await page.waitForTimeout(150);await page.keyboard.up('a');await page.keyboard.up('w');assert.deepEqual(await page.evaluate(()=>({x:emberwildQA.game.hero.x,y:emberwildQA.game.hero.y})),startPoint);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const panel=await page.locator('#tutorial').boundingBox(),controls=await page.locator('.field-controls').boundingBox();assert.ok(panel.y+panel.height<controls.y||panel.x+panel.width<controls.x,'guide must leave movement and skills accessible');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true,'all training controls fit on one screen');
      assert.equal(await page.locator('#skill-volley').isDisabled(),true);const locked=await page.locator('#skill-volley').boundingBox();await page.mouse.click(locked.x+locked.width/2,locked.y+locked.height/2);await page.keyboard.press('j');assert.equal(await page.evaluate(()=>emberwildQA.game.hero.volleyCD),0);assert.equal(await page.evaluate(()=>emberwildQA.game.tutorial.awaiting),false);
      await page.waitForFunction(()=>!document.querySelector('#tutorial-finger').hidden&&Number(getComputedStyle(document.querySelector('#tutorial-finger')).opacity)>.8);const gestureTime=await page.locator('#tutorial-finger').evaluate(el=>el.getAnimations()[0].currentTime);await page.waitForTimeout(100);assert.ok(await page.locator('#tutorial-finger').evaluate((el,t)=>el.getAnimations()[0].currentTime>t,gestureTime),'hand animation must progress rather than restart every frame');
      await page.screenshot({path:path.join(out,`strong-move-${viewport.width}.png`)});
      if(mobile){
        const cdp=await context.newCDPSession(page),joy=await page.locator('#joystick').boundingBox();await page.locator('#joystick').scrollIntoViewIfNeeded();
        const box=await page.locator('#joystick').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box.x+box.width*.8,y:box.y+box.height*.5}]});await page.waitForFunction(()=>emberwildQA.game.tutorial.awaiting);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      }else{await page.keyboard.down('d');await page.waitForFunction(()=>emberwildQA.game.tutorial.awaiting);await page.keyboard.up('d');}
      await completed(page);await step(page,'attack');await completed(page);await step(page,'skill');await page.locator('#pause').click();const before=await page.evaluate(()=>emberwildQA.game.tutorial);await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>emberwildQA.game.tutorial),before);await page.locator('[data-action="resume"]').click();
      await page.screenshot({path:path.join(out,`strong-skill-${viewport.width}.png`)});
      await page.locator('#skill-volley').click();await completed(page);await step(page,'build');
      await page.locator('#save-game').click();await page.waitForFunction(()=>emberwildQA.store.state.run.tutorial.step==='build');await page.reload();await page.locator('#begin').click();assert.equal(await page.locator('[data-action="save-camp"]').count(),0);await page.locator('[data-action="resume"]').click();await step(page,'build');
      if(viewport.width===393){
        for(const size of [{width:844,height:390},viewport]){await page.setViewportSize(size);await page.waitForFunction(()=>{const t=emberwildQA.game.tutorial,p=emberwildQA.painter.screen(t.buildSpot.x,t.buildSpot.y),r=document.querySelector('#tutorial-marker').getBoundingClientRect();return Math.abs(p.x-r.x-r.width/2)<1&&Math.abs(p.y-r.y-r.height/2)<1;});}
        const before=await page.evaluate(()=>({...emberwildQA.game.inventory})),card=await page.locator('#hand [data-slot="0"]').boundingBox(),wrong=await page.evaluate(()=>emberwildQA.painter.screen(600,650));await touchDrag(context,page,{x:card.x+card.width/2,y:card.y+card.height/2},{x:wrong.x,y:wrong.y+55});assert.deepEqual(await page.evaluate(()=>emberwildQA.game.inventory),before);assert.equal(await page.evaluate(()=>emberwildQA.game.buildings.length),0);assert.equal(await page.evaluate(()=>emberwildQA.game.tutorial.awaiting),false);
      }
      await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#tutorial-finger')).opacity)>.8);await page.screenshot({path:path.join(out,`strong-build-${viewport.width}.png`)});
      const target=await page.evaluate(()=>emberwildQA.game.tutorial.buildSpot);
      if(mobile){await page.locator('#hand [data-slot="0"]').scrollIntoViewIfNeeded();const c=await page.locator('#hand [data-slot="0"]').boundingBox(),p=await page.evaluate(p=>emberwildQA.painter.screen(p.x,p.y),target);await touchDrag(context,page,{x:c.x+c.width/2,y:c.y+c.height/2},{x:p.x,y:p.y+55});}
      else{const c=await page.locator('#hand [data-slot="0"]').boundingBox(),p=await page.evaluate(p=>emberwildQA.painter.screen(p.x,p.y),target);await page.mouse.move(c.x+c.width/2,c.y+c.height/2);await page.mouse.down();await page.mouse.move(p.x,p.y,{steps:15});await page.mouse.up();}
      await completed(page);await step(page,'reward');assert.equal(await page.evaluate(()=>emberwildQA.game.buildings.length),1);
      // One full first wave runs naturally. Other sizes reuse the combat result to check persistence/layout.
      if(viewport.width===393)await page.waitForFunction(()=>emberwildQA.game.tutorial.reward,null,{timeout:60000});
      else await page.evaluate(()=>{const g=emberwildQA.game;g.enemies=[];g.spawnQueue=[];g.finishWave();emberwildQA.render();});await page.waitForSelector('#tutorial-claim:not([hidden])');
      const reward=await page.evaluate(()=>({materials:{...emberwildQA.game.materials},amber:emberwildQA.game.amber,pending:emberwildQA.game.tutorial.reward}));await page.waitForFunction(()=>emberwildQA.store.state.run.tutorial.reward);await page.reload();await page.locator('#begin').click();await page.locator('[data-action="resume"]').click();
      assert.equal(await page.locator('#next-wave').isDisabled(),true);await page.locator('#tutorial-claim').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`strong-reward-${viewport.width}.png`)});
      if(viewport.width===393){
        await page.evaluate(()=>{window.originalTutorialSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='emberwild_save_v2')throw Error('test quota');return window.originalTutorialSet.call(this,key,value);};});
        await page.locator('#tutorial-claim').click();await page.locator('[data-action="retry-save"]').waitFor();assert.deepEqual(await page.evaluate(()=>emberwildQA.game.tutorial.reward),reward.pending);assert.deepEqual(await page.evaluate(()=>emberwildQA.game.materials),reward.materials);
        await page.evaluate(()=>{Storage.prototype.setItem=window.originalTutorialSet;});await page.locator('[data-action="retry-save"]').click();await page.locator('[data-action="resume"]').click();
      }
      await page.locator('#tutorial-claim').click();await page.waitForFunction(()=>emberwildQA.store.state.profile.tutorialDone===true);assert.equal(await page.locator('#tutorial').isVisible(),false);
      await page.locator('#camp:not([hidden])').waitFor();assert.equal(await page.evaluate(()=>emberwildQA.store.state.run.materials.wood),Math.min(999,reward.materials.wood+reward.pending.wood));assert.equal(await page.evaluate(()=>emberwildQA.store.state.run.tutorial.status),'done');await page.locator('#camp-loadout').click();await page.locator('#modal:not([hidden])').waitFor();assert.deepEqual(errors,[]);
      console.log(`PASS ${viewport.width}x${viewport.height}: focused controls, explicit confirmations, movement, actual hits, skill, real drag, pause/reload and one-time reward`);await context.close();
    }
    const context=await browser.newContext(),page=await context.newPage();await page.goto(url+'/?qa=1');await veteran(page);await page.evaluate(()=>emberwildQA.start());assert.equal(await page.evaluate(()=>emberwildQA.game.tutorial),null);console.log('PASS graduate keeps normal gameplay and optional practice');
    await page.locator('#pause').click();await page.waitForTimeout(200);await page.reload();const saved=await page.evaluate(()=>localStorage.getItem('emberwild_save_v2'));await page.locator('#tutorial-replay').click();assert.equal(await page.evaluate(()=>emberwildQA.game.runId.startsWith('practice-')),true);await page.locator('#tutorial-next').click();await page.keyboard.down('d');await page.waitForFunction(()=>emberwildQA.game.tutorial.awaiting);await page.keyboard.up('d');await completed(page);await completed(page);await page.locator('#skill-volley').click();await completed(page);
    // Keyboard-accessible card selection plus a real world click is the alternative to dragging.
    await page.keyboard.press('1');const p=await page.evaluate(()=>{const p=emberwildQA.game.tutorial.buildSpot;return emberwildQA.painter.screen(p.x,p.y);});await page.mouse.click(p.x,p.y);await completed(page);await page.evaluate(()=>{const g=emberwildQA.game;g.enemies=[];g.spawnQueue=[];g.finishWave();emberwildQA.render();});await page.locator('#tutorial-claim').click();await page.locator('#camp:not([hidden])').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('emberwild_save_v2')),saved);assert.equal(await page.locator('#tutorial-layer').isVisible(),false);console.log('PASS replay completes without changing the real save and supports keyboard card placement');
    await page.reload();await page.locator('#tutorial-replay').click();await page.locator('#pause').click();await page.locator('[data-action="exit-confirm"]').click();await page.locator('[data-action="abandon"]').click();await page.locator('#camp:not([hidden])').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('emberwild_save_v2')),saved);console.log('PASS abandoning practice preserves the original suspended expedition');await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
