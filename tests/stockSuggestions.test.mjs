import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestStockLevels, getReorderPoint } from '../src/lib/stockSuggestions.ts';
const product={type:'comum',stock:5,dailyAverageSales:4,replacementDays:3};
test('minimum covers lead time plus 25% buffer, maximum adds the buying cycle',()=>{
 const result=suggestStockLevels(product);
 assert.equal(result.safetyStock,3);assert.equal(result.minimum,15);assert.equal(result.maximum,43);
 assert.equal(result.toBuy,38);assert.equal(result.daysRemaining,1.25);assert.equal(result.needsReorder,true);
 assert.equal(getReorderPoint({...product,safetyStock:result.safetyStock}),result.minimum);
});
test('overstock does not inflate demand-based limits or recommend a negative purchase',()=>{
 const result=suggestStockLevels({...product,stock:100});
 assert.equal(result.maximum,43);assert.equal(result.toBuy,0);assert.equal(result.excess,57);assert.equal(result.needsReorder,false);
});
test('a different buying cycle adjusts the maximum without changing the minimum',()=>{
 const result=suggestStockLevels(product,14);
 assert.equal(result.minimum,15);assert.equal(result.maximum,71);
});
test('no sales estimate means no invented limits, including for empty stock',()=>{
 for(const average of [0,-1,NaN,Infinity])assert.equal(suggestStockLevels({...product,stock:0,dailyAverageSales:average}),null);
});
test('cigarette suggestions count carteiras and preserve twentieths',()=>{
 const result=suggestStockLevels({...product,type:'cigarro',stock:0.5,dailyAverageSales:0.15,replacementDays:2});
 assert.equal(result.safetyStock,0.1);assert.equal(result.minimum,0.4);assert.equal(result.maximum,1.45);assert.equal(result.toBuy,0.95);
 for(const value of [result.safetyStock,result.minimum,result.maximum,result.toBuy])assert.ok(Math.abs(value*20-Math.round(value*20))<1e-9);
});
test('zero lead time needs no safety reserve and uses the configured coverage',()=>{
 const result=suggestStockLevels({...product,replacementDays:0},7);
 assert.equal(result.safetyStock,0);assert.equal(result.minimum,0);assert.equal(result.maximum,28);
});
test('rounding does not double-count reserve or round cigarette thresholds to whole packs',()=>{
 assert.equal(getReorderPoint({...product,dailyAverageSales:2.5,replacementDays:3,safetyStock:2}),10);
 assert.equal(getReorderPoint({...product,type:'cigarro',dailyAverageSales:0.15,replacementDays:2,safetyStock:0.1}),0.4);
});
