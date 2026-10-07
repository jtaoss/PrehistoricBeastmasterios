// Native code owns order creation, Apple verification and delivery; the
// browser preview never simulates a successful payment.
import {DEPLOY_CARDS} from './engine.mjs';

export const SHOP_PAYMENT_COPY='僅在 iOS App 內使用 App Store 付款；實際金額與幣別以系統付款頁為準。未驗證成功不會發放卡牌。';
export const SHOP_CURRENCY=Object.freeze({id:'ingot',name:'晶錠',balance:0});
export const SHOP_PACKS=Object.freeze([
  Object.freeze({
    id:'pack-fortify',productId:'pbm_tier_099',goodsId:910001,name:'新手防線禮包',priceLabel:'以系統顯示為準',
    art:'shop-pack-fortify',tag:'新手限定 · 一次',copies:2,limit:'once',promotion:'starter',
    cards:Object.freeze(['watchtower','catapult','wall']),
    description:'獵脊弩台、琥珀投獸器與裂骨牆各兩張，發放到目前遠征。'
  }),
  Object.freeze({
    id:'pack-hire',productId:'pbm_tier_199',goodsId:910003,name:'遊獵契約包',priceLabel:'以系統顯示為準',
    art:'shop-pack-hire',tag:'傭兵卡包',copies:3,
    cards:Object.freeze(['hunter','guard']),
    description:'遊獵弓手與骨盾守衛各三張，補強遠征隊伍。'
  }),
  Object.freeze({
    id:'pack-scout',productId:'pbm_tier_299',goodsId:910004,name:'探索者補給',priceLabel:'以系統顯示為準',
    art:'shop-pack-fortify',tag:'攻防混合',copies:2,
    cards:Object.freeze(['watchtower','catapult','spring','hunter']),
    description:'建造與傭兵混合補給，每種各兩張。'
  }),
  Object.freeze({
    id:'pack-relic',productId:'pbm_tier_499',goodsId:910002,name:'每週荒境禮包',priceLabel:'以系統顯示為準',
    art:'shop-pack-relic',tag:'每週限定 · 一次',copies:3,limit:'weekly',promotion:'weekly',
    cards:Object.freeze(['watchtower','catapult','spring','hunter']),
    description:'建造與僱傭混合卡組，含潮汐泉，每種各三張。'
  }),
  Object.freeze({
    id:'pack-titan',productId:'pbm_tier_999',goodsId:910005,name:'泰坦遠征箱',priceLabel:'以系統顯示為準',
    art:'shop-pack-relic',tag:'大型遠征補給',copies:5,
    cards:Object.freeze(['watchtower','catapult','wall','spring','hunter','guard']),
    description:'六種核心建造與傭兵卡各五張，適合長線遠征。'
  })
]);

export function offerWeekKey(time=Date.now()){
  const date=new Date(time),utc=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate()+4-(utc.getUTCDay()||7));
  const year=utc.getUTCFullYear(),start=new Date(Date.UTC(year,0,1));
  return `${year}-W${String(Math.ceil((((utc-start)/86400000)+1)/7)).padStart(2,'0')}`;
}

export function offerAvailable(offer,transactions=[],time=Date.now()){
  if(!offer)return false;
  const records=Array.isArray(transactions)?transactions:[];
  if(offer.limit==='once')return !records.some(item=>item.offerId===offer.id);
  if(offer.limit==='weekly')return !records.some(item=>item.offerId===offer.id&&offerWeekKey(item.deliveredAt)===offerWeekKey(time));
  return true;
}

export function shopOffer(id){
  const pack=SHOP_PACKS.find(item=>item.id===id);
  return pack||null;
}

export function shopPrice(id){return shopOffer(id)?.priceLabel||'';}

export function offerContents(offer){
  return offer.cards.map(id=>`${DEPLOY_CARDS[id]?.name||id} ×${offer.copies}`).join(' · ');
}

function offerRewardChips(offer){
  return offer.cards.map(id=>`<span>${DEPLOY_CARDS[id]?.name||id}<b>×${offer.copies}</b></span>`).join('');
}

const shopCrest=()=>`<svg class="shop-crest" viewBox="0 0 72 72" aria-hidden="true"><path d="M36 4 55 14l9 20-9 24-19 10-19-10L8 34l9-20Z"/><path d="m36 14 7 14 14 7-14 7-7 16-7-16-14-7 14-7Z"/><circle cx="36" cy="35" r="5"/></svg>`;

export function shopCatalogHTML(artFor,transactions=[]){
  return `<section class="shop-store" aria-label="卡包支付">
    <header class="shop-pay-head">
      <span class="shop-brand-seal">${shopCrest()}</span>
      <div class="shop-head-copy"><small>原始文明：聖獸覺醒</small><b>荒境遠征補給站</b><p>挑選需要的卡牌補給，再由 App Store 顯示本地價格。</p></div>
      <div class="shop-wallet"><span>安全付款</span><b></b><small>App Store</small></div>
    </header>
    <div class="shop-guard"><span aria-hidden="true">◆</span><p><b>補給只在伺服器驗證付款後發放</b><small>取消、待確認或驗證失敗都不會扣除卡牌額度。</small></p></div>
    <div class="shop-grid" aria-label="遠征補給商品">${SHOP_PACKS.map((offer,index)=>{const available=offerAvailable(offer,transactions);return `<article class="shop-pack tier-${index+1}${available?'':' sold'}" data-product-id="${offer.productId}">
      <span class="shop-ribbon">${offer.tag}</span>
      <div class="shop-pack-art-wrap">${artFor(offer)}<span class="shop-price-tag">${index===0?'推薦':offer.limit==='weekly'?'每週':'補給'}</span></div>
      <div class="shop-pack-copy"><small>遠征物資箱 · ${String(index+1).padStart(2,'0')}</small><h3>${offer.name}</h3><p>${offer.description}</p></div>
      <div class="shop-reward-chips" aria-label="禮包內容">${offerRewardChips(offer)}</div>
      <button type="button" class="shop-pay-btn" data-shop-offer="${offer.id}" ${available?'':'disabled'}><span><i>${available?'APP STORE':'LIMIT REACHED'}</i><b>${available?'查看價格並購買':offer.limit==='weekly'?'本週已購買':'新手禮包已購買'}</b></span><em aria-hidden="true">›</em></button>
    </article>`;}).join('')}</div>
    <p class="shop-disclaimer">${SHOP_PAYMENT_COPY}</p>
  </section>`;
}

export function shopCheckoutHTML(offer,phase='confirm',orderId='',art='',detail=''){
  if(!offer)return '';
  const pending=phase==='pending',done=phase==='done',failed=phase==='error';
  const title=done?'發放完成':failed?'未完成付款':pending?'正在等待 App Store':'確認支付';
  const copy=detail||(done?'付款已由伺服器驗證，卡牌已存入目前遠征。':failed?'沒有發放卡牌；如已收到扣款通知，請勿重複購買。':pending?'請在系統付款頁完成操作，不要重複點擊。':`將購買「${offer.name}」，實際金額以 App Store 顯示為準。`);
  const actions=done||failed
    ?'<button type="button" class="shop-pay-btn" data-action="shop-done">完成 · 返回商店</button>'
    :`<button type="button" class="shop-pay-btn" data-action="shop-confirm" ${pending?'disabled':''}>${pending?'等待 App Store…':'使用 App Store 付款'}</button><button type="button" class="secondary" data-action="shop-cancel" ${pending?'disabled':''}>取消</button>`;
  return `<div class="shop-sheet" id="shop-sheet" role="dialog" aria-modal="true" aria-labelledby="shop-checkout-title">
    <article class="shop-checkout ${phase}">
      <header class="shop-checkout-head"><span class="shop-brand-seal">${shopCrest()}</span><div><small>SECURE APP STORE CHECKOUT</small><b>荒境補給確認</b></div></header>
      <div class="shop-checkout-hero"><div class="shop-checkout-art">${art}</div><div><small>遠征物資箱</small><h3>${offer.name}</h3><p>${offer.description}</p></div></div>
      <div class="shop-state"><i aria-hidden="true">${done?'✓':failed?'!':pending?'•••':'◆'}</i><div><small>付款狀態</small><h3 id="shop-checkout-title">${title}</h3><p>${copy}</p></div></div>
      <div class="shop-total"><small>App Store 本地價格</small><b>${offer.priceLabel}</b></div>
      <ul class="shop-receipt">
        <li><span>商品</span><b>${offer.name}</b></li>
        <li><span>內容</span><b>${offerContents(offer)}</b></li>
        <li><span>支付方式</span><b>Apple App Store</b></li>
        <li><span>訂單狀態</span><b>${orderId?'已建立':'確認後建立'}</b></li>
      </ul>
      <p class="shop-disclaimer">${SHOP_PAYMENT_COPY}</p>
      <div class="shop-checkout-actions">${actions}</div>
    </article>
  </div>`;
}

export function cardPayButton(id){
  // Individual card purchases intentionally remain disabled in the first
  // release. This prevents silently expanding the App Store product matrix.
  return '';
}

export function grantOffer(snapshot,offer){
  if(!snapshot?.inventory||!SHOP_PACKS.includes(offer))throw new Error('商品或遠征存檔無效');
  const next=structuredClone(snapshot);
  for(const id of offer.cards)next.inventory[id]=Math.min(99,(next.inventory[id]||0)+offer.copies);
  return next;
}
