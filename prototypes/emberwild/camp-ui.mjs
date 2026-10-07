import { FACILITIES, buildCamp, moveCamp } from './camp.mjs';
import { CampWalk, CAMP_WORLD, CAMP_SITES, campObstacles } from './camp-world.mjs';
import { CampRenderer } from './camp-renderer.mjs';
import { spriteIcon } from './painted-art.mjs';
import { experience } from './experience.mjs';
import {controlLabel} from './control-hints.mjs';

const $=id=>document.getElementById(id);
const pictures={
  tent:'<path d="M10 76L53 18l42 58z" fill="#467c69" stroke="#203f32" stroke-width="3"/><path d="M53 18l14 58H10z" fill="#c3ae79"/><path d="M53 40l-14 36h28z" fill="#293d29"/><path d="M49 14l48 65M54 14L8 80" stroke="#dec790" stroke-width="4"/><path d="M27 72l13-21" stroke="#ead9aa" stroke-width="2"/>',
  forge:'<path d="M17 79V47l23-23h37l17 25v30z" fill="#857e66"/><path d="M23 38h62l-14-22H43z" fill="#596d54"/><path d="M37 78V57a18 18 0 0136 0v21" fill="#29382b"/><path d="M51 75c-16-9-2-18 3-29 7 15 18 20 4 29" fill="#f5b968"/><path d="M56 71c-6-7-2-9 1-16 9 11 5 15-1 16" fill="#ffe5a3"/><path d="M79 17V3h12v31" fill="#74826b"/>',
  cache:'<path d="M13 80V39h77v41z" fill="#a78351"/><path d="M7 38l45-26 46 26z" fill="#52836a"/><path d="M20 46h63M20 57h63M20 69h63" stroke="#c6a76d" stroke-width="3"/><path d="M27 37v43m43-43v43" stroke="#5e553c" stroke-width="5"/><path d="M42 77V53h23v24" fill="#684e33"/><path d="M49 61h9v8h-9z" fill="#f0d58e"/>',
  nursery:'<path d="M10 79V47l43-29 41 29v32z" fill="#b9d8b170" stroke="#b0c698" stroke-width="3"/><path d="M9 47l44-29 41 29M53 18v61M12 49h80" stroke="#d8c99a" stroke-width="4"/><ellipse cx="54" cy="74" rx="28" ry="11" fill="#8a7448"/><ellipse cx="42" cy="61" rx="12" ry="17" fill="#e5e7bd"/><ellipse cx="64" cy="64" rx="10" ry="14" fill="#c7dba8"/><path d="M38 53l8 7m15-2l5 6" stroke="#99b881" stroke-width="4"/>'
};
export const facilityIcon=type=>spriteIcon(type,'facility-icon')||`<svg viewBox="0 0 106 96" class="facility-icon" aria-hidden="true"><ellipse cx="53" cy="83" rx="44" ry="9" fill="#10281c40"/>${pictures[type]||''}</svg>`;
export class CampUI {
  constructor(store,{onError,onInteract,isPaused}) {
    this.store=store;this.onError=onError;this.onInteract=onInteract;this.isPaused=isPaused;
    this.walk=new CampWalk(store.state.camp.position);this.painter=new CampRenderer($('camp-world'));
    this.keys=new Set();this.stick={x:0,y:0};this.pointer=null;this.sprint=false;this.busy=false;this.saving=null;this.lastSave=0;this.lastFrame=0;this.lastPowerFrame=0;this.movingFrom=null;
    window.addEventListener('keydown',e=>{
      if(!this.active||this.paused||e.ctrlKey||e.metaKey||e.altKey)return;
      const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','e','escape'].includes(k)){
        e.preventDefault();if(k==='e'){if(!e.repeat)this.interact();return;}if(k==='escape'){this.movingFrom=null;this.clear();this.message('已取消行走或搬遷。');return;}this.keys.add(k);
      }
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
    $('camp-world').addEventListener('pointerdown',e=>{
      if(!this.active||this.paused||e.button>0)return;e.preventDefault();$('camp-world').focus({preventScroll:true});
      const p=this.painter.point(e.clientX,e.clientY),site=CAMP_SITES.find(s=>Math.hypot(s.x-p.x,s.y-p.y)<85);
      if(site)this.travel(site.id);else if(!this.walk.goTo(p.x,p.y,campObstacles(this.store.state)))this.message('這裡無法通行，請點建築前方的空地。');
    });
    for(const event of ['contextmenu','selectstart'])$('camp').addEventListener(event,e=>e.preventDefault());
    $('camp-waypoints-toggle').addEventListener('click',()=>this.setWaypoints(!$('camp-waypoints').classList.contains('open')));
    for(const b of document.querySelectorAll('[data-walk-to]'))b.addEventListener('click',()=>{this.setWaypoints(false);this.travel(b.dataset.walkTo);});
    $('camp-interact').addEventListener('click',()=>this.interact());
    $('camp-cancel-move').addEventListener('click',()=>{this.movingFrom=null;this.clear();this.message('已取消搬遷，原建築保持不變。');});
    $('camp-joystick').addEventListener('pointerdown',e=>{if(!this.active||this.paused||this.pointer!==null)return;e.preventDefault();this.pointer=e.pointerId;$('camp-joystick').setPointerCapture(e.pointerId);this.moveStick(e);});
    $('camp-joystick').addEventListener('pointermove',e=>this.moveStick(e));
    for(const event of ['pointerup','pointercancel','lostpointercapture'])$('camp-joystick').addEventListener(event,e=>{if(e.pointerId===this.pointer){this.pointer=null;this.stick={x:0,y:0};$('camp-stick').style.transform='';}});
    $('camp-sprint').addEventListener('pointerdown',e=>{if(this.paused)return;e.preventDefault();this.sprint=true;$('camp-sprint').setPointerCapture(e.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])$('camp-sprint').addEventListener(event,()=>this.sprint=false);
    new ResizeObserver(()=>this.painter.resize()).observe($('camp-world'));
  }
  get active(){return !$('camp').hidden;}
  get paused(){return this.busy||this.store.blocked||this.isPaused()||document.hidden;}
  enter(){this.clear();this.setWaypoints(false);this.walk.restore(this.store.state.camp.position);this.ensureFree();this.painter.resize();this.render();this.lastFrame=performance.now();this.lastSave=this.lastFrame;this.movingFrom=null;this.message(this.store.warning||'自由走動，走近行商購買卡牌；空地可建設，山口可出征。');}
  setWaypoints(open){$('camp-waypoints').classList.toggle('open',open);$('camp-waypoints-toggle').setAttribute('aria-expanded',String(open));$('camp-waypoints-toggle').textContent=open?'收起':'路標';}
  ensureFree(){if(this.walk.free(this.walk,campObstacles(this.store.state)))return;const near=CAMP_SITES.find(s=>Math.hypot(s.x-this.walk.x,s.y-this.walk.y)<100);if(near){this.walk.x=near.x;this.walk.y=near.y+110;}else this.walk.restore(CAMP_WORLD.start);}
  clear(){this.keys.clear();this.stick={x:0,y:0};this.pointer=null;this.sprint=false;this.walk.stop();$('camp-stick').style.transform='';}
  moveStick(e){if(e.pointerId!==this.pointer)return;const r=$('camp-joystick').getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,max=r.width*.34,len=Math.max(max,Math.hypot(dx,dy));this.stick={x:dx/len,y:dy/len};$('camp-stick').style.transform=`translate(${this.stick.x*max}px,${this.stick.y*max}px)`;}
  message(text){$('camp-message').textContent=text;}
  nearbyResident(){return this.painter.nearestResident(this.walk);}
  canInteractResident(type){return this.nearbyResident()?.type===type;}
  travel(id){if(!this.active||this.paused)return;const s=CAMP_SITES.find(s=>s.id===id);if(!s)return;this.clear();if(this.walk.goTo(s.x,s.y+110,campObstacles(this.store.state)))this.message(`正在走向${s.label}，抵達後按「互動」。`);else this.message('這條路暫時無法通行，請從另一側靠近。');}
  interact(){if(!this.active||this.paused)return;const resident=this.nearbyResident(),site=this.walk.nearest(),siteDistance=site?Math.hypot(site.x-this.walk.x,site.y-this.walk.y):Infinity,s=resident&&resident.distance<siteDistance?{id:`npc-${resident.type}`,kind:'npc',npc:resident.type,label:resident.type==='porter'?'搬運工阿拓':'巡林獵人瑟雅'}:site;if(!s){this.message('再靠近一點，就能與設施或居民互動。');return;}experience.haptic('selection');this.clear();this.onInteract(s);}
  render(){
    $('camp-stones').textContent=this.store.state.camp.stones;
    $('camp-save-status').textContent=this.store.warning||(this.store.savedAt?`✓ 本機已存檔 · ${new Date(this.store.savedAt).toLocaleTimeString('zh-TW',{hour12:false})}`:'移動、建設與交易自動存檔');
  }
  frame(t){
    if(!this.active){this.lastFrame=t;return;}if(experience.settings.effectiveLowPower&&t-this.lastPowerFrame<32)return;this.lastPowerFrame=t;const dt=Math.min((t-this.lastFrame)/1000||0,.05);this.lastFrame=t;
    const has=k=>this.keys.has(k)?1:0;
    this.walk.tick(dt,{x:this.stick.x+has('d')+has('arrowright')-has('a')-has('arrowleft'),y:this.stick.y+has('s')+has('arrowdown')-has('w')-has('arrowup'),sprint:this.sprint||!!has('shift'),paused:this.paused},campObstacles(this.store.state));
    this.painter.draw(this.walk,this.store.state,dt);
    const site=this.walk.nearest(),resident=this.nearbyResident(),siteDistance=site?Math.hypot(site.x-this.walk.x,site.y-this.walk.y):Infinity,s=resident&&resident.distance<siteDistance?{kind:'npc',npc:resident.type,label:resident.type==='porter'?'搬運工阿拓':'巡林獵人瑟雅'}:site,b=s?.kind==='plot'&&this.store.state.camp.buildings.find(b=>b.slot===s.slot);
    $('camp-nearby').textContent=s?(b?FACILITIES[b.type].name:s.label):'走近設施或居民互動';
    $('camp-interact').disabled=!s||this.paused;
    const label=controlLabel(s?.kind==='npc'?'交談 / 委託':s?.kind==='merchant'?'交談 / 購物':s?.kind==='gate'?'準備出征':s?.kind==='plot'?(b?'查看 / 生產 / 升級':this.movingFrom!==null?'搬遷到此處':'建設地塊'):'互動','E');
    if($('camp-interact').textContent!==label)$('camp-interact').textContent=label;
    $('camp-cancel-move').hidden=this.movingFrom===null;
    if(t-this.lastSave>2500&&!this.paused){this.lastSave=t;this.savePosition();}
  }
  positionChanged(){const p=this.store.state.camp.position,n=this.walk.snapshot();return !p||p.x!==n.x||p.y!==n.y||p.angle!==n.angle;}
  async savePosition(){if(this.saving)return this.saving;if(!this.active||this.busy||this.store.blocked||!this.positionChanged())return;this.saving=this.store.mutate(s=>{s.camp.position=this.walk.snapshot();}).then(()=>this.render()).catch(e=>this.onError(e)).finally(()=>this.saving=null);return this.saving;}
  flush(){if(!this.active||this.busy||this.store.blocked||!this.positionChanged())return;try{this.store.commit(s=>{s.camp.position=this.walk.snapshot();});this.render();}catch(e){this.onError(e);}}
  async change(fn,message){if(this.busy)return false;this.busy=true;this.clear();try{await this.store.mutate(s=>{fn(s);this.ensurePositionFor(s);s.camp.position=this.walk.snapshot();});experience.haptic('success');this.message(message);return true;}catch(e){experience.haptic('warning');this.message(e.message);if(e.code==='CONFLICT'||/存檔|儲存/.test(e.message))this.onError(e);return false;}finally{this.busy=false;this.render();}}
  ensurePositionFor(state){if(!this.walk.free(this.walk,campObstacles(state))){const s=this.walk.nearest();if(s){this.walk.x=s.x;this.walk.y=s.y+110;}}}
  build(type,slot){if(!this.walk.canInteract('plot-'+slot)){this.message('請走近這塊地，再建設或升級。');return false;}return this.change(s=>buildCamp(s,type,slot),`${FACILITIES[type].name} 已建設完成，並保存到本機。`);}
  moveBuilding(from,to){if(!this.walk.canInteract('plot-'+to)){this.message('請走近目的地塊，再放置建築。');return false;}return this.change(s=>moveCamp(s,from,to),'建築已搬遷並保存，沒有消耗營火石。');}
}
