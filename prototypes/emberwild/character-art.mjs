// Animation-ready AI sprite atlases. Every pose is drawn at a stable foot
// baseline and fixed scale: no procedural limb stretching or face morphing.
const images=new Map();
export const CHARACTER_ART={
 ranger:{file:'assets/motion-v4/scout-run-v1.png',cols:5,height:92,pivotX:[195.9,195.9],
  top:[[17,14,13,15,16],[0,0,0,0,0]],base:[[401,401,401,401,401],[378,371,380,376,360]],
  idle:{key:'rangerIdleV4',file:'assets/motion-v4/scout-idle-v1.png',cols:5,height:92,
   pivotX:[[192,183,183.5,208.5,208.5],[225.5,225.5,175,213.5,196.5]],
   top:[[16,15,15,14,15],[0,0,0,0,0]],base:[[402,402,402,402,402],[383,383,383,383,383]]},
  run:{key:'rangerRunV4',file:'assets/motion-v4/scout-run-v1.png',cols:5,height:92,pivotX:[195.9,195.9],
   top:[[17,14,13,15,16],[0,0,0,0,0]],base:[[401,401,401,401,401],[378,371,380,376,360]]},
  attack:{
   spear:{key:'rangerSpearAttackV4',file:'assets/motion-v4/scout-spear-v1.png',scale:[.24,.24],
    rect:[[[0,0,391,402],[391,0,391,402],[782,0,392,402],[1174,0,391,402],[1565,0,391,402]],[[0,402,391,402],[391,402,391,402],[782,402,392,402],[1174,402,391,402],[1565,402,391,402]]],
    pivotX:[[195.5,195.5,196,195.5,195.5],[195.5,195.5,196,195.5,195.5]],base:[[397,401,395,401,399],[401,370,371,371,371]]},
   axe:{key:'rangerAxeAttackV4',file:'assets/motion-v4/scout-axe-v1.png',scale:[.235,.235],
    rect:[[[0,0,392,402],[392,0,392,402],[784,0,391,402],[1175,0,392,402],[1567,0,392,402]],[[0,402,392,401],[392,402,392,401],[784,402,391,401],[1175,402,392,401],[1567,402,392,401]]],
    pivotX:[[196,196,195.5,196,196],[196,196,195.5,196,196]],base:[[401,401,401,401,401],[400,385,382,400,385]]}
  }},
 porter:{height:79,pivotX:[230,228],top:[[16,16,16,16,16],[9,9,9,10,9]],base:[[388,389,392,391,391],[360,361,361,373,361]]},
 hunter:{height:79,pivotX:[228,217],top:[[13,16,17,14,16],[11,9,9,8,9]],base:[[370,383,377,383,373],[366,368,365,368,367]]}
};
export function preloadCharacters(){for(const type of Object.keys(CHARACTER_ART))if(!images.has(type)){const im=new Image(),art=CHARACTER_ART[type];im.decoding='async';im.src=art.file||`assets/motion-v2/${type}.png`;images.set(type,im);}const extras=[CHARACTER_ART.ranger.idle,CHARACTER_ART.ranger.run,...Object.values(CHARACTER_ART.ranger.attack)];for(const art of extras)if(!images.has(art.key)){const im=new Image();im.decoding='async';im.src=art.file;images.set(art.key,im);}return Promise.all([...images.values()].map(im=>im.decode().catch(()=>{})));}
export const characterStatus=()=>Object.fromEntries([...images].map(([key,im])=>[key,im.complete&&im.naturalWidth>0]));
export const attackFrame=attack=>Math.max(0,Math.min(4,Math.floor((1-attack)*5+1e-6)));
// Kept as a small pure helper for cadence validation and future footstep FX.
export function footPose(phase,stride,amount=1){
 const p=((phase%1)+1)%1,A=stride*.30;
 if(p<.6)return{travel:(A-p/.6*2*A)*amount,lift:0};
 const u=(p-.6)/.4,e=u*u*(3-2*u);return{travel:(-A+2*A*e)*amount,lift:Math.sin(u*Math.PI)*5.5*amount};
}
export function drawCharacter(c,type,x,y,pose,{height,weapon}={}){
 const rig=CHARACTER_ART[type];if(!rig)return null;
 const attack=type==='ranger'&&pose.attack>0&&rig.attack?.[weapon],attackImage=attack&&images.get(attack.key);
 if(attackImage?.complete&&attackImage.naturalWidth){
  const row=pose.back?1:0,frame=attackFrame(pose.attack),rect=attack.rect[row][frame];
  const [sx,sy,sw,sh]=rect,k=attack.scale[row],pivotX=attack.pivotX[row][frame],baseline=attack.base[row][frame];
  c.save();c.translate(x,y);c.scale(pose.flip?-1:1,1);c.rotate(pose.lean||0);c.drawImage(attackImage,sx,sy,sw,sh,-pivotX*k,-baseline*k,sw*k,sh*k);c.restore();
  return {integratedWeapon:true,attackFrame:frame};
 }
 const locomoting=pose.moving||pose.state==='settle'||pose.state==='dash',run=type==='ranger'&&locomoting&&images.get(rig.run?.key)?.naturalWidth?rig.run:null;
 const idle=type==='ranger'&&!locomoting&&images.get(rig.idle?.key)?.naturalWidth?rig.idle:null;
 const art=run||idle||rig,im=images.get(run?.key||idle?.key||type);if(!im?.complete||!im.naturalWidth)return null;
 const row=pose.back?1:0,cols=art.cols||5,frame=locomoting?Math.max(0,Math.min(cols-1,run?(pose.runFrame??pose.frame??0):(pose.frame??0))):idle?Math.max(0,Math.min(cols-1,pose.idleFrame??0)):0;
 const sw=im.naturalWidth/cols,sh=im.naturalHeight/2,sx=frame*sw,sy=row*sh;
 // Scale comes only from the neutral pose. Per-frame feet are aligned back to
 // y=0, so AI crop differences cannot make the character bounce or resize.
 const k=(height||art.height||rig.height)/(art.base[row][0]-art.top[row][0]),pivotX=Array.isArray(art.pivotX[row])?art.pivotX[row][frame]:art.pivotX[row],baseline=art.base[row][frame];
 // The authored idle atlas already contains breathing and weight changes. Do
 // not scale it procedurally as well, otherwise the planted boots appear soft.
 const breathing=idle?1:1+(pose.breath||0)*.006;
 c.save();c.translate(x,y);c.scale(pose.flip?-1:1,breathing);c.rotate(pose.lean||0);
 c.drawImage(im,sx,sy,sw,sh,-pivotX*k,-baseline*k,sw*k,sh*k);c.restore();
 const hand=art.hand?.[row]?.[frame];return hand?{x:(hand[0]-pivotX)*k,y:(hand[1]-baseline)*k*breathing}:{};
}
