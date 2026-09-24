const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const out=path.resolve(__dirname,'../test-output');
fs.mkdirSync(out,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const errors=[];
  try{
    const context=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    for(const stage of [6,7,8]){
      await require('./camp-helpers.cjs').openVeteran(p,`${url}/?qa=stage${stage}`);
      await p.waitForFunction(n=>window.emberwildQA?.game?.wave===n,stage);
      const report=await p.evaluate(async stage=>{
        const art=await import('./painted-art.mjs');await art.preloadArt();await document.fonts.ready;emberwildQA.render();
        const bg=emberwildQA.painter.backgrounds[stage-1];
        return{backgrounds:emberwildQA.painter.backgrounds.length,bgReady:bg.complete&&bg.naturalWidth>0,bg:bg.src,overflow:document.documentElement.scrollWidth<=innerWidth,bosses:[art.SPRITES['enemy-matriarch']?.sheet,art.SPRITES['enemy-charger']?.sheet],artReady:art.artStatus().bosses};
      },stage);
      assert.equal(report.backgrounds,8);assert.equal(report.bgReady,true);assert.match(report.bg,new RegExp(`stage-${stage}-`));assert.equal(report.overflow,true);assert.deepEqual(report.bosses,['bosses','bosses']);assert.equal(report.artReady,true);
      await p.screenshot({path:path.join(out,`40-stage-${stage}-map-mobile.png`),fullPage:true,animations:'disabled'});
    }
    await require('./camp-helpers.cjs').openVeteran(p,`${url}/?qa=enemies`);await p.waitForFunction(()=>window.emberwildQA?.game?.enemies?.length===3);
    await p.evaluate(async()=>{await (await import('./painted-art.mjs')).preloadArt();for(const e of emberwildQA.game.enemies){e.bossPhase=2;e.attackKind=e.type==='matriarch'?'brood-pool':e.type==='charger'?'bone-charge':'titan-double';e.windup=e.type==='boss'?1.3:e.type==='charger'?.72:1.25;e.lockX=360;e.lockY=430;e.weakpoint.open=true;e.weakpoint.openTime=99;}emberwildQA.render();});
    assert.deepEqual(await p.evaluate(()=>emberwildQA.game.enemies.map(e=>e.type)),['matriarch','charger','boss']);
    assert.deepEqual(await p.evaluate(()=>emberwildQA.game.enemies.map(e=>({phase:e.bossPhase,attack:e.attackKind,weakpoint:e.weakpoint.name,open:e.weakpoint.open}))),[
      {phase:2,attack:'brood-pool',weakpoint:'孵化囊',open:true},{phase:2,attack:'bone-charge',weakpoint:'裂角肩甲',open:true},{phase:2,attack:'titan-double',weakpoint:'琥珀核心',open:true}
    ]);
    await p.screenshot({path:path.join(out,'43-three-bosses-mobile.png'),fullPage:true,animations:'disabled'});
    await require('./camp-helpers.cjs').openVeteran(p,`${url}/?qa=route`);await p.waitForSelector('#route-map:not([hidden])');
    assert.equal(await p.locator('.route-node').count(),8);assert.equal(await p.locator('.chapter-preview-node').count(),4);assert.equal(await p.locator('.route-coming-card').count(),2);assert.equal(await p.locator('#route-progress').textContent(),'0 / 8');
    const atlas=await p.evaluate(async()=>{const view=document.querySelector('#route-chapter-scroll'),image=new Image();image.src='assets/painted-v1/chapter-2-moonbone-highlands-v1.jpg';await image.decode();return{scrollable:view.scrollHeight>view.clientHeight,startsAboveBottom:view.scrollTop>0,image:[image.naturalWidth,image.naturalHeight]};});
    assert.equal(atlas.scrollable,true);assert.equal(atlas.startsAboveBottom,true);assert.deepEqual(atlas.image,[1024,1536]);
    const saveBefore=await p.evaluate(()=>JSON.stringify(emberwildQA.store.state));await p.locator('[data-coming-soon="月門聖壇"]').click({force:true});assert.match(await p.locator('#route-coming-toast').textContent(),/月門聖壇.*敬請期待/);assert.equal(await p.locator('#route-coming-toast').isVisible(),true);assert.equal(await p.evaluate(()=>JSON.stringify(emberwildQA.store.state)),saveBefore);
    await p.screenshot({path:path.join(out,'44-eight-stage-route-mobile.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
    console.log('PASS boss maps and upward-scrolling chapter atlas render on mobile; future chapters return coming-soon feedback');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
