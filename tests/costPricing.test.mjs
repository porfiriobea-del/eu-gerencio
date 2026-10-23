import test from 'node:test';
import assert from 'node:assert/strict';
import {costPriceReview,lowMarginFormats,changedPrices} from '../src/lib/costPricing.ts';
const p={id:'p',name:'Produto',type:'comum',stock:100,unitCost:10,basePrice:15};
test('cost threshold is strictly above 3 percent, and suggestions keep current markup and round to halves',()=>{
 assert.equal(costPriceReview(p,10.3,'r'),null);assert.equal(costPriceReview(p,9.7,'r'),null);
 const review=costPriceReview(p,11,'r');assert.equal(review.changePercent,10);assert.equal(review.prices[0].newPrice,16.5);assert.equal(p.basePrice,15);
 assert.equal(costPriceReview(p,9,'r').prices[0].newPrice,13.5);
 assert.equal(costPriceReview({...p,unitCost:0},10,'r'),null);assert.equal(costPriceReview(p,0,'r'),null);
 assert.equal(costPriceReview({...p,basePrice:0.2},11,'r').prices[0].newPrice,0.5);
});
test('last receipt cost is used as the markup reference and disabled formats stay disabled',()=>{
 const cigarette={...p,type:'cigarro',priceCart:15,priceHalfCart:8,priceUnit:1,pricePack:0};
 const review=costPriceReview(cigarette,11,'first');
 assert.deepEqual(review.prices.map(x=>[x.field,x.newPrice]),[['priceCart',16.5],['priceHalfCart',9],['priceUnit',1]]);
 const next=costPriceReview({...cigarette,unitCost:10,lastCost:11,pendingPriceReview:review},12.1,'next');
 assert.equal(next.oldCost,11);assert.ok(Math.abs(next.changePercent-10)<1e-9);
});
test('margin warnings use current lot cost and selling margin, including enabled cigarette formats and active promotion',()=>{
 assert.equal(lowMarginFormats({...p,unitCost:11},30)[0].field,'basePrice');
 assert.equal(lowMarginFormats({...p,desiredMargin:10,unitCost:11},30).length,0);
 assert.equal(lowMarginFormats({...p,hasPromoSuggestion:true,promoPrice:11},30)[0].field,'promoPrice');
 assert.deepEqual(lowMarginFormats({...p,type:'cigarro',unitCost:10,priceCart:11,priceHalfCart:6,priceUnit:0.5},30).map(x=>x.field),['priceCart','priceHalfCart','priceUnit']);
});
test('price audit records old and new values including disabled/deleted formats without false changes',()=>{
 assert.deepEqual(changedPrices(p,{...p,basePrice:16}),[{field:'basePrice',oldPrice:15,newPrice:16}]);
 assert.deepEqual(changedPrices({...p,priceUnit:1},{...p,priceUnit:{__eu_delete_field:true}}),[{field:'priceUnit',oldPrice:1,newPrice:0}]);
 assert.deepEqual(changedPrices(p,{...p}),[]);
});
