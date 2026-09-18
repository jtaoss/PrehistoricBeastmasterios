// Run with node scripts/test-double-jump.cjs. Exercises production physics in memory.
const assert = require('node:assert/strict');
const { harness } = require('./test-mushroom-interactions.cjs');
let passed = 0;

function test(name, body) {
    body();
    console.log(`PASS ${name}`);
    passed++;
}

function grounded(options = {}) {
    return harness({ noObstacles: true, ...options, player: { y: 500, vy: 0, grounded: true, jumpsUsed: 0, ...options.player } });
}

function tap(game) {
    game.jump();
    game.releaseJump();
}

test('two rapid taps trigger first jump then double jump, even in one frame', () => {
    const { game, get } = grounded();
    tap(game);
    assert.equal(game.snapshot().player.jumpsUsed, 1);
    assert(game.snapshot().player.vy < 0);
    tap(game);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
    assert.equal(game.snapshot().jumpBuffer, 0);
    assert.equal(get('comic-fx-layer').children.at(-1).textContent, '二段跳！');
});

test('holding one press cannot consume the second jump', () => {
    const { game } = grounded();
    game.jump();
    game.update(.033);
    const before = game.snapshot().player.vy;
    game.jump();
    assert.equal(game.snapshot().player.jumpsUsed, 1);
    assert.equal(game.snapshot().player.vy, before);
    game.releaseJump();
    game.jump();
    assert.equal(game.snapshot().player.jumpsUsed, 2);
});

for (const vy of [-160, 0, 700]) test(`second tap works while airborne at vy=${vy}`, () => {
    const { game } = harness({ noObstacles: true, player: { y: 280, vy, jumpsUsed: 1 } });
    tap(game);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
    assert(game.snapshot().player.vy < -500);
});

test('third and later taps cannot add an airborne impulse', () => {
    const { game } = harness({ noObstacles: true, player: { y: 200, vy: 100, jumpsUsed: 2 } });
    for (let i = 0; i < 5; i++) {
        const before = game.snapshot().player.vy;
        tap(game);
        assert.equal(game.snapshot().player.vy, before);
        assert.equal(game.snapshot().player.jumpsUsed, 2);
        game.update(.016);
    }
});

test('near-ground third tap waits for landing, then starts a new first jump', () => {
    const { game } = harness({ noObstacles: true, player: { y: 490, vy: 300, jumpsUsed: 2 } });
    tap(game);
    assert.equal(game.snapshot().player.vy, 300);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
    game.update(.01);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
    game.update(.025);
    assert.equal(game.snapshot().player.jumpsUsed, 1);
    assert(game.snapshot().player.vy < 0);
});

test('landing without a buffered press restores both jumps', () => {
    const { game } = harness({ noObstacles: true, player: { y: 498, vy: 500, jumpsUsed: 2 } });
    game.update(.016);
    assert.equal(game.snapshot().player.grounded, true);
    assert.equal(game.snapshot().player.jumpsUsed, 0);
    tap(game);
    tap(game);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
});

test('long press still rises higher than a short tap for either jump', () => {
    for (const airborne of [false, true]) {
        const options = { noObstacles: true, player: { y: airborne ? 350 : 500, vy: 0, grounded: !airborne, jumpsUsed: airborne ? 1 : 0 } };
        const short = harness(options).game;
        const long = harness(options).game;
        tap(short);
        long.jump();
        for (let i = 0; i < 10; i++) { short.update(.016); long.update(.016); }
        assert(long.snapshot().player.y < short.snapshot().player.y);
        assert.equal(long.snapshot().player.jumpsUsed, airborne ? 2 : 1);
    }
});

test('pause ignores taps and does not refill the jump count', () => {
    const { game } = grounded();
    tap(game);
    game.pauseGame();
    const before = game.snapshot().player.vy;
    tap(game);
    game.frame(1000);
    assert.equal(game.snapshot().player.vy, before);
    assert.equal(game.snapshot().player.jumpsUsed, 1);
    game.resumeGame();
    tap(game);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
});

test('a new run clears held input and restores jump count', () => {
    const { game, get } = grounded();
    tap(game);
    game.jump();
    game.resetGame();
    assert.equal(game.snapshot().jumpHeld, false);
    assert.equal(game.snapshot().player.jumpsUsed, 0);
    assert.equal(get('jump-button').classList.contains('pressed'), false);
});

test('stomping a mushroom heals and restores one air jump after the bounce', () => {
    const { game } = harness({ player: { jumpsUsed: 2 } });
    game.update(.025);
    assert.equal(game.snapshot().lives, 3);
    assert.equal(game.snapshot().player.jumpsUsed, 1);
    tap(game);
    assert.equal(game.snapshot().player.jumpsUsed, 2);
    const before = game.snapshot().player.vy;
    tap(game);
    assert.equal(game.snapshot().player.vy, before);
});

for (const shield of [false, true]) test(`collision bounce preserves limits (shield=${shield})`, () => {
    for (const jumpsUsed of [0, 2]) {
        const { game } = harness({ shield, lives: 3, player: { y: 500, vy: 0, grounded: true, jumpsUsed } });
        game.update(.016);
        assert.equal(game.snapshot().player.jumpsUsed, Math.max(1, jumpsUsed));
        assert.equal(game.snapshot().coyoteTimer, 0);
        const before = game.snapshot().player.vy;
        tap(game);
        assert.equal(game.snapshot().player.jumpsUsed, 2);
        if (jumpsUsed === 2) assert.equal(game.snapshot().player.vy, before);
    }
});

test('double jump stays visible on short screens and eventually lands', () => {
    const { game } = grounded({ height: 310, groundY: 245, player: { y: 245 } });
    game.jump();
    for (let i = 0; i < 12; i++) game.update(.016);
    game.releaseJump();
    game.jump();
    for (let i = 0; i < 80; i++) {
        game.update(.016);
        assert(game.snapshot().player.y >= 100);
    }
    assert.equal(game.snapshot().player.grounded, true);
    assert.equal(game.snapshot().player.jumpsUsed, 0);
});

console.log(`\n${passed} double-jump tests passed.`);
