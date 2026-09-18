import { Expedition, CARDS, HIRES, DEPLOY_CARDS, UPGRADES, ACTIVE_SKILLS, MAX_WAVES } from './engine.mjs';
import { marketContent } from './merchant-ui.mjs';
import { Painter, icon } from './art.mjs';
import { SaveStore, SAVE_KEY, decode, encode } from './save.mjs';
import { FACILITIES, createExpedition } from './camp.mjs';
import { CampUI, facilityIcon } from './camp-ui.mjs';
import { spriteIcon } from './painted-art.mjs';
import { experience } from './experience.mjs';

const $ = id => document.getElementById(id);
// QA routes are visual sandboxes. They must never compete with the player's
// real expedition save, even when a preview and the normal game are open.
const qaMode=['127.0.0.1','localhost'].includes(location.hostname)?new URLSearchParams(location.search).get('qa'):null;
const STAGES=Object.freeze([
  {name:'蕨谷入口',region:'FERN VALLEY',hint:'營地邊境',rule:'熟悉移動、自動攻擊與卡牌建造',tactic:'迅猛獸從林緣來襲 · 守住聖獸卵'},
  {name:'巨蕨巢道',region:'GIANT FERN HOLLOW',hint:'獸群伏擊',rule:'左右兩側交替出現高速獸群',tactic:'注意兩翼夾擊 · 骨牆可爭取建造時間'},
  {name:'潮汐濕地',region:'TIDAL MARSH',hint:'母獸巢心',rule:'毒液獸掩護沼澤母獸召喚幼獸',tactic:'閃開扇形毒液 · 母獸半血時會召喚幼獸'},
  {name:'古獸石陣',region:'BEAST-STONE RUINS',hint:'遺跡守衛',rule:'重甲骨背獸由四座遺跡包圍進場',tactic:'投獸器壓制重甲獸 · 骨牆爆破打散包圍'},
  {name:'琥珀山脊',region:'AMBER RIDGE',hint:'熔晶裂谷',rule:'精英獸群從整圈山脊持續壓境',tactic:'混合獸群來襲 · 預留衝刺路線並保護後排'},
  {name:'熔灰林',region:'ASHEN CANOPY',hint:'灼熱伏擊',rule:'骨甲衝角獸在焦木間蓄力衝鋒',tactic:'離開橙色衝鋒線 · 半血後衝角獸會狂暴'},
  {name:'月骨峽谷',region:'MOONBONE RAVINE',hint:'月夜圍獵',rule:'狹長峽谷裡迎戰密集混合獸群',tactic:'用投獸器控制獸群 · 保留骨牆處理兩翼'},
  {name:'泰坦聖所',region:'TITAN SANCTUARY',hint:'最終試煉',rule:'琥珀泰坦鎮守最後的史前聖所',tactic:'躲開震地圓環 · 泰坦半血後範圍擴大'}
]);
let g = null, painter = null, drag = null, selected = null, lastHand = '', modalKind = '', toastUntil = 0, lastTime = 0;
let stickPointer = null, stickX = 0, stickY = 0, soundEnabled = experience.settings.volume > 0, audio = null, lastSound = 0, lastAudibleVolume = experience.settings.volume || .65;
let settingsResumeGame=false,settingsReturnToPause=false,lastRenderedFrame=0;
const keys = new Set();
let storage;
try { storage=window.localStorage; } catch { storage={getItem(){throw new Error('Storage unavailable');}}; }
const store=new SaveStore(storage,navigator.locks||null);
let campUI, checkpointPending=null, lastAutoSave=0, working=false, pendingImport=null, saveFailed=false;
let marketTab='build',routeOrigin='camp';
const readonlyQADemo=()=>Boolean(qaMode&&g?.runId?.startsWith('qa-'));
function refreshSaveUI(){
  $('continue-run').hidden=!store.state.run;
  $('continue-run').textContent=store.state.run?`繼續遠征 · 第 ${store.state.run.wave||1} 波 ↗`:'繼續遠征 ↗';
  $('landing-save-note').textContent=store.warning||'本機自動存檔 · 清除網站資料前請先匯出備份';
  const qaReadonly=readonlyQADemo();
  $('save-game').disabled=qaReadonly;
  $('save-game').textContent=qaReadonly?'測':saveFailed?'!':'存';$('save-game').classList.toggle('save-error',saveFailed&&!qaReadonly);
  $('save-game').title=qaReadonly?'QA 預覽不寫入真實存檔':saveFailed?'儲存失敗，請重試':store.savedAt?`最後儲存 ${new Date(store.savedAt).toLocaleTimeString()}`:'儲存遠征';
  if(!$('camp').hidden)campUI?.render();
}
function saveFailure(error){
  saveFailed=true;clearInput();if(g)g.paused=true;refreshSaveUI();
  openModal('save-error','先保護你的進度',error.message,'<p class="howto">未成功保存的操作不會顯示為「已存檔」。載入其他頁面的最新存檔，會放棄本頁未儲存的變更。</p>',error.code==='CONFLICT'?'<button class="primary" data-action="reload-save">載入最新存檔</button><button class="secondary" data-action="export-save">匯出本機備份</button>':'<button class="primary" data-action="retry-save">重試儲存</button><button class="secondary" data-action="export-save">匯出本機備份</button>');
}
async function checkpoint(manual=false){
  const game=g;
  if(!game||['win','lose'].includes(game.phase))return true;
  if(readonlyQADemo()){if(manual)notify('QA 預覽為唯讀，不會改動真實存檔');return true;}
  if(checkpointPending)return checkpointPending;
  lastAutoSave=performance.now();
  checkpointPending=store.saveRun(()=>game.snapshot()).then(()=>{saveFailed=false;refreshSaveUI();if(manual)notify('✓ 遠征已儲存到本機');return true;}).catch(error=>{saveFailure(error);return false;}).finally(()=>{checkpointPending=null;});
  return checkpointPending;
}
function flush(){
  if(readonlyQADemo())return;
  // Do not persist a tentative purchase before its transaction commits or rolls back.
  if(working&&modalKind==='merchant')return;
  if(campUI?.active&&!saveFailed)campUI.flush();
  if(!g||['win','lose'].includes(g.phase)||store.state.run?.runId!==g.runId)return;
  try{store.flushRun(g.snapshot());saveFailed=false;refreshSaveUI();}catch(e){saveFailed=true;refreshSaveUI();}
}
function sound(kind) {
  const volume=experience.settings.volume;
  if (!soundEnabled||volume<=0) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const now = audio.currentTime;
    if (kind === 'attack' && now - lastSound < .12) return;
    const notes = { attack: [180, .05, 'triangle'], build: [510, .13, 'sine'], dash: [280, .1, 'sine'], collect: [860, .055, 'sine'], kill: [370, .055, 'triangle'], hurt: [95, .14, 'triangle'], combo: [660, .18, 'sine'], wave: [150, .3, 'triangle'], ignite: [570, .05, 'sine'] };
    const [freq, length, type] = notes[kind] || [440, .05, 'sine'];
    const osc = audio.createOscillator(), gain = audio.createGain();osc.type = type;osc.frequency.setValueAtTime(freq, now);osc.frequency.exponentialRampToValueAtTime(freq * .55, now + length);
    gain.gain.setValueAtTime(.035*volume, now);gain.gain.exponentialRampToValueAtTime(.001, now + length);osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now + length);lastSound = now;
  } catch { soundEnabled = false; updateSoundButton(); }
}
function updateSoundButton() { soundEnabled=experience.settings.volume>0;$('sound').classList.toggle('sound-on', soundEnabled); $('sound').setAttribute('aria-pressed', String(soundEnabled)); $('sound').setAttribute('aria-label', soundEnabled ? '關閉音效' : '開啟音效'); }
function notify(message, duration = 2800) { $('toast').textContent = message; $('toast').classList.add('visible'); toastUntil = performance.now() + duration; }
function hideWaveLoot(){
  $('wave-loot').hidden=true;$('arena').classList.remove('showing-loot');
  if($('wave-loot').contains(document.activeElement))$('next-wave').focus({preventScroll:true});
}
function showWaveLoot(reward){
  $('wave-loot-title').textContent=`${STAGES[g.wave-1].name} · 已守住`;
  $('wave-loot-items').innerHTML=[['wood','木材','▰'],['bone','獸骨','✧'],['amber','琥珀','◆']].map(([key,label,symbol])=>`<div class="wave-loot-item ${key}"><i aria-hidden="true">${key==='amber'?spriteIcon('amber-crystal','loot-crystal-art'):symbol}</i><span>${label}<b>+${reward[key]}</b></span></div>`).join('');
  $('wave-loot-note').textContent=reward.survivors?`保留 ${reward.survivors} 座建築 · 修復 ${reward.repair}% 耐久`:'防線已清理 · 可重新部署';
  $('toast').classList.remove('visible');toastUntil=0;
  $('wave-loot').hidden=false;$('arena').classList.add('showing-loot');
}
$('dismiss-loot').addEventListener('click',hideWaveLoot);
$('loot-merchant').addEventListener('click',()=>{hideWaveLoot();showMarket();});
function clearInput() {
  campUI?.clear();
  keys.clear();stickX = stickY = 0; stickPointer = null;
  $('stick').style.transform = ''; cancelDrag(); selected = null;
}
function cancelDrag() {
  if (g) g.building = false;
  drag = null; $('drag-ghost').hidden = true; $('build-indicator').hidden = true;
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}
function mountRun(game){
  clearInput();closeModal();hideWaveLoot();g=game;
  $('landing').hidden = true; $('camp').hidden=true; $('route-map').hidden=true; $('game').hidden = false; lastHand = '';
  if (!painter) painter = new Painter($('world')); else painter.resize();
  updateHUD();renderHand();refreshSaveUI();lastTime=performance.now();lastAutoSave=lastTime;
}
async function start(replace=false) {
  if(working)return;working=true;
  try{
    if(campUI?.active)await campUI.savePosition();
    if(saveFailed)return;
    const next=createExpedition(store.state,(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0,crypto.randomUUID());
    await store.begin(next.snapshot(),replace);saveFailed=false;mountRun(next);refreshSaveUI();notify('營地加成已套用；拖卡佈防，準備好再召喚獸潮。',4800);
  }catch(error){saveFailure(error);}finally{working=false;}
}
function showCamp(){clearInput();closeModal();g=null;$('landing').hidden=true;$('game').hidden=true;$('route-map').hidden=true;$('camp').hidden=false;campUI.enter();refreshSaveUI();window.scrollTo(0,0);}
async function returnCamp(){
  if(working||!g)return;
  working=true;$('return-camp').disabled=true;clearInput();g.paused=true;
  try{if(await checkpoint())showCamp();}
  finally{working=false;$('return-camp').disabled=false;}
}
async function showHome(){if(campUI.active)await campUI.savePosition();if(saveFailed)return;clearInput();closeModal();g=null;$('game').hidden=true;$('camp').hidden=true;$('route-map').hidden=true;$('landing').hidden=false;refreshSaveUI();$('begin').focus();}
function routeRun(){return g&&store.state.run?.runId===g.runId?g:store.state.run;}
function renderRoute(){
  const run=routeRun(),completed=Math.min(MAX_WAVES,run?.stats?.waves||0),phase=run?.phase||'prep';
  const current=run?(phase==='wave'?run.wave:Math.min(MAX_WAVES,run.wave+1)):1;
  $('route-progress').textContent=`${completed} / ${MAX_WAVES}`;
  $('route-status').textContent=phase==='wave'?`${STAGES[current-1].name}戰鬥尚未結束，點擊返回戰場。`:completed?`已完成 ${completed} 關；下一站是${STAGES[current-1].name}。`:'選擇蕨谷入口，開始這次遠征。';
  for(const node of document.querySelectorAll('.route-node')){
    const stage=Number(node.dataset.stage),done=stage<=completed,active=phase==='wave'&&stage===current,available=phase!=='wave'&&stage===current,locked=!done&&!active&&!available;
    node.classList.toggle('completed',done);node.classList.toggle('active',active);node.classList.toggle('available',available);node.classList.toggle('locked',locked);
    node.disabled=done||locked;
    node.querySelector('.route-marker').textContent=done?'✓':active?'↗':locked?'◇':String(stage);
    node.setAttribute('aria-label',`${STAGES[stage-1].name}，${done?'已完成':active?'戰鬥中，返回戰場':available?'可挑戰':'尚未解鎖'}`);
  }
}
async function showRoute(origin='camp'){
  if(working||saveFailed)return;
  if(campUI.active)await campUI.savePosition();
  if(saveFailed)return;
  if(g&&origin==='game'){if(!await checkpoint())return;g.paused=true;}
  routeOrigin=origin;clearInput();closeModal();
  $('landing').hidden=true;$('camp').hidden=true;$('game').hidden=true;$('route-map').hidden=false;
  renderRoute();window.scrollTo(0,0);$('route-back').focus();
}
function leaveRoute(){
  if(routeOrigin==='game'&&g){$('route-map').hidden=true;$('game').hidden=false;g.paused=false;lastTime=performance.now();return;}
  if(routeOrigin==='home'){showHome();return;}
  showCamp();
}
async function chooseStage(stage){
  if(working||saveFailed)return;
  const saved=routeRun();
  if(!saved){if(stage!==1)return;await start();if(!g)return;}
  else if(!g){try{mountRun(Expedition.restore(store.state.run));}catch(error){saveFailure(error);return;}}
  else mountRun(g);
  g.paused=false;lastTime=performance.now();
  if(g.phase==='wave'&&stage===g.wave){updateHUD();return;}
  if(g.phase!=='prep'||stage!==g.wave+1)return;
  if(g.startWave()){updateHUD();notify(`${STAGES[stage-1].name} · 第 ${stage} 關開始`,3200);await checkpoint();}
}
function showMarket(tab=marketTab,message=''){
  if(!g||g.phase!=='prep'||working)return;
  marketTab=tab;g.paused=true;clearInput();
  openModal('merchant','荒境行商',g.wave?`第 ${g.wave} 波已完成，先補貨，再出發。`:'本次遠征備貨：建造防線，雇佣伙伴，選擇武技。',marketContent(g,tab,message),campUI.active?'<button class="primary" data-action="market-close">收好卡牌，繼續逛營地</button>':'<button class="primary" data-action="market-close">返回戰場 · 部署卡牌</button><button class="secondary" data-action="save-camp">儲存並回營地</button>');
}
function closeMarket(){closeModal();if(campUI.active){g=null;campUI.render();}else if(g){g.paused=false;lastTime=performance.now();checkpoint();}}
async function visitMerchant(){
  if(working||!campUI.walk.canInteract('merchant'))return;
  if(store.state.run&&store.state.run.phase!=='prep'){
    openModal('camp-site','行商正在等你歸來','已保存的遠征尚在戰鬥中，不能在營地繞過休整限制購物。先從山口繼續，完成這一波後再交易。','','<button class="primary" data-action="close-camp-site">知道了</button>');return;
  }
  working=true;clearInput();
  try{
    if(!store.state.run){const next=createExpedition(store.state,(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0,crypto.randomUUID());await store.begin(next.snapshot());}
    g=Expedition.restore(store.state.run);saveFailed=false;working=false;showMarket('build','備貨已建立本次遠征存檔，營地加成已套用。購買後可繼續逛營地，再走到山口出發。');refreshSaveUI();
  }catch(error){saveFailure(error);}finally{working=false;}
}
function campSite(site){
  if(!campUI.walk.canInteract(site.id))return;
  const state=store.state,back='<button class="secondary" data-action="close-camp-site">繼續逛營地</button>';
  if(site.kind==='merchant'){visitMerchant();return;}
  if(site.kind==='gate'){
    openModal('camp-site','遠征山口',state.run?'你的遠征進度與卡牌仍在，從地圖返回目前關卡。':'穿過山口，選擇第一站開始遠征。',`<p id="camp-run-summary" class="howto">${state.run?`已保存：完成 ${state.run.stats?.waves||0} / ${MAX_WAVES} 關 · ${Math.ceil(state.run.hero.hp)} 生命`:`${MAX_WAVES} 個地區 · 戰勝獲得材料 · 自由購買卡牌`}</p>`,`<button id="camp-start" class="primary" data-action="camp-depart">查看遠征地圖 ↗</button>${state.run?'<button id="camp-new" class="secondary" data-action="camp-new">放棄這次遠征，重新出發</button>':''}${back}`);return;
  }
  if(site.kind==='fire'){
    openModal('camp-site','火種仍在，歡迎回家','這是你的永久營地。建設花費營火石，效果在建立下一次遠征時套用；已保存的遠征不會追補加成。',`<div class="camp-bonus-list">${Object.entries(FACILITIES).map(([type,d])=>{const b=state.camp.buildings.find(b=>b.type===type);return `<div><span>${d.name}</span><b>${b?d.benefit(b.level):'尚未建造'}</b></div>`;}).join('')}</div><p class="howto">遠征 ${state.profile.runs} 次 · 最佳 ${state.profile.best}/${MAX_WAVES} · 通關 ${state.profile.victories} 次<br>${state.lastResult?`上次帶回 ${state.lastResult.stones} 營火石。`:''}</p>`,back);return;
  }
  const b=state.camp.buildings.find(b=>b.slot===site.slot);
  if(!b&&campUI.movingFrom!==null){
    openModal('camp-site','把建築安置在這裡？','免費搬遷，不改變建築等級或營地加成。','',`<button class="primary" data-action="camp-place-building" data-slot="${site.slot}">確認搬遷</button>${back}`);return;
  }
  if(b){const d=FACILITIES[b.type];openModal('camp-site',`${d.name} · ${b.level} 級`,d.desc,`${facilityIcon(b.type)}<p class="howto">目前效果：${d.benefit(b.level)}。<br>選擇搬遷後，走到另一塊空地安置。按 Esc 可取消。</p>`,`${b.level<3?`<button class="primary" data-action="facility-upgrade" data-slot="${b.slot}" ${state.camp.stones<d.costs[b.level]?'disabled':''}>升級 · ✦ ${d.costs[b.level]}</button>`:''}<button class="secondary" data-action="camp-move-building" data-slot="${b.slot}">搬遷建築</button>${back}`);return;}
  openModal('camp-site',site.label+' · 建設','選擇一張永久建築藍圖。每種一座，最高三級；營火石不足時可先遠征。',`<div class="camp-blueprint-options">${Object.entries(FACILITIES).map(([type,d])=>{const owned=state.camp.buildings.some(b=>b.type===type),disabled=owned||state.camp.stones<d.costs[0];return `<button data-action="camp-build" data-facility="${type}" data-slot="${site.slot}" ${disabled?'disabled':''}>${facilityIcon(type)}<b>${d.name}</b><small>${d.benefit(1)}</small><small>${owned?'已建造，走近原建築升級':`建造 · ✦ ${d.costs[0]}`}</small></button>`;}).join('')}</div>`,back);
}
async function purchase(id){
  if(working||modalKind!=='merchant'||!g)return;working=true;
  $('modal').setAttribute('aria-busy','true');
  $('modal').querySelectorAll('button').forEach(button=>button.disabled=true);
  if(checkpointPending)await checkpointPending;
  if(saveFailed){working=false;return;}
  const before=g.snapshot(),result=g.buy(id);
  if(!result.ok){working=false;showMarket(marketTab,result.reason);return;}
  try{await store.saveRun(()=>g.snapshot());saveFailed=false;refreshSaveUI();working=false;showMarket(marketTab,`已購買 ${DEPLOY_CARDS[id]?.name||UPGRADES.find(u=>u.id===id.slice(6)).name}，材料與卡牌已存檔。`);document.querySelector(`[data-buy="${id}"]`)?.focus();}
  catch(error){g=Expedition.restore(before);working=false;saveFailure(error);}
}
function showResult(result){
    const waveStones=result.waves*2,clearStones=Math.max(0,result.stones-waveStones),state=result.won?'win':'loss';
    const rank=result.won?(result.combos>=8||result.kills>=45?'S':'A'):result.waves>=4?'B':'C';
    const route=STAGES.map((stage,i)=>`<div class="result-stage ${i<result.waves?'cleared':i===result.waves?'stopped':''}" style="--i:${i}"><i>${i<result.waves?'✓':i+1}</i><span>${stage.name}</span></div>`).join('');
    const loot=result.loot||{wood:0,bone:0,amber:0,harvested:0};
    const lootItems=[
      {kind:'stones',icon:'✦',name:'營火石',quantity:`+${result.stones}`,note:'永久營地'},
      {kind:'wood',icon:'▰',name:'木材',quantity:`×${loot.wood}`,note:'本局結算'},
      {kind:'bone',icon:'✧',name:'獸骨',quantity:`×${loot.bone}`,note:'本局結算'},
      {kind:'amber',icon:spriteIcon('amber-crystal','loot-crystal-art'),name:'琥珀',quantity:`×${loot.amber}`,note:loot.harvested?`採集 ${loot.harvested} 處晶礦`:'本局結算'}
    ].map(item=>`<div class="loot-item ${item.kind}"><span class="loot-icon">${item.icon}</span><div><small>${item.name}</small><b>${item.quantity}</b></div><em>${item.note}</em></div>`).join('');
    const content=`<div class="result-screen ${state}"><div class="result-ribbon"><span>${result.won?'EXPEDITION CLEARED':'EXPEDITION ENDED'}</span><b>RANK <em>${rank}</em></b></div><div class="result-route" aria-label="遠征關卡進度">${route}</div><div class="result-hero"><div class="result-emblem-wrap"><img class="result-emblem" src="assets/painted-v1/victory-reward-v1.png" alt="${result.won?'聖獸卵、骨矛、骨斧與營火石組成的通關徽記':'本次遠征帶回的營火石'}"></div><div class="reward-total"><small>${result.won?'守護成功 · 戰利品入庫':'本次遠征收穫'}</small><div class="reward-payout"><span>◆</span><strong>+${result.stones}</strong><b>營火石</b></div><p>${result.won?'聖獸卵安然無恙，琥珀荒境的火種得以延續。':'完成波次的營火石已安全帶回；整備營地後可以再次出發。'}</p><div class="reward-breakdown"><div><span>波次收集</span><b>+${waveStones}</b><small>${result.waves} 關 × 2</small></div><div class="${clearStones?'bonus':'locked'}"><span>最終守護</span><b>${clearStones?`+${clearStones}`:'—'}</b><small>${clearStones?'擊退琥珀泰坦':`通過第 ${MAX_WAVES} 關解鎖`}</small></div></div></div></div><section class="loot-section" aria-label="本次獲得物品"><header><h3>本次獲得</h3><span>4 種戰利品</span></header><div class="loot-grid">${lootItems}</div><p>營火石已存入永久營地；木材、獸骨與琥珀顯示遠征結束時的持有量。</p></section><div class="result-stats"><div><i>▰</i><b>${result.waves}/${MAX_WAVES}</b><span>抵達關卡</span></div><div><i>爪</i><b>${result.kills}</b><span>擊敗獸群</span></div><div><i>✦</i><b>${result.combos}</b><span>建築共鳴</span></div></div><p class="reward-note"><span>✓</span> 營火石獎勵已安全寫入永久營地。</p></div>`;
    openModal('end',result.won?'遠征結算':'遠征結算',result.won?'八處荒境全部平定，獎勵已安全結算。':`抵達第 ${Math.max(1,result.waves)} 關，已保留本次可結算獎勵。`,content,`<button class="primary" data-action="camp">${result.won?'收下獎勵 · 返回營地':'帶回收穫 · 返回營地'} ↗</button><button class="secondary" data-action="restart">再次遠征</button>`);
}
async function settle(){
  if(working)return;working=true;const game=g;
  try{
    const result=await store.complete(game.snapshot());saveFailed=false;refreshSaveUI();showResult(result);
  }catch(error){saveFailure(error);}finally{working=false;}
}
function resumeRun(){
  if(working||!store.state.run)return;
  try{
    mountRun(Expedition.restore(store.state.run));
    if(['win','lose'].includes(g.phase))settle();
    else openModal('restored','歡迎回到荒境',`已還原第 ${g.wave||1} 波、建築、佣兵、材料與卡牌庫存。離線期間沒有推進戰鬥。`,'<p class="howto">目前保持暫停，準備好再繼續。休整時可以找商人自由補貨。</p>','<button class="primary" data-action="resume">繼續戰鬥</button><button class="secondary" data-action="save-camp">回到營地</button>');
  }catch(error){saveFailure(error);}
}
function cardHTML(type, slot, ghost = false) {
  if (!type) return `<button class="build-card" disabled aria-label="空位"><span class="card-icon"></span><b class="card-name">旅伴席位</b><small class="card-desc">隊伍最多 4 名佣兵</small></button>`;
  const c=DEPLOY_CARDS[type],count=g.inventory[type],poor=!count;
  const role={watchtower:'速射',catapult:'範圍',wall:'防禦',spring:'支援',hunter:'遠程',guard:'護衛',torch:'共鳴',nest:'召喚'}[type]||'建造';
  return `<button class="build-card${poor ? ' unaffordable' : ''}${selected === slot ? ' selected' : ''}" data-slot="${slot}" data-kind="${type}" type="button" aria-label="${c.name}，持有 ${count} 張，${c.description}"${ghost ? ' tabindex="-1"' : ''}><span class="card-hotkey">${slot+1}</span><span class="card-role">${role}</span><span class="card-cost">× ${count}</span>${icon(type)}<b class="card-name">${c.name}</b><small class="card-desc">${poor?'待補貨':c.short}</small><i class="card-glow"></i></button>`;
}
function renderHand() {
  if (!g || drag) return;
  const signature = `${g.hand.join(',')}|${JSON.stringify(g.inventory)}|${selected}`;
  if (signature === lastHand) return;
  lastHand = signature; $('hand').innerHTML = g.hand.map((type, i) => cardHTML(type, i)).join('');
}
function updateHUD() {
  if (!g) return;
  const stage=STAGES[Math.max(0,Math.min(MAX_WAVES-1,(g.phase==='prep'?g.wave:g.wave-1)))];
  $('hp').textContent = Math.ceil(g.hero.hp); $('hp').nextElementSibling.textContent = `/${g.hero.maxHp}`;
  $('nest-hp').textContent = Math.ceil(g.base.hp); $('amber').textContent = g.amber;
  $('hp-fill').style.setProperty('--value',`${Math.max(0,g.hero.hp/g.hero.maxHp)*100}%`);$('nest-fill').style.setProperty('--value',`${Math.max(0,g.base.hp/g.base.maxHp)*100}%`);
  $('wood').textContent=g.materials.wood;$('bone').textContent=g.materials.bone;
  $('merchant').disabled=g.phase!=='prep';$('merchant').textContent=g.phase==='prep'?'找商人 ↗':'商人休息中';
  $('region').textContent=stage.region;
  $('wave-title').textContent = g.phase === 'prep' ? `${stage.name} · ${g.wave ? '休整營地' : '營地準備'}` : `${stage.name} · 第 ${g.wave} / ${MAX_WAVES} 關`;
  $('stage-rule').textContent=stage.rule;
  $('phase-label').textContent = g.phase === 'prep' ? `下一站 · ${stage.name}` : g.wave === MAX_WAVES ? '琥珀泰坦來襲' : `${stage.name} · 守住聖獸卵`;
  $('phase-hint').textContent = g.phase === 'prep' ? '拖卡建造 · 靠近晶礦會自動採集琥珀' : `${stage.tactic} · 尚餘 ${g.enemies.length + g.spawnQueue.length} 隻`;
  const stageNumber=Math.min(MAX_WAVES,g.phase==='prep'?g.wave+1:g.wave),threat=g.enemies.length+g.spawnQueue.length;
  $('stage-progress-label').textContent=`第 ${stageNumber} 關 / 共 ${MAX_WAVES} 關`;
  [...$('stage-pips').children].forEach((pip,i)=>{pip.classList.toggle('cleared',i<g.wave-(g.phase==='wave'?1:0));pip.classList.toggle('active',i===stageNumber-1);});
  $('enemy-count').textContent=threat;$('threat-label').textContent=g.phase==='prep'?'整備防線':g.wave===MAX_WAVES?'泰坦威脅':'獸群威脅';$('threat-pill').classList.toggle('active',g.phase==='wave');
  $('wave-banner').classList.toggle('subtle', g.phase === 'wave');
  $('wave-banner').classList.toggle('receded',g.phase==='wave'&&g.waveTime>3.5);
  $('arena').classList.toggle('in-combat',g.phase==='wave');
  $('arena').classList.toggle('low-health',g.phase==='wave'&&g.hero.hp/g.hero.maxHp<=.3);
  $('nest-hp').closest('.nest-stat').classList.toggle('in-danger',g.base.hp/g.base.maxHp<=.3);
  $('next-wave').hidden = g.phase !== 'prep';
  $('next-wave').textContent = g.wave ? '選擇下一關 ↗' : '查看遠征地圖 ↗';
  $('run-info').textContent = `第 ${store.state.profile.runs} 次遠征 · 擊敗 ${g.stats.kills} · 共鳴 ${g.stats.combos}`;
  $('dash-label').textContent = g.hero.dashCD > 0 ? `${g.hero.dashCD.toFixed(1)}s` : '衝刺';
  $('dash').classList.toggle('cooling', g.hero.dashCD > 0);
  $('dash').style.setProperty('--dash-remaining',Math.min(100,g.hero.dashCD/(3.1*g.mods.dash)*100).toFixed(1));
  $('dash').setAttribute('aria-disabled',String(g.hero.dashCD>0));
  for(const [id,key,label] of [['volley','volleyCD','齊射 · J'],['shock','shockCD','震擊 · K']]){
    const button=$(`skill-${id}`),remaining=g.hero[key]||0,ready=g.phase==='wave'&&remaining<=0;
    button.classList.toggle('cooling',!ready);button.setAttribute('aria-disabled',String(!ready));
    button.style.setProperty('--dash-remaining',Math.min(100,remaining/ACTIVE_SKILLS[id].cooldown*100).toFixed(1));
    $(`${id}-label`).textContent=remaining>0?`${remaining.toFixed(1)}s`:label;
  }
  if($('weapon').dataset.weapon!==g.hero.weapon){
    $('weapon').dataset.weapon=g.hero.weapon;
    $('weapon').innerHTML=spriteIcon(g.hero.weapon,'equipped-weapon-art')+`<span>${g.hero.weapon==='spear'?'骨矛 ⇄ 切骨斧':'骨斧 ⇄ 切骨矛'}</span>`;
  }
  $('deck-hint').textContent = selected !== null ? '已選卡：點空地使用，Esc 取消' : '拖卡使用 · 顯示持有張數';
  $('deck-build').setAttribute('aria-pressed',String(!HIRES[g.hand[0]]));$('deck-hire').setAttribute('aria-pressed',String(!!HIRES[g.hand[0]]));
  $('build-indicator').hidden = !(g.building && g.phase === 'wave');
}
let priorFocus = null;
function openModal(kind, title, copy, content, actions) {
  if ($('modal').hidden) priorFocus = document.activeElement;
  modalKind = kind; clearInput();
  $('modal').setAttribute('aria-busy','false');
  $('modal').classList.toggle('merchant-modal',kind==='merchant');
  $('modal').classList.toggle('end-modal',kind==='end');
  $('modal-title').textContent = title; $('modal-copy').textContent = copy;
  $('modal-eyebrow').textContent = kind === 'merchant' ? 'SUPPLIES · CONTRACTS · CRAFT' : kind === 'end' ? 'EXPEDITION COMPLETE' : 'TAKE A BREATH';
  $('modal-content').innerHTML = content; $('modal-actions').innerHTML = actions;
  $('modal').hidden = false;
  $('modal').querySelector('button')?.focus();
}
function closeModal() { $('modal').hidden = true; modalKind = ''; if (priorFocus?.isConnected) priorFocus.focus(); priorFocus = null; }
function settingsContent(){
  const s=experience.settings,option=(setting,value,label)=>`<button data-setting="${setting}" data-setting-value="${value}" aria-pressed="${s[setting]===value}">${label}</button>`;
  return `<div class="settings-panel">
    <div class="setting-row"><span><b>觸覺回饋</b><small>建造、技能、受擊與通關使用 iPhone 原生震動</small></span><button class="setting-switch" data-setting="haptics" aria-label="切換觸覺回饋" aria-pressed="${s.haptics}"></button></div>
    <label class="setting-row"><span><b>音效音量</b><small>即時調整戰鬥與介面音效</small></span><span class="setting-volume"><input data-setting="volume" type="range" min="0" max="100" step="5" value="${Math.round(s.volume*100)}"><output>${Math.round(s.volume*100)}%</output></span></label>
    <div class="setting-row"><span><b>低電量模式</b><small>降至 30 FPS，減少粒子並降低渲染解析度</small></span><button class="setting-switch" data-setting="powerSaver" aria-label="切換低電量模式" aria-pressed="${s.powerSaver}"></button></div>
    <div class="setting-row"><span><b>字體大小</b><small>同步放大主要介面與說明文字</small></span><span class="setting-options">${option('fontSize','small','小')}${option('fontSize','normal','標準')}${option('fontSize','large','大')}</span></div>
    <div class="setting-row"><span><b>畫質</b><small>自動會依裝置與系統低電量狀態調整</small></span><span class="setting-options">${option('quality','auto','自動')}${option('quality','high','高')}${option('quality','balanced','平衡')}${option('quality','low','省電')}</span></div>
  </div><p class="settings-system-note">${s.nativeLowPower?'iPhone 系統低電量模式已開啟，遊戲目前自動採用省電渲染。':'偏好會保存在本機；iPhone 開啟系統低電量模式時會自動降載。'}</p>`;
}
function syncSettingsControls(){
  const s=experience.settings;
  for(const control of $('modal').querySelectorAll('[data-setting]')){
    const key=control.dataset.setting,value=control.dataset.settingValue;
    if(control.type==='range'){control.value=String(Math.round(s.volume*100));control.parentElement.querySelector('output').textContent=`${control.value}%`;}
    else control.setAttribute('aria-pressed',String(value!==undefined?s[key]===value:Boolean(s[key])));
  }
  const note=$('modal-content').querySelector('.settings-system-note');if(note)note.textContent=s.nativeLowPower?'iPhone 系統低電量模式已開啟，遊戲目前自動採用省電渲染。':'偏好會保存在本機；iPhone 開啟系統低電量模式時會自動降載。';
}
function showSettings(){
  settingsReturnToPause=modalKind==='pause';
  settingsResumeGame=Boolean(g&&!$('game').hidden&&!g.paused);
  if(settingsResumeGame)g.paused=true;
  openModal('settings','遊戲設定','依你的裝置與遊玩習慣調整；所有選項立即生效。',settingsContent(),'<button class="primary" data-action="settings-close">完成</button>');
  checkpoint();
}
function closeSettings(){
  closeModal();
  if(settingsReturnToPause){settingsReturnToPause=false;pause('manual');return;}
  if(settingsResumeGame&&g){g.paused=false;lastTime=performance.now();}
  settingsResumeGame=false;
}
function pause(reason='manual') {
  if (!g || !['prep', 'wave'].includes(g.phase)) return;
  g.paused = true;
  const background=reason==='background';
  openModal('pause', background?'已為你暫停':'荒野稍歇', background?'遊戲進入背景時已自動暫停；回來後由你決定何時繼續。':'暫停期間不會受傷，也不會消耗資源。', '<div class="howto">拖卡到空地：建造；拖到同類建築：升級。<br>普通攻擊會自動鎖定；J 使用貫骨齊射，K 使用荒骨震擊。<br>弩台負責速射，投獸器壓制獸群；衝刺穿過骨牆可引爆骨片。<br>每 2.5 秒與關鍵操作自動儲存；回營地後可以繼續。</div>', '<button class="primary" data-action="resume">繼續遠征</button><button class="secondary" data-action="settings">遊戲設定</button><button class="secondary" data-action="save-camp">儲存並回營地</button><button class="secondary" data-action="exit-confirm">放棄本局</button>');
  checkpoint();
}
function handleEvents() {
  for (const ev of g.consumeEvents()) {
    if (ev.type === 'notice') notify(ev.message);
    else if(ev.type==='skill'){notify(ev.name);sound('combo');experience.haptic('medium');painter.shake=2;}
    else if (ev.type === 'combo') { notify(ev.message); sound('combo'); experience.haptic('success');painter.shake = 3; }
    else if (ev.type === 'market-ready') {
      clearInput();showWaveLoot(ev);sound('combo');experience.haptic('success');checkpoint();
    } else if (ev.type === 'end') {
      experience.haptic(ev.won?'success':'warning');
      settle();
    } else { sound(ev.type);if(ev.type==='build')experience.haptic('medium');if(ev.type==='collect')experience.haptic('light');if (ev.type === 'hurt'){experience.haptic('warning');painter.shake = 4;}if(ev.type==='wave'){experience.haptic('heavy');hideWaveLoot();$('toast').classList.remove('visible');toastUntil=0;const arena=$('arena');arena.classList.remove('wave-starting');void arena.offsetWidth;arena.classList.add('wave-starting');setTimeout(()=>arena.classList.remove('wave-starting'),1100);} if(['build','wave','weapon'].includes(ev.type))checkpoint(); }
  }
}
function input() { return { x: stickX + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0), y: stickY + (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) }; }
function frame(t) {
  requestAnimationFrame(frame);
  campUI?.frame(t);
  if(experience.settings.effectiveLowPower&&t-lastRenderedFrame<32)return;
  lastRenderedFrame=t;
  if (!g || $('game').hidden) { lastTime = t; return; }
  const dt = Math.min((t - lastTime) / 1000 || 0, .05); lastTime = t;
  g.tick(dt, input()); handleEvents();
  painter.render(g, drag?.moved ? { slot: drag.slot, ...drag.world } : null);
  updateHUD(); renderHand(); if (toastUntil && t > toastUntil) { $('toast').classList.remove('visible'); toastUntil = 0; }
  if(!saveFailed&&!g.paused&&t-lastAutoSave>=2500&&!['win','lose'].includes(g.phase))checkpoint();
}
function selectCard(slot) {
  if (!g?.canBuild || !g.hand[slot]) return;
  if (!g.inventory[g.hand[slot]]) { notify('這張卡用完了，休整時找商人購買'); return; }
  selected = selected === slot ? null : slot; g.building = selected !== null;
  if (selected !== null) notify(`${DEPLOY_CARDS[g.hand[slot]].name}：點空地使用卡牌`);
  renderHand();
}
$('hand').addEventListener('pointerdown', e => {
  const card = e.target.closest('[data-slot]'); if (!card || !g?.canBuild || modalKind || e.button > 0) return;
  const slot = Number(card.dataset.slot); if (!g.hand[slot]) return;
  if (!g.inventory[g.hand[slot]]) { notify('這張卡用完了，休整時找商人購買'); return; }
  e.preventDefault(); selected = null; g.building = true;
  drag = { id: e.pointerId, slot, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType === 'touch', world: painter.point(e.clientX, e.clientY) };
  $('hand').setPointerCapture(e.pointerId); card.classList.add('dragging');
  $('drag-ghost').innerHTML = cardHTML(g.hand[slot], slot, true);
});
$('hand').addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return; e.preventDefault();
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) drag.moved = true;
  const lift = drag.touch ? 55 : 0; drag.world = painter.point(e.clientX, e.clientY - lift);
  $('drag-ghost').hidden = !drag.moved; $('drag-ghost').style.left = `${e.clientX}px`; $('drag-ghost').style.top = `${e.clientY - lift}px`;
});
$('hand').addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return; e.preventDefault();
  const d = drag; cancelDrag();
  if (d.moved) { const p = painter.point(e.clientX, e.clientY - (d.touch ? 55 : 0)); g.placeCard(d.slot, p.x, p.y); }
  else selectCard(d.slot);
  renderHand();
});
$('hand').addEventListener('pointercancel', cancelDrag);
$('hand').addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
$('hand').addEventListener('click', e => { if (e.detail === 0) { const b = e.target.closest('[data-slot]'); if (b) selectCard(Number(b.dataset.slot)); } });
$('world').addEventListener('pointerdown', e => {
  if (!g?.canBuild || modalKind || e.button > 0) return; e.preventDefault();
  const p = painter.point(e.clientX, e.clientY);
  if (selected !== null) { const slot = selected; selected = null; g.building = false; g.placeCard(slot, p.x, p.y); renderHand(); }
});
$('world').addEventListener('contextmenu', e => e.preventDefault());
$('joystick').addEventListener('pointerdown', e => { if (!g?.canBuild || modalKind || stickPointer !== null) return; e.preventDefault(); stickPointer = e.pointerId; $('joystick').setPointerCapture(e.pointerId); moveStick(e); });
function moveStick(e) {
  if (e.pointerId !== stickPointer) return; const r = $('joystick').getBoundingClientRect();
  const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, len = Math.hypot(x, y), max = r.width * .34;
  stickX = x / Math.max(max, len); stickY = y / Math.max(max, len); $('stick').style.transform = `translate(${stickX * max}px,${stickY * max}px)`;
}
$('joystick').addEventListener('pointermove', moveStick);
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(name, e => { if (e.pointerId === stickPointer) { stickPointer = null; stickX = stickY = 0; $('stick').style.transform = ''; } });
$('skill-volley').addEventListener('click',()=>{if(!modalKind)g?.castSkill('volley');});
$('skill-shock').addEventListener('click',()=>{if(!modalKind)g?.castSkill('shock');});
$('dash').addEventListener('click', () => { if (!modalKind) g?.dash(input()); });
$('weapon').addEventListener('click', () => { if (!modalKind) g?.switchWeapon(); });
$('merchant').addEventListener('click',()=>showMarket());
for(const [id,kind] of [['deck-build','build'],['deck-hire','hire']])$(id).addEventListener('click',()=>{if(!modalKind&&g){clearInput();g.setDeck(kind);renderHand();checkpoint();}});
$('next-wave').addEventListener('click', () => showRoute('game'));
$('route-back').addEventListener('click',leaveRoute);
$('route-map').addEventListener('click',e=>{const node=e.target.closest('.route-node:not([disabled])');if(node)chooseStage(Number(node.dataset.stage));});
$('begin').addEventListener('click', showCamp);
$('continue-run').addEventListener('click', resumeRun);
$('camp-home').addEventListener('click',showHome);
$('return-camp').addEventListener('click',returnCamp);
$('save-game').addEventListener('click',()=>checkpoint(true));
$('pause').addEventListener('click', pause);
$('sound').addEventListener('click', () => { const next=experience.settings.volume>0?0:lastAudibleVolume;experience.update({volume:next});if(next>0)sound('build'); });
for(const id of ['landing-settings','camp-settings','route-settings','game-settings'])$(id).addEventListener('click',showSettings);
$('modal').addEventListener('input',e=>{
  const control=e.target.closest('input[data-setting="volume"]');if(!control)return;
  const volume=Number(control.value)/100;if(volume>0)lastAudibleVolume=volume;experience.update({volume});control.parentElement.querySelector('output').textContent=`${control.value}%`;
});
$('modal').addEventListener('click', async e => {
  const setting=e.target.closest('button[data-setting]');
  if(setting){
    const key=setting.dataset.setting,value=setting.dataset.settingValue;
    experience.update({[key]:value!==undefined?value:!experience.settings[key]});
    experience.haptic('selection');syncSettingsControls();return;
  }
  const tab=e.target.closest('[data-market-tab]')?.dataset.marketTab;if(tab){showMarket(tab);return;}
  const buy=e.target.closest('[data-buy]')?.dataset.buy;if(buy){purchase(buy);return;}
  const action = e.target.closest('[data-action]')?.dataset.action;
  if(working)return;
  if(action==='settings')showSettings();
  if(action==='settings-close')closeSettings();
  if(action==='market-close')closeMarket();
  if(action==='close-camp-site')closeModal();
  if(action==='camp-depart'){if(!campUI.walk.canInteract('gate'))return;closeModal();await showRoute('camp');}
  if(action==='camp-new')openModal('replace','放棄已保存的遠征？','這會刪除本次戰鬥進度與本次購買的卡牌，不發放營火石；永久營地與已結算資源保留。','','<button class="primary" data-action="cancel-camp">保留存檔</button><button class="secondary" data-action="replace-run">確認，重新出發</button>');
  if(action==='camp-build'){const b=e.target.closest('[data-facility]');closeModal();await campUI.build(b.dataset.facility,Number(b.dataset.slot));}
  if(action==='camp-move-building'){campUI.movingFrom=Number(e.target.closest('[data-slot]').dataset.slot);closeModal();campUI.message('走到另一塊空地按「互動」安置。建築暫時保留原位；Esc 取消搬遷。');}
  if(action==='camp-place-building'){const to=Number(e.target.closest('[data-slot]').dataset.slot),from=campUI.movingFrom;closeModal();if(from!==null&&await campUI.moveBuilding(from,to))campUI.movingFrom=null;}
  if (action === 'resume') { closeModal(); g.paused = false; lastTime = performance.now(); }
  if (action === 'restart') start();
  if (action === 'exit-confirm') openModal('exit', '放棄這次遠征？', '將清除本次戰鬥存檔，不發放營火石。永久營地與已結算資源保留。', '', '<button class="primary" data-action="resume">繼續遊玩</button><button class="secondary" data-action="abandon">確認放棄</button>');
  if (action === 'save-camp') returnCamp();
  if (action === 'camp') showCamp();
  if (action === 'cancel-camp') closeModal();
  if (action === 'home') showHome();
  if (action === 'replace-run') start(true);
  if (action === 'abandon' && !working) {working=true;try{await store.abandon();showCamp();}catch(error){saveFailure(error);}finally{working=false;}}
  if (action === 'reload-save') {store.reload();saveFailed=false;showCamp();}
  if (action === 'retry-save') {if(g&&['win','lose'].includes(g.phase))settle();else if(g){if(await checkpoint(true)){if(campUI.active){closeModal();g=null;campUI.message('已恢復存檔。剛才未完成的購買沒有扣除材料，可再找行商選購。');}else pause();}}else{store.reload();saveFailed=false;showCamp();}}
  if (action === 'export-save') exportSave();
  if (action === 'import-confirm'&&pendingImport&&!working){working=true;try{await store.import(pendingImport);pendingImport=null;saveFailed=false;showCamp();campUI.message('存檔已匯入；可以查看營地或繼續遠征。');}catch(error){saveFailure(error);}finally{working=false;}}
  if (action === 'facility-upgrade'){const slot=Number(e.target.closest('[data-slot]')?.dataset.slot),b=store.state.camp.buildings.find(b=>b.slot===slot);closeModal();if(b)await campUI.build(b.type,slot);}
});
window.addEventListener('keydown', e => {
  if (modalKind) {
    if(working)return;
    if(e.key==='Escape'&&modalKind==='merchant'){closeMarket();return;}
    if (e.key === 'Escape' && ['pause', 'exit', 'restored'].includes(modalKind)) { closeModal(); if(g)g.paused = false; }
    if (e.key === 'Escape' && ['camp-site','facility','replace','import'].includes(modalKind)) closeModal();
    if(e.key==='Escape'&&modalKind==='settings')closeSettings();
    if (e.key === 'Tab') { const items = [...$('modal').querySelectorAll('button:not([disabled])')]; if (items.length) { const i = items.indexOf(document.activeElement); const next = (i + (e.shiftKey ? -1 : 1) + items.length) % items.length; e.preventDefault(); items[next].focus(); } }
    return;
  }
  if(!$('route-map').hidden&&e.key==='Escape'){leaveRoute();return;}
  if (!g || $('game').hidden) return;
  const key = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
  if (key === 'escape') { if (drag || selected !== null) { clearInput(); renderHand(); } else pause(); return; }
  if (!e.repeat && key === ' ') g.dash(input());
  if (!e.repeat && key === 'q') g.switchWeapon();
  if (!e.repeat && key === 'j') g.castSkill('volley');
  if (!e.repeat && key === 'k') g.castSkill('shock');
  if (!e.repeat && ['1','2','3','4'].includes(key)) selectCard(Number(key) - 1);
  keys.add(key);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); if (g && !$('game').hidden && !modalKind) pause('background'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (g && !$('game').hidden && !modalKind) pause('background');flush(); } lastTime = performance.now(); });
window.addEventListener('emberwild-shell-active',event=>{clearInput();if(!event.detail?.active){if(g&&!$('game').hidden&&!modalKind)pause('background');flush();}lastTime=performance.now();});
window.addEventListener('pagehide',flush);
window.addEventListener('storage',event=>{if(!qaMode&&event.key===SAVE_KEY&&event.newValue!==store.raw){const error=new Error('另一個頁面已更新存檔。為避免互相覆蓋，本頁已暫停。');error.code='CONFLICT';saveFailure(error);}});
window.addEventListener('resize', () => { cancelDrag(); selected = null; painter?.resize();campUI?.painter.resize(); });
new ResizeObserver(() => painter?.resize()).observe($('arena'));
requestAnimationFrame(frame);

function exportSave(){
  if(campUI.active&&!saveFailed)campUI.flush();
  try{const raw=!store.blocked&&g&&store.state.run?.runId===g.runId?encode({...store.state,run:g.snapshot()},store.revision):store.export();const blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`emberwild-save-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){saveFailure(error);}
}
$('camp-export').addEventListener('click',exportSave);
$('camp-import').addEventListener('click',()=>$('save-file').click());
$('save-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{if(file.size>500000)throw new Error('檔案太大，請選擇本遊戲匯出的 JSON 存檔');const raw=await file.text(),saved=decode(raw);pendingImport=raw;
    openModal('import','匯入並替換本機存檔？',`檔案包含 ${saved.state.camp.buildings.length} 座營地建築、${saved.state.camp.stones} 營火石${saved.state.run?'與未完成遠征':''}。這會替換目前進度，建議先匯出備份。`,'','<button class="primary" data-action="cancel-camp">取消，保留目前進度</button><button class="secondary" data-action="import-confirm">確認替換</button>');
  }catch(error){campUI.message(`匯入失敗，原存檔未改動：${error.message}`);}
});
campUI=new CampUI(store,{onError:saveFailure,onInteract:campSite,isPaused:()=>!!modalKind||working||saveFailed});
experience.subscribe(()=>{updateSoundButton();painter?.resize();campUI?.painter.resize();if(modalKind==='settings')syncSettingsControls();});
updateSoundButton();
refreshSaveUI();

// Explicit localhost-only QA hook; never connects to, or controls, a native app.
if (qaMode) {
  window.emberwildQA = { get game() { return g; }, get painter() { return painter; }, get dragging() { return !!drag; },store,campUI,experience,start,input,checkpoint,showCamp,showRoute,resumeRun,showResult,showSettings,render: () => { if(g){handleEvents();updateHUD();renderHand();painter?.render(g);}else campUI.render(); } };
  if(qaMode==='route')queueMicrotask(()=>showRoute('home'));
  if(qaMode==='reward')queueMicrotask(()=>showResult({won:true,waves:MAX_WAVES,stones:24,kills:67,combos:15,loot:{wood:76,bone:45,amber:62,harvested:8}}));
  if(qaMode==='enemies')queueMicrotask(()=>{
    const demo=new Expedition(11,'qa-enemies');demo.wave=8;demo.phase='wave';demo.spawnQueue=[];
    for(const [type,x,y] of [['matriarch',150,255],['charger',545,255],['boss',355,610]]){const enemy=demo.spawnEnemy(type,{x,y});enemy.hp*=.72;enemy.angle=0;}
    demo.effects=[];demo.paused=true;mountRun(demo);updateHUD();painter.render(demo);
  });
  const stageMatch=/^stage([1-8])$/.exec(qaMode);
  if(stageMatch)queueMicrotask(()=>{
    const stage=Number(stageMatch[1]),demo=new Expedition(100+stage,`qa-stage-${stage}`);demo.wave=stage-1;demo.stats.waves=stage-1;demo.paused=false;mountRun(demo);demo.paused=false;demo.startWave();demo.spawnQueue=[];demo.spawnTimer=999;
    const samples={1:[['raptor',210,235],['raptor',505,255]],2:[['raptor',165,250],['brute',535,255]],3:[['matriarch',355,230],['spitter',540,560]],4:[['brute',180,240],['spitter',520,250]],5:[['brute',170,240],['spitter',520,235],['raptor',355,190]],6:[['charger',355,245],['brute',535,560]],7:[['brute',160,250],['spitter',545,250],['raptor',355,620]],8:[['boss',355,250],['brute',545,580]]}[stage];
    for(const [type,x,y]of samples)demo.spawnEnemy(type,{x,y});demo.effects=[];demo.consumeEvents();demo.paused=true;updateHUD();painter.render(demo);
  });
}
