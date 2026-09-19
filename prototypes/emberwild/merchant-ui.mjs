import {BUILD_CARDS,CARDS,HIRES,UPGRADES,ACTIVE_SKILLS,WEAPONS} from './engine.mjs';
import {icon} from './art.mjs';
import {spriteIcon} from './painted-art.mjs';
const priceText=p=>[p.wood?`木材 ${p.wood}`:'',p.bone?`獸骨 ${p.bone}`:'',p.amber?`琥珀 ${p.amber}`:''].filter(Boolean).join(' · ');
export function marketContent(g,tab,message=''){
  const training=UPGRADES.filter(u=>!u.weapon&&g.upgradeFitsLoadout(u)),forge=UPGRADES.filter(u=>u.weapon&&g.upgradeFitsLoadout(u));
  const catalog=tab==='hire'?HIRES:(g.loadout?.legacy?BUILD_CARDS:CARDS);
  const upgrades=tab==='forge'?forge:training;
  const goods=['training','forge'].includes(tab)?upgrades.map(u=>({...u,id:`skill-${u.id}`,description:u.desc})):Object.entries(catalog).filter(([id])=>g.carriesCard(id)).map(([id,c])=>({id,...c}));
  const tabs=[['build','建造卡'],['hire','雇佣卡'],['forge','武器鍛造'],['training','技能成長']];
  const skillPaths=tab==='training'?`<section class="skill-paths" aria-label="主動技能成長路線">${Object.entries(ACTIVE_SKILLS).filter(([id])=>g.carriesSkill(id)).map(([id,skill])=>{const learned=UPGRADES.filter(u=>u.branch===id&&g.selectedUpgrades.includes(u.id)).length,level=1+learned,next=UPGRADES.find(u=>u.branch===id&&!g.selectedUpgrades.includes(u.id));return `<div class="skill-path ${id}"><span>${id==='volley'?'➶':'✹'}</span><div><small>本次攜帶 · Lv.${level} / 3</small><b>${skill.name}</b><p>${next?`下一階：${next.name}`:'成長路線已完成'}</p></div></div>`;}).join('')}</section>`:'';
  const forgedWeapon=g.loadout?.weapons[0]||g.hero.weapon,weapon=WEAPONS[forgedWeapon];
  const forgePath=tab==='forge'&&weapon?`<section class="forge-path" aria-label="攜帶武器鍛造"><div class="forge-weapon-art">${spriteIcon(forgedWeapon,'forge-weapon-icon')||`<span>${weapon.symbol}</span>`}</div><div><small>本次攜帶 · ${weapon.short}</small><b>${weapon.name}</b><p>${weapon.description}</p></div><em>${g.selectedUpgrades.includes(forgedWeapon)?'鍛造完成':'可改造攻擊方式'}</em></section>`:'';
  return `<div class="merchant-banner"><div class="merchant-portrait" aria-hidden="true">${spriteIcon('merchant','merchant-art')}<i>荒境行商</i></div><div><b>材料換好牌，搭配由你決定。</b><p>固定貨架，不抽卡、不刷新。買幾張，就能部署幾次。</p></div></div>
  <div class="material-wallet"><span>▰ 木材 <b>${g.materials.wood}</b></span><span>✧ 獸骨 <b>${g.materials.bone}</b></span><span>◆ 琥珀 <b>${g.amber}</b></span></div>
  <div class="market-tabs" role="group" aria-label="商品分類">${tabs.map(([id,label])=>`<button data-market-tab="${id}" aria-pressed="${id===tab}">${label}</button>`).join('')}</div>
  <p id="market-message" class="market-message" role="status">${message||'開局含旅行補給；材料與卡牌保存在這次遠征。結算後營火石留在永久營地。'}</p>
  ${skillPaths}${forgePath}<div class="market-grid">${goods.map(d=>{const plan=g.purchasePlan(d.id),upgrade=['training','forge'].includes(tab),learned=upgrade&&g.selectedUpgrades.includes(d.id.slice(6)),prerequisite=upgrade&&d.requires&&!g.selectedUpgrades.includes(d.requires),growth=tab==='training'&&d.branch;return `<article class="market-card${growth?` skill-growth ${d.branch}`:''}${tab==='forge'?' weapon-forge-card':''}"><div class="market-card-art">${d.symbol?`<span>${d.symbol}</span>`:icon(d.id)}</div><div class="market-card-copy"><small>${tab==='forge'?`${WEAPONS[d.weapon].name} · 攻擊方式改造`:growth?`${ACTIVE_SKILLS[d.branch].name} · 成長 ${d.rank} / ${d.maxRank}`:tab==='training'?'本局一次性強化':tab==='hire'?'雇佣契約 · 部署後跟隨':'建造藍圖 · 同類可升級'}</small><h3>${d.name}</h3><p>${d.description}</p><b class="market-price">${priceText(g.price(d.id))}</b><span class="market-owned">${upgrade?(learned?'本次遠征已完成':prerequisite?'需先完成前一階':tab==='forge'?'鍛造後立即改變普通攻擊':growth?'購買後主動技能立即成長':'購買後立即生效'): `背包持有 ${g.inventory[d.id]} 張`}</span></div><button data-buy="${d.id}" class="primary" ${plan.ok?'':'disabled'}>${learned?(tab==='forge'?'已鍛造':'已學會'):prerequisite?'先購買前一階':plan.ok?(tab==='forge'?'鍛造招式':growth?'購買技能成長':'購買'):g.inventory?.[d.id]>=99?'庫存已滿':'材料不足'}</button></article>`;}).join('')}</div>
  <p class="market-footnote">行商只供應本次出征配置中的卡牌、武器與主動技能成長；部分貨架由永久營地設施等級解鎖。建造、升級與部署只消耗卡牌；固定貨架不抽取，也沒有戰後隨機三選一。</p>`;
}
