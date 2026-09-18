const STORAGE_KEY='emberwild_experience_v1';
const DEFAULTS=Object.freeze({haptics:true,volume:.65,powerSaver:false,fontSize:'normal',quality:'auto'});
const FONT_SIZES=new Set(['small','normal','large']);
const QUALITIES=new Set(['auto','high','balanced','low']);

function storage(){try{return window.localStorage;}catch{return null;}}
function normalise(value={}){
  const volume=Number(value.volume);
  return {
    haptics:value.haptics!==false,
    volume:Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULTS.volume,
    powerSaver:value.powerSaver===true,
    fontSize:FONT_SIZES.has(value.fontSize)?value.fontSize:DEFAULTS.fontSize,
    quality:QUALITIES.has(value.quality)?value.quality:DEFAULTS.quality
  };
}
function load(){
  try{return normalise(JSON.parse(storage()?.getItem(STORAGE_KEY)||'{}'));}
  catch{return {...DEFAULTS};}
}

let preferences=load(),nativeLowPower=false;
const listeners=new Set();
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');

function effectiveLowPower(){return preferences.powerSaver||nativeLowPower;}
function apply(){
  const root=document.documentElement;
  root.dataset.fontSize=preferences.fontSize;
  root.dataset.quality=preferences.quality;
  root.dataset.lowPower=String(effectiveLowPower());
  root.style.colorScheme='dark';
  listeners.forEach(listener=>listener(experience.settings));
}
function persist(){try{storage()?.setItem(STORAGE_KEY,JSON.stringify(preferences));}catch{}}

export const experience={
  get settings(){return Object.freeze({...preferences,nativeLowPower,effectiveLowPower:effectiveLowPower()});},
  update(patch){preferences=normalise({...preferences,...patch});persist();apply();return this.settings;},
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  renderScale(){
    const dpr=Math.max(1,devicePixelRatio||1);
    if(effectiveLowPower()||preferences.quality==='low')return Math.min(dpr,1);
    if(preferences.quality==='balanced')return Math.min(dpr,1.5);
    if(preferences.quality==='high')return Math.min(dpr,2);
    return Math.min(dpr,matchMedia('(max-width: 760px)').matches?1.5:2);
  },
  reducedEffects(){return effectiveLowPower()||preferences.quality==='low'||motionQuery.matches;},
  haptic(style='light'){
    if(!preferences.haptics)return false;
    try{
      const bridge=window.webkit?.messageHandlers?.gameHaptics;
      if(bridge){bridge.postMessage({style});return true;}
      if(navigator.vibrate){navigator.vibrate(style==='success'?[18,35,24]:style==='warning'?[30,40,30]:style==='heavy'?28:style==='medium'?18:10);return true;}
    }catch{}
    return false;
  },
  setNativeLowPower(active){nativeLowPower=Boolean(active);apply();},
  reset(){preferences={...DEFAULTS};persist();apply();}
};

window.setShellLowPowerMode=active=>experience.setNativeLowPower(active);
window.setShellAppActive=active=>window.dispatchEvent(new CustomEvent('emberwild-shell-active',{detail:{active:Boolean(active)}}));
motionQuery.addEventListener?.('change',apply);
apply();

export {STORAGE_KEY as EXPERIENCE_STORAGE_KEY};
