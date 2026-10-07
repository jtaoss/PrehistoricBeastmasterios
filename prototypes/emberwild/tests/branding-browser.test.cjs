// Display identity regression; all sessions/storage are disposable.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {openVeteran}=require('./camp-helpers.cjs');
const root=path.resolve(__dirname,'../../..');
const origin=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';
const appName=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',path.join(root,'PrehistoricBeastmaster/Info.plist')],{encoding:'utf8'})).CFBundleDisplayName;
const nativeIcon=path.join(root,'PrehistoricBeastmaster/Assets.xcassets/AppIcon.appiconset');
const iconName=JSON.parse(fs.readFileSync(path.join(nativeIcon,'Contents.json'),'utf8')).images[0].filename;
assert.deepEqual(fs.readFileSync(path.join(nativeIcon,iconName)),fs.readFileSync(path.join(root,'prototypes/emberwild/assets/brand-v1/sacred-beast-icon.png')));
const imageInfo=execFileSync('/usr/bin/sips',['-g','pixelWidth','-g','pixelHeight','-g','hasAlpha',path.join(nativeIcon,iconName)],{encoding:'utf8'});
assert.match(imageInfo,/pixelWidth: 1024/);assert.match(imageInfo,/pixelHeight: 1024/);assert.match(imageInfo,/hasAlpha: no/);

(async()=>{
  fs.mkdirSync(path.join(root,'output/playwright/brand-20260921'),{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const [width,height] of [[320,568],[375,812],[844,390],[768,1024],[1440,900]]){
      for(const veteran of [false,true]){
        const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000});
        try{
          const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
          if(veteran)await openVeteran(page,origin+'/?qa=brand');else await page.goto(origin);
          await page.waitForFunction(()=>document.documentElement.dataset.bootReady==='true');
          await page.locator('.landing .brand-app-icon').evaluate(img=>img.decode());
          assert.equal(await page.title(),appName);
          assert.equal(await page.locator('.landing h1').getAttribute('aria-label'),appName);
          assert.equal(await page.locator('.journal h1').getAttribute('aria-label'),appName);
          assert.doesNotMatch(await page.locator('body').innerText(),/琥珀荒境|EMBERWILD/);
          for(const selector of ['.landing h1','#begin','#landing-account','#landing-settings']){
            // First-session gating deliberately hides settings until onboarding.
            if(selector==='#landing-settings'&&!await page.locator(selector).isVisible())continue;
            const box=await page.locator(selector).boundingBox();
            assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,`${width}x${height}: ${selector} clipped`);
          }
          const title=await page.locator('.landing h1').boundingBox(),begin=await page.locator('#begin').boundingBox(),brand=await page.locator('.landing>.brand').boundingBox();
          assert.ok(title.y+title.height<=begin.y&&brand.y+brand.height<=title.y,'name overlaps header or action');
          assert.equal(await page.locator('#begin').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
          if(!veteran)await page.screenshot({path:path.join(root,`output/playwright/brand-20260921/lobby-${width}.png`)});
          await page.goto(origin+'/login-preview.html');await page.waitForFunction(()=>!document.querySelector('#form-fields').disabled);
          await page.locator('.wordmark .brand-app-icon').evaluate(img=>img.decode());
          assert.equal(await page.title(),appName+' · 帳號登入');
          assert.equal(await page.locator('#game-title').getAttribute('aria-label'),appName);
          assert.doesNotMatch(await page.locator('body').innerText(),/琥珀荒境|EMBERWILD/);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'login horizontal overflow');
          if(!veteran)await page.screenshot({path:path.join(root,`output/playwright/brand-20260921/login-${width}.png`),fullPage:true});
          assert.deepEqual(errors,[]);
          console.log(`PASS ${width}x${height} ${veteran?'returning':'new'}: title matches Info.plist, no overlap, shared opaque icon`);
        }finally{await context.close();}
      }
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
