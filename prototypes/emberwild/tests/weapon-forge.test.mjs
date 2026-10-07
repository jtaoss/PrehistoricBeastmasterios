import assert from 'node:assert/strict';
import {Expedition,WEAPONS,isValidLoadout,DEFAULT_LOADOUT} from '../engine.mjs';

let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}
const game=weapon=>{const g=new Expedition(9100+passed,`weapon-${weapon}-${passed}`);g.nodes=[];g.applyLoadout({...DEFAULT_LOADOUT,weapons:[weapon]});g.paused=false;return g;};
const ready=g=>{g.hero.attackCD=0;};

test('five weapons are valid one-slot expedition choices',()=>{
  assert.deepEqual(Object.keys(WEAPONS),['spear','axe','bow','blades','hammer']);
  for(const weapon of Object.keys(WEAPONS))assert.equal(isValidLoadout({...DEFAULT_LOADOUT,weapons:[weapon]}),true);
});

test('spear forging changes every third throw into a three-way split',()=>{
  const g=game('spear'),target=g.spawnEnemy('brute',{x:520,y:475});g.mods.spearFork=true;
  g.attack(target);ready(g);g.attack(target);ready(g);const before=g.projectiles.length;g.attack(target);
  assert.equal(g.projectiles.length-before,3);assert.deepEqual(g.projectiles.slice(-3).map(p=>p.kind),['spear','spear','spear']);
});

test('axe forging changes a forward fan into a full-circle strike',()=>{
  const g=game('axe');g.hero.angle=0;const behind=g.spawnEnemy('brute',{x:g.hero.x-75,y:g.hero.y}),hp=behind.hp;
  g.attack({x:g.hero.x+80,y:g.hero.y});assert.equal(behind.hp,hp);ready(g);g.mods.spin=true;g.attack({x:g.hero.x+80,y:g.hero.y});assert.ok(behind.hp<hp);
});

test('bow is a fast long-range weapon and forging adds a third-shot fan',()=>{
  const g=game('bow'),target=g.spawnEnemy('brute',{x:640,y:475});g.mods.bowVolley=true;
  g.attack(target);assert.equal(g.hero.attackCD,.32);ready(g);g.attack(target);ready(g);const before=g.projectiles.length;g.attack(target);
  assert.equal(g.projectiles.length-before,3);assert.ok(g.projectiles.slice(-3).every(p=>p.kind==='arrow'));
});

test('dual-blade forging turns the fourth combo into an invulnerable rush and circular double slash',()=>{
  const g=game('blades'),target=g.spawnEnemy('brute',{x:g.hero.x+120,y:g.hero.y}),start=g.hero.x,hp=target.hp;g.mods.bladeRush=true;
  for(let i=0;i<4;i++){ready(g);g.attack(target);}
  assert.ok(g.hero.x>start+40);assert.ok(g.hero.invulnerable>0);assert.ok(target.hp<hp);assert.equal(g.hero.weaponChain,4);
});

test('hammer forging emits a broad piercing ground wave after the heavy knockback smash',()=>{
  const g=game('hammer'),target=g.spawnEnemy('brute',{x:g.hero.x+190,y:g.hero.y+28}),hp=target.hp;g.mods.hammerQuake=true;
  g.attack(target);const wave=g.projectiles.find(p=>p.kind==='quake-wave');assert.ok(wave);assert.equal(wave.hitRadius,34);for(let i=0;i<35;i++)g.updateProjectiles(.02);assert.ok(target.hp<hp);
});

test('merchant materials unlock attack forms without adding a hidden numeric damage rank',()=>{
  for(const weapon of Object.keys(WEAPONS)){
    const g=game(weapon);g.materials={wood:99,bone:99};g.amber=99;const before=g.mods[weapon];assert.equal(g.buy(`skill-${weapon}`).ok,true);assert.equal(g.mods[weapon],before);assert.equal(g.selectedUpgrades.includes(weapon),true);
  }
});

test('new weapon, combo counter and forged form survive an exact snapshot restore',()=>{
  const g=game('hammer');g.mods.hammerQuake=true;g.selectedUpgrades.push('hammer');g.hero.weaponChain=7;const snapshot=g.snapshot(),restored=Expedition.restore(snapshot);
  assert.deepEqual(restored.snapshot(),snapshot);assert.equal(restored.hero.weapon,'hammer');assert.equal(restored.hero.weaponChain,7);assert.equal(restored.mods.hammerQuake,true);
});

console.log(`\n${passed} weapon forging scenarios passed.`);
