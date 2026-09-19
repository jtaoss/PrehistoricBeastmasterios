// Run with playwright-cli -s=emberwild-music run-code --filename <this file>.
async page => {
  const browser = page.context().browser(), reports = [];
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 393, height: 852 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    const p = await context.newPage(), errors = [], checks = [];
    p.on('pageerror', error => errors.push(error.message));
    const check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
    const click = selector => mobile ? p.locator(selector).tap() : p.locator(selector).click();
    const playing = (track = 'ambient') => p.waitForFunction(track => {
      const music = emberwildQA.backgroundMusic, m = music.media;
      return music.track === track && m && !m.paused && m.readyState >= 2 && m.currentTime > 0 &&
        [...music.players.values()].filter(player => !player.paused).length === 1;
    }, track);
    const silent = () => p.waitForFunction(() => [...emberwildQA.backgroundMusic.players.values()].every(player => player.paused));
    const approach = async id => {
      await p.evaluate(async id => {
        const { CAMP_SITES } = await import('./camp-world.mjs');
        const site = CAMP_SITES.find(site => site.id === id), ui = emberwildQA.campUI;
        ui.clear(); ui.walk.restore({ x: site.x, y: site.y + 110 }); ui.painter.snap = true;
        ui.lastFrame = performance.now() - 16; ui.frame(performance.now());
      }, id);
      await p.waitForFunction(id => emberwildQA.campUI.walk.nearest()?.id === id && !document.querySelector('#camp-interact').disabled, id);
      await click('#camp-interact');
    };
    try {
      await p.goto('http://127.0.0.1:4174/?qa=1');
      await p.waitForFunction(() => window.emberwildQA);
      check(await p.evaluate(() => emberwildQA.backgroundMusic.media === null), 'no audio allocated before interaction');
      await click('#landing h1'); await playing();
      check(await p.evaluate(() => emberwildQA.backgroundMusic.media.loop && !emberwildQA.backgroundMusic.media.error), 'real MP3 decodes and loops after first gesture');
      const duration = await p.evaluate(() => emberwildQA.backgroundMusic.media.duration);
      await p.evaluate(async () => {
        window.__musicInstance = emberwildQA.backgroundMusic.media;
        await emberwildQA.store.mutate(state => { state.profile.tutorialDone = true; });
      });
      await click('#begin'); await p.waitForSelector('#camp:not([hidden])'); await playing();
      check(await p.evaluate(() => window.__musicInstance === emberwildQA.backgroundMusic.media), 'home to camp retains one audio instance');
      await click('#camp-companion'); await playing(); await click('[data-action="companion-close"]');
      await click('#camp-loadout'); await playing(); await click('[data-action="loadout-close"]');
      checks.push('companion and loadout panels keep playing');
      await approach('merchant'); await p.waitForSelector('.merchant-modal:not([hidden])'); await playing();
      await click('[data-action="market-close"]'); await playing(); checks.push('camp merchant keeps playing');
      await click('#camp-settings');
      await p.locator('input[data-setting="volume"]').fill('35');
      check(await p.evaluate(() => Math.abs(emberwildQA.backgroundMusic.media.volume - .35 * .55) < .001), 'volume slider updates actual audio');
      await p.locator('input[data-setting="volume"]').fill('0'); await silent();
      check(await p.evaluate(() => emberwildQA.backgroundMusic.media.muted), 'zero volume mutes and pauses');
      await p.reload(); await p.waitForFunction(() => window.emberwildQA);
      await click('#landing h1');
      check(await p.evaluate(() => emberwildQA.experience.settings.volume === 0 && emberwildQA.backgroundMusic.media === null), 'mute persists across reload');
      await click('#landing-settings'); await p.locator('input[data-setting="volume"]').fill('50'); await playing();
      await click('[data-action="settings-close"]'); await click('#begin'); await p.waitForSelector('#camp:not([hidden])');
      await p.evaluate(() => {
        const media = emberwildQA.backgroundMusic.media;
        media.currentTime = media.duration - .2;
      });
      await p.waitForFunction(() => {
        const media = emberwildQA.backgroundMusic.media;
        return media.currentTime < 2 && !media.paused;
      });
      checks.push('real audio wraps at track end');
      await p.evaluate(() => window.setShellAppActive(false)); await silent();
      await p.evaluate(() => window.setShellAppActive(true)); await playing();
      checks.push('native background and foreground pause and resume audio');
      await p.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await silent();
      await p.evaluate(() => window.dispatchEvent(new Event('pageshow'))); await playing();
      checks.push('page cache lifecycle pause and resume audio');
      await approach('gate'); await click('#camp-start'); await p.waitForSelector('#route-map:not([hidden])'); await playing();
      checks.push('route selection plays ambient music');
      await click('.route-node.available'); await p.waitForSelector('#game:not([hidden])'); await playing('battle');
      check(await p.evaluate(() => emberwildQA.game.phase === 'wave' && emberwildQA.backgroundMusic.media.currentSrc.endsWith('/hold-the-ridge.mp3')), 'entering real battle switches to Hold the Ridge exclusively');
      const battleDuration = await p.evaluate(() => emberwildQA.backgroundMusic.media.duration);
      await p.evaluate(() => {
        const media = emberwildQA.backgroundMusic.media;
        media.currentTime = media.duration - .2;
      });
      await p.waitForFunction(() => {
        const media = emberwildQA.backgroundMusic.media;
        return media.currentTime < 2 && !media.paused;
      });
      checks.push('battle MP3 decodes and loops at track end');
      await click('#pause'); await silent();
      await click('[data-action="settings"]'); await silent();
      await click('[data-action="settings-close"]'); await silent();
      checks.push('battle pause and settings remain silent');
      await click('[data-action="resume"]'); await playing('battle');
      await p.evaluate(() => window.setShellAppActive(false)); await silent();
      await p.evaluate(() => window.setShellAppActive(true)); await silent();
      check(await p.evaluate(() => emberwildQA.game.paused), 'returning from background keeps battle and music paused until confirmation');
      await click('[data-action="resume"]'); await playing('battle');
      await click('#pause'); await silent();
      await click('[data-action="save-camp"]'); await p.waitForSelector('#camp:not([hidden])'); await playing();
      checks.push('saving and returning to camp resumes audio');
      await click('#camp-home'); await p.waitForSelector('#landing:not([hidden])'); await playing();
      await click('#continue-run'); await p.waitForSelector('#game:not([hidden])'); await silent();
      checks.push('restored battle stays silent');
      await click('[data-action="resume"]'); await playing('battle');
      await click('#sound'); await silent();
      check(await p.evaluate(() => emberwildQA.experience.settings.volume === 0), 'existing sound shortcut mutes music too');
      await click('#sound'); await playing('battle');
      check(await p.evaluate(() => emberwildQA.backgroundMusic.players.size === 2), 'repeated scene changes reuse exactly two players');
      await p.evaluate(() => {
        emberwildQA.game.paused = true; emberwildQA.game.phase = 'lose';
        emberwildQA.showResult({ won: false, waves: 1, stones: 2, kills: 1, combos: 0 });
      });
      await playing(); checks.push('settlement resumes ambient music');
      check(errors.length === 0, 'no JavaScript errors');
      reports.push({ viewport: mobile ? 'mobile-touch' : 'desktop', duration, battleDuration, checks });
    } finally { await context.close(); }
  }
  const freshContext = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  try {
    const fresh = await freshContext.newPage();
    await fresh.goto('http://127.0.0.1:4174/?qa=1');
    await fresh.waitForFunction(() => window.emberwildQA);
    await fresh.locator('#begin').tap();
    await fresh.waitForFunction(() => {
      const music = emberwildQA.backgroundMusic;
      return music.track === 'battle' && music.media && !music.media.paused && music.media.currentTime > 0 &&
        [...music.players.values()].filter(player => !player.paused).length === 1;
    });
    reports.push({ firstTap: 'PASS direct mandatory-tutorial entry plays only the battle track' });
  } finally { await freshContext.close(); }
  return reports;
}
