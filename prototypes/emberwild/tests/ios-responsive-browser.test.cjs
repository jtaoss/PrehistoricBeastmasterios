const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const out=path.resolve(__dirname,'../test-output');
fs.mkdirSync(out,{recursive:true});

const devices=[
  {name:'se',width:375,height:667,safe:{top:20,bottom:0,left:0,right:0}},
  {name:'notch',width:390,height:844,safe:{top:47,bottom:34,left:0,right:0}},
  {name:'max',width:430,height:932,safe:{top:59,bottom:34,left:0,right:0}},
  {name:'landscape',width:844,height:390,safe:{top:0,bottom:21,left:47,right:47}},
];

async function applySafeArea(page,safe){
  await page.evaluate(s=>{
    const root=document.documentElement.style;
    root.setProperty('--safe-top',`${s.top}px`);
    root.setProperty('--safe-right',`${s.right}px`);
    root.setProperty('--safe-bottom',`${s.bottom}px`);
    root.setProperty('--safe-left',`${s.left}px`);
  },safe);
}
async function assertInViewport(page,selector,label,{vertical=true}={}){
  const box=await page.locator(selector).boundingBox();
  assert.ok(box,`${label} must be visible`);
  assert.ok(box.x>=-1&&box.x+box.width<=page.viewportSize().width+1,`${label} must fit horizontally`);
  if(vertical)assert.ok(box.y>=-1&&box.y+box.height<=page.viewportSize().height+1,`${label} must fit vertically`);
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const device of devices){
      const landscape=device.width>device.height;
      const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));

      await page.goto(`${url}/?qa=1`);await page.waitForFunction(()=>window.emberwildQA);await applySafeArea(page,device.safe);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await assertInViewport(page,'#begin','landing primary action');
      await page.screenshot({path:path.join(out,`50-ios-${device.name}-landing.png`),fullPage:true,animations:'disabled'});

      await page.locator('#begin').click();await page.waitForSelector('#camp:not([hidden])');await applySafeArea(page,device.safe);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await assertInViewport(page,'#camp-interact','camp interaction');
      await assertInViewport(page,'#camp-joystick','camp joystick');
      await page.screenshot({path:path.join(out,`51-ios-${device.name}-camp.png`),animations:'disabled'});

      await page.goto(`${url}/?qa=route`);await page.waitForSelector('#route-map:not([hidden])');await applySafeArea(page,device.safe);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await assertInViewport(page,'.route-header','route header');
      await page.screenshot({path:path.join(out,`52-ios-${device.name}-route.png`),fullPage:true,animations:'disabled'});

      await page.goto(`${url}/?qa=stage1`);await page.waitForFunction(()=>window.emberwildQA?.game);await applySafeArea(page,device.safe);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await assertInViewport(page,'#joystick','battle joystick',{vertical:!landscape});
      await assertInViewport(page,'#skill-volley','volley skill',{vertical:!landscape});
      await assertInViewport(page,'.bottomline','battle bottom action row',{vertical:!landscape});
      if(!landscape){
        assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true,'portrait battle must not require page scrolling');
      }
      await page.screenshot({path:path.join(out,`53-ios-${device.name}-battle.png`),fullPage:true,animations:'disabled'});
      assert.deepEqual(errors,[]);
      console.log(`PASS iOS ${device.width}x${device.height}: safe areas, controls and page width adapt`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
