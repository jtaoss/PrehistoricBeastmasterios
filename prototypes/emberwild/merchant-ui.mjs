import {BUILD_CARDS,HIRES,UPGRADES} from './engine.mjs';
import {icon} from './art.mjs';
import {spriteIcon} from './painted-art.mjs';
const priceText=p=>[p.wood?`木材 ${p.wood}`:'',p.bone?`獸骨 ${p.bone}`:'',p.amber?`琥珀 ${p.amber}`:''].filter(Boolean).join(' · ');
export function marketContent(g,tab,message=''){
  const goods=tab==='training'?UPGRADES.map(u=>({id:`skill-${u.id}`,name:u.name,description:u.desc,symbol:u.symbol})):Object.entries(tab==='hire'?HIRES:BUILD_CARDS).map(([id,c])=>({id,...c}));
  const tabs=[['build','建造卡'],['hire','雇佣卡'],['training','武技與強化']];
  return `<div class="merchant-banner"><div class="merchant-portrait" aria-hidden="true">${spriteIcon('merchant','merchant-art')}<i>荒境行商</i></div><div><b>材料換好牌，搭配由你決定。</b><p>固定貨架，不抽卡、不刷新。買幾張，就能部署幾次。</p></div></div>
  <div class="material-wallet"><span>▰ 木材 <b>${g.materials.wood}</b></span><span>✧ 獸骨 <b>${g.materials.bone}</b></span><span>◆ 琥珀 <b>${g.amber}</b></span></div>
  <div class="market-tabs" role="group" aria-label="商品分類">${tabs.map(([id,label])=>`<button data-market-tab="${id}" aria-pressed="${id===tab}">${label}</button>`).join('')}</div>
  <p id="market-message" class="market-message" role="status">${message||'開局含旅行補給；材料與卡牌保存在這次遠征。結算後營火石留在永久營地。'}</p>
  <div class="market-grid">${goods.map(d=>{const plan=g.purchasePlan(d.id),learned=tab==='training'&&g.selectedUpgrades.includes(d.id.slice(6));return `<article class="market-card"><div class="market-card-art">${d.symbol?`<span>${d.symbol}</span>`:icon(d.id)}</div><div class="market-card-copy"><small>${tab==='training'?'本局一次性強化':tab==='hire'?'雇佣契約 · 部署後跟隨':'建造藍圖 · 同類可升級'}</small><h3>${d.name}</h3><p>${d.description}</p><b class="market-price">${priceText(g.price(d.id))}</b><span class="market-owned">${tab==='training'?(learned?'本次遠征已學會':'購買後立即生效'): `背包持有 ${g.inventory[d.id]} 張`}</span></div><button data-buy="${d.id}" class="primary" ${plan.ok?'':'disabled'}>${learned?'已學會':plan.ok?'購買':g.inventory[d.id]>=99?'庫存已滿':'材料不足'}</button></article>`;}).join('')}</div>
  <p class="market-footnote">建造、升級與部署不再扣材料，只消耗 1 張卡。戰場最多 12 座建築、4 名佣兵；陣亡不返還契約。強化本局生效，每項只買一次。</p>`;
}
