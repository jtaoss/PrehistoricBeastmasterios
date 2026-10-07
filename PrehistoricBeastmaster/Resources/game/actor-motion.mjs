// Render-only locomotion. Simulation coordinates and save formats are untouched.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class ActorMotion {
 constructor({stride=96}={}){this.stride=stride;this.time=-1;this.x=0;this.y=0;this.phase=0;this.step=0;this.speed=0;this.amount=0;this.stopAmount=0;this.idleFor=0;this.back=false;this.flip=false;this.turnAge=1;this.moving=false;this.state='idle';this.frame=0;this.runFrame=0;this.idleFrame=0;}
 update(actor,time,{reduced=false}={}){
  const dx=actor.x-this.x,dy=actor.y-this.y,d=Math.hypot(dx,dy),dt=time-this.time;
  const reset=this.time<0||dt<0||dt>.25||d>Math.max(80,Math.max(0,dt)*1100);
  if(reset){this.phase=0;this.speed=0;this.amount=0;this.stopAmount=0;this.idleFor=1;this.moving=false;this.frame=0;this.runFrame=0;this.idleFrame=0;this.state='idle';this.turnAge=1;}
  // Repainting the same simulation instant must not advance a walk/idle cycle.
  if(dt>0&&!reset){
   const moving=d>.025&&actor.moving!==false,dash=actor.dashTime>0;
   this.speed+=(moving?d/dt-this.speed:-this.speed)*(1-Math.exp(-dt*15));
   if(moving){if(!this.moving)this.phase=0;this.idleFor=0;if(!dash)this.phase=(this.phase+d/this.stride)%1;}
   else{if(this.moving)this.stopAmount=this.amount;this.idleFor+=dt;}
   this.turnAge+=dt;
   this.moving=moving;this.state=dash?'dash':moving?'walk':this.idleFor<.10?'settle':'idle';
   // Two planted transition poses separate the left/right steps. This avoids
   // holding one raised leg for half a cycle, which reads as a stiff hop.
   const sequence=[1,2,0,3,4,0];
   this.frame=reduced||this.state==='idle'?0:dash?2:sequence[Math.floor(this.phase*sequence.length)%sequence.length];
   // The regenerated ranger atlas is a dedicated five-pose light-jog loop.
   // NPCs keep the original planted walk sequence through `frame`.
   this.runFrame=reduced||this.state==='idle'?0:dash?2:Math.floor(this.phase*5)%5;
   // A deliberately slow, reversible loop avoids a visible pop between the
   // neutral and breathing poses. It starts only after the planted settle.
   const idleSequence=[0,1,2,3,4,3,2,1];
   this.idleFrame=reduced||this.state!=='idle'?0:idleSequence[Math.floor(Math.max(0,this.idleFor-.18)/.42)%idleSequence.length];
  }
  // A vertical walk holds the last left/right choice; small analog-stick noise
  // cannot mirror the whole body. Hysteresis also stabilizes front/back turns.
  const a=Number.isFinite(actor.angle)?actor.angle:0,sx=Math.cos(a),sy=Math.sin(a);
  if(reset||this.moving||actor.swing>0){
   const back=this.back?sy<.18:sy<-.38;
   const flip=sx<-.28?true:sx>.28?false:this.flip;
   if(reset||this.turnAge>.11||actor.swing>0){if(back!==this.back||flip!==this.flip)this.turnAge=0;this.back=back;this.flip=flip;}
  }
  this.x=actor.x;this.y=actor.y;this.time=time;this.step=this.phase*6;
  const walking=this.state==='walk',breath=reduced?0:Math.sin(time*2.2)*.22;
  const amount=reduced?0:walking?Math.min(1,this.speed/(this.stride*1.25)):this.state==='settle'?this.stopAmount*Math.max(0,1-this.idleFor/.1):0;
  this.amount=amount;
  return {frame:this.frame,runFrame:this.runFrame,idleFrame:this.idleFrame,back:this.back,flip:this.flip,state:this.state,moving:this.moving,phase:this.phase,amount,stride:this.stride,angle:a,
   // All sprites are grounded by an explicit foot pivot; never bob the root.
   breath:walking||actor.dashTime>0?0:breath,lean:reduced?0:actor.dashTime>0?Math.cos(a)*.065:0,
   attack:reduced?0:clamp(actor.swing/.2,0,1)};
 }
}
