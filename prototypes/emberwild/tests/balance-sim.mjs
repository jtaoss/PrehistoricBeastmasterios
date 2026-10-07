// Deterministic tuning harness. It is intentionally a competent, not perfect,
// player: holds attack, dodges nearby threats, and follows a limited purchase plan.
import {Expedition,DEFAULT_LOADOUT,HIRES,distance,pointToSegment} from '../engine.mjs';

const g=new Expedition(20260918,'balance-simulation');
g.applyLoadout(DEFAULT_LOADOUT);
g.nodes=[];
const spots={watchtower:[[190,300],[530,300],[150,590],[570,590]],catapult:[[360,175],[145,430],[575,430]],wall:[[220,535],[500,535]],hunter:[[310,570],[410,570],[260,620],[460,620]]};
function deploy(type){
  g.setDeck(HIRES[type]?'hire':'build');const slot=g.hand.indexOf(type);if(slot<0)return false;g.cardTimers[slot]=0;
  const upgrade=g.buildings.find(b=>b.type===type&&b.level<3),used=new Set(g.buildings.filter(b=>b.type===type).map(b=>`${b.x},${b.y}`));
  const point=upgrade?[upgrade.x,upgrade.y]:spots[type].find(([x,y])=>!used.has(`${x},${y}`));
  return point?g.placeCard(slot,...point).ok:false;
}
for(const type of ['watchtower','watchtower','catapult','wall','hunter'])deploy(type);

const cardPlan=['watchtower','catapult','watchtower','wall','catapult','watchtower','catapult'];
const skillPlan={2:'spear',4:'beast',6:'armor',7:'heart'};
const report=[];
for(let stage=1;stage<=8;stage++){
  if(!g.startWave())throw Error(`stage ${stage} did not start`);
  const started=g.time,kills=g.stats.kills;let heroHits=0,lastHp=g.hero.hp;
  for(let frame=0;frame<9000&&g.phase==='wave';frame++){
    const alive=g.enemies.filter(e=>e.hp>0),nearest=alive.sort((a,b)=>distance(g.hero,a)-distance(g.hero,b))[0];
    // A competent player pulls bosses away from the egg so telegraphed area
    // attacks do not splash the objective. Regular packs are fought mid-field.
    const bossAlive=alive.some(e=>['matriarch','charger','boss'].includes(e.type));
    let rally=bossAlive?{x:360,y:665}:{x:360,y:500};
    const objective=g.objective;
    if(objective?.type==='escort')rally=objective.npc;
    else if(objective?.type==='destroy')rally=objective.targets.filter(target=>target.hp>0).sort((a,b)=>distance(g.hero,a)-distance(g.hero,b))[0]||rally;
    else if(objective?.type==='mining')rally=g.nodes.filter(node=>node.hp>0&&node.objectiveKind==='ore').sort((a,b)=>distance(g.hero,a)-distance(g.hero,b))[0]||rally;
    else if(objective?.type==='rescue')rally=objective.captive;
    else if(objective?.type==='strongholds')rally=[...objective.points].sort((a,b)=>{
      const threat=point=>Math.min(...alive.map(enemy=>distance(point,enemy)),999)-90*(1-point.hp/point.maxHp);
      return threat(a)-threat(b);
    })[0]||rally;
    let x=(rally.x-g.hero.x)/180,y=(rally.y-g.hero.y)/180;
    const warning=alive.find(e=>e.windup>0&&(e.type==='charger'?pointToSegment(g.hero,e,{x:e.lockX,y:e.lockY})<75:distance(g.hero,{x:e.lockX,y:e.lockY})<(e.type==='boss'?145:55)));
    if(warning){
      let dx=g.hero.x-warning.lockX,dy=g.hero.y-warning.lockY,d=Math.hypot(dx,dy);
      // Ground attacks lock exactly on the hero. Pick a real escape direction
      // instead of feeding the simulator a zero-length stick vector.
      if(d<1){dx=g.hero.x<360?1:-1;dy=g.hero.y<410?1:-.35;d=Math.hypot(dx,dy);}
      x=dx/d;y=dy/d;if(g.hero.dashCD<=0)g.dash({x,y});
    }
    else if(nearest&&distance(g.hero,nearest)<95){const dx=g.hero.x-nearest.x,dy=g.hero.y-nearest.y,d=Math.hypot(dx,dy)||1;x=dx/d;y=dy/d;}
    if(g.hero.volleyCD<=0&&(alive.length>=3||bossAlive))g.castSkill('volley');
    if(g.hero.shockCD<=0&&alive.some(e=>distance(g.hero,e)<150+e.r))g.castSkill('shock');
    g.tick(.02,{x,y,attack:true,aim:nearest});if(g.hero.hp<lastHp)heroHits++;lastHp=g.hero.hp;
  }
  const survivor=g.enemies.find(e=>e.hp>0);
  report.push({stage,seconds:+(g.time-started).toFixed(1),kills:g.stats.kills-kills,hits:heroHits,hero:Math.ceil(g.hero.hp),egg:Math.ceil(g.base.hp),buildings:g.buildings.map(b=>b.type[0]).join(''),remaining:survivor?`${survivor.type}:${Math.ceil(survivor.hp)}`:'—',wood:g.materials.wood,bone:g.materials.bone,amber:g.amber,result:g.phase});
  if(g.phase==='lose')break;
  if(stage<8){
    const endangered=g.base.hp/g.base.maxHp<.55;
    if(endangered&&!g.selectedUpgrades.includes('repair'))g.buy('skill-repair');
    const skill=skillPlan[stage];if(!endangered&&skill)g.buy(`skill-${skill}`);
    const card=endangered?'wall':cardPlan[stage-1];if(card&&g.buy(card).ok)deploy(card);
  }
}
console.table(report);
// A competent run must arrive at the final result with a real surviving
// defence, proving persistence matters instead of rebuilding every stage.
if(g.phase!=='win'||g.buildings.length<3)process.exitCode=1;
