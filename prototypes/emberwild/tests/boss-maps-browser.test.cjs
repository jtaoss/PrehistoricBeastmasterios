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
      await p.goto(`${url}/?qa=stage${stage}`);
      await p.waitForFunction(n=>window.emberwildQA?.game?.wave===n,stage);
      const report=await p.evaluate(async stage=>{
        const art=await import('./painted-art.mjs');await art.preloadArt();await document.fonts.ready;emberwildQA.render();
        const bg=emberwildQA.painter.backgrounds[stage-1];
        return{backgrounds:emberwildQA.painter.backgrounds.length,bgReady:bg.complete&&bg.naturalWidth>0,bg:bg.src,overflow:document.documentElement.scrollWidth<=innerWidth,bosses:[art.SPRITES['enemy-matriarch']?.sheet,art.SPRITES['enemy-charger']?.sheet],artReady:art.artStatus().bosses};
      },stage);
      assert.equal(report.backgrounds,8);assert.equal(report.bgReady,true);assert.match(report.bg,new RegExp(`stage-${stage}-`));assert.equal(report.overflow,true);assert.deepEqual(report.bosses,['bosses','bosses']);assert.equal(report.artReady,true);
      await p.screenshot({path:path.join(out,`40-stage-${stage}-map-mobile.png`),fullPage:true,animations:'disabled'});
    }
    await p.goto(`${url}/?qa=enemies`);await p.waitForFunction(()=>window.emberwildQA?.game?.enemies?.length===3);
    await p.evaluate(async()=>{await (await import('./painted-art.mjs')).preloadArt();for(const e of emberwildQA.game.enemies){e.windup=e.type==='boss'?1.1:e.type==='charger'?1:.9;e.lockX=360;e.lockY=430;}emberwildQA.render();});
    assert.deepEqual(await p.evaluate(()=>emberwildQA.game.enemies.map(e=>e.type)),['matriarch','charger','boss']);
    await p.screenshot({path:path.join(out,'43-three-bosses-mobile.png'),fullPage:true,animations:'disabled'});
    await p.goto(`${url}/?qa=route`);await p.waitForSelector('#route-map:not([hidden])');
    assert.equal(await p.locator('.route-node').count(),8);assert.equal(await p.locator('#route-progress').textContent(),'0 / 8');
    await p.screenshot({path:path.join(out,'44-eight-stage-route-mobile.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
    console.log('PASS three new battle maps, three named bosses and eight-stage route render on mobile without overflow');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
