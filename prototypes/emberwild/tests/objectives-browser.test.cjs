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
  const p=await context.newPage(),errors=[],external=[];
  p.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(url).origin)return route.continue();external.push(route.request().url());return route.abort();});
  try{
    const cases=[
      [2,'escort','護送採集師'],[3,'destroy','摧毀三座獸巢'],[4,'mining','限時採集熔晶'],[5,'rescue','營救受困弓手'],[7,'strongholds','守住三處月骨據點']
    ];
    for(const [stage,type,title] of cases){
      await require('./camp-helpers.cjs').openVeteran(p,`${url}/?qa=stage${stage}`);await p.waitForFunction(value=>window.emberwildQA?.game?.wave===value,stage);
      await p.waitForSelector('#objective-panel:not([hidden])');
      assert.equal(await p.locator('#objective-title').textContent(),title);assert.equal(await p.locator('#objective-panel').evaluate((el,value)=>el.classList.contains(value),type),true);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const state=await p.evaluate(()=>{const o=emberwildQA.game.objective;return{type:o.type,actors:[o.npc,o.captive,...(o.targets||[]),...(o.points||[])].filter(Boolean).length,ores:emberwildQA.game.nodes.filter(n=>n.objectiveKind==='ore').length};});
      assert.equal(state.type,type);assert.ok(state.actors>0||state.ores===3);
      await p.screenshot({path:path.join(out,`objective-stage-${stage}-mobile.png`),fullPage:true,animations:'disabled'});
    }
    await require('./camp-helpers.cjs').openVeteran(p,`${url}/?qa=stage2`);await p.waitForFunction(()=>window.emberwildQA?.game?.objective?.type==='escort');
    const escort=await p.evaluate(()=>{const g=emberwildQA.game,n=g.objective.npc,before={x:n.x,y:n.y};g.enemies=[];g.spawnQueue=['raptor'];g.spawnTimer=99;g.hero.x=n.x;g.hero.y=n.y;g.paused=false;for(let i=0;i<30;i++)g.tick(.02);g.paused=true;emberwildQA.render();return{before,after:{x:n.x,y:n.y},status:g.objectiveStatus().text};});
    assert.notDeepEqual(escort.after,escort.before);assert.match(escort.status,/路程/);
    await require('./camp-helpers.cjs').openVeteran(p,`${url}/?qa=stage5`);await p.waitForFunction(()=>window.emberwildQA?.game?.objective?.type==='rescue');
    const rescue=await p.evaluate(()=>{const g=emberwildQA.game,o=g.objective;g.enemies=[];g.spawnQueue=['raptor'];g.spawnTimer=99;g.hero.x=o.captive.x;g.hero.y=o.captive.y;g.paused=false;for(let i=0;i<210;i++)g.tick(.02);g.paused=true;emberwildQA.render();return{rescued:o.rescued,ally:g.allies.some(a=>a.rescued),status:g.objectiveStatus().text};});
    assert.deepEqual(rescue,{rescued:true,ally:true,status:'受困弓手已獲救'});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS five special objectives render on mobile, update progress and remain playable without overflow');
  }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
