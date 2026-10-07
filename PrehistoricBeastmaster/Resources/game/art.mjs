import { CARDS, HIRES, DEPLOY_CARDS, COMPANIONS, BOSS_WEAKPOINTS, MAP_EVENT_DEFS, WORLD, clamp, distance } from './engine.mjs';
import { preloadArt, drawSprite, drawRanger, spriteIcon } from './painted-art.mjs';
import {ActorMotion} from './actor-motion.mjs';
import {drawCharacter} from './character-art.mjs';
import {experience} from './experience.mjs';
import {controlLabel} from './control-hints.mjs';
import {battleViewport} from './battle-viewport.mjs';

const shapes = {
  hunter:'<path d="M14 50l3-24h23l4 24" fill="#539781"/><circle cx="28" cy="16" r="10" fill="#d3ab78"/><path d="M15 16L28 2l14 15" fill="#385d46"/><path d="M45 16Q62 33 45 50V16M39 32h16" fill="none" stroke="#e3ce91" stroke-width="3"/>',
  guard:'<circle cx="27" cy="14" r="10" fill="#d3ab78"/><path d="M16 15V6l22 0v10" fill="#b4c5bb"/><path d="M13 52V27h27v25" fill="#9b7f50"/><path d="M24 27l21-5v20l-10 11-11-10z" fill="#719582" stroke="#e6d7ab" stroke-width="3"/><path d="M7 10v42" stroke="#dedec1" stroke-width="4"/>',
  torch: '<path d="M19 47L23 22h10l4 25" fill="#8c8067"/><path d="M17 27h24l-4 7H21z" fill="#c2aa79"/><path d="M29 3c10 9 15 16 8 23-4 5-15 3-18-2-3-6 3-10 5-15 0 6 2 7 3 7 3-3 3-7 2-13" fill="#f4ab51"/><path d="M29 14c6 6 8 11 1 14-7-1-7-5-1-14" fill="#ffe7a4"/><ellipse cx="28" cy="49" rx="21" ry="5" fill="#10291e66"/>',
  wall: '<path d="M8 18l5-9 5 9-2 26H9zm13-6l6-9 5 9-2 35h-8zm16 6l6-10 5 11-2 25h-8z" fill="#e7ddbc"/><path d="M5 25l45 5-1 7-45-5z" fill="#8a7851"/><path d="M11 14v29m15-32v35m16-29v26" stroke="#fff0c9" stroke-width="2"/><path d="M12 28l2 8m12-7l-1 7m16-4l-2 7" stroke="#ba9c64" stroke-width="2"/>',
  nest: '<ellipse cx="28" cy="39" rx="23" ry="12" fill="#917344"/><ellipse cx="28" cy="36" rx="21" ry="9" fill="#4e6140"/><path d="M11 42l14 6 19-7M7 35l8 10M35 46l14-9" stroke="#cead72" stroke-width="3" fill="none"/><ellipse cx="23" cy="27" rx="9" ry="13" fill="#ece4bd" transform="rotate(-15 23 27)"/><ellipse cx="35" cy="31" rx="8" ry="11" fill="#d5deb4" transform="rotate(18 35 31)"/><path d="M20 20l4 3-3 5m11 0l5 3" stroke="#b5ba88" stroke-width="3"/>',
  spring: '<ellipse cx="28" cy="38" rx="25" ry="13" fill="#829a90"/><ellipse cx="28" cy="36" rx="20" ry="9" fill="#65acb0"/><path d="M15 37q13 8 26-1m-24-3q8-4 18 0" stroke="#bce9d4" stroke-width="2" fill="none"/><path d="M28 4c-2 8-10 14-10 20 0 13 21 13 21 0 0-6-8-13-11-20" fill="#91d5d7"/><path d="M25 15c-7 12-3 13 1 14" fill="none" stroke="#e0f7e3" stroke-width="3"/>',
};
export function icon(type, className = 'card-icon') {
  if (['watchtower','catapult','torch','wall','nest','spring','hunter','guard'].includes(type)) return spriteIcon(`card-${type}`,className);
  return `<svg class="${className}" viewBox="0 0 56 56" aria-hidden="true">${shapes[type] || ''}</svg>`;
}
function ellipse(c, x, y, rx, ry, color) { c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=color; c.fill(); }
function polygon(c, points, color, stroke) { c.beginPath(); points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.closePath(); c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();} }
function line(c, points, color, width=2) { c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke(); }
function text(c, label, x, y, size, color, weight=600) { c.font=`${weight} ${size}px -apple-system,"PingFang TC",sans-serif`;c.textAlign='center';c.fillStyle=color;c.fillText(label,x,y); }
const ENEMY_SIZE={raptor:78,brute:112,spitter:88,matriarch:186,charger:190,boss:176};
const BOSS_NAMES={matriarch:'沼澤母獸',charger:'骨甲衝角獸',boss:'琥珀泰坦'};
const ESCORT_PATH=[[125,650],[205,585],[275,515],[390,435],[500,325],[585,235],[640,145]].map(([x,y])=>({x,y}));

export class Painter {
  constructor(canvas) {
    preloadArt();this.walkArt=new ActorMotion();this.actorMotions=new Map();
    this.canvas=canvas;this.c=canvas.getContext('2d');
    this.backgrounds=['assets/fern-valley.png','assets/painted-v1/stage-2-fern-hollow-v1.png','assets/painted-v1/stage-3-tidal-marsh-v1.png','assets/painted-v1/stage-4-beast-ruins-v1.png','assets/painted-v1/stage-5-amber-ridge-v1.png','assets/painted-v1/stage-6-ashen-canopy-v1.png','assets/painted-v1/stage-7-moonbone-ravine-v1.png','assets/painted-v1/stage-8-titan-sanctuary-v1.png'].map(src=>{const image=new Image();image.decoding='async';image.src=src;return image;});this.bg=this.backgrounds[0];
    this.scale=1;this.ox=0;this.oy=0;this.w=720;this.h=820;this.shake=0;
    this.reduced=experience.reducedEffects();
    this.resize();
  }
  resize() {
    const rect=this.canvas.getBoundingClientRect();const dpr=experience.renderScale();
    this.w=rect.width||720;this.h=rect.height||820;
    this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);this.dpr=dpr;
    this.scale=Math.min(this.w/WORLD.width,this.h/WORLD.height);this.ox=(this.w-WORLD.width*this.scale)/2;this.oy=(this.h-WORLD.height*this.scale)/2;
    this.closeCamera=getComputedStyle(this.canvas.parentElement).getPropertyValue('--battle-close-camera').trim()==='1';
    this.cameraReady=false;
  }
  point(clientX,clientY) { const r=this.canvas.getBoundingClientRect();return{x:(clientX-r.left-this.ox)/this.scale,y:(clientY-r.top-this.oy)/this.scale}; }
  screen(x,y) { const r=this.canvas.getBoundingClientRect();return{x:r.left+this.ox+x*this.scale,y:r.top+this.oy+y*this.scale}; }
  render(g, preview) {
    this.reduced=experience.reducedEffects();
    const close=this.closeCamera&&!this.overview;
    if(!g.building||!this.cameraReady){
      const next=battleViewport(this.w,this.h,WORLD,g.hero,{close});
      const blend=this.cameraReady&&this.cameraRun===g.runId&&this.scale===next.scale&&!this.reduced ? 0.14 : 1;
      this.scale=next.scale;this.ox+=(next.ox-this.ox)*blend;this.oy+=(next.oy-this.oy)*blend;
      this.cameraReady=true;this.cameraRun=g.runId;
    }
    const c=this.c;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.w,this.h);c.fillStyle='#213c2b';c.fillRect(0,0,this.w,this.h);
    c.translate(this.ox,this.oy);c.scale(this.scale,this.scale);
    if(this.shake>0&&!this.reduced){c.translate(Math.sin(g.time*100)*this.shake,Math.cos(g.time*90)*this.shake);this.shake*=.8;if(this.shake<.1)this.shake=0;}
    c.save();c.beginPath();c.rect(0,0,WORLD.width,WORLD.height);c.clip();
    const level=clamp(g.phase==='prep'&&!g.tutorial?.reward?g.wave+1:g.wave||1,1,8),bg=this.backgrounds[level-1];
    if(bg.complete&&bg.naturalWidth)c.drawImage(bg,0,0,WORLD.width,WORLD.height);
    else {c.fillStyle='#76904f';c.fillRect(0,0,WORLD.width,WORLD.height);}
    c.fillStyle='#15342326';c.fillRect(0,0,WORLD.width,WORLD.height);
    const vig=c.createRadialGradient(360,400,140,360,400,550);vig.addColorStop(0,'#0c302200');vig.addColorStop(1,'#0b241b8c');c.fillStyle=vig;c.fillRect(0,0,720,820);
    // Quiet ambient flecks are visual only; reduced-motion respects the system preference.
    for(let i=0;i<(this.reduced?5:15);i++){let x=(i*149+40)%680+20,y=(i*79+(!this.reduced?g.time*5:0))%760+20;ellipse(c,x,y,1.5,1.5,'#f6e6a269');}
    for(const b of g.buildings)if(b.type==='spring')this.aura(b,g.time);
    this.buildingRecoil=new Map(g.effects.filter(f=>f.buildingId!==undefined).map(f=>[f.buildingId,Math.sin((1-f.life/f.maxLife)*Math.PI)]));
    if(preview){c.strokeStyle='#f5eed41a';c.lineWidth=1;for(let x=60;x<680;x+=40){c.beginPath();c.moveTo(x,85);c.lineTo(x,735);c.stroke();}for(let y=95;y<735;y+=40){c.beginPath();c.moveTo(55,y);c.lineTo(665,y);c.stroke();}}
    this.objectiveGround(g.objective,g.time);
    const mapEvents=(g.eventPlan||[]).filter(mapEvent=>mapEvent.stage===g.wave&&mapEvent.status==='active');
    for(const mapEvent of mapEvents)this.mapEventGround(mapEvent,g.time);
    for(const enemy of g.enemies)if(enemy.elite)this.eliteGround(enemy,g.time);
    for(const n of g.nodes)if(n.hp>0)this.crystal(n);
    for(const d of g.drops){c.save();c.translate(d.x,d.y);c.rotate(Math.PI/4);c.fillStyle='#f8d276';c.fillRect(-5,-5,10,10);c.restore();ellipse(c,d.x-2,d.y-2,2,2,'#fff0b8');}
    for(const p of g.projectiles)if(p.kind==='shock-field')this.projectile(p);
    for(const e of g.enemies)if(e.windup>0)this.telegraph(e);
    const objectiveActors=g.objective?[g.objective.npc,g.objective.captive,...(g.objective.targets||[]),...(g.objective.points||[])].filter(Boolean):[];
    const objects=[{y:g.base.y,draw:()=>this.base(g.base,g.time,!!g.companion)},...g.buildings.map(b=>({y:b.y,draw:()=>this.building(b,g.time)})),...g.allies.map(a=>({y:a.y,draw:()=>this.ally(a,g.time)})),...objectiveActors.map(a=>({y:a.y,draw:()=>this.objectiveActor(a,g.objective,g.time)})),...mapEvents.map(mapEvent=>({y:mapEvent.y,draw:()=>this.mapEvent(mapEvent,g.time)})),...g.enemies.map(e=>({y:e.y,draw:()=>this.enemy(e,g.time)})),...(g.companion?[{y:g.companion.y,draw:()=>this.companion(g.companion,g.time)}]:[]),{y:g.hero.y,draw:()=>this.hero(g.hero,g.time)},...g.buildings.filter(b=>b.type==='nest').map(b=>({y:b.pet.y,draw:()=>this.pet(b.pet,g.time)}))].sort((a,b)=>a.y-b.y);
    objects.forEach(o=>o.draw());
    for(const e of g.enemies)if(e.hp>0&&e.weakpoint)this.weakpoint(e,g.time);
    for(const e of g.enemies)if(e.hp>0&&e.elite)this.eliteMark(e,g.time);
    const liveMotions=new Set([...g.allies.map(a=>'ally-'+a.id),...g.enemies.map(e=>'enemy-'+e.id)]);
    for(const key of this.actorMotions.keys())if((key.startsWith('ally-')||key.startsWith('enemy-'))&&!liveMotions.has(key))this.actorMotions.delete(key);
    for(const p of g.projectiles)if(p.kind!=='shock-field')this.projectile(p);
    const effects=this.reduced?g.effects.filter(f=>['text','beam','muzzle','slash','enemy-death','burst'].includes(f.kind)).slice(-45):g.effects;
    for(const f of effects)this.effect(f);
    if(preview)this.preview(g,preview);
    c.restore();
    const boss=g.enemies.find(e=>BOSS_NAMES[e.type]&&e.hp>0);if(boss){c.save();if(this.closeCamera){const s=Math.min(1,(this.w-24)/440);c.setTransform(this.dpr,0,0,this.dpr,0,0);c.translate((this.w-440*s)/2-140*s,145-90*s);c.scale(s,s);}const weak=boss.weakpoint,phase=Math.min(3,(boss.bossPhase||0)+1);c.fillStyle='#193323dd';c.fillRect(140,90,440,42);c.fillStyle=boss.type==='matriarch'?'#b9cf70':boss.type==='charger'?'#e2a765':'#f0a84f';c.fillRect(148,118,424*boss.hp/boss.maxHp,5);text(c,`${BOSS_NAMES[boss.type]} · 階段 ${phase}`,360,105,12,'#ffddad');text(c,weak?.broken?`${weak.name}已破壞`:weak?.open?`${weak.name}暴露中`:`${weak?.name||'弱點'}尚未暴露`,360,116,8,weak?.broken?'#9fd8ad':weak?.open?'#ffe19a':'#9eab94');c.restore();}
  }
  aura(b,t){const c=this.c;const r=CARDS.spring.range+(b.level-1)*14;c.beginPath();c.arc(b.x,b.y,r,0,Math.PI*2);c.fillStyle='#7cd3d718';c.fill();c.strokeStyle='#bbe2c337';c.setLineDash([6,8]);c.lineDashOffset=-t*7;c.stroke();c.setLineDash([]);}
  mapEventGround(event,t){const c=this.c,pulse=this.reduced?0:Math.sin(t*3.8)*4;c.save();c.beginPath();c.arc(event.x,event.y,event.r+18+pulse,0,Math.PI*2);c.fillStyle=event.type==='elite'?'#cf6c3b18':'#f0d07c13';c.fill();c.strokeStyle=event.type==='elite'?'#ff9b65aa':'#ffe2a28c';c.lineWidth=2;c.setLineDash([8,7]);c.lineDashOffset=this.reduced?0:-t*15;c.stroke();c.setLineDash([]);c.restore();}
  mapEvent(event,t){const c=this.c,d=MAP_EVENT_DEFS[event.type],bob=this.reduced?0:Math.sin(t*2.8)*1.5;c.save();c.translate(event.x,event.y+bob);ellipse(c,0,18,event.r+9,11,'#11261e70');
    if(event.type==='merchant'){polygon(c,[[-29,-12],[-21,-43],[23,-43],[31,-12]],'#bd8250','#f0d29a');polygon(c,[[-30,-42],[31,-42],[22,-56],[-20,-56]],'#d4a45e','#ffe0a0');line(c,[[-23,-12],[-23,17]],'#795d3d',5);line(c,[[24,-12],[24,17]],'#795d3d',5);ellipse(c,2,-19,11,13,'#c99a70');polygon(c,[[-12,-8],[14,-8],[18,17],[-17,17]],'#426e5d');text(c,'◆',1,-26,12,'#ffe19a');}
    else if(event.type==='ruin'){polygon(c,[[-29,17],[-24,-36],[-12,-48],[-7,17]],'#77806a','#c8c291');polygon(c,[[8,17],[12,-48],[26,-36],[30,17]],'#77806a','#c8c291');line(c,[[-18,-36],[19,-36]],'#d1c89b',9);polygon(c,[[0,-28],[11,-13],[0,2],[-11,-13]],'#d9b963','#fff0ae');}
    else if(event.type==='hunter'){polygon(c,[[-30,13],[-12,3],[18,8],[31,18]],'#396a58');ellipse(c,-16,-1,10,11,'#d1a072');polygon(c,[[-25,-8],[-17,-22],[-5,-7]],'#315744');line(c,[[6,6],[24,-10]],'#e2d19d',3);line(c,[[17,-12],[29,-17]],'#e2d19d',2);text(c,'+',19,-28,19,'#9ee0ba');}
    else if(event.type==='chest'){polygon(c,[[-29,-3],[29,-3],[25,22],[-25,22]],'#8b5d31','#e5bb6b');polygon(c,[[-29,-4],[-22,-25],[22,-25],[29,-4]],'#b0783b','#f1cf7d');line(c,[[0,-24],[0,22]],'#e8c778',5);polygon(c,[[-7,-7],[7,-7],[8,7],[-8,7]],'#f3dc8e','#6d5630');}
    else {polygon(c,[[-9,18],[-5,-36],[6,-36],[10,18]],'#8a714d','#d7bf82');polygon(c,[[-22,-32],[0,-55],[23,-32],[10,-25],[0,-37],[-10,-25]],'#be7148','#ffd08a');ellipse(c,0,-8,8,8,'#f2c66f');}
    text(c,d.name,0,event.r+34,11,event.type==='elite'?'#ffc29b':'#ffe8b2');text(c,event.type==='elite'?'擊敗金印獸群':controlLabel('靠近後點互動','E'),0,event.r+47,8,'#d6ddbb');c.restore();}
  eliteGround(e,t){const c=this.c,pulse=this.reduced?0:Math.sin(t*6)*3;c.save();c.beginPath();c.arc(e.x,e.y,e.r+12+pulse,0,Math.PI*2);c.fillStyle='#f0b25a14';c.fill();c.strokeStyle='#ffd37f';c.lineWidth=3;c.setLineDash([5,5]);c.stroke();c.setLineDash([]);c.restore();}
  eliteMark(e){text(this.c,'精英',e.x,e.y-e.r-24,9,'#ffd88c');}
  ally(a,t){const c=this.c,pose=this.actorPose('ally-'+(a.id??'preview'),a,t,76);ellipse(c,a.x,a.y+13,21,8,'#132a2559');const animated=a.type==='hunter'&&drawCharacter(c,'hunter',a.x,a.y+13,pose,{height:78});if(animated||drawSprite(c,a.type,a.x,a.y+17,{height:78,flip:pose.flip})){text(c,a.type==='guard'?'盾衛':'弓手',a.x,a.y+29,10,'#edf0bf');this.healthbar(a.x,a.y+35,35,a.hp/a.maxHp,'#9bd3b4');return;}c.save();c.translate(a.x,a.y);ellipse(c,0,11,19,8,'#112e2966');const guard=a.type==='guard';polygon(c,[[-10,-15],[10,-15],[14,12],[-14,12]],guard?'#998254':'#568675','#25493b');ellipse(c,0,-24,10,12,'#d2a375');if(guard){polygon(c,[[-11,-26],[-9,-37],[8,-37],[11,-26]],'#bdcebb');polygon(c,[[1,-12],[20,-17],[20,2],[11,14],[1,4]],'#728d6a','#e5d5a3');line(c,[[-16,-33],[-16,14]],'#d5caa1',3);}else{polygon(c,[[-12,-26],[0,-41],[14,-27]],'#365e47');c.beginPath();c.arc(9,-9,21,-1.25,1.25);c.strokeStyle='#e5cf98';c.lineWidth=3;c.stroke();line(c,[[16,-29],[16,11]],'#e5cf98',1);line(c,[[-2,-8],[30,-8]],'#d9c394',2);}text(c,guard?'盾衛':'弓手',0,27,10,'#edf0bf');this.healthbar(0,33,35,a.hp/a.maxHp,'#9bd3b4');c.restore();}
  crystal(n){const c=this.c,variant=(Math.round(n.x*3+n.y*5)%7)/7,height=57+variant*7,rotation=(variant-.5)*.07;
    if(n.objectiveKind==='ore'){c.save();c.beginPath();c.arc(n.x,n.y,34,0,Math.PI*2);c.setLineDash([7,6]);c.strokeStyle='#ffe18db8';c.lineWidth=3;c.stroke();c.setLineDash([]);text(c,'限時熔晶',n.x,n.y+42,9,'#ffe9ae');c.restore();}
    ellipse(c,n.x,n.y+11,24,8,'#142d2452');ellipse(c,n.x,n.y-3,27,25,'#f6b52f13');
    if(drawSprite(c,'amber-crystal',n.x,n.y+17,{height,anchorY:.91,rotation}))return;
    polygon(c,[[n.x-13,n.y+13],[n.x-18,n.y-7],[n.x-5,n.y-27],[n.x+5,n.y-9],[n.x+2,n.y+15]],'#d7a74c','#6d713e');polygon(c,[[n.x-5,n.y-27],[n.x+5,n.y-9],[n.x+2,n.y+15],[n.x-4,n.y+5]],'#f0ce7a');polygon(c,[[n.x+3,n.y+11],[n.x+9,n.y-13],[n.x+20,n.y-4],[n.x+17,n.y+15]],'#edd17f','#7c7944');}
  base(b,t,hatched=false){const c=this.c;ellipse(c,b.x,b.y+24,61,21,'#132b205c');ellipse(c,b.x,b.y+3,55,42,hatched?'#7bd9c217':'#f3b84b17');
    if(hatched){for(let i=0;i<8;i++){const a=i*Math.PI/4;polygon(c,[[b.x+Math.cos(a)*31,b.y+Math.sin(a)*18],[b.x+Math.cos(a-.16)*51,b.y+Math.sin(a-.16)*31],[b.x+Math.cos(a+.16)*51,b.y+Math.sin(a+.16)*31]],i%2?'#c9b57b':'#eee3bc','#796f4c');}ellipse(c,b.x,b.y-3,31,18,'#244f45');ellipse(c,b.x,b.y-5,22,12,'#76c9b4');for(let i=0;i<5;i++){const a=i*Math.PI*2/5+(this.reduced?0:t*.18);ellipse(c,b.x+Math.cos(a)*24,b.y-5+Math.sin(a)*11,3,3,'#f7dda0');}}
    const painted=!hatched&&drawSprite(c,'sacred-egg',b.x,b.y+43,{height:126+(this.reduced?0:Math.sin(t*1.55)*1.1)});
    if(!hatched&&!painted){ellipse(c,b.x,b.y,51,31,'#6b5c35');ellipse(c,b.x,b.y-4,43,25,'#a2915a');ellipse(c,b.x,b.y-7,36,19,'#405239');for(let i=0;i<9;i++){let a=i/9*Math.PI*2;line(c,[[b.x+Math.cos(a)*42,b.y+Math.sin(a)*24],[b.x+Math.cos(a+.6)*48,b.y+Math.sin(a+.6)*27]],'#c8b276',4);}c.save();c.translate(b.x,b.y-17);c.rotate(-.15);ellipse(c,0,0,21,30,'#edf0cf');polygon(c,[[3,-19],[11,-9],[6,0],[-2,-5]],'#b3c798');c.restore();}
    text(c,hatched?'聖 獸 靈 巢':'聖 獸 卵',b.x,b.y+58,12,'#fff0c8');this.healthbar(b.x,b.y+68,82,b.hp/b.maxHp,'#d9e5a9');}
  building(b,t,ghost=false){const c=this.c;c.save();c.translate(b.x,b.y);if(ghost)c.globalAlpha=.6;ellipse(c,0,14,b.r+9,11,'#18322355');
    let painted=false;
    const recoil=ghost||this.reduced?0:(this.buildingRecoil?.get(b.id)||0);
    if(b.type==='watchtower')painted=drawSprite(c,'building-watchtower',0,31+recoil*3,{height:106-recoil*2});
    if(b.type==='catapult')painted=drawSprite(c,'building-catapult',0,31+recoil*4,{height:104-recoil*3});
    if(['torch','wall','nest','spring'].includes(b.type))painted=drawSprite(c,`building-${b.type}`,0,28,{height:{torch:104,wall:87,nest:90,spring:96}[b.type]});
    if(!painted&&b.type==='torch'){polygon(c,[[-14,14],[-11,-22],[9,-22],[15,14]],'#93856b','#586346');polygon(c,[[-11,-22],[0,-29],[9,-22],[-1,-14]],'#c3b585');line(c,[[-3,-12],[-3,10]],'#b6a577',3);polygon(c,[[-20,-26],[18,-26],[12,-15],[-14,-15]],'#b5a079','#637450');const f=2+Math.sin(t*12)*3;polygon(c,[[-14,-28],[-16,-42],[-8,-51],[-5,-40],[2,-65-f],[15,-45],[12,-29],[3,-22]],'#f6ae51');polygon(c,[[-8,-27],[-6,-42],[1,-35],[5,-50],[10,-35],[5,-24]],'#ffe7a7');ellipse(c,0,-29,38,32,'#fac57411');}
    if(!painted&&b.type==='wall'){for(let i=-1;i<=1;i++){let x=i*20;polygon(c,[[x-7,10],[x-6,-25],[x,-40-Math.abs(i)*-9],[x+7,-25],[x+7,10]],'#ddd7b4','#7a7f52');line(c,[[x-1,-24],[x-1,8]],'#f6ebc6',2);}line(c,[[-34,-12],[32,-7]],'#8e744a',8);line(c,[[-33,-14],[31,-9]],'#baa06b',2);for(let i=-1;i<=1;i++)line(c,[[i*20-3,-17],[i*20+2,-4]],'#d1b77c',2);}
    if(!painted&&b.type==='nest'){ellipse(c,0,3,28,18,'#88744a');ellipse(c,0,-2,23,13,'#5b683e');line(c,[[-24,3],[-10,15],[17,10],[25,2]],'#c2ae6c',4);ellipse(c,-8,-7,10,14,'#e6e2b6');ellipse(c,9,-5,9,12,'#c4d09d');ellipse(c,-7,-10,3,3,'#b4bc85');}
    if(!painted&&b.type==='spring'){ellipse(c,0,5,31,20,'#829787');ellipse(c,0,1,25,14,'#67adb1');ellipse(c,0,-1,18,8,'#90d1cb');for(let i=0;i<3;i++){c.beginPath();c.ellipse(0,1,10+i*5+Math.sin(t*3+i),4+i*2,0,0,Math.PI*2);c.strokeStyle='#c8f0db66';c.lineWidth=1.5;c.stroke();}polygon(c,[[-7,-8],[-4,-24],[0,-36],[6,-24],[9,-10],[1,-3]],'#b5e5d8');}
    if(!ghost){for(let i=0;i<b.level;i++)ellipse(c,(i-(b.level-1)/2)*8,27,2.2,2.2,'#f4d598');if(b.hp<b.maxHp)this.healthbar(0,34,42,b.hp/b.maxHp,'#cfdbad');}c.restore();}
  actorPose(key,actor,t,stride=82){if(!this.actorMotions.has(key))this.actorMotions.set(key,new ActorMotion({stride}));return this.actorMotions.get(key).update(actor,t,{reduced:this.reduced});}
  hero(h,t){const c=this.c,pose=this.walkArt.update(h,t,{reduced:this.reduced});
    ellipse(c,h.x,h.y+13,23,9,'#14261765');if(drawRanger(c,h,t,{moving:pose.moving,step:this.walkArt.step,reduced:this.reduced,pose}))return;
    c.save();c.translate(h.x,h.y);if(h.invulnerable>0&&Math.floor(t*20)%2)c.globalAlpha=.55;const facing=Math.cos(h.angle)>=0?1:-1;c.scale(facing,1);const bob=h.dashTime>0?0:Math.sin(t*5)*.8;c.translate(0,bob);
    polygon(c,[[-10,-20],[-22,8],[2,15],[14,-7],[9,-23]],'#34766b','#17463b');polygon(c,[[-10,-20],[-19,8],[-10,4],[-3,-20]],'#619887');line(c,[[-6,4],[-9,15]],'#573f2b',9);line(c,[[7,3],[10,14]],'#67472e',9);ellipse(c,-8,15,7,4,'#3c3b29');ellipse(c,11,15,7,4,'#3c3b29');polygon(c,[[-10,-21],[8,-22],[13,4],[-8,6]],'#ad7f4d','#73583a');line(c,[[-10,-17],[9,-2]],'#ead9a5',4);ellipse(c,0,-30,14,16,'#c99362');polygon(c,[[-15,-29],[-14,-40],[-5,-48],[8,-44],[15,-32],[7,-36],[0,-38],[-7,-27]],'#3c3427');line(c,[[-13,-34],[10,-38]],'#b9d3a5',3);ellipse(c,8,-30,2,2,'#273023');ellipse(c,5,-22,4,2,'#dca278');line(c,[[8,-17],[22,-10]],'#c38d5d',7);
    c.save();c.translate(21,-10);c.rotate((h.swing>0?-.55:.15));if(h.weapon==='spear'){line(c,[[0,-26],[0,25]],'#c5aa73',4);polygon(c,[[0,-43],[-6,-25],[0,-20],[7,-26]],'#f1e5ba','#8e9774');}else if(h.weapon==='bow'){c.beginPath();c.moveTo(-4,-29);c.quadraticCurveTo(20,0,-4,29);c.quadraticCurveTo(-12,0,-4,-29);c.strokeStyle='#e1ca8c';c.lineWidth=4;c.stroke();line(c,[[-6,-28],[-6,28]],'#eee6c8',1.5);line(c,[[-6,0],[25,0]],'#c5aa73',3);}else if(h.weapon==='blades'){line(c,[[-7,-24],[5,25]],'#e8dfbb',5);line(c,[[8,-24],[-2,25]],'#e8dfbb',5);line(c,[[-13,12],[11,12]],'#c79a5d',4);}else if(h.weapon==='hammer'){line(c,[[0,-12],[0,27]],'#a47b4c',7);polygon(c,[[-19,-30],[19,-30],[23,-10],[-23,-10]],'#ddd3aa','#80876d');}else{line(c,[[0,-26],[0,25]],'#c5aa73',4);polygon(c,[[-1,-28],[15,-32],[23,-17],[14,-10],[0,-14]],'#e5d9ac','#92997a');}c.restore();c.restore();
    const v={x:h.x+Math.cos(h.angle)*37,y:h.y+Math.sin(h.angle)*37};this.c.strokeStyle='#e6eab57a';this.c.lineWidth=2;this.c.beginPath();this.c.arc(h.x,h.y,34,h.angle-.25,h.angle+.25);this.c.stroke();
  }
  enemy(e,t){const c=this.c,size=ENEMY_SIZE[e.type]||78,stride={raptor:62,spitter:74,brute:92,matriarch:124,charger:142,boss:130}[e.type],pose=this.actorPose('enemy-'+e.id,e,t,stride),flip=pose.flip;
    const cycle=pose.phase*Math.PI*2,moving=pose.amount,maxWind={boss:1.1,charger:1,matriarch:.9}[e.type]||.6,wind=e.windup>0?Math.max(0,Math.min(1,1-e.windup/maxWind)):0,attackPulse=Math.sin(wind*Math.PI);
    let lift=0,sx=1,sy=1,rot=0;
    if(!this.reduced&&moving){
      if(e.type==='raptor'){lift=Math.max(0,Math.sin(cycle))*4.2*moving;rot=Math.sin(cycle)*.035*moving;sx+=Math.cos(cycle)*.022*moving;sy-=Math.cos(cycle)*.018*moving;}
      else if(e.type==='spitter'){lift=(1-Math.cos(cycle))*1.3*moving;rot=Math.sin(cycle)*.025*moving;sx+=Math.sin(cycle)*.018*moving;sy-=Math.sin(cycle)*.012*moving;}
      else {lift=Math.max(0,Math.sin(cycle))*1.6*moving;rot=Math.sin(cycle)*.014*moving;sx+=Math.cos(cycle)*.012*moving;sy-=Math.cos(cycle)*.01*moving;}
    }
    if(e.windup>0&&!this.reduced){sx+=attackPulse*(e.type==='spitter'||e.type==='matriarch'?.08:.055);sy-=attackPulse*(e.type==='spitter'||e.type==='matriarch'?.1:.06);rot+=(flip?-1:1)*attackPulse*(e.type==='boss'||e.type==='charger'?.025:.045);}
    if(e.flash>0&&!this.reduced){sx*=1.055;sy*=.945;}
    const lunge=this.reduced?0:attackPulse*({raptor:14,brute:8,spitter:4,matriarch:6,charger:16,boss:10}[e.type]||6),dx=Math.cos(e.angle)*lunge,dy=Math.sin(e.angle)*lunge*.58,boss=Boolean(BOSS_NAMES[e.type]);
    ellipse(c,e.x+dx*.35,e.y+e.r+7,(boss?59:e.type==='brute'?37:25)*(1-lift*.008),boss?17:10,'#10251d69');
    c.save();c.translate(e.x+dx,e.y+dy-lift);c.rotate(rot);c.scale(sx,sy);
    const painted=drawSprite(c,`enemy-${e.type}`,0,e.r+9,{height:size,flip,alpha:e.flash>0?.58:1});c.restore();
    if(painted){
      if(e.burn>0)text(c,'♨',e.x,e.y-e.r-18,18,'#ffc272');
      if(e.hp<e.maxHp)this.healthbar(e.x,e.y+e.r+13,boss?104:e.type==='brute'?48:38,e.hp/e.maxHp,boss?'#f4b05f':'#e6a179');
      return;
    }
    c.save();c.translate(e.x,e.y);const scale=boss?2.2:e.type==='brute'?1.3:1;c.scale(scale,scale);const face=flip?-1:1;c.scale(face,1);ellipse(c,0,11,22,9,'#213f2859');let body=e.type==='brute'?'#917052':e.type==='spitter'||e.type==='matriarch'?'#977f72':e.type==='charger'?'#8c704f':e.type==='boss'?'#956747':'#b48f63';if(e.flash>0)body='#f5e9ca';
    polygon(c,[[-14,-3],[-38,-16],[-27,3],[-11,8]],body,'#575f3c');ellipse(c,0,0,21,14,body);ellipse(c,16,-9,17,13,body);ellipse(c,25,-5,12,7,body);polygon(c,[[9,-20],[4,-34],[18,-21]],'#d3be85');ellipse(c,21,-13,3,3,'#273220');ellipse(c,22,-14,1,1,'#f9dfa0');line(c,[[28,-3],[35,-3]],'#624f39',2);line(c,[[-10,8],[-14,19]],body,8);line(c,[[9,7],[15,17]],body,7);for(let i=0;i<3;i++)polygon(c,[[-17+i*9,-10],[-17+i*9,-18],[-8+i*9,-12]],'#6a784b');if(e.type==='brute'||boss){ellipse(c,-2,-1,17,10,'#717d52');line(c,[[-13,-5],[8,7]],'#a0a478',3);}if(e.type==='spitter'||e.type==='matriarch')ellipse(c,26,0,6,5,'#b8d36d');c.restore();if(e.burn>0){text(c,'♨',e.x,e.y-e.r-10,18,'#ffc272');}if(e.hp<e.maxHp)this.healthbar(e.x,e.y+e.r+10,boss?90:35,e.hp/e.maxHp,boss?'#f4b05f':'#e6a179');}
  weakpoint(e,t){const c=this.c,w=e.weakpoint,d=BOSS_WEAKPOINTS[e.type];if(!w||!d)return;c.save();if(w.broken){c.globalAlpha=.72;for(let i=0;i<4;i++){const a=i*Math.PI/2+.4;polygon(c,[[w.x+Math.cos(a)*5,w.y+Math.sin(a)*3],[w.x+Math.cos(a-.35)*15,w.y+Math.sin(a-.35)*10],[w.x+Math.cos(a+.35)*13,w.y+Math.sin(a+.35)*9]],'#75664d');}c.restore();return;}const pulse=this.reduced?0:Math.sin(t*7)*3;if(w.open){c.beginPath();c.arc(w.x,w.y,w.r+10+pulse,0,Math.PI*2);c.fillStyle=`${d.color}25`;c.fill();c.strokeStyle=d.color;c.lineWidth=3;c.setLineDash([6,5]);c.stroke();c.setLineDash([]);}polygon(c,[[w.x,w.y-w.r],[w.x+w.r*.8,w.y],[w.x,w.y+w.r],[w.x-w.r*.8,w.y]],w.open?d.color:'#6d705b',w.open?'#fff0b1':'#a69d76');ellipse(c,w.x-3,w.y-4,4,4,w.open?'#fff6c7':'#8c8d76');if(w.open){text(c,w.name,w.x,w.y-w.r-14,10,'#fff0ba');this.healthbar(w.x,w.y+w.r+10,52,w.hp/w.maxHp,d.color);}c.restore();}
  pet(p,t){const c=this.c;ellipse(c,p.x,p.y+11,24,9,'#132a254f');if(drawSprite(c,'pet',p.x,p.y+14,{height:47,rotation:this.reduced?0:Math.sin(t*3)*.015}))return;c.save();c.translate(p.x,p.y);c.scale(.72,.72);ellipse(c,0,10,22,9,'#17392440');polygon(c,[[-15,-1],[-33,-9],[-28,5],[-11,10]],'#8ca56e');ellipse(c,0,0,21,15,'#92b77c');ellipse(c,15,-9,17,15,'#a6c98a');polygon(c,[[22,-18],[31,-29],[29,-13]],'#ede2b7');polygon(c,[[9,-23],[9,-32],[15,-21]],'#ede2b7');ellipse(c,23,-8,2.5,3,'#27462e');line(c,[[-10,10],[-12,17]],'#6f915a',7);line(c,[[9,9],[12,16]],'#6f915a',7);c.restore();}
  companion(p,t,camp=false){const c=this.c,d=COMPANIONS[p.type];if(!d)return;const moving=Math.hypot(p.vx||0,p.vy||0)>.5,bob=this.reduced?0:Math.sin(t*(moving?8:3.2))*1.5,flip=Math.cos(p.angle||0)<0,height=(camp?92:74)+Math.min(18,(p.level-1)*2);
    ellipse(c,p.x,p.y+14,height*.3,10,'#132a2558');
    if(!drawSprite(c,`companion-${p.type}`,p.x,p.y+18+bob,{height,flip})){this.pet(p,t);return;}
    if(!camp){text(c,`${d.name} · Lv.${p.level}`,p.x,p.y+33,9,'#f7e8b6');this.healthbar(p.x,p.y+39,43,p.hp/p.maxHp,d.color);}
  }
  objectiveGround(o,t){
    if(!o)return;const c=this.c,pulse=this.reduced?0:(Math.sin(t*4)+1)*.5;c.save();c.lineWidth=3;c.setLineDash([10,10]);c.lineDashOffset=this.reduced?0:-t*18;
    if(o.type==='escort'&&!o.npc.reached){c.beginPath();c.moveTo(o.npc.x,o.npc.y);for(let i=o.npc.waypoint;i<ESCORT_PATH.length;i++)c.lineTo(ESCORT_PATH[i].x,ESCORT_PATH[i].y);c.strokeStyle='#a9e1b58f';c.stroke();}
    const rings=o.type==='rescue'?[o.captive]:o.type==='strongholds'?o.points:o.type==='destroy'?o.targets:[];
    for(const actor of rings){if(actor.hp<=0&&o.type!=='rescue')continue;c.beginPath();c.arc(actor.x,actor.y,actor.r+18+pulse*4,0,Math.PI*2);c.strokeStyle=o.type==='destroy'?'#ef9567b0':o.type==='rescue'?'#8ed8bda8':'#e7d184a8';c.stroke();}
    c.setLineDash([]);c.restore();
  }
  objectiveActor(a,o,t){
    const c=this.c;if(a.objectiveKind==='escort'){ellipse(c,a.x,a.y+13,23,8,'#10251d65');const pose=this.actorPose('objective-'+a.id,a,t,75);drawCharacter(c,'hunter',a.x,a.y+13,pose,{height:76});text(c,'採集師',a.x,a.y+33,10,'#d9f0c8');this.healthbar(a.x,a.y+40,46,a.hp/a.maxHp,'#9bd3b4');return;}
    if(a.objectiveKind==='captive'){ellipse(c,a.x,a.y+13,25,9,'#10251d65');if(!o.rescued){const pose=this.actorPose('objective-'+a.id,a,t,75);drawCharacter(c,'hunter',a.x,a.y+13,pose,{height:72});for(const x of[-22,-7,8,23])line(c,[[a.x+x,a.y-43],[a.x+x,a.y+24]],'#c7b986',4);line(c,[[a.x-25,a.y-43],[a.x+26,a.y-43]],'#ece0b4',5);text(c,'救援中',a.x,a.y+42,10,'#c8ead2');}else text(c,'已獲救',a.x,a.y+8,11,'#bde5c8');return;}
    if(a.objectiveKind==='nest'){ellipse(c,a.x,a.y+15,38,13,'#281d176b');for(let i=0;i<7;i++){const angle=i/7*Math.PI*2;polygon(c,[[a.x+Math.cos(angle)*16,a.y+Math.sin(angle)*9],[a.x+Math.cos(angle-.13)*38,a.y+Math.sin(angle-.13)*28-8],[a.x+Math.cos(angle+.13)*35,a.y+Math.sin(angle+.13)*24]],i%2?'#b38a58':'#ddc58d','#604933');}ellipse(c,a.x,a.y,25,18,'#674b38');ellipse(c,a.x,a.y-3,16,10,'#302821');text(c,'敵對獸巢',a.x,a.y+45,10,'#ffd0ad');this.healthbar(a.x,a.y+52,58,a.hp/a.maxHp,'#e58d65');return;}
    if(a.objectiveKind==='stronghold'){ellipse(c,a.x,a.y+16,37,12,'#10251d69');polygon(c,[[a.x-19,a.y+14],[a.x-12,a.y-28],[a.x,a.y-45],[a.x+13,a.y-27],[a.x+20,a.y+14]],'#9d986d','#e4d39a');polygon(c,[[a.x-7,a.y-20],[a.x,a.y-34],[a.x+8,a.y-20],[a.x,a.y-8]],'#d6bd6d');text(c,a.label,a.x,a.y+37,9,'#f0e2b0');this.healthbar(a.x,a.y+44,54,a.hp/a.maxHp,'#d8ce83');}
  }
  telegraph(e){const c=this.c;c.save();
    if(e.type==='charger'){
      c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.lockX,e.lockY);c.strokeStyle='#e9864b32';c.lineWidth=e.r*(e.bossPhase===2?1.58:1.25);c.lineCap='round';c.stroke();c.setLineDash([8,7]);line(c,[[e.x,e.y],[e.lockX,e.lockY]],'#ffc085c7',3);c.setLineDash([]);
    }else{
      const r=e.type==='boss'?(e.bossPhase===2?122:e.bossPhase===1?108:84):e.type==='matriarch'&&e.attackKind==='brood-pool'?(e.bossPhase===2?118:94):e.type==='matriarch'?24:e.type==='spitter'?17:30;c.beginPath();c.arc(e.lockX,e.lockY,r,0,Math.PI*2);c.fillStyle=e.type==='matriarch'?'#a8cf5d2e':'#e879502b';c.fill();c.strokeStyle=e.type==='matriarch'?'#d8ee8fc0':'#ffad80b3';c.lineWidth=2;c.setLineDash([5,5]);c.stroke();c.setLineDash([]);
      if(e.type==='boss'&&e.bossPhase===2){c.beginPath();c.arc(e.lockX,e.lockY,176,0,Math.PI*2);c.strokeStyle='#ffd078b8';c.lineWidth=4;c.setLineDash([12,8]);c.stroke();c.setLineDash([]);}
      if(e.type==='spitter'||e.type==='matriarch')line(c,[[e.x,e.y],[e.lockX,e.lockY]],e.type==='matriarch'?'#cde68b7d':'#ecc38465',2);
    }c.restore();}
  projectile(p){const c=this.c;if(p.kind==='shock-field'){const a=clamp(p.life/p.maxLife,0,1),pulse=.55+.1*Math.sin(p.life*7),g=c.createRadialGradient(p.x,p.y,10,p.x,p.y,p.radius);g.addColorStop(0,`rgba(129,207,181,${.16*a})`);g.addColorStop(.72,`rgba(114,190,168,${.1*a})`);g.addColorStop(1,'rgba(93,169,151,0)');c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,p.radius,0,Math.PI*2);c.fill();c.save();c.globalAlpha=a;c.beginPath();c.arc(p.x,p.y,p.radius*pulse,0,Math.PI*2);c.strokeStyle='#b9ead1';c.lineWidth=3;c.setLineDash([9,10]);c.stroke();c.setLineDash([]);c.restore();return;}if(p.hostile){ellipse(c,p.x,p.y,8,8,'#bad56b');ellipse(c,p.x-2,p.y-2,3,3,'#e1f19a');return;}if(p.kind==='catapult'){const progress=clamp(1-p.life/p.maxLife,0,1),lift=Math.sin(progress*Math.PI)*78;ellipse(c,p.x,p.y+6,11*(1-lift/260),5*(1-lift/260),'#142a205c');c.save();c.translate(p.x,p.y-lift);c.rotate(progress*Math.PI*3);ellipse(c,0,0,11,9,'#e7a632');polygon(c,[[-7,-6],[-1,-11],[8,-7],[10,2],[3,9],[-8,6]],'#efb743','#8b6732');ellipse(c,-2,-3,4,3,'#fff0a2');c.restore();return;}if(p.kind==='companion-tide'){ellipse(c,p.x,p.y,12,12,'#65d7d2');ellipse(c,p.x-2,p.y-2,6,6,'#d9fff3');c.beginPath();c.arc(p.x,p.y,17,0,Math.PI*2);c.strokeStyle='#a9f3e5a0';c.stroke();return;}c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));if(p.kind==='tower-bolt'){line(c,[[-13,0],[9,0]],'#d9c493',3);polygon(c,[[17,0],[7,-5],[9,0],[7,5]],'#f1e4c1');line(c,[[-14,-4],[-7,0],[-14,4]],'#b5a675',2);c.restore();return;}if(p.kind==='arrow'){line(c,[[-17,0],[10,0]],'#d9c493',2.5);polygon(c,[[18,0],[8,-4],[10,0],[8,4]],'#edf0ce');line(c,[[-17,-4],[-10,0],[-17,4]],'#a9c48c',2);c.restore();return;}if(p.kind==='quake-wave'){c.globalAlpha=.82;polygon(c,[[-24,-27],[18,-20],[31,0],[18,20],[-24,27],[-10,0]],'#d2a654','#f1d28b');line(c,[[-18,-15],[13,-8],[22,0],[10,9],[-18,16]],'#ffe6a4',3);c.restore();return;}if(drawSprite(c,'spear',0,0,{height:42,anchorY:.5,rotation:Math.PI/2})){if(p.fire){line(c,[[-33,0],[-16,0]],'#ed985a99',5);line(c,[[-28,-2],[-13,0]],'#ffe6a9',2);}c.restore();return;}line(c,[[-19,0],[9,0]],p.fire?'#ffba63':'#dbc597',3);polygon(c,[[17,0],[5,-5],[7,0],[5,5]],p.fire?'#ffe6a9':'#f4ebce');if(p.fire){line(c,[[-35,-3],[-18,0]],'#ec935a88',4);line(c,[[-29,5],[-15,0]],'#ffd17d88',3);}c.restore();}
  effect(f){const c=this.c;const a=clamp(f.life/f.maxLife,0,1),age=1-a;c.save();c.globalAlpha=a;
    if(f.kind==='text'){text(c,f.text,f.x,f.y-age*32,15,f.color,700);}
    else if(f.kind==='beam'){line(c,[[f.x,f.y],[f.tx,f.ty]],f.color,3);}
    else if(f.kind==='muzzle'){c.save();c.translate(f.x,f.y);c.rotate(f.angle);polygon(c,[[0,0],[-12,-7],[5,-3],[17,0],[5,3],[-12,7]],f.color);ellipse(c,3,0,4,4,'#fff7ce');c.restore();}
    else if(f.kind==='launch-dust'){for(let i=0;i<5;i++){const an=i*Math.PI*2/5+.4,r=f.r*age;ellipse(c,f.x+Math.cos(an)*r,f.y+Math.sin(an)*r*.35,5*(1-age)+2,3*(1-age)+1,f.color);}}
    else if(f.kind==='slash'){c.beginPath();c.arc(f.x,f.y,f.r*(.6+age*.4),f.angle-f.spread,f.angle+f.spread);c.lineWidth=7*(1-age)+2;c.strokeStyle=f.color;c.stroke();}
    else if(f.kind==='trail'){ellipse(c,f.x,f.y,12,16,f.color);}
    else if(f.kind==='enemy-death'){
      const size=ENEMY_SIZE[f.type]||78,flip=Math.cos(f.angle||0)<0;
      ellipse(c,f.x,f.y+(f.r||20)+8,Math.max(12,(f.r||20)*(1-age*.55)),7,'#10251d55');
      c.save();c.translate(f.x,f.y+age*15);c.rotate((flip?-1:1)*age*.38);c.scale(1+age*.08,1-age*.35);
      drawSprite(c,`enemy-${f.type}`,0,(f.r||20)+9,{height:size,flip,alpha:a});c.restore();
    }
    else {const r=f.r*(.25+age*.75);c.beginPath();c.arc(f.x,f.y,r,0,Math.PI*2);c.strokeStyle=f.color;c.lineWidth=f.kind==='burst'?6:2;c.stroke();for(let i=0;i<7;i++){let an=i*Math.PI*2/7;ellipse(c,f.x+Math.cos(an)*r,f.y+Math.sin(an)*r,3*(1-age)+1,3*(1-age)+1,f.color);}}
    c.restore();
  }
  preview(g,p){const c=this.c;const type=g.hand[p.slot];if(!type)return;const target=g.placement(p.slot,p.x,p.y);const x=target.ok?target.x:p.x,y=target.ok?target.y:p.y;c.save();c.beginPath();c.arc(x,y,DEPLOY_CARDS[type].range,0,Math.PI*2);c.fillStyle=target.ok?'#ddec9d15':'#d3666618';c.fill();c.strokeStyle=target.ok?'#edeca0c4':'#ef9c85';c.setLineDash([6,6]);c.lineWidth=2;c.stroke();c.setLineDash([]);if(HIRES[type]){c.globalAlpha=.65;this.ally({x,y,type,hp:1,maxHp:1},g.time);c.globalAlpha=1;}else this.building({x,y,type,r:CARDS[type].radius},g.time,true);text(c,target.ok?(target.hire?'放開派遣':target.upgrade?'疊卡升級':'放開建造'):target.reason,x,Math.min(720,y+62),13,target.ok?'#fef2c0':'#ffc1a1');c.restore();}
  healthbar(x,y,w,v,color){const c=this.c;c.fillStyle='#193322bf';c.fillRect(x-w/2,y,w,4);c.fillStyle=color;c.fillRect(x-w/2,y,w*clamp(v,0,1),4);}
}
