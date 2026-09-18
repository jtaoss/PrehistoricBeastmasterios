const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const out=path.resolve(__dirname,'../test-output');
fs.mkdirSync(out,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const viewport of [{width:430,height:932},{width:390,height:844},{width:1440,height:1080}]){
      const mobile=viewport.width<760;
      const context=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
      const p=await context.newPage(),errors=[];
      p.on('pageerror',e=>errors.push(e.message));
      await p.goto(url+'/?qa=combat-polish');
      await p.evaluate(async()=>{await emberwildQA.start();await (await import('./painted-art.mjs')).preloadArt();await document.fonts.ready;});
      await p.evaluate(()=>{
        const g=emberwildQA.game;g.nodes=[];
        for(const [slot,x,y]of [[0,200,290],[1,520,290],[2,250,480],[3,505,485]]){
          if(!g.placeCard(slot,x,y).ok)throw Error('Test building placement failed');
        }
        g.startWave();g.spawnQueue=['brute'];g.spawnTimer=99;g.waveTime=4;g.spawnEnemy('brute',{x:g.hero.x+135,y:g.hero.y});
        emberwildQA.render();
      });
      await p.waitForFunction(()=>document.querySelector('#wave-banner').classList.contains('receded'));
      await p.locator('#dash').click();
      await p.waitForFunction(()=>document.querySelector('#dash').getAttribute('aria-disabled')==='true');
      assert.ok(await p.evaluate(()=>Number(document.querySelector('#dash').style.getPropertyValue('--dash-remaining'))>0));
      await p.evaluate(()=>{emberwildQA.game.hero.dashTime=0;});
      await p.locator('#skill-volley').click();await p.waitForFunction(()=>emberwildQA.game.hero.volleyCD>0);await p.waitForFunction(()=>document.querySelector('#skill-volley').getAttribute('aria-disabled')==='true');
      assert.match(await p.locator('#volley-label').textContent(),/s$/);
      await p.evaluate(()=>{const g=emberwildQA.game;g.spawnEnemy('brute',{x:g.hero.x+70,y:g.hero.y});});
      await p.locator('#skill-shock').click();await p.waitForFunction(()=>emberwildQA.game.hero.shockCD>0);await p.waitForFunction(()=>document.querySelector('#skill-shock').getAttribute('aria-disabled')==='true');
      await p.evaluate(()=>{const g=emberwildQA.game;g.hero.hp=25;g.hero.dashTime=0;g.hero.invulnerable=0;g.hero.swing=0;g.hero.x=360;g.hero.y=545;g.effects=[];g.spawnEnemy('brute',{x:160,y:180});g.spawnEnemy('raptor',{x:560,y:195});g.paused=true;emberwildQA.render();});
      await p.waitForFunction(()=>!document.querySelector('#arena').classList.contains('wave-starting'));
      assert.equal(await p.locator('#arena').evaluate(e=>e.classList.contains('low-health')),true);
      await p.screenshot({path:path.join(out,`31-combat-polish-${viewport.width}.png`),fullPage:true,animations:'disabled'});

      await p.evaluate(()=>{
        const g=emberwildQA.game;g.enemies=[];g.spawnQueue=[];g.drops=[{value:3}];g.paused=false;
        g.finishWave();emberwildQA.render();
      });
      await p.waitForSelector('#wave-loot:not([hidden])');
      assert.deepEqual(await p.locator('.wave-loot-item b').allTextContents(),['+5','+3','+6']);
      assert.match(await p.locator('#wave-loot-note').textContent(),/保留 .* 座建築 · 修復 35% 耐久|防線已清理/);
      assert.equal(await p.locator('#modal').isVisible(),false);
      await p.waitForFunction(()=>emberwildQA.store.state.run.phase==='prep');
      const materials=await p.evaluate(()=>({...emberwildQA.game.materials,amber:emberwildQA.game.amber}));
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const panel=await p.locator('#wave-loot').boundingBox(),controls=await p.locator('.field-controls').boundingBox();
      assert.ok(panel.y+panel.height<controls.y,'reward receipt must not cover combat controls');
      if(mobile){const next=await p.locator('#next-wave').boundingBox();assert.ok(next.y+next.height<=viewport.height,'next stage should fit on phone');}
      await p.screenshot({path:path.join(out,`32-wave-loot-${viewport.width}.png`),fullPage:true,animations:'disabled'});
      await p.locator('#loot-merchant').click();
      assert.equal(await p.locator('#wave-loot').isVisible(),false);
      assert.equal(await p.locator('[data-buy]').count(),4);
      await p.locator('[data-action="market-close"]').click();
      await p.reload();await p.locator('#continue-run').click();
      assert.deepEqual(await p.evaluate(()=>({...emberwildQA.game.materials,amber:emberwildQA.game.amber})),materials);
      assert.equal(await p.locator('#wave-loot').isVisible(),false);
      await p.locator('[data-action="resume"]').click();
      await p.evaluate(()=>{const g=emberwildQA.game;g.startWave();g.enemies=[];g.spawnQueue=[];g.finishWave();emberwildQA.render();});
      await p.waitForSelector('#wave-loot:not([hidden])');
      const second=await p.evaluate(()=>({...emberwildQA.game.materials,amber:emberwildQA.game.amber}));
      await p.locator('#dismiss-loot').click();await p.evaluate(()=>emberwildQA.render());
      assert.deepEqual(await p.evaluate(()=>({...emberwildQA.game.materials,amber:emberwildQA.game.amber})),second);
      assert.equal(await p.locator('#wave-loot').isVisible(),false);
      await p.locator('#return-camp').click();await p.waitForSelector('#camp:not([hidden])');
      assert.ok(await p.evaluate(()=>emberwildQA.store.state.run),'returning to camp must preserve the active expedition');
      assert.equal(await p.locator('#game').isVisible(),false);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${viewport.width}×${viewport.height}: battle HUD, rewards, save/restore and direct return-to-camp all work without overflow`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
