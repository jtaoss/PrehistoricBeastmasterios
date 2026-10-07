import assert from 'node:assert/strict';
import {SOUND_ASSETS,SoundEffects} from '../sound-effects.mjs';

const players=[];let now=10;
const createAudio=src=>{const player={src,paused:true,ended:false,currentTime:9,volume:0,preload:'',playsInline:false,plays:0,play(){this.paused=false;this.plays++;return Promise.resolve();},pause(){this.paused=true;}};players.push(player);return player;};
const sfx=new SoundEffects({createAudio,now:()=>now});

assert.ok(Object.keys(SOUND_ASSETS).length>=16);
assert.ok(players.every(player=>player.preload==='auto'&&player.playsInline));
assert.equal(sfx.play('attack',.5),true);
const first=players.find(player=>player.plays===1);assert.ok(first);assert.equal(first.currentTime,0);assert.ok(first.volume>0&&first.volume<=.5);
assert.equal(sfx.play('attack',.5),true);assert.equal(players.reduce((sum,player)=>sum+player.plays,0),1,'rapid attack is throttled');
now+=.12;assert.equal(sfx.play('attack',.5),true);assert.equal(players.reduce((sum,player)=>sum+player.plays,0),2);
assert.equal(sfx.play('unknown',1),false);assert.equal(sfx.play('hurt',0),false);
sfx.dispose();assert.equal(sfx.players.size,0);assert.ok(players.every(player=>player.paused&&player.currentTime===0));
console.log('PASS licensed sample sound effects preload, throttle, mix volume and dispose safely');
