// Isolated browser regression; no real login, purchase or player save.
// WebKit's on-device gesture handling still needs a physical iPhone check.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {openVeteran} = require('./camp-helpers.cjs');
const origin = process.env.EMBERWILD_URL || 'http://127.0.0.1:8765';

(async () => {
  const browser = await chromium.launch({headless: true, executablePath:
    process.env.PBM_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    for (const [width, height] of [[375,812], [320,568], [844,390], [768,1024]]) {
      const context = await browser.newContext({viewport: {width,height}, isMobile: true, hasTouch: true});
      try {
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await openVeteran(page, origin + '/?qa=touch');
        await page.waitForFunction(() => window.emberwildQA && document.documentElement.dataset.bootReady === 'true');
        assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /maximum-scale=1/);
        for (const selector of ['html','body','#modal-content','#camp-message','#wave-title']) {
          assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).touchAction), 'manipulation', selector);
        }
        for (const selector of ['#camp-world','#world','#camp-joystick','#joystick','#camp-sprint']) {
          assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).touchAction), 'none', selector);
        }
        await page.evaluate(() => emberwildQA.showCamp());
        await page.waitForSelector('#camp:not([hidden])');
        const heading = await page.locator('.camp-hud h1').boundingBox();
        const session = await context.newCDPSession(page);
        await session.send('Input.synthesizeTapGesture', {x:heading.x+10, y:heading.y+10, tapCount:2, gestureSourceType:'touch'});
        assert.ok(Math.abs(await page.evaluate(() => visualViewport.scale)-1) < .01, 'double tap zoomed the game');
        await page.locator('#camp-settings').tap();
        await page.waitForSelector('#modal:not([hidden])');
        assert.deepEqual(errors, []);

        await page.goto(origin + '/login-preview.html');
        await page.waitForFunction(() => !document.querySelector('#form-fields').disabled);
        assert.doesNotMatch(await page.locator('meta[name="viewport"]').getAttribute('content'), /user-scalable=no/, 'login keeps manual reading zoom');
        await page.locator('#tab-register').tap();
        for (const selector of ['#nickname','#account','#password','#confirm']) {
          assert.ok(await page.locator(selector).evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), `${width}x${height} ${selector} can trigger iOS focus zoom`);
          await page.locator(selector).fill(selector === '#nickname' ? '測試獵人' : 'test_1234');
        }
        await page.locator('#consent').check();
        assert.equal(await page.locator('#consent').isChecked(), true);
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}x${height}: zoom policy, double tap, game gestures, settings, registration input/consent`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
