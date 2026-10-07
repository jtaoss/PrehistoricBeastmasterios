const asset=name=>new URL(`./assets/audio/sfx/${name}`,import.meta.url).href;

export const SOUND_ASSETS=Object.freeze({
  attack:{files:['attack-slice-1.m4a','attack-slice-2.m4a'],gain:.36,interval:.11,channels:2},
  build:{files:['build-wood.m4a'],gain:.5},
  dash:{files:['dash-cloth.m4a'],gain:.42},
  collect:{files:['collect-coins.m4a'],gain:.42},
  kill:{files:['kill-impact.m4a'],gain:.4,interval:.07,channels:2},
  hurt:{files:['hurt-impact.m4a'],gain:.48,interval:.12},
  combo:{files:['reward-confirm.m4a'],gain:.5,interval:.12},
  wave:{files:['wave-horn.m4a'],gain:.58},
  ignite:{files:['ignite-crystal.m4a'],gain:.43,interval:.1},
  skill:{files:['skill-chop.m4a'],gain:.48,interval:.1},
  weapon:{files:['weapon-draw.m4a'],gain:.44},
  purchase:{files:['purchase-coins.m4a'],gain:.45},
  objective:{files:['wave-horn.m4a'],gain:.35,interval:.2},
  'objective-complete':{files:['reward-confirm.m4a'],gain:.52},
  'weakpoint-broken':{files:['skill-chop.m4a'],gain:.55,interval:.12},
  'market-ready':{files:['reward-confirm.m4a'],gain:.38},
  ui:{files:['ui-select.m4a'],gain:.34,interval:.04},
  error:{files:['error.m4a'],gain:.42,interval:.12}
});

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const clock=()=>((globalThis.performance?.now?.()||Date.now())/1000);

export class SoundEffects{
  constructor({createAudio=source=>new Audio(source),now=clock}={}){
    this.createAudio=createAudio;
    this.now=now;
    this.players=new Map();
    this.cursor=new Map();
    this.lastPlayed=new Map();
    for(const [kind,definition] of Object.entries(SOUND_ASSETS)){
      const channels=Math.max(1,definition.channels||1),pool=[];
      for(const file of definition.files)for(let channel=0;channel<channels;channel++){
        const media=createAudio(asset(file));
        media.preload='auto';
        media.playsInline=true;
        pool.push(media);
      }
      this.players.set(kind,pool);
    }
  }

  play(kind,volume=1){
    const definition=SOUND_ASSETS[kind],pool=this.players.get(kind);
    if(!definition||!pool?.length||volume<=0)return false;
    const now=this.now(),last=this.lastPlayed.get(kind)??-Infinity;
    if(now-last<(definition.interval||0))return true;
    this.lastPlayed.set(kind,now);
    const available=pool.find(player=>player.paused||player.ended);
    const index=this.cursor.get(kind)||0,player=available||pool[index%pool.length];
    this.cursor.set(kind,(pool.indexOf(player)+1)%pool.length);
    try{
      player.volume=clamp(volume*definition.gain);
      player.currentTime=0;
      Promise.resolve(player.play()).catch(()=>{});
      return true;
    }catch{return false;}
  }

  dispose(){
    for(const pool of this.players.values())for(const player of pool){try{player.pause();player.currentTime=0;}catch{}}
    this.players.clear();
  }
}

