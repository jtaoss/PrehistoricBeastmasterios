import assert from 'node:assert/strict';
import {SHOP_CURRENCY,SHOP_DEMO_COPY,SHOP_PACKS,cardPayButton,shopCatalogHTML,shopCheckoutHTML,shopOffer} from '../shop.mjs';
import {DEPLOY_CARDS} from '../engine.mjs';
let passed=0;function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}

test('shop catalogue is a frozen demo list with display prices only',()=>{
  assert.equal(SHOP_PACKS.length,3);
  assert.equal(SHOP_CURRENCY.balance,0);
  for(const pack of SHOP_PACKS){
    assert.ok(pack.sku.startsWith('emberwild.demo.'));
    assert.match(pack.priceLabel,/^¥\d+\.00$/);
    assert.ok(pack.cards.every(id=>Object.hasOwn(DEPLOY_CARDS,id)));
  }
  assert.equal(shopOffer('unknown'),null);
  assert.equal(shopOffer('watchtower').sku,'emberwild.demo.card.watchtower');
  assert.equal(shopOffer('pack-fortify').name,'防線補給包');
});

test('checkout markup is a demo sheet and never mentions a live charge',()=>{
  const offer=shopOffer('pack-hire');
  const html=shopCheckoutHTML(offer,'confirm','DEMO-TEST','');
  assert.match(html,/支付 ¥12\.00/);
  assert.ok(html.includes(SHOP_DEMO_COPY));
  assert.doesNotMatch(html,/data-buy=/);
  assert.doesNotMatch(html,/fetch\(|StoreKit|dopay|xmwsdk/);
  assert.match(shopCheckoutHTML(offer,'done','DEMO-TEST',''),/演示完成/);
  assert.match(shopCatalogHTML(()=>''),/立刻支付/);
  assert.match(cardPayButton('wall'),/data-shop-offer="wall"/);
  assert.match(cardPayButton('wall'),/立即支付/);
});

console.log(`\n${passed} shop ui scenarios passed.`);
