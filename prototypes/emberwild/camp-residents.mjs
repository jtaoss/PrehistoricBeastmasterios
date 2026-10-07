import {CampWalk,CAMP_WORLD,campObstacles} from './camp-world.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const routes={
 porter:[{x:780,y:1030,wait:3.1},{x:1380,y:1050,wait:4.2},{x:1350,y:890,wait:3.3},{x:750,y:810,wait:2.8}],
 hunter:[{x:1460,y:590,wait:3.8},{x:1100,y:680,wait:3},{x:1110,y:1050,wait:4.4},{x:1630,y:650,wait:3.2}]
};
// Decorative schedules only. NPCs never mutate player resources or save data.
export class CampResidents {
 constructor(){this.time=0;this.key=null;this.actors=Object.entries(routes).map(([type,route],i)=>({type,route,index:0,wait:route[0].wait+i*1.3,walk:new CampWalk(route[0]),speed:0,maxSpeed:type==='porter'?65:78,blocked:0,status:'rest'}));}
 tick(dt,state,hero,{paused=false}={}){
  if(paused||dt<=0)return;dt=Math.min(dt,.05);this.time+=dt;
  const obstacles=campObstacles(state),key=JSON.stringify(obstacles);
  if(key!==this.key){if(this.key!==null)for(const a of this.actors){a.walk.stop();a.wait=Math.min(a.wait,.3);a.blocked=0;}this.key=key;}
  for(const a of this.actors){
   const w=a.walk;w.moving=false;
   // Construction may occupy a work point. Step to the nearest free entrance
   // once, not every render. Current routes normally stay clear of all plots.
   if(!w.free(w,obstacles)){const o=obstacles.find(o=>distance(w,o)<o.r+CAMP_WORLD.radius);if(o){const angle=Math.atan2(w.y-o.y,w.x-o.x);w.x=o.x+Math.cos(angle)*(o.r+CAMP_WORLD.radius+8);w.y=o.y+Math.sin(angle)*(o.r+CAMP_WORLD.radius+8);}w.stop();a.wait=.3;a.speed=0;}
   if(a.wait>0){a.wait=Math.max(0,a.wait-dt);a.speed=0;a.status='rest';continue;}
   if(!w.path.length){a.index=(a.index+1)%a.route.length;const target=a.route[a.index];if(!w.goTo(target.x,target.y,obstacles)){a.wait=1;continue;}a.status='walk';}
   const p=w.path[0],d=distance(w,p),dir={x:(p.x-w.x)/(d||1),y:(p.y-w.y)/(d||1)};
   const blockers=[hero,...this.actors.filter(b=>b!==a).map(b=>b.walk)].filter(Boolean);
   const blocked=blockers.some(b=>{const gap=distance(w,b);return gap<58&&((b.x-w.x)*dir.x+(b.y-w.y)*dir.y)>0;});
   if(blocked){a.speed=0;a.blocked+=dt;a.status='yield';if(a.blocked>1.2){const goal=a.route[a.index];w.goTo(goal.x,goal.y,[...obstacles,...blockers.filter(b=>distance(w,b)<100).map(b=>({x:b.x,y:b.y,r:29}))]);a.blocked=0;}continue;}
   a.blocked=0;a.status='walk';const targetSpeed=w.path.length>1?a.maxSpeed:Math.min(a.maxSpeed,Math.max(20,d*3.5));a.speed+=(targetSpeed-a.speed)*(1-Math.exp(-dt*6));
   w.tick(dt*a.speed/CAMP_WORLD.speed,{},obstacles);
   if(!w.path.length){a.wait=a.route[a.index].wait;a.speed=0;a.status='rest';}
  }
 }
 snapshot(){return this.actors.map(a=>({type:a.type,x:a.walk.x,y:a.walk.y,angle:a.walk.angle,moving:a.walk.moving,status:a.status}));}
}
