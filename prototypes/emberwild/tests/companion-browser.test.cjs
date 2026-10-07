const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const errors=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await require('./camp-helpers.cjs').openVeteran(p,url+'/?qa=1');await p.waitForFunction(()=>window.emberwildQA);await p.locator('#begin').click();await p.locator('#camp-companion').click();
  assert.equal(await p.locator('.companion-choice').count(),3);assert.equal(await p.getByRole('button',{name:'孵化初始聖獸卵'}).count(),1);assert.equal(await p.locator('[data-companion="tideroot"]').isDisabled(),true);
  await p.getByRole('button',{name:'孵化初始聖獸卵'}).click();await p.waitForFunction(()=>emberwildQA.store.state.profile.companions.selected==='emberclaw');assert.equal(await p.evaluate(()=>emberwildQA.store.state.camp.stones),8);
  await p.getByRole('button',{name:'返回',exact:true}).click();await p.evaluate(async()=>{await emberwildQA.store.mutate(s=>{s.camp.buildings.push({type:'nursery',slot:0,level:1});s.camp.stockpile.warmth=3;});emberwildQA.campUI.render();});await p.locator('#camp-companion').click();await p.getByRole('button',{name:/孵化 · ♨ 3/}).click();await p.waitForFunction(()=>emberwildQA.store.state.profile.companions.selected==='tideroot');assert.equal(await p.evaluate(()=>emberwildQA.store.state.camp.stockpile.warmth),0);assert.equal(await p.evaluate(()=>emberwildQA.store.state.camp.stones),8);assert.equal(await p.locator('[data-companion="stoneback"]').isDisabled(),true);
  console.log('PASS initial egg hatches free; nursery level and produced warmth unlock later partners');
  await p.getByRole('button',{name:'返回',exact:true}).click();await p.evaluate(()=>emberwildQA.start());await p.waitForFunction(()=>emberwildQA.game?.companion?.type==='tideroot');if(await p.locator('#tutorial-skip').isVisible())await p.locator('#tutorial-skip').click();await p.waitForFunction(()=>emberwildQA.store.state.profile.tutorialDone);
  assert.match(await p.locator('#companion-name').textContent(),/潮汐角龍/);assert.match(await p.locator('#nest-label').textContent(),/聖獸靈巢/);
  const combat=await p.evaluate(()=>{const g=emberwildQA.game;g.phase='wave';g.wave=1;g.spawnQueue=[];g.spawnTimer=999;g.hero.attackCD=999;g.hero.hp=50;g.base.hp=100;g.companion.x=240;g.companion.y=300;g.companion.cd=0;g.companion.abilityCD=0;const e=g.spawnEnemy('brute',{x:390,y:300});e.speed=0;e.cd=99;g.updateCompanion(.01);for(let i=0;i<40;i++)g.updateProjectiles(.02);return{hero:g.hero.hp,base:g.base.hp,enemy:e.hp,slow:e.slow};});
  assert.ok(combat.hero>50&&combat.base>100&&combat.enemy<210&&combat.slow>0);console.log('PASS selected partner joins combat and performs its healing, ranged attack and slow');
  await p.locator('#companion-button').click();assert.equal(await p.getByRole('button',{name:'戰鬥中不可更換'}).count(),3);console.log('PASS active waves allow inspection but block partner swapping');
  await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);assert.ok(await p.locator('.modal-panel').evaluate(e=>e.scrollHeight>=e.clientHeight));
  await p.getByRole('button',{name:'返回',exact:true}).click();await p.evaluate(async()=>{const g=emberwildQA.game;g.phase='prep';g.companion.level=2;g.companion.xp=9;g.companion.maxHp=g.companionMaxHp(g.companion.type,2);await emberwildQA.checkpoint();});
  await p.reload();await p.waitForFunction(()=>window.emberwildQA);assert.deepEqual(await p.evaluate(()=>emberwildQA.store.state.profile.companions.roster.tideroot),{unlocked:true,level:2,xp:9});
  console.log('PASS mobile panel fits and companion level/experience survives reload');assert.deepEqual(errors,[]);console.log('PASS no JavaScript errors');await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
