// Playwright CLI run-code --filename. The mock implements the native boundary,
// never an HTTP/browser credential fallback.
async page => {
  const browser=page.context().browser(),reports=[];
  const root='http://127.0.0.1:4174/login-preview.html';
  const legal={terms:'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html',privacy:'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html',deletion:'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html'};
  const installNativeMock=async(context,initiallySignedIn=false)=>context.addInitScript(signedIn=>{
    if(sessionStorage.getItem('__test_native_signed_in')===null)sessionStorage.setItem('__test_native_signed_in',signedIn?'1':'0');
    window.__nativeLegal=[];window.__authActions=[];
    window.android={
      miniAuth(raw){
        const request=JSON.parse(raw);window.__authActions.push({action:request.action,hasPassword:Boolean(request.password)});
        let data={};
        if(request.action==='login'||request.action==='register'){
          sessionStorage.setItem('__test_native_signed_in','1');
          data={authenticated:true,playerId:'player-test-2001',displayName:request.nickname||'蕨林獵人',authenticatedAt:1770000000,accessExpiresAt:1770003600};
        }else if(request.action==='status'&&sessionStorage.getItem('__test_native_signed_in')==='1'){
          data={authenticated:true,playerId:'player-test-2001',displayName:'蕨林獵人',authenticatedAt:1770000000,accessExpiresAt:1770003600};
        }else if(request.action==='recover')data={accepted:true};
        else{if(request.action==='logout')sessionStorage.setItem('__test_native_signed_in','0');data={authenticated:false};}
        queueMicrotask(()=>window.javaCallBack?.({func:'onMiniAuthResult',code:'OK',action:request.action,requestId:request.requestId,data}));
      },
      sdkToBrowser(url){window.__nativeLegal.push(url);}
    };
  },initiallySignedIn);

  for(const [label,width,height] of [['desktop',1440,1000],['mobile',393,852],['small',320,568],['landscape',844,390]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:label!=='desktop',hasTouch:label!=='desktop'});
    await installNativeMock(context,false);
    const p=await context.newPage(),errors=[],requests=[];
    p.on('pageerror',error=>errors.push(error.message));p.on('request',request=>requests.push({method:request.method(),url:request.url()}));
    const check=(condition,message)=>{if(!condition)throw Error(`${label}: ${message}`);};
    const click=selector=>label==='desktop'?p.locator(selector).click():p.locator(selector).tap();
    try{
      await p.addInitScript(()=>localStorage.setItem('emberwild-ui-preserve','original-progress-untouched'));
      await p.goto(root);await p.waitForFunction(()=>!document.getElementById('form-fields').disabled);
      await p.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
      check(await p.locator('.scene-art').evaluate(img=>img.naturalWidth===1536),'generated background missing');
      await p.screenshot({path:`output/playwright/login-ui-${label}.png`,fullPage:true});
      await click('#submit-auth');check(await p.locator('#form-error').isVisible(),'empty-field feedback missing');
      await p.locator('#account').fill('hunter_01');await p.locator('#password').fill('real-test-password');
      await click('#password-toggle');check(await p.locator('#password').getAttribute('type')==='text','password reveal');await click('#password-toggle');
      await click('#submit-auth');check((await p.locator('#form-error').textContent()).includes('同意'),'consent gate missing');
      await p.locator('#consent').check();await click('#submit-auth');await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-copy').textContent()).includes('Keychain'),'secure login copy missing');
      check(await p.locator('#password').inputValue()==='','password retained');
      const cached=await p.evaluate(()=>JSON.parse(localStorage.getItem('emberwild_account_session_v1')));
      check(cached.version===2&&cached.playerId==='player-test-2001'&&!JSON.stringify(cached).includes('password')&&!JSON.stringify(cached).includes('token'),'public session cache invalid');
      await click('#dismiss-dialog');await click('#tab-register');
      await p.locator('#nickname').fill('蕨林獵人');await p.locator('#account').fill('bad-name');await click('#submit-auth');
      check((await p.locator('#form-error').textContent()).includes('6–24'),'account validation missing');
      await p.locator('#account').fill('hunter_01');await p.locator('#password').fill('real-test-password');await p.locator('#confirm').fill('mismatch');await click('#submit-auth');
      check((await p.locator('#form-error').textContent()).includes('不一致'),'confirmation missing');
      await p.locator('#confirm').fill('real-test-password');await p.locator('#consent').check();await click('#submit-auth');await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-title').textContent()).includes('帳號已建立'),'registration result missing');
      await click('#dismiss-dialog');await click('#tab-login');await click('.login-options [data-view="recover"]');
      check(await p.locator('[data-field="password"]').isHidden(),'password shown during recovery');
      await p.locator('#account').fill('hunter_01');await click('#submit-auth');await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-copy').textContent()).includes('不會在此確認帳號'),'anti-enumeration recovery copy missing');
      await click('#dismiss-dialog');await click('.back-to-login');
      check(await p.locator(`#consent-copy a[href="${legal.terms}"]`).count()===1,'terms link missing');
      check(await p.locator(`.footer-legal a[href="${legal.deletion}"]`).count()===1,'deletion link missing');
      await click(`.footer-legal [data-legal-url="${legal.deletion}"]`);check(await p.evaluate(url=>window.__nativeLegal.includes(url),legal.deletion),'legal bridge not used');
      await click('#guest-entry');check((await p.locator('#dialog-copy').textContent()).includes('不能發起真實付款'),'guest boundary missing');await click('#dismiss-dialog');
      check(await p.locator('#session-banner').isVisible(),'session status missing');await click('#logout-session');await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-copy').textContent()).includes('遊戲存檔'),'logout save boundary missing');await click('#dismiss-dialog');
      check(await p.evaluate(()=>localStorage.length===1&&localStorage.getItem('emberwild-ui-preserve')==='original-progress-untouched'),'logout changed unrelated storage');
      check(requests.every(request=>request.method==='GET'&&request.url.startsWith('http://127.0.0.1:4174/')),'browser sent credentials over HTTP');
      check(errors.length===0,`JavaScript errors: ${errors.join(', ')}`);
      reports.push({label,viewport:`${width}x${height}`,result:'PASS secure native auth UI, public-only cache and guest/payment boundary'});
    }finally{await context.close();}
  }

  const noJS=await browser.newContext({javaScriptEnabled:false});
  try{const p=await noJS.newPage();await p.goto(root);if(!await p.locator('#submit-auth').isDisabled()||!await p.locator('#account').isDisabled())throw Error('No-JS credential form enabled');reports.push({noJavaScript:'PASS credential inputs remain disabled'});}finally{await noJS.close();}

  const gameContext=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  await installNativeMock(gameContext,true);
  try{
    const p=await gameContext.newPage();
    await p.addInitScript(()=>localStorage.setItem('emberwild_account_session_v1',JSON.stringify({version:2,playerId:'player-test-2001',label:'蕨林獵人',authenticatedAt:1770000000000,accessExpiresAt:1770003600000})));
    await p.goto('http://127.0.0.1:4174/?qa=account');await p.waitForFunction(()=>window.emberwildQA?.store);
    await p.evaluate(()=>emberwildQA.store.mutate(state=>{state.profile.tutorialDone=true;state.profile.runs=2;}));await p.reload();await p.waitForFunction(()=>window.emberwildQA?.store);
    if(await p.locator('#landing-account').getAttribute('href')!=='#account')throw Error('authenticated account entry missing');
    await p.locator('#landing-settings').tap();if(await p.locator('.settings-legal [data-legal-url]').count()!==3)throw Error('settings legal entries missing');
    await p.locator('[data-action="clear-save-confirm"]').tap();await p.locator('[data-action="clear-save"]').tap();await p.waitForFunction(()=>localStorage.getItem('emberwild_save_v2')===null&&document.getElementById('modal').hidden);
    if(JSON.parse(await p.evaluate(()=>localStorage.getItem('emberwild_account_session_v1'))).playerId!=='player-test-2001')throw Error('delete-save removed account cache');
    await p.locator('#landing-account').tap();if(await p.locator('[data-action="delete-account-confirm"]').count()!==1)throw Error('real account deletion entry missing');
    await p.locator('[data-action="logout-confirm"]').tap();await p.locator('[data-action="logout-account"]').tap();
    await p.waitForURL('**/login-preview.html?status=signed-out');await p.waitForFunction(()=>sessionStorage.getItem('__test_native_signed_in')==='0');
    if(await p.evaluate(()=>localStorage.getItem('emberwild_account_session_v1'))!==null)throw Error('logout did not clear public account cache');
    reports.push({gameEntry:'PASS real native logout remains separate from local save deletion'});
  }finally{await gameContext.close();}
  return reports;
}
