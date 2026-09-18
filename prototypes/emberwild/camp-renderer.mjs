import {Painter} from './art.mjs';
import {CAMP_WORLD,CAMP_SITES} from './camp-world.mjs';
import {FACILITIES} from './camp.mjs';
import {drawSprite} from './painted-art.mjs';
import {drawCharacter} from './character-art.mjs';
import {CampResidents} from './camp-residents.mjs';
import {experience} from './experience.mjs';
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();};
const poly=(c,p,color,edge)=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=2;c.stroke();}};
const line=(c,p,color,w=2)=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.stroke();};
const text=(c,s,x,y,size=13,color='#f2e1b6')=>{c.fillStyle=color;c.font=`600 ${size}px -apple-system,"PingFang TC",sans-serif`;c.textAlign='center';c.fillText(s,x,y);};
export class CampRenderer extends Painter{
 constructor(canvas){super(canvas);this.camera={x:0,y:0};this.snap=true;this.residents=new CampResidents();this.residentTime=0;}
 resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width||1000;this.h=r.height||700;this.dpr=experience.renderScale();this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.scale=this.w<760?Math.max(.68,Math.min(.88,this.w/500)):Math.max(.72,Math.min(1.25,this.h/760));this.visible={w:this.w/this.scale,h:this.h/this.scale};this.snap=true;}
 point(x,y){const r=this.canvas.getBoundingClientRect();return{x:(x-r.left)/this.scale+this.camera.x,y:(y-r.top)/this.scale+this.camera.y};}
 screen(x,y){const r=this.canvas.getBoundingClientRect();return{x:r.left+(x-this.camera.x)*this.scale,y:r.top+(y-this.camera.y)*this.scale};}
 draw(walk,state,dt){
  this.reduced=experience.reducedEffects();
  const c=this.c,t=this.reduced?0:walk.time,want={x:Math.max(0,Math.min(CAMP_WORLD.width-this.visible.w,walk.x-this.visible.w*.5)),y:Math.max(0,Math.min(CAMP_WORLD.height-this.visible.h,walk.y-this.visible.h*.57))};
  const residentDt=Math.max(0,Math.min(.05,walk.time-this.residentTime));this.residentTime=walk.time;
  this.residents.tick(residentDt,state,walk,{paused:this.reduced});
  for(const k of ['x','y'])this.camera[k]=this.snap?want[k]:this.camera[k]+(want[k]-this.camera[k])*(1-Math.exp(-dt*8));this.snap=false;
  c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#1c382d';c.fillRect(0,0,this.w,this.h);c.scale(this.scale,this.scale);c.translate(-this.camera.x,-this.camera.y);
  if(this.bg.complete&&this.bg.naturalWidth)c.drawImage(this.bg,0,0,2000,1700);else{c.fillStyle='#6d8048';c.fillRect(0,0,2000,1700);}
  c.fillStyle='#12352a3d';c.fillRect(0,0,2000,1700);
  // Worn paths connect landmarks in both axes; no side-scrolling ground line.
  for(const site of CAMP_SITES){line(c,[[960,960],[(site.x+960)/2,960],[site.x,site.y+110]],'#ada47334',73);line(c,[[960,960],[(site.x+960)/2,960],[site.x,site.y+110]],'#cab68726',48);}
  for(let i=0;i<(this.reduced?35:100);i++){const x=180+i*173%1620,y=200+i*97%1350;oval(c,x,y,3+i%4,1.7,'#d5c38a33');}
  for(let i=0;i<34;i++){const x=170+i*283%1660,y=180+i*397%1350;if(CAMP_SITES.some(s=>Math.hypot(s.x-x,s.y-y)<165)||Math.hypot(x-960,y-960)<220)continue;drawSprite(c,i%4?'ferns':'rocks',x,y,{height:i%4?32+i%3*6:55,width:90,flip:!!(i%2)});}
  const pond={x:420,y:400};oval(c,pond.x,pond.y,132,83,'#57745d');oval(c,pond.x,pond.y-6,118,71,'#4a8a83');oval(c,pond.x-12,pond.y-9,85,50,'#72a59166');for(let i=0;i<5;i++){c.beginPath();c.ellipse(pond.x,pond.y,25+i*16+Math.sin(t+i)*3,10+i*10,0,0,Math.PI*2);c.strokeStyle='#b7d6b247';c.stroke();}
  const objects=CAMP_SITES.map(s=>({y:s.y,draw:()=>this.site(s,state,t)}));
  // Residents follow purposeful walking routes, pause at work points and yield
  // to the player. The merchant stays at the stall, not duplicated in a loop.
  for(const actor of this.residents.snapshot())objects.push({y:actor.y,draw:()=>this.residentActor(actor,t)});
  const forge=state.camp.buildings.find(b=>b.type==='forge'),workSite=forge?CAMP_SITES.find(s=>s.slot===forge.slot):{x:720,y:790};
  const smith={x:workSite.x+100,y:workSite.y+85};objects.push({y:smith.y,draw:()=>this.resident(smith.x,smith.y,t,1)});
  objects.push({y:1060,draw:()=>this.pet({x:860,y:1060},t)});
  for(let i=0;i<10;i++){const x=250+i*283%1500,y=250+i*397%1250;if(CAMP_SITES.some(s=>Math.hypot(s.x-x,s.y-y)<180)||Math.hypot(x-960,y-960)<180)continue;objects.push({y,draw:()=>this.tree(x,y,i)});}
  objects.push({y:walk.y,draw:()=>{this.hero({x:walk.x,y:walk.y,angle:walk.angle,moving:walk.moving,weapon:'spear',invulnerable:0,swing:0,dashTime:0},walk.time);}});
  objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  const near=walk.nearest();if(near){c.beginPath();c.ellipse(near.x,near.y+12,85,35,0,0,Math.PI*2);c.strokeStyle='#f9dfa280';c.lineWidth=2;c.setLineDash([5,8]);c.stroke();c.setLineDash([]);}
  for(let i=0;i<(this.reduced?6:22);i++)oval(c,720+i*71%720+Math.sin(t*.3+i)*25,560+i*89%660+Math.cos(t*.5+i)*14,1.4,1.4,'#f4df9977');
  if(walk.path.length){const p=walk.path[walk.path.length-1];c.beginPath();c.ellipse(p.x,p.y,15,7,0,0,Math.PI*2);c.strokeStyle='#ffe7ac';c.stroke();}
 }
 tree(x,y,i){const c=this.c;oval(c,x,y+12,65,24,'#1b3c2d49');if(drawSprite(c,i%2?'fern-tree':'broadleaf',x,y+20,{height:230+i%3*20,width:240,flip:!!(i%2)}))return;line(c,[[x,y],[x-8,y-126]],'#64714b',17);for(let k=0;k<4;k++)poly(c,[[x-89+k*28,y-80-k%2*35],[x-61+k*30,y-137-k%2*25],[x-21+k*29,y-115],[x+1+k*26,y-69]],['#385d3c','#4c713e','#618247','#537547'][k]);}
 residentActor(actor,t){const c=this.c,pose=this.actorPose('camp-'+actor.type,actor,t,actor.type==='porter'?65:76);oval(c,actor.x,actor.y+15,18,6,'#213f2d55');if(drawCharacter(c,actor.type,actor.x,actor.y+15,pose))return;this.resident(actor.x,actor.y,t,actor.type==='porter'?0:2);}
 resident(x,y,t,i){const c=this.c;oval(c,x,y+15,18,6,'#213f2d55');if(drawSprite(c,['porter','smith','hunter','merchant'][i%4],x,y+17,{height:79}))return;c.save();c.translate(x,y);line(c,[[-5,6],[-7,16]],'#615538',6);line(c,[[5,6],[7,16]],'#615538',6);poly(c,[[-10,-19],[10,-19],[14,8],[-13,8]],i%2?'#a79967':'#567c73','#365641');oval(c,0,-27,10,12,'#cea477');poly(c,[[-13,-28],[0,-44],[14,-27]],'#69734e');if(i%2)poly(c,[[8,-13],[22,-8],[21,10],[7,7]],'#b79761');c.restore();}
 site(s,state,t){const c=this.c;c.save();c.translate(s.x,s.y);oval(c,0,15,93,35,'#1e432c35');
  if(s.kind==='plot'){
   const b=state.camp.buildings.find(b=>b.slot===s.slot);if(b)this.facility(b,t);else{c.setLineDash([8,10]);c.strokeStyle='#e1dca782';c.lineWidth=2;c.strokeRect(-69,-35,138,83);c.setLineDash([]);for(const [x,y]of[[-72,-33],[72,-33],[-72,49],[72,49]]){line(c,[[x,y],[x,y-19]],'#967c50',5);poly(c,[[x,y-19],[x+17,y-14],[x,y-6]],'#c6cc91');}text(c,'＋',0,15,29,'#ecdfab');}
   text(c,b?`${FACILITIES[b.type].name} ${'◆'.repeat(b.level)}`:s.label,0,b?-208:-65,13);
  }else if(s.kind==='fire'){
   if(drawSprite(c,'campfire',0,24,{height:128,width:137})){
    const glow=c.createRadialGradient(0,-14,2,0,-14,76);glow.addColorStop(0,`rgba(255,180,66,${.12+Math.sin(t*6)*.025})`);glow.addColorStop(1,'#ffa64000');c.fillStyle=glow;c.fillRect(-80,-94,160,160);
    for(let i=0;i<5;i++)oval(c,Math.sin(t*2+i)*17,-27-((t*27+i*13)%56),1.5,2,'#ffe4a4b3');text(c,'營火 · 休整',0,63,14);c.restore();return;
   }
   for(let i=0;i<8;i++){const a=i*Math.PI/4;oval(c,Math.cos(a)*38,Math.sin(a)*21,11,8,'#9aab81');}line(c,[[-26,8],[22,-9]],'#917047',9);line(c,[[-23,-9],[24,9]],'#917047',9);
   const glow=c.createRadialGradient(0,-15,10,0,-15,140);glow.addColorStop(0,'#f9bb5836');glow.addColorStop(1,'#f9bb5800');c.fillStyle=glow;c.fillRect(-140,-155,280,280);
   poly(c,[[-21,0],[-28,-27],[-12,-48],[-6,-30],[3,-72-Math.sin(t*8)*6],[25,-29],[17,4]],'#f1aa52');poly(c,[[-9,0],[0,-32],[11,-11],[6,3]],'#fff0b4');text(c,'營火 · 休整',0,63,14);
  }else if(s.kind==='merchant'){
   if(drawSprite(c,'merchant-stall',0,40,{height:205,width:229})){drawSprite(c,'merchant',65,56,{height:77});text(c,'荒境行商',0,-190,18);text(c,'建造 · 雇佣 · 武技',0,83,12);c.restore();return;}
   for(const x of [-77,77])line(c,[[x,22],[x,-117]],'#8b7950',7);poly(c,[[-95,-86],[-51,-142],[54,-142],[99,-86]],'#7a9970','#cfca91');for(let i=0;i<5;i++)poly(c,[[-94+i*39,-86],[-51+i*21,-140],[-30+i*21,-140],[-75+i*39,-86]],i%2?'#729772':'#d1bd83');
   for(let i=0;i<7;i++)poly(c,[[-94+i*28,-86],[-80+i*28,-69],[-66+i*28,-86]],'#a9b481');this.resident(0,-4,0,3);poly(c,[[-70,-8],[71,-8],[71,39],[-70,39]],'#ad8f58','#dac087');line(c,[[-68,7],[68,7]],'#d2b577',3);for(let i=0;i<4;i++)poly(c,[[-56+i*28,-10],[-51+i*28,-35],[-33+i*28,-32],[-31+i*28,-10]],['#d6c292','#8bae97','#d1d8a9','#9f9564'][i]);
   poly(c,[[87,0],[119,-7],[119,30],[87,38]],'#b19460','#d1bb84');text(c,'荒境行商',0,-170,18);text(c,'建造 · 雇佣 · 武技',0,72,12);
  }else if(s.kind==='gate'){
   if(drawSprite(c,'gate',0,35,{height:220,width:221})){text(c,'遠征山口',0,-208,18);text(c,state.run?'繼續已保存的遠征':'出發 · 蕨谷',0,69,13);c.restore();return;}
   for(const x of [-70,70])poly(c,[[x-12,30],[x-14,-97],[x+4,-125],[x+19,-94],[x+18,30]],'#7a896c','#c0c5a0');line(c,[[-80,-101],[90,-111]],'#c2b48b',12);poly(c,[[-34,-105],[42,-109],[39,-58],[5,-44],[-35,-63]],'#538b7c','#a0c4a3');text(c,'↗',3,-72,30);text(c,'遠征山口',0,-150,18);text(c,state.run?'繼續已保存的遠征':'出發 · 蕨谷',0,65,13);
  }c.restore();
 }
 facility(b,t){const c=this.c;
  if(drawSprite(c,b.type,0,28,{height:210,width:229})){
   for(let i=0;i<b.level;i++)oval(c,(i-(b.level-1)/2)*13,47,3,3,'#f4d898');
   if(b.type==='forge')for(let i=0;i<3;i++)oval(c,-13+Math.sin(t+i)*6,-177-i*16-(t*12%16),8+i*3,7+i*3,'#d5d9c129');
   if(b.level>=2)drawSprite(c,'fence',-96,32,{height:43,width:64});return;
  }
  if(b.type==='tent'){poly(c,[[-84,21],[-14,-111],[19,-116],[89,20]],'#cfbd8a','#6b7451');poly(c,[[-14,-111],[19,-116],[89,20],[26,21]],'#6b9177');poly(c,[[-19,-69],[-44,21],[11,21]],'#284b39');line(c,[[-87,23],[-15,-117],[92,23]],'#e3d3a4',4);}
  if(b.type==='forge'){poly(c,[[-67,26],[-67,-53],[-43,-90],[48,-90],[77,-51],[77,27]],'#909a7c','#56694e');poly(c,[[38,-80],[38,-155],[63,-155],[63,-65]],'#6b8067');poly(c,[[-89,-62],[-47,-117],[56,-111],[92,-62]],'#628d76','#b3c49a');poly(c,[[-34,27],[-34,-24],[-13,-44],[20,-25],[20,27]],'#243d2c');poly(c,[[-25,18],[-21,-8],[-8,-29],[4,-2],[8,20]],'#eeb966');for(let i=0;i<3;i++)oval(c,49+Math.sin(t+i)*5,-174-i*21-(t*12%20),13+i*4,9+i*3,'#ccd3ba35');}
  if(b.type==='cache'){poly(c,[[-77,22],[-77,-61],[77,-61],[77,22]],'#a28b5c','#5e6946');for(let i=0;i<5;i++)line(c,[[-72,12-i*15],[74,12-i*15]],'#c8ad74',3);poly(c,[[-96,-59],[0,-125],[95,-58]],'#638867','#c5caa0');poly(c,[[-19,22],[-19,-42],[27,-42],[27,22]],'#625836');}
  if(b.type==='nursery'){poly(c,[[-80,20],[-80,-58],[0,-120],[80,-58],[80,20]],'#bdd8ae86','#ddd6a6');line(c,[[-80,-58],[80,-58]],'#d7c997',5);for(const x of [-40,0,40])line(c,[[x,20],[x,-117+Math.abs(x)*.7]],'#d7c997',4);oval(c,0,11,65,17,'#8d8150');for(const [x,y]of[[-30,-4],[3,-16],[37,0]]){oval(c,x,y,16,24,'#e7e8b8');oval(c,x+5,y+3,4,8,'#a6bd87');}}
  for(let i=0;i<b.level;i++)oval(c,-12+i*12,47,3,3,'#f4d898');if(b.level>=2)this.building({x:-99,y:28,type:'torch',r:24},t,true);
 }
}
