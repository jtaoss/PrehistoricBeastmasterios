// Visual card-store catalogue only. No StoreKit, network pay, inventory grants, or save writes.
import {CARDS,DEPLOY_CARDS,HIRES} from './engine.mjs';

export const SHOP_DEMO_COPY='此為支付介面演示，不會連接 App Store，不會扣款，也不會發放卡牌。';
export const SHOP_CURRENCY=Object.freeze({id:'ingot',name:'晶錠',balance:0});
const CARD_PRICES=Object.freeze({
  watchtower:'¥6.00',catapult:'¥6.00',wall:'¥3.00',spring:'¥6.00',
  torch:'¥3.00',nest:'¥6.00',hunter:'¥12.00',guard:'¥12.00'
});
export const SHOP_PACKS=Object.freeze([
  Object.freeze({
    id:'pack-fortify',sku:'emberwild.demo.pack.fortify',name:'防線補給包',priceLabel:'¥6.00',
    art:'shop-pack-fortify',tag:'建造卡包',copies:2,
    cards:Object.freeze(['watchtower','catapult','wall']),
    description:'獵脊弩台、琥珀投獸器與裂骨牆各兩張。只展示結帳畫面。'
  }),
  Object.freeze({
    id:'pack-hire',sku:'emberwild.demo.pack.hire',name:'僱傭契約包',priceLabel:'¥12.00',
    art:'shop-pack-hire',tag:'僱傭卡包',copies:2,
    cards:Object.freeze(['hunter','guard']),
    description:'遊獵弓手與骨盾衛士契約各兩張。只展示結帳畫面。'
  }),
  Object.freeze({
    id:'pack-relic',sku:'emberwild.demo.pack.relic',name:'荒境密藏',priceLabel:'¥30.00',
    art:'shop-pack-relic',tag:'混合密藏',copies:3,
    cards:Object.freeze(['watchtower','catapult','spring','hunter']),
    description:'建造與僱傭混合卡組，含潮汐泉。只展示結帳畫面。'
  })
]);

export function shopOffer(id){
  const pack=SHOP_PACKS.find(item=>item.id===id);
  if(pack)return pack;
  if(!Object.hasOwn(DEPLOY_CARDS,id))return null;
  const card=DEPLOY_CARDS[id];
  return Object.freeze({
    id,sku:`emberwild.demo.card.${id}`,name:card.name,priceLabel:CARD_PRICES[id]||'¥6.00',
    art:`card-${id}`,tag:HIRES[id]?'僱傭契約':'建造藍圖',copies:1,
    cards:Object.freeze([id]),
    description:`以晶錠購買 1 張「${card.name}」。${SHOP_DEMO_COPY}`
  });
}

export function shopPrice(id){return CARD_PRICES[id]||'¥6.00';}

export function offerContents(offer){
  return offer.cards.map(id=>`${DEPLOY_CARDS[id]?.name||id} ×${offer.copies}`).join(' · ');
}

export function shopCatalogHTML(artFor){
  return `<section class="shop-store" aria-label="卡包支付">
    <header class="shop-pay-head">
      <span class="shop-pay-stamp">PAY</span>
      <div><small>晶錠結帳</small><b>選擇卡包，立刻支付</b></div>
      <div class="shop-wallet"><span>餘額</span><b>${SHOP_CURRENCY.balance}</b></div>
    </header>
    <p class="shop-disclaimer">${SHOP_DEMO_COPY}</p>
    <div class="shop-grid">${SHOP_PACKS.map(offer=>`<article class="shop-pack">
      <div class="shop-pack-art-wrap">${artFor(offer)}<span class="shop-price-tag">${offer.priceLabel}</span></div>
      <small>${offer.tag}</small>
      <h3>${offer.name}</h3>
      <p>${offer.description}</p>
      <span class="shop-contents">${offerContents(offer)}</span>
      <button type="button" class="shop-pay-btn" data-shop-offer="${offer.id}"><i>支付</i><b>${offer.priceLabel}</b></button>
    </article>`).join('')}</div>
  </section>`;
}

export function shopCheckoutHTML(offer,phase='confirm',orderId='',art=''){
  if(!offer)return '';
  const pending=phase==='pending',done=phase==='done';
  const title=done?'演示完成':pending?'正在確認訂單':'確認支付';
  const copy=done?'商店未連接，卡牌與材料均未改動。':pending?'畫面會停留在確認中，不會向任何支付服務發請求。':`將以 ${offer.priceLabel} 購買「${offer.name}」。`;
  const actions=done
    ?'<button type="button" class="shop-pay-btn" data-action="shop-done">完成 · 返回商店</button>'
    :`<button type="button" class="shop-pay-btn" data-action="shop-confirm" ${pending?'disabled':''}>${pending?'支付確認中…':`支付 ${offer.priceLabel}`}</button><button type="button" class="secondary" data-action="shop-cancel" ${pending?'disabled':''}>取消支付</button>`;
  return `<div class="shop-sheet" id="shop-sheet" role="dialog" aria-modal="true" aria-labelledby="shop-checkout-title">
    <article class="shop-checkout ${phase}">
      <span class="shop-pay-stamp">PAYMENT</span>
      <div class="shop-checkout-art">${art}</div>
      <small>DEMO CHECKOUT · ${offer.sku}</small>
      <h3 id="shop-checkout-title">${title}</h3>
      <p>${copy}</p>
      <div class="shop-total"><small>應付金額</small><b>${offer.priceLabel}</b></div>
      <ul class="shop-receipt">
        <li><span>商品</span><b>${offer.name}</b></li>
        <li><span>內容</span><b>${offerContents(offer)}</b></li>
        <li><span>支付方式</span><b>晶錠 · 演示</b></li>
        <li><span>訂單</span><b>${orderId||'DEMO'}</b></li>
      </ul>
      <p class="shop-disclaimer">${SHOP_DEMO_COPY}</p>
      <div class="shop-checkout-actions">${actions}</div>
    </article>
  </div>`;
}

export function cardPayButton(id){
  if(!Object.hasOwn(CARDS,id)&&!Object.hasOwn(HIRES,id))return '';
  return `<button type="button" class="shop-pay-btn shop-alt" data-shop-offer="${id}"><i>立即支付</i><b>${shopPrice(id)}</b></button>`;
}
