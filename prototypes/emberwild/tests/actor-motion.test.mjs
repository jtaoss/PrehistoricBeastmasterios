import assert from 'node:assert/strict';
import {ActorMotion} from '../actor-motion.mjs';
import {attackFrame,footPose} from '../character-art.mjs';
import {CampResidents} from '../camp-residents.mjs';
import {campObstacles} from '../camp-world.mjs';
import {freshState} from '../save.mjs';
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const hero=(x=0,y=0,angle=0)=>({x,y,angle});
test('distance drives gait consistently across frame rates',()=>{
 const sample=hz=>{const a=new ActorMotion(),h=hero(200,200);a.update(h,0);for(let i=1;i<=hz;i++){h.x=200+i/hz*90;a.update(h,i/hz);}return a.phase;};
 assert.ok(Math.abs(sample(30)-sample(60))<1e-8);assert.ok(Math.abs(sample(60)-sample(120))<1e-8);
});
test('young ranger run frames advance through the dedicated five-pose loop',()=>{const a=new ActorMotion(),h=hero(0,0),seen=new Set();a.update(h,0);for(let i=1;i<=40;i++){h.x+=4;seen.add(a.update(h,i/40).runFrame);}assert.deepEqual([...seen].sort(),[0,1,2,3,4]);});
test('authored idle advances slowly while planted and resets on movement',()=>{const a=new ActorMotion(),h=hero(200,200),seen=new Set();a.update(h,0);for(let i=1;i<=180;i++)seen.add(a.update(h,i/60).idleFrame);assert.ok(seen.size>=4);h.x+=4;const moving=a.update(h,3.03);assert.equal(moving.state,'walk');assert.equal(moving.idleFrame,0);});
test('attack progress maps cleanly across all five authored poses',()=>{assert.deepEqual([1,.8,.6,.4,.2].map(attackFrame),[0,1,2,3,4]);});
test('idle, start, walk and settle are distinct; a blocked actor stops stepping',()=>{
 const a=new ActorMotion(),h=hero(200,200);assert.equal(a.update(h,0).state,'idle');h.x+=4;assert.equal(a.update(h,.03).state,'walk');
 const p=a.phase;assert.equal(a.update(h,.06).state,'settle');assert.equal(a.update(h,.2).state,'idle');assert.equal(a.phase,p);assert.equal(a.update(h,.22).amount,0);
});
test('same-time repaint and pause cannot advance animation',()=>{const a=new ActorMotion(),h=hero(200,200);a.update(h,1);h.x+=3;const p=a.update(h,1.02);for(let i=0;i<100;i++)assert.deepEqual(a.update(h,1.02),p);});
test('vertical joystick noise does not mirror the actor',()=>{const a=new ActorMotion(),h=hero(200,200,-Math.PI/2);a.update(h,0);for(let i=1;i<90;i++){h.y-=1;h.angle=-Math.PI/2+(i%2?.03:-.03);const p=a.update(h,i/60);assert.equal(p.back,true);assert.equal(p.flip,false);}});
test('intentional turns work, idle aim noise is ignored',()=>{const a=new ActorMotion(),h=hero(200,200);a.update(h,0);h.x-=4;h.angle=Math.PI;assert.equal(a.update(h,.1).flip,true);h.angle=0;assert.equal(a.update(h,.2).flip,true);h.swing=.2;assert.equal(a.update(h,.22).flip,false);});
test('teleport and changed simulation clock reset stride instead of fast-forwarding',()=>{const a=new ActorMotion(),h=hero(200,200);a.update(h,0);h.x+=10;a.update(h,.05);h.x+=800;assert.equal(a.update(h,.1).state,'idle');assert.equal(a.phase,0);h.x+=2;a.update(h,.12);a.update(h,0);assert.equal(a.phase,0);});
test('dash is a distinct pose; reduced motion removes optional articulation',()=>{const a=new ActorMotion(),h=hero(200,200);a.update(h,0);h.x+=12;h.dashTime=.2;assert.equal(a.update(h,.02).state,'dash');h.x+=12;const p=a.update(h,.04,{reduced:true});assert.equal(p.lean,0);assert.equal(p.amount,0);});
test('feet alternate, swing lifts only off-ground, and loop endpoints meet',()=>{assert.equal(footPose(.2,80).lift,0);assert.ok(footPose(.8,80).lift>0);assert.notEqual(footPose(.1,80).travel,footPose(.6,80).travel);assert.ok(Math.abs(footPose(.999999,80).travel-footPose(0,80).travel)<.001);assert.deepEqual(footPose(.8,80,0),{travel:0,lift:0});});
test('residents walk and stop at work points without mutating the save',()=>{const s=freshState(),before=JSON.stringify(s),r=new CampResidents(),seen=new Map();for(let i=0;i<6000;i++){r.tick(.02,s,{x:980,y:960});for(const a of r.snapshot()){if(!seen.has(a.type))seen.set(a.type,new Set());seen.get(a.type).add(a.status);}}for(const states of seen.values()){assert.ok(states.has('walk'));assert.ok(states.has('rest'));}assert.equal(JSON.stringify(s),before);});
test('residents avoid all built facilities over a long patrol',()=>{const s=freshState();s.camp.buildings=['tent','forge','cache','nursery'].map((type,slot)=>({type,slot,level:1}));const r=new CampResidents(),obs=campObstacles(s);for(let i=0;i<9000;i++){r.tick(.02,s,{x:980,y:960});for(const a of r.snapshot())for(const o of obs)assert.ok(Math.hypot(a.x-o.x,a.y-o.y)>=o.r+18-.01,a.type+' passes through a facility');}});
test('NPC pause freezes clocks and position; nearby player makes a walker yield',()=>{const s=freshState(),r=new CampResidents();for(let i=0;i<200;i++)r.tick(.02,s);const before=r.snapshot(),time=r.time;for(let i=0;i<100;i++)r.tick(.02,s,null,{paused:true});assert.deepEqual(r.snapshot(),before);assert.equal(r.time,time);const a=r.actors[0],next=a.walk.path[0],d=Math.hypot(next.x-a.walk.x,next.y-a.walk.y);const h={x:a.walk.x+(next.x-a.walk.x)/d*35,y:a.walk.y+(next.y-a.walk.y)/d*35};const pos={x:a.walk.x,y:a.walk.y};r.tick(.02,s,h);assert.equal(a.status,'yield');assert.equal(a.walk.x,pos.x);assert.equal(a.walk.y,pos.y);});
console.log(`${passed} actor animation scenarios passed.`);
