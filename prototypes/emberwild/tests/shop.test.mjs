import assert from 'node:assert/strict';
import {SHOP_CURRENCY,SHOP_PACKS,SHOP_PAYMENT_COPY,cardPayButton,grantOffer,offerAvailable,offerWeekKey,shopCatalogHTML,shopCheckoutHTML,shopOffer} from '../shop.mjs';
let passed=0;function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}

test('StoreKit catalogue exposes five allowlisted packs',()=>{
  assert.equal(SHOP_PACKS.length,5);assert.equal(SHOP_CURRENCY.balance,0);
  assert.deepEqual(SHOP_PACKS.map(p=>[p.id,p.productId,p.goodsId]),[
    ['pack-fortify','pbm_tier_099',910001],['pack-hire','pbm_tier_199',910003],
    ['pack-scout','pbm_tier_299',910004],['pack-relic','pbm_tier_499',910002],
    ['pack-titan','pbm_tier_999',910005]
  ]);
  assert.equal(shopOffer('pack-hire')?.cards.includes('guard'),true);assert.equal(shopOffer('watchtower'),null);
  assert.equal(cardPayButton('wall'),'');
});

test('starter and weekly packs enforce their local visibility limits',()=>{
  const monday=Date.UTC(2026,8,21),transactions=[{offerId:'pack-fortify',deliveredAt:monday},{offerId:'pack-relic',deliveredAt:monday}];
  assert.equal(offerWeekKey(monday),'2026-W39');
  assert.equal(offerAvailable(shopOffer('pack-fortify'),transactions,monday),false);
  assert.equal(offerAvailable(shopOffer('pack-relic'),transactions,monday+2*86400000),false);
  assert.equal(offerAvailable(shopOffer('pack-relic'),transactions,monday+7*86400000),true);
  assert.match(shopCatalogHTML(()=>'',transactions),/新手禮包已購買/);
});

test('checkout is App Store copy and never claims success before callback',()=>{
  const offer=shopOffer('pack-fortify'),html=shopCheckoutHTML(offer,'confirm','','');
  assert.match(html,/APP STORE/);assert.match(html,/使用 App Store 付款/);assert.ok(html.includes(SHOP_PAYMENT_COPY));
  assert.doesNotMatch(html,/演示完成|不會扣款/);
  assert.match(shopCheckoutHTML(offer,'pending','',''),/等待 App Store/);
  assert.match(shopCheckoutHTML(offer,'done','ORDER-1',''),/發放完成/);
  assert.match(shopCheckoutHTML(offer,'error','','','network'),/network/);
  assert.match(shopCatalogHTML(()=>''),/pbm_tier_099/);
});

test('verified pack grant is a pure bounded snapshot update',()=>{
  const before={inventory:{watchtower:98,catapult:1,wall:0,spring:0,hunter:0}};
  const next=grantOffer(before,shopOffer('pack-fortify'));
  assert.notEqual(next,before);assert.deepEqual(before.inventory,{watchtower:98,catapult:1,wall:0,spring:0,hunter:0});
  assert.deepEqual(next.inventory,{watchtower:99,catapult:3,wall:2,spring:0,hunter:0});
});

console.log(`\n${passed} shop ui scenarios passed.`);
