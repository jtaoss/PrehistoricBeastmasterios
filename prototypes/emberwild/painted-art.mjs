// AI-produced transparent atlases. Original PNGs stay intact; source rectangles
// isolate the sprites at render time. No simulation or save data lives here.
import {preloadCharacters,characterStatus,drawCharacter} from './character-art.mjs';
export const ATLASES={
 ranger:{file:'ranger.png',size:[1536,1024]},
 weapons:{file:'weapons.png',size:[1254,1254]},
 settlement:{file:'settlement-v2.png',size:[1536,1024]},
 residents:{file:'residents.png',size:[1536,1024]},
 scenery:{file:'scenery.png',size:[1536,1024]},
 cards:{file:'cards-v1.png',size:[1536,1024]},
 cardTorch:{file:'card-torch-game-v2.png',size:[768,768]},
 cardWall:{file:'card-wall-game-v2.png',size:[768,768]},
 cardNest:{file:'card-nest-game-v2.png',size:[768,768]},
 cardSpring:{file:'card-spring-game-v2.png',size:[768,768]},
 cardWatchtower:{file:'card-watchtower-v1.png',size:[1254,1254]},
 cardCatapult:{file:'card-catapult-v1.png',size:[1254,1254]},
 egg:{file:'sacred-beast-egg-v1.png',size:[1254,1254]},
 amber:{file:'amber-crystal-node-v1.png',size:[1284,1225]},
 enemies:{file:'enemies-v1.png',size:[1254,1254]},
 bosses:{file:'bosses-v1.png',size:[1254,1254]},
 companionEmberclaw:{file:'companion-emberclaw-v1.png',size:[1024,1024]},
 companionTideroot:{file:'companion-tideroot-v1.png',size:[1024,1024]},
 companionStoneback:{file:'companion-stoneback-v1.png',size:[1024,1024]}
};
const frames={
 ranger:[[155,17,255,469],[664,19,252,472],[1196,20,237,470],[144,512,238,469],[685,518,268,465],[1211,518,250,468]],
 weapons:[[270,13,120,1225],[745,216,422,901]],
 settlement:[[87,89,365,356],[582,90,360,363],[1079,103,374,353],[81,585,367,343],[592,580,370,345],[1112,580,326,338]],
 residents:[[105,20,376,480],[622,12,324,494],[1129,7,268,498],[124,521,388,474],[584,510,396,485],[1081,578,417,403]],
 scenery:[[26,81,452,436],[504,6,502,569],[1055,11,472,558],[25,610,435,354],[532,637,453,338],[1057,655,458,280]],
 cards:[[0,0,512,512],[512,0,512,512],[1024,0,512,512],[0,512,512,512],[512,512,512,512],[1024,512,512,512]],
 egg:[[0,0,1254,1254]],
 amber:[[0,0,1284,1225]],
 enemies:[[0,0,627,627],[627,0,627,627],[0,627,627,627],[627,627,627,627]],
 bosses:[[0,0,627,1254],[627,0,627,1254]]
};
export const SPRITES={};
for(const [sheet,names]of Object.entries({ranger:['hero-down-0','hero-down-1','hero-down-2','hero-up-0','hero-up-1','hero-up-2'],weapons:['spear','axe'],settlement:['tent','forge','cache','nursery','merchant-stall','gate'],residents:['merchant','porter','smith','hunter','guard','pet'],scenery:['campfire','broadleaf','fern-tree','rocks','ferns','fence'],cards:['card-torch','card-wall','card-nest','card-spring','card-hunter','card-guard'],egg:['sacred-egg'],amber:['amber-crystal'],enemies:['enemy-raptor','enemy-brute','enemy-spitter','enemy-boss'],bosses:['enemy-matriarch','enemy-charger']}))names.forEach((name,i)=>SPRITES[name]={sheet,rect:frames[sheet][i]});
// Independent building-card files keep each design replaceable without
// repacking the legacy atlas that still supplies the two hire cards.
SPRITES['card-torch']={sheet:'cardTorch',rect:[0,0,768,768]};
SPRITES['card-wall']={sheet:'cardWall',rect:[0,0,768,768]};
SPRITES['card-nest']={sheet:'cardNest',rect:[0,0,768,768]};
SPRITES['card-spring']={sheet:'cardSpring',rect:[0,0,768,768]};
SPRITES['card-watchtower']={sheet:'cardWatchtower',rect:[0,0,1254,1254]};
SPRITES['card-catapult']={sheet:'cardCatapult',rect:[0,0,1254,1254]};
SPRITES['building-watchtower']={sheet:'cardWatchtower',rect:[0,0,1254,1254]};
SPRITES['building-catapult']={sheet:'cardCatapult',rect:[0,0,1254,1254]};
for(const type of ['torch','wall','nest','spring'])SPRITES[`building-${type}`]=SPRITES[`card-${type}`];
SPRITES['companion-emberclaw']={sheet:'companionEmberclaw',rect:[0,0,1024,1024]};
SPRITES['companion-tideroot']={sheet:'companionTideroot',rect:[0,0,1024,1024]};
SPRITES['companion-stoneback']={sheet:'companionStoneback',rect:[0,0,1024,1024]};
export const spriteURL=sheet=>`assets/painted-v1/${ATLASES[sheet].file}`;
const images=new Map();
export function preloadArt(){for(const sheet of Object.keys(ATLASES))if(!images.has(sheet)){const image=new Image();image.decoding='async';image.src=spriteURL(sheet);images.set(sheet,image);}return Promise.all([preloadCharacters(),...[...images.values()].map(image=>image.decode().catch(()=>{}))]);}
export function artStatus(){return {...Object.fromEntries([...images].map(([key,image])=>[key,image.complete&&image.naturalWidth>0])),...Object.fromEntries(Object.entries(characterStatus()).map(([key,v])=>['motion-'+key,v]))};}
export function drawSprite(c,key,x,y,{height=90,width=Infinity,anchorX=.5,anchorY=1,flip=false,rotation=0,alpha=1}={}){
 const s=SPRITES[key],image=s&&images.get(s.sheet);if(!image?.complete||!image.naturalWidth)return false;
 const [sx,sy,sw,sh]=s.rect,k=Math.min(height/sh,width/sw),w=sw*k,h=sh*k;
 c.save();c.translate(x,y);c.rotate(rotation);c.scale(flip?-1:1,1);c.globalAlpha*=alpha;c.imageSmoothingEnabled=true;
 c.drawImage(image,sx,sy,sw,sh,-w*anchorX,-h*anchorY,w,h);c.restore();return true;
}
export function spriteIcon(key,className='card-icon'){
 const s=SPRITES[key];if(!s){const shapes={bow:'<path d="M18 7q28 21 0 42M18 7q-7 21 0 42M16 28h30m-9-6 9 6-9 6" fill="none" stroke="#ead69b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',blades:'<path d="M13 44L39 10l5 3-23 36zm30 0L20 10l-5 3 20 36z" fill="#e7dfbd" stroke="#8b9478" stroke-width="2"/><path d="M10 39l13 10m23-10L33 49" stroke="#c99b5e" stroke-width="5"/>',hammer:'<path d="M27 18v33" stroke="#a98150" stroke-width="7"/><path d="M9 8h38l4 17H5z" fill="#ddd3aa" stroke="#81896c" stroke-width="3"/><path d="M13 12h30" stroke="#f1e4bd" stroke-width="3"/>'};if(!shapes[key])return '';return `<svg class="${className} painted-icon vector-weapon-icon" viewBox="0 0 56 56" aria-hidden="true" focusable="false">${shapes[key]}</svg>`;}const atlas=ATLASES[s.sheet];
 return `<svg class="${className} painted-icon" viewBox="${s.rect.join(' ')}" aria-hidden="true" focusable="false"><image href="${spriteURL(s.sheet)}" width="${atlas.size[0]}" height="${atlas.size[1]}"/></svg>`;
}
function drawWeapon(c,key,x,y,{height=70,anchorX=.5,anchorY=.5,flip=false,rotation=0,alpha=1}={}){
 if(drawSprite(c,key,x,y,{height,anchorX,anchorY,flip,rotation,alpha}))return true;
 if(!['bow','blades','hammer'].includes(key))return false;
 const scale=height/70;c.save();c.translate(x,y);c.rotate(rotation);c.scale((flip?-1:1)*scale,scale);c.globalAlpha*=alpha;c.lineCap='round';c.lineJoin='round';
 if(key==='bow'){
  c.beginPath();c.moveTo(-6,-31);c.quadraticCurveTo(18,0,-6,31);c.quadraticCurveTo(-15,0,-6,-31);c.strokeStyle='#e5cd8d';c.lineWidth=4;c.stroke();c.beginPath();c.moveTo(-8,-30);c.lineTo(-8,30);c.strokeStyle='#e8e4c5';c.lineWidth=1.5;c.stroke();c.beginPath();c.moveTo(-8,0);c.lineTo(27,0);c.strokeStyle='#baa06b';c.lineWidth=3;c.stroke();c.beginPath();c.moveTo(30,0);c.lineTo(21,-5);c.lineTo(23,0);c.lineTo(21,5);c.closePath();c.fillStyle='#eee4bd';c.fill();
 }else if(key==='blades'){
  for(const side of [-1,1]){c.save();c.rotate(side*.34);c.beginPath();c.moveTo(side*4,-32);c.lineTo(side*10,10);c.lineTo(side*3,19);c.lineTo(side*-2,9);c.closePath();c.fillStyle='#e9e2c1';c.strokeStyle='#879078';c.lineWidth=2;c.fill();c.stroke();c.beginPath();c.moveTo(-8,14);c.lineTo(8,14);c.strokeStyle='#d2a766';c.lineWidth=4;c.stroke();c.restore();}
 }else{
  c.beginPath();c.moveTo(0,-14);c.lineTo(0,32);c.strokeStyle='#9d7448';c.lineWidth=7;c.stroke();c.beginPath();c.moveTo(-19,-29);c.lineTo(19,-29);c.lineTo(24,-10);c.lineTo(-24,-10);c.closePath();c.fillStyle='#ddd3aa';c.strokeStyle='#7e866c';c.lineWidth=3;c.fill();c.stroke();c.beginPath();c.moveTo(-15,-24);c.lineTo(16,-24);c.strokeStyle='#f1e5bc';c.lineWidth=3;c.stroke();
 }
 c.restore();return true;
}
export function drawRanger(c,h,t,{moving=false,step=0,reduced=false,pose}={}){
 if(pose){
  c.save();if(h.invulnerable>0&&Math.floor(t*20)%2)c.globalAlpha=.55;
  const spear=h.weapon==='spear',attacking=h.swing>0&&!reduced;
  const carry=()=>{c.save();c.translate(h.x,h.y+13);c.scale(pose.flip?-1:1,1);c.rotate(pose.lean||0);
   // Keep stowed weapons high across the shoulder blades. The previous lower,
   // near-vertical mount crossed the new running legs and read like a cane.
    drawWeapon(c,h.weapon,spear?0:-3,spear?-58:-51,{height:spear?70:h.weapon==='hammer'?58:52,anchorX:spear?.5:.34,anchorY:.5,rotation:spear?-.88:-.78});c.restore();};
  if(!attacking&&!pose.back)carry();
  const grip=drawCharacter(c,'ranger',h.x,h.y+13,pose,{weapon:h.weapon});
  if(grip){
   if(!attacking&&pose.back)carry();
   if(attacking&&!grip.integratedWeapon){c.save();c.translate(h.x,h.y+13);c.scale(pose.flip?-1:1,1);c.rotate(pose.lean||0);
    const age=1-h.swing/.2,strike=Math.sin(age*Math.PI);c.translate(grip.x,grip.y);
     drawWeapon(c,h.weapon,0,0,{height:spear?82:h.weapon==='hammer'?68:60,anchorX:spear?.5:.28,anchorY:spear?.65:.76,rotation:(spear?-.6:-.52)+(spear?1.55:1.7)*strike});
    c.beginPath();c.ellipse(0,0,1.9,2.4,0,0,Math.PI*2);c.fillStyle='#806146';c.fill();c.restore();}
   c.restore();
   c.save();c.beginPath();c.arc(h.x,h.y,34,h.angle-.25,h.angle+.25);c.strokeStyle='#efdaa37a';c.lineWidth=2;c.stroke();c.restore();return true;
  }c.restore();
 }
 const back=Math.sin(h.angle)<-.35,flip=Math.cos(h.angle)<0,frame=moving&&!reduced?[1,0,2,0][Math.floor(step)%4]:0;
  const key=`hero-${back?'up':'down'}-${frame}`;if(!images.get('ranger')?.naturalWidth)return false;
 c.save();c.translate(h.x,h.y);c.scale(flip?-1:1,1);if(h.invulnerable>0&&Math.floor(t*20)%2)c.globalAlpha=.55;
 const bob=reduced?0:moving?Math.sin(step*Math.PI)*1.3:Math.sin(t*2.5)*.65;
  const weapon=()=>{const swing=h.swing>0?Math.sin((.2-h.swing)/.2*Math.PI):0,spear=h.weapon==='spear';drawWeapon(c,h.weapon,back?14:16,-21+bob,{height:spear?94:h.weapon==='hammer'?70:63,anchorX:spear?.5:.26,anchorY:spear?.65:.76,rotation:(spear?.12:-.15)+swing*(spear?1.05:1.6)});};
 if(back)weapon();drawSprite(c,key,0,15+bob,{height:92});if(!back)weapon();c.restore();
 c.save();c.beginPath();c.arc(h.x,h.y,34,h.angle-.25,h.angle+.25);c.strokeStyle='#efdaa37a';c.lineWidth=2;c.stroke();c.restore();return true;
}
