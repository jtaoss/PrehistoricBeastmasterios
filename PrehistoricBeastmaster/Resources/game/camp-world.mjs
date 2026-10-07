// Top-down camp: four-direction movement, spatial interactions and click-to-walk.
export const CAMP_WORLD=Object.freeze({width:2000,height:1700,start:{x:980,y:960},speed:185,sprint:280,reach:135,radius:18});
export const CAMP_SITES=Object.freeze([
 {id:'plot-0',kind:'plot',slot:0,x:630,y:690,label:'西林地塊'},
 {id:'plot-1',kind:'plot',slot:1,x:630,y:1160,label:'溪畔地塊'},
 {id:'fire',kind:'fire',x:960,y:800,label:'營火'},
 {id:'merchant',kind:'merchant',x:1260,y:760,label:'荒境行商'},
 {id:'plot-2',kind:'plot',slot:2,x:1530,y:760,label:'東林地塊'},
 {id:'plot-3',kind:'plot',slot:3,x:1490,y:1200,label:'石階地塊'},
 {id:'plot-4',kind:'plot',slot:4,x:1030,y:1370,label:'南林地塊'},
 {id:'plot-5',kind:'plot',slot:5,x:390,y:940,label:'蕨叢地塊'},
 {id:'gate',kind:'gate',x:1730,y:400,label:'遠征山口'}
]);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function campObstacles(state){return CAMP_SITES.flatMap(s=>s.kind==='merchant'?[{x:s.x,y:s.y,r:65}]:s.kind==='fire'?[{x:s.x,y:s.y,r:35}]:s.kind==='plot'&&state.camp.buildings.some(b=>b.slot===s.slot)?[{x:s.x,y:s.y,r:65}]:[]);}
export class CampWalk{
 constructor(position){this.x=CAMP_WORLD.start.x;this.y=CAMP_WORLD.start.y;this.angle=0;this.path=[];this.moving=false;this.time=0;this.restore(position);}
 restore(p){this.x=CAMP_WORLD.start.x;this.y=CAMP_WORLD.start.y;if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){this.x=Math.max(80,Math.min(1920,p.x));this.y=Math.max(80,Math.min(1620,p.y));}this.angle=Number.isFinite(p?.angle)?p.angle:0;this.stop();}
 snapshot(){return{x:Math.round(this.x),y:Math.round(this.y),angle:this.angle};}
 stop(){this.path=[];this.moving=false;}
 nearest(){return CAMP_SITES.filter(s=>dist(s,this)<=CAMP_WORLD.reach).sort((a,b)=>dist(a,this)-dist(b,this))[0]||null;}
 canInteract(id){const site=CAMP_SITES.find(s=>s.id===id);return !!site&&dist(site,this)<=CAMP_WORLD.reach;}
 free(p,obstacles){return p.x>=80&&p.x<=1920&&p.y>=80&&p.y<=1620&&!obstacles.some(o=>dist(p,o)<o.r+CAMP_WORLD.radius);}
 goTo(x,y,obstacles=[]){
   if(!Number.isFinite(x)||!Number.isFinite(y))return false;const goal={x:Math.max(80,Math.min(1920,x)),y:Math.max(80,Math.min(1620,y))};
   if(!this.free(goal,obstacles)){this.stop();return false;}
   const clear=(a,b)=>{const n=Math.ceil(dist(a,b)/14);for(let i=1;i<=n;i++)if(!this.free({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},obstacles))return false;return true;};
   if(clear(this,goal)){this.path=[goal];return true;}
   const grid=40,key=(x,y)=>`${x},${y}`;
   const anchors=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const p={x:Math.round(this.x/grid)*grid+dx*grid,y:Math.round(this.y/grid)*grid+dy*grid};if(this.free(p,obstacles)&&clear(this,p))anchors.push(p);}
   anchors.sort((a,b)=>dist(this,a)-dist(this,b));if(!anchors.length){this.stop();return false;}const start={...anchors[0],g:dist(this,anchors[0]),parent:null};
   const open=[start],best=new Map([[key(start.x,start.y),0]]),closed=new Set();let found=null;
   for(let i=0;open.length&&i<3000;i++){
     open.sort((a,b)=>(a.g+dist(a,goal))-(b.g+dist(b,goal)));const n=open.shift(),k=key(n.x,n.y);if(closed.has(k))continue;closed.add(k);
     if(dist(n,goal)<60&&clear(n,goal)){found=n;break;}
     for(const dx of [-grid,0,grid])for(const dy of [-grid,0,grid]){if(!dx&&!dy)continue;const p={x:n.x+dx,y:n.y+dy,g:n.g+Math.hypot(dx,dy),parent:n},pk=key(p.x,p.y);if(closed.has(pk)||!this.free(p,obstacles)||!clear(n,p)||p.g>=(best.get(pk)??Infinity))continue;best.set(pk,p.g);open.push(p);}
   }
   if(!found){this.stop();return false;}const path=[goal];for(let n=found;n;n=n.parent)path.unshift({x:n.x,y:n.y});this.path=path;return true;
 }
 tick(dt,{x=0,y=0,sprint=false,paused=false}={},obstacles=[]){
   if(paused||!Number.isFinite(dt)||dt<=0){this.moving=false;return;}dt=Math.min(dt,.05);this.time+=dt;
   let len=Math.hypot(x,y);if(len>.05){this.path=[];x/=Math.max(1,len);y/=Math.max(1,len);}else if(this.path.length){let p=this.path[0];if(dist(this,p)<4){this.path.shift();p=this.path[0];}if(p){len=dist(this,p);x=(p.x-this.x)/len;y=(p.y-this.y)/len;}else{x=0;y=0;}}else{x=0;y=0;}
   let step=(sprint?CAMP_WORLD.sprint:CAMP_WORLD.speed)*dt;if(this.path.length)step=Math.min(step,dist(this,this.path[0]));const old={x:this.x,y:this.y};
   if(this.free({x:this.x+x*step,y:this.y},obstacles))this.x+=x*step;
   if(this.free({x:this.x,y:this.y+y*step},obstacles))this.y+=y*step;
   this.moving=dist(old,this)>.01;if(this.moving)this.angle=Math.atan2(this.y-old.y,this.x-old.x);
 }
}
