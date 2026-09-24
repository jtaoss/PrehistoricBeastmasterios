import {tutorialActive,tutorialProtected,tutorialWaiting,mandatoryTutorial,TUTORIAL_STEPS,TUTORIAL_BUILD_RADIUS} from './tutorial.mjs';
import {touchControls} from './control-hints.mjs';

const $=id=>document.getElementById(id),names=['移動','攻擊','技能','建造','獎勵'];
const center=el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};};
export class TutorialUI{
  constructor(){
    this.panel=$('tutorial');this.last='';this.lastHoles='';this.lastPath='';this.g=null;this.visible=false;
    this.layer=document.createElement('div');this.layer.id='tutorial-layer';this.layer.hidden=true;this.layer.setAttribute('aria-hidden','true');
    this.layer.innerHTML='<svg class="tutorial-veil"><defs><mask id="tutorial-cutouts" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/><path id="tutorial-holes" fill="black"/></mask></defs><rect width="100%" height="100%" fill="#031b18" fill-opacity=".76" mask="url(#tutorial-cutouts)"/><path id="tutorial-path" fill="none" stroke="#ffe4a3" stroke-width="3" stroke-dasharray="7 7"/></svg><div id="tutorial-marker"><span></span></div><div id="tutorial-finger"><svg viewBox="0 0 48 60"><path d="M15 31V8c0-6 8-6 8 0v15c2-4 7-3 8 1 4-2 8 0 8 4 5 0 7 4 6 9l-3 15c-1 4-4 6-8 6H23c-4 0-6-2-8-5L4 37c-4-6 2-11 6-7l5 5" fill="#fff3d0" stroke="#5b4220" stroke-width="2.5"/></svg></div>';
    document.body.append(this.layer);
    // Releases must always reach the drag and joystick cleanup handlers.
    for(const type of ['pointerdown','click','keydown'])document.addEventListener(type,e=>this.guard(e),true);
  }
  guard(e){
    const g=this.g;if(!this.visible||!g||g.tutorial.version!==2||$('game').hidden||(!tutorialProtected(g)&&!g.tutorial.reward&&!mandatoryTutorial(g)))return;
    if(e.target.closest('#modal'))return;
    if(e.target.closest(mandatoryTutorial(g)?'#tutorial-next,#tutorial-claim,#pause,#save-game':'#tutorial,#pause,#return-camp,#save-game')&&(e.type!=='keydown'||['Enter',' '].includes(e.key)))return;
    if(e.type==='keydown'&&['Escape','Tab'].includes(e.key))return;
    const t=g.tutorial,waiting=tutorialWaiting(g)||!!t.reward;
    if(!waiting){
      if(e.type==='keydown'){
        if(t.step==='move'&&(mandatoryTutorial(g)?['d','arrowright']:['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']).includes(e.key.toLowerCase()))return;
        if(t.step==='skill'&&e.key.toLowerCase()===(g.loadout.skills[0]==='shock'?'k':'j'))return;
        if(t.step==='build'&&e.key===String(t.slot+1))return;
        if(['Enter',' '].includes(e.key)&&this.allowedTarget(e.target,t,g))return;
      }else if(this.allowedTarget(e.target,t,g))return;
    }
    e.preventDefault();e.stopImmediatePropagation();
    this.panel.classList.remove('tutorial-nudge');void this.panel.offsetWidth;this.panel.classList.add('tutorial-nudge');
  }
  allowedTarget(target,t,g){
    const selector={move:'#joystick',skill:'#skill-'+g.loadout.skills[0],build:'#hand [data-slot="'+t.slot+'"],#world'}[t.step];
    return selector&&!!target.closest(selector);
  }
  render(g,blocked=false,painter=null){
    const active=!!g&&tutorialActive(g),visible=active&&!blocked&&!$('game').hidden;
    this.g=g;this.visible=visible;this.panel.hidden=!visible;
    const t=g?.tutorial,step=active?t.step:'',pending=!!t?.reward,skill=g?.loadout?.skills[0]||'volley';
    const forced=mandatoryTutorial(g),training=visible&&(tutorialProtected(g)||pending||forced),waiting=visible&&tutorialWaiting(g),intro=visible&&(g.wave===0||t.version===2&&!t.started);
    $('arena').classList.toggle('tutorial-active',visible);$('game').classList.toggle('tutorial-guided',visible);$('game').classList.toggle('tutorial-training',training);
    $('game').classList.toggle('tutorial-mandatory',forced);
    $('joystick').inert=forced&&(waiting||step!=='move');
    for(const card of $('hand').querySelectorAll('[data-slot]')){const locked=forced&&(waiting||step!=='build'||Number(card.dataset.slot)!==t.slot);card.disabled=locked;card.classList.toggle('tutorial-locked',locked);}
    this.layer.hidden=!training;
    const touch=touchControls(),signature=[visible,step,pending,skill,g?.phase,t?.started,t?.awaiting,forced,touch].join('|');
    if(signature!==this.last){
      this.last=signature;
      for(const node of document.querySelectorAll('.tutorial-focus'))node.classList.remove('tutorial-focus');
      if(visible){
        const index=TUTORIAL_STEPS.indexOf(step),success=!!t.awaiting;
        const copy={
          move:['走進金色光圈','按住左下搖桿向右拖動，帶獵人走進光圈。電腦按 D／→。'],
          attack:['不用點，獵人會自動攻擊','放開操作，看獵人擊中眼前的練習獸。平時只需移動到武器射程內。'],
          skill:['點一下發光的技能',skill==='shock'?'點右下「震擊」（K），擊退身邊的敵人。':'點右下「齊射」（J），向眼前的敵人射出骨矛。'],
          build:['按住卡牌，拖到金圈放開','沿手勢拖動發光卡牌，預覽進入金圈後放開。也可點卡，再點金圈。'],
          reward:pending?['守護成功！收下戰利品','木材 +'+t.reward.wood+'　獸骨 +'+t.reward.bone+'　琥珀 +'+t.reward.amber]:['實戰：守住聖獸卵','自由移動、使用技能和建造。擊退剩餘獸群後，回來領取獎勵。']
        };
        if(t.version!==2){copy.move=['先走動看看','拖動左下搖桿，或用 WASD／方向鍵走一小段。'];copy.build=['把一張卡拖進戰場','拖下方建造卡到空地放開；也可點卡再點空地。'];}
        if(forced){copy.move=['只向右，走進金色光圈','按住搖桿向右拖，或按 D／→。這一步只開放向右移動。'];if(!pending)copy.reward=['觀察防線自動作戰','先不用操作。獵人和剛建的弩台會消滅練習獸，結束後再領取獎勵。'];}
        if(touch){
          copy.move[1]=forced?'按住左下搖桿向右拖，走進金色光圈。這一步只開放向右移動。':'按住左下搖桿拖動，帶獵人走進光圈。';
          copy.skill[1]=skill==='shock'?'點右下「震擊」，擊退身邊的敵人。':'點右下「齊射」，向眼前的敵人射出骨矛。';
        }
        const done={move:['移動完成！','走位能追擊、採礦，也能避開敵人的攻擊。'],attack:['看到了嗎？攻擊自動完成','你只管移動和選位置，普通攻擊不需要一直點。'],skill:['技能釋放成功！','技能用完會冷卻；冷卻結束後，就能再次使用。'],build:['建造成功！','卡牌已消耗 1 張，建築會自動作戰。接下來守住聖獸卵！']};
        const practice=g.runId.startsWith('practice-');
        if(forced)done.build=['建造成功！','現在觀察防線消滅練習獸。完成最後領獎步驟，才會解鎖自由操作。'];
        const text=intro?['跟著我，學會守護荒境',forced?'這是必修訓練。現在只能跟著發光提示操作；完成五步並領獎，才會解鎖營地。':practice?'跟著發光的位置完成 5 個練習。試煉不改動原遠征、營地或資源。':'一次只學一件事。發光的位置就是下一步；完成後點「繼續」。']:success?done[step]:copy[step];
        $('tutorial-count').textContent=intro?'獵人訓練 · 5 個小練習':(success?'✓ 已學會':'正在練習')+' '+(index+1)+' / 5';
        $('tutorial-title').textContent=text[0];$('tutorial-copy').textContent=text[1];
        $('tutorial-progress').innerHTML=names.map((name,i)=>'<span class="'+(i<index||i===index&&success?'complete':i===index?'current':'')+'" '+(i===index?'aria-current="step"':'')+'>'+(i<index||i===index&&success?'✓':i+1)+' '+name+'</span>').join('');
        $('tutorial-protection').textContent=forced?'必修訓練 · 不可跳過 · 進度自動保存':training?'練習保護中 · 不會受傷 · 可隨時暫停':'教學保護已解除 · 留意獵人與聖獸卵血量';
        $('tutorial-next').hidden=pending||!(waiting||intro);$('tutorial-next').textContent=intro?'準備好了，開始移動 →':step==='build'?(forced?'繼續，觀察防線作戰 →':'我準備好了，開始實戰 →'):'記住了，繼續 →';
        $('tutorial-claim').hidden=!pending;$('tutorial-skip').hidden=pending||forced;
        $('tutorial-claim').textContent=forced?'領取獎勵 · 解鎖營地與自由操作 ✓':practice?'領取練習獎勵 · 返回營地 ✓':'領取獎勵 · 完成教學 ✓';
        this.panel.classList.toggle('tutorial-success',success||pending);this.panel.classList.toggle('tutorial-combat',step==='reward'&&!pending&&!forced);
        this.panel.dataset.step=step;
        if(waiting||pending)($('tutorial-next').hidden?$('tutorial-claim'):$('tutorial-next')).focus({preventScroll:true});
      }
    }
    if(!training||!painter)return;
    if(step==='attack'&&t.version===2&&!waiting){
      const progress='已命中 '+t.attackHits+' / 2 · 放開操作，看看自動攻擊';
      if($('tutorial-protection').textContent!==progress)$('tutorial-protection').textContent=progress;
    }
    const target=pending?$('tutorial-claim'):waiting||intro?$('tutorial-next'):{move:$('joystick'),attack:document.querySelector('.auto-attack-status'),skill:$('skill-'+skill),build:document.querySelector('#hand [data-slot="'+(t.slot??0)+'"]')}[step];
    target?.classList.add('tutorial-focus');
    // Viewport coordinates track canvas letterboxing, resize and scrolling.
    const holes=[];
    const rect=(r,p=7)=>holes.push('M'+(r.x-p)+' '+(r.y-p)+'h'+(r.width+2*p)+'v'+(r.height+2*p)+'h'+(-r.width-2*p)+'Z');
    const circle=(p,r)=>holes.push('M'+(p.x-r)+' '+p.y+'a'+r+' '+r+' 0 1 0 '+(r*2)+' 0a'+r+' '+r+' 0 1 0 '+(-r*2)+' 0Z');
    rect(this.panel.getBoundingClientRect(),1);for(const id of forced?['pause','save-game']:['pause','return-camp','save-game'])rect($(id).getBoundingClientRect(),3);
    if(forced&&step==='reward'&&!pending)rect($('world').getBoundingClientRect(),0);
    if(target)rect(target.getBoundingClientRect());
    const hero=painter.screen(g.hero.x,g.hero.y),enemy=g.enemies.find(e=>e.hp>0);
    if(!waiting&&!pending){circle(hero,Math.max(28,painter.scale*48));if(enemy&&['attack','skill'].includes(step))circle(painter.screen(enemy.x,enemy.y),Math.max(34,painter.scale*64));}
    const marker=$('tutorial-marker'),finger=$('tutorial-finger'),guiding=!waiting&&!intro&&!pending&&!!target;
    // Never transiently hide/show an animated element during a frame: a layout read
    // would restart its CSS animation and the demonstration hand would stay invisible.
    marker.hidden=!(guiding&&t.version===2&&['move','build'].includes(step));finger.hidden=!(guiding&&['move','skill','build'].includes(step));
    let gesturePath='';
    if(guiding){
      let from=center(target),to=from;
      const world=t.version!==2?null:step==='move'?t.moveTarget:step==='build'?t.buildSpot:null;
      if(world){
        const spot=painter.screen(world.x,world.y),r=step==='build'?painter.scale*TUTORIAL_BUILD_RADIUS:Math.max(24,painter.scale*42);
        marker.hidden=false;marker.style.left=spot.x+'px';marker.style.top=spot.y+'px';marker.style.width=marker.style.height=(r*2)+'px';marker.firstElementChild.textContent=step==='move'?'走到這裡':'預覽放進圈內';circle(spot,r+10);
        if(step==='move'){const d=Math.hypot(spot.x-hero.x,spot.y-hero.y)||1;to={x:from.x+(spot.x-hero.x)/d*30,y:from.y+(spot.y-hero.y)/d*30};}
        else to={x:spot.x,y:spot.y+(navigator.maxTouchPoints>0?55:0)};
      }
      if(['move','skill','build'].includes(step)){
        finger.hidden=false;finger.style.left=from.x+'px';finger.style.top=from.y+'px';finger.style.setProperty('--gesture-x',(to.x-from.x)+'px');finger.style.setProperty('--gesture-y',(to.y-from.y)+'px');
        if(step==='build')gesturePath='M'+from.x+' '+from.y+'L'+to.x+' '+to.y;
      }
    }
    if(gesturePath!==this.lastPath){$('tutorial-path').setAttribute('d',gesturePath);this.lastPath=gesturePath;}
    const holePath=holes.join('');
    if(holePath!==this.lastHoles){$('tutorial-holes').setAttribute('d',holePath);this.lastHoles=holePath;}
  }
}
