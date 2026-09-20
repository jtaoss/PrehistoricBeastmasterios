// Playwright CLI run-code --filename (local session only; no credential requests).
async page => {
  const browser = page.context().browser(), reports = [];
  const root = 'http://127.0.0.1:4174/login-preview.html';
  const legal = {
    terms: 'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html',
    privacy: 'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html',
    deletion: 'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html'
  };
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 393, 852], ['small', 320, 568], ['landscape', 844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: label !== 'desktop', hasTouch: label !== 'desktop' });
    const p = await context.newPage(), errors = [], requests = [];
    p.on('pageerror', error => errors.push(error.message));
    p.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    const check = (condition, message) => { if (!condition) throw Error(`${label}: ${message}`); };
    const click = selector => label === 'desktop' ? p.locator(selector).click() : p.locator(selector).tap();
    try {
      await p.addInitScript(() => { localStorage.setItem('emberwild-ui-preserve', 'original-progress-untouched'); });
      await p.goto(root);
      await p.waitForFunction(() => !document.getElementById('form-fields').disabled);
      await p.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow on login');
      check(await p.locator('.scene-art').evaluate(img => img.naturalWidth === 1536), 'generated background loaded');
      await p.screenshot({ path: `output/playwright/login-ui-${label}.png`, fullPage: true });
      await click('#submit-auth'); check(await p.locator('#form-error').isVisible(), 'empty field feedback missing');
      await p.locator('#account').fill('demo-hunter'); await p.locator('#password').fill('demo-only-123');
      await click('#password-toggle'); check(await p.locator('#password').getAttribute('type') === 'text', 'password reveal');
      await click('#password-toggle'); check(await p.locator('#password').getAttribute('type') === 'password', 'password hide');
      await click('#submit-auth'); check((await p.locator('#form-error').textContent()).includes('勾選'), 'consent gate missing');
      await p.locator('#consent').check(); await click('#submit-auth');
      check(await p.locator('#auth-form').getAttribute('aria-busy') === 'true', 'loading state missing');
      await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-copy').textContent()).includes('密碼也沒有保存'), 'local-login boundary missing');
      check(await p.locator('#password').inputValue() === '', 'password retained after login');
      check(await p.evaluate(() => JSON.parse(localStorage.getItem('emberwild_account_session_v1')).label === 'demo-hunter'), 'local login session missing');
      await click('#dismiss-dialog');

      await click('#tab-register');
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow on registration');
      if (label === 'mobile') await p.screenshot({ path: 'output/playwright/login-ui-register.png', fullPage: true });
      await p.locator('#nickname').fill('蕨林獵人'); await p.locator('#account').fill('not-email');
      await click('#submit-auth'); check((await p.locator('#form-error').textContent()).includes('電子郵件格式'), 'email validation missing');
      await p.locator('#account').fill('hunter@example.com'); await p.locator('#password').fill('demo-only-123'); await p.locator('#confirm').fill('mismatch');
      await click('#submit-auth'); check((await p.locator('#form-error').textContent()).includes('不一致'), 'password confirmation missing');
      await p.locator('#confirm').fill('demo-only-123'); await p.locator('#consent').check(); await click('#submit-auth');
      await p.waitForSelector('#preview-dialog[open]'); check((await p.locator('#dialog-title').textContent()).includes('本機帳號已建立'), 'registration local-session labeling');
      await click('#dismiss-dialog'); await click('#tab-login'); await click('.login-options [data-view="recover"]');
      check(await p.locator('[data-field="password"]').isHidden(), 'password shown on recovery');
      if (label === 'mobile') await p.screenshot({ path: 'output/playwright/login-ui-recover.png', fullPage: true });
      await p.locator('#account').fill('hunter@example.com'); await click('#submit-auth'); await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-copy').textContent()).includes('沒有寄出郵件'), 'recovery claims to send an email');
      await click('#dismiss-dialog'); await click('.back-to-login');
      check(await p.locator(`#consent-copy a[href="${legal.terms}"][data-legal-url="${legal.terms}"]`).count() === 1, 'terms jump missing');
      check(await p.locator(`#consent-copy a[href="${legal.privacy}"][data-legal-url="${legal.privacy}"]`).count() === 1, 'privacy jump missing');
      check(await p.locator(`.footer-legal a[href="${legal.deletion}"][data-legal-url="${legal.deletion}"]`).count() === 1, 'account deletion jump missing');
      await p.evaluate(() => { window.__legalOpen = []; window.open = (...args) => { window.__legalOpen.push(args); return null; }; });
      await click(`#consent-copy [data-legal-url="${legal.terms}"]`);
      check(await p.evaluate(url => window.__legalOpen.some(args => args[0] === url && args[1] === '_blank' && args[2] === 'noopener,noreferrer'), legal.terms), 'browser legal jump did not use protected tab');
      await p.evaluate(() => { window.__nativeLegal = []; window.android = { sdkToBrowser: url => window.__nativeLegal.push(url) }; });
      await click(`.footer-legal [data-legal-url="${legal.deletion}"]`);
      check(await p.evaluate(url => window.__nativeLegal.includes(url), legal.deletion), 'native legal jump did not use sdkToBrowser');
      await click('#guest-entry');
      check((await p.locator('#dialog-copy').textContent()).includes('新手訓練'), 'guest bypass warning missing');
      check(await p.locator('#dialog-game').getAttribute('href') === './', 'guest does not return to existing game');
      await click('#dismiss-dialog');
      check(await p.locator('#session-banner').isVisible(), 'signed-in account status missing');
      await click('#logout-session');await p.waitForSelector('#preview-dialog[open]');
      check((await p.locator('#dialog-copy').textContent()).includes('遊戲存檔'), 'logout does not explain save preservation');
      await click('#dismiss-dialog');
      check(await p.evaluate(() => localStorage.length === 1 && localStorage.getItem('emberwild-ui-preserve') === 'original-progress-untouched' && sessionStorage.length === 0), 'storage was changed');
      check(requests.every(request => request.method === 'GET' && request.url.startsWith('http://127.0.0.1:4174/')), 'unexpected credential or external request');
      check(errors.length === 0, `JavaScript errors: ${errors.join(', ')}`);
      reports.push({ label, viewport: `${width}x${height}`, result: 'PASS layout, local login/logout, register/recovery, save isolation and no auth requests' });
    } finally { await context.close(); }
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  try {
    const p = await noJS.newPage(); await p.goto(root);
    if (!await p.locator('#submit-auth').isDisabled() || !await p.locator('#account').isDisabled()) throw Error('No-JS form is not safely disabled');
    reports.push({ noJavaScript: 'PASS credential inputs and submit stay disabled' });
  } finally { await noJS.close(); }
  const gameContext = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  try {
    const p = await gameContext.newPage();
    await p.addInitScript(()=>{if(location.pathname.endsWith('/'))localStorage.setItem('emberwild_account_session_v1',JSON.stringify({version:1,label:'蕨林獵人',signedInAt:1}));});
    await p.goto('http://127.0.0.1:4174/?qa=account');await p.waitForFunction(()=>window.emberwildQA?.store);
    await p.evaluate(()=>emberwildQA.store.mutate(state=>{state.profile.tutorialDone=true;state.profile.runs=2;}));await p.reload();await p.waitForFunction(()=>window.emberwildQA?.store);
    if (!await p.locator('.landing-account').isVisible() || await p.locator('.landing-account').getAttribute('href') !== '#account' || !(await p.locator('.landing-account').textContent()).includes('蕨林獵人')) throw Error('signed-in account entry missing');
    if (await p.locator('.landing-legal a').count() !== 3) throw Error('game landing legal/account entries missing');
    if (await p.locator('.intro-bottom').count() !== 0) throw Error('old three-part landing tips still exist');
    const legalBar = await p.locator('.landing-legal').boundingBox();
    if (!legalBar || 852 - (legalBar.y + legalBar.height) > 32) throw Error('legal links were not moved to the bottom area');
    if (Number.parseFloat(await p.locator('.landing-legal a').first().evaluate(link => getComputedStyle(link).fontSize)) < 12) throw Error('landing legal links are still too small');
    await p.evaluate(() => { window.__nativeLegal = []; window.android = { sdkToBrowser: url => window.__nativeLegal.push(url) }; });
    await p.locator(`.landing-legal [data-legal-url="${legal.privacy}"]`).tap();
    if (!await p.evaluate(url => window.__nativeLegal.includes(url), legal.privacy)) throw Error('game landing did not use native legal bridge');
    await p.setViewportSize({ width: 1048, height: 338 });
    await p.reload();
    const wideBar = await p.locator('.landing-legal').boundingBox();
    if (!wideBar || 338 - (wideBar.y + wideBar.height) > 10) throw Error('wide short viewport does not keep legal links at the bottom');
    if (Number.parseFloat(await p.locator('.landing-legal a').first().evaluate(link => getComputedStyle(link).fontSize)) < 14) throw Error('wide short viewport legal links are too small');
    await p.setViewportSize({ width: 393, height: 852 });await p.goto('http://127.0.0.1:4174/?qa=account');await p.waitForFunction(()=>window.emberwildQA?.store);
    await p.locator('#landing-settings').tap();
    if (await p.locator('.settings-legal [data-legal-url]').count() !== 3) throw Error('game settings legal/account jumps missing');
    if(await p.locator('[data-action="logout-confirm"]').count()!==1||await p.locator('[data-action="clear-save-confirm"]').count()!==1)throw Error('logout or delete-save setting missing');
    await p.locator('[data-action="clear-save-confirm"]').tap();
    if(!(await p.locator('#modal-copy').textContent()).includes('永久清除'))throw Error('delete-save confirmation missing');
    await p.locator('[data-action="clear-save"]').tap();await p.waitForFunction(()=>localStorage.getItem('emberwild_save_v2')===null&&document.getElementById('modal').hidden);
    const afterDelete=await p.evaluate(()=>({save:localStorage.getItem('emberwild_save_v2'),backup:localStorage.getItem('emberwild_save_v2_backup'),legacy:localStorage.getItem('emberwild_prototype_v1'),account:JSON.parse(localStorage.getItem('emberwild_account_session_v1')),settings:localStorage.getItem('emberwild_experience_v1')}));
    if(afterDelete.save!==null||afterDelete.backup!==null||afterDelete.legacy!==null||afterDelete.account?.label!=='蕨林獵人')throw Error(`delete-save did not preserve account or clear progress exactly: ${JSON.stringify(afterDelete)}`);
    if(!await p.locator('#onboarding-gate').isVisible())throw Error('delete-save did not restore first-run onboarding');
    await p.locator('#landing-account').tap();await p.locator('[data-action="logout-confirm"]').tap();await p.locator('[data-action="logout-account"]').tap();
    await p.waitForURL('**/login-preview.html?status=signed-out');
    if(await p.evaluate(()=>localStorage.getItem('emberwild_account_session_v1'))!==null)throw Error('logout did not clear local account session');
    if(await p.evaluate(()=>localStorage.getItem('emberwild_save_v2'))!==null)throw Error('logout changed deleted-save boundary');
    reports.push({ gameEntry: 'PASS legal jumps, delete-save/account separation and logout from game account management' });
  } finally { await gameContext.close(); }
  return reports;
}
