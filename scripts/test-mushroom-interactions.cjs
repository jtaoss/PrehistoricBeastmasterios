// Run with node scripts/test-mushroom-interactions.cjs. No browser or saved-game writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../PrehistoricBeastmaster/Resources/game/game.js'), 'utf8');
const initMarker = "    $('quick-start').addEventListener";
assert(source.includes(initMarker), 'game initialization marker must exist');

function harness(options = {}) {
    const elements = new Map();
    const noop = () => {};
    const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop });
    function element() {
        const classes = new Set();
        return {
            classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n), toggle: (n, value) => value ? classes.add(n) : classes.delete(n) },
            style: { setProperty: noop }, dataset: {}, children: [], textContent: '',
            getContext: () => context, addEventListener: noop, setAttribute: noop,
            append(...children) { this.children.push(...children); }, remove: noop,
            replaceChildren() { this.children = []; }, getBoundingClientRect: () => ({ width: 390, height: 618 })
        };
    }
    const get = id => {
        if (!elements.has(id)) elements.set(id, { ...element(), parentElement: element() });
        return elements.get(id);
    };
    const storage = new Map();
    const sandbox = {
        window: { GameSfx: options.sfx, DinoSprites: { load: () => Promise.resolve(true), draw: noop }, matchMedia: () => ({ matches: false }) },
        document: { getElementById: get, querySelector: get, querySelectorAll: () => [], createElement: element, documentElement: element() },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        navigator: { vibrate: noop }, performance: { now: () => 0 },
        requestAnimationFrame: () => 1, cancelAnimationFrame: noop, setTimeout: () => 1, clearTimeout: noop
    };
    // Expose the real closure only in this in-memory test copy; production has no debug API.
    const hooks = `
    window.testGame = {
        update, canStompMushroom, stompMushroom, pauseGame, resumeGame, drawObstacle,
        jump, releaseJump, resetGame, frame, collectPickup, collectAmberItem, completeLevel,
        setup(options) {
            width = 390; height = options.height || 618; groundY = options.groundY || 500; state = 'running';
            currentMode = options.mode || 'level'; baseSpeed = 174; distance = 0;
            obstacleClock = amberClock = pickupClock = 100;
            lives = options.lives ?? 2;
            invulnerable = options.invulnerable || 0;
            shieldReady = options.shield || false;
            rushTimer = options.rush || 0;
            slowTimer = options.slow || 0;
            player = { x: 75, y: 440, vy: 600, grounded: false, runPhase: 0, squash: 0, hurtTimer: 0, landTimer: 0, ...options.player };
            player.jumpsUsed = options.player?.jumpsUsed ?? (player.grounded ? 0 : 1);
            obstacles = options.noObstacles ? [] : [{ type: 'mushroom', x: 70, y: 500, w: 48, h: 50, variant: .3, ...options.obstacle }];
        },
        snapshot: () => ({ lives, state, shieldReady, invulnerable, rushTimer, jumpHeld, jumpBuffer, coyoteTimer, player: { ...player }, obstacles: obstacles.map(item => ({ ...item })) })
    };
})();`;
    vm.runInNewContext(source.slice(0, source.indexOf(initMarker)) + hooks, sandbox);
    sandbox.window.testGame.setup(options);
    return { game: sandbox.window.testGame, get };
}

module.exports = { harness };

if (require.main === module) {
let passed = 0;
function test(name, body) {
    body();
    console.log(`PASS ${name}`);
    passed++;
}

for (const dt of [1 / 120, 1 / 60, .033]) {
    test(`descending stomp heals once and bounces at dt=${dt}`, () => {
        const { game, get } = harness();
        for (let i = 0; i < 10 && !game.snapshot().obstacles[0]?.stomped; i++) game.update(dt);
        const snapshot = game.snapshot();
        assert.equal(snapshot.lives, 3);
        assert.equal(snapshot.obstacles[0].stomped, true);
        assert(snapshot.player.vy < 0);
        assert.equal(snapshot.player.hurtTimer, 0);
        assert(get('lives').parentElement.classList.contains('life-heal'));
        assert.match(get('shell-toast').textContent, /恢復 1 顆心/);
        assert.equal(game.canStompMushroom(snapshot.obstacles[0], 420), false);
        const particlesBefore = get('comic-fx-layer').children.length;
        game.stompMushroom(snapshot.obstacles[0]);
        assert.equal(get('comic-fx-layer').children.length, particlesBefore);
        for (let i = 0; i < 11; i++) game.update(.033);
        assert.equal(game.snapshot().obstacles.length, 0);
        assert.equal(game.snapshot().lives, 3);
    });
}

test('full health stays at three and still consumes the mushroom', () => {
    const { game, get } = harness({ lives: 3 });
    game.update(.025);
    assert.equal(game.snapshot().lives, 3);
    assert.equal(game.snapshot().obstacles[0].stomped, true);
    assert.match(get('shell-toast').textContent, /生命已滿/);
});

test('grounded side contact loses one heart, never heals', () => {
    const { game, get } = harness({ lives: 3, player: { y: 500, vy: 0, grounded: true } });
    game.update(1 / 60);
    assert.equal(game.snapshot().lives, 2);
    assert(game.snapshot().player.hurtTimer > 0);
    assert.match(get('shell-toast').textContent, /側面撞到蘑菇/);
    game.update(1 / 60);
    assert.equal(game.snapshot().lives, 2);
});

for (const [name, player] of [
    ['rising into the side', { y: 480, vy: -500 }],
    ['descending after feet are already below the cap', { y: 470, vy: 300 }]
]) test(`${name} is damage, not a stomp`, () => {
    const { game } = harness({ lives: 3, player });
    game.update(1 / 60);
    assert.equal(game.snapshot().lives, 2);
    assert(!game.snapshot().obstacles[0].stomped);
});

for (const [name, options] of [
    ['shield', { shield: true }], ['invulnerability', { invulnerable: 1 }],
    ['rush', { rush: 2 }], ['slow', { slow: 2 }], ['endless mode', { mode: 'endless' }]
]) test(`top stomp works with ${name}`, () => {
    const { game } = harness(options);
    game.update(.025);
    assert.equal(game.snapshot().lives, 3);
    assert.equal(game.snapshot().obstacles[0].stomped, true);
    if (options.shield) assert.equal(game.snapshot().shieldReady, true);
});

for (const options of [{ shield: true }, { invulnerable: 1 }, { rush: 2 }]) {
    test(`existing side protection is preserved: ${JSON.stringify(options)}`, () => {
        const { game } = harness({ ...options, player: { y: 500, vy: 0, grounded: true } });
        game.update(1 / 60);
        assert.equal(game.snapshot().lives, 2);
        if (options.shield) assert.equal(game.snapshot().shieldReady, false);
    });
}

test('a side collision on the last heart ends the run', () => {
    const { game } = harness({ lives: 1, player: { y: 500, vy: 0, grounded: true } });
    game.update(1 / 60);
    assert.equal(game.snapshot().lives, 0);
    assert.equal(game.snapshot().state, 'ended');
});

test('swept contact uses mushroom position at the instant feet cross the cap', () => {
    const { game } = harness({ player: { y: 462 } });
    const mushroom = { type: 'mushroom', y: 500, h: 50, w: 48, previousX: 170, x: 80 };
    assert.equal(game.canStompMushroom(mushroom, 452), false, 'overlap only after crossing must not heal');
    mushroom.previousX = 70;
    mushroom.x = 0;
    assert.equal(game.canStompMushroom(mushroom, 452), true, 'contact before frame end must be detected');
    mushroom.previousX = mushroom.x = 250;
    assert.equal(game.canStompMushroom(mushroom, 440), false);
});

test('rocks retain their normal damage behavior', () => {
    const { game } = harness({ lives: 3, obstacle: { type: 'rock' }, player: { y: 500, vy: 0, grounded: true } });
    game.update(1 / 60);
    assert.equal(game.snapshot().lives, 2);
    assert(!game.snapshot().obstacles[0].stomped);
});

test('normal and stomped mushroom drawing paths execute', () => {
    const { game } = harness();
    game.drawObstacle(game.snapshot().obstacles[0]);
    game.update(.025);
    game.drawObstacle(game.snapshot().obstacles[0]);
    game.pauseGame();
    assert.equal(game.snapshot().state, 'paused');
    game.resumeGame();
    assert.equal(game.snapshot().state, 'running');
});

console.log(`\n${passed} mushroom interaction tests passed.`);
}
