import test from 'node:test';import assert from 'node:assert/strict';
import {correctedPurchase,correctedProductCosts} from '../src/lib/purchaseCorrection.ts';
import {consumeLots,restoreLots} from '../src/lib/fifoCost.ts';
const purchase={id:'receipt',ownerId:'shop',productId:'p',quantity:10,totalCost:100,unitCost:10,createdAt:10,date:'2026-11-01'};
const patch={totalCost:60,supplier:'Fornecedor',notes:'Correção',expectedUpdatedAt:10,correctionId:'revision-12345'};
test('correction recalculates costs and bonus, preserves received quantities and rejects stale or invalid edits',()=>{
 const before={...purchase,bonusQuantity:2},after=correctedPurchase(before,patch,20,'owner');
 assert.equal(after.totalCost,60);assert.equal(after.unitCost,6);assert.equal(after.effectiveUnitCost,5);assert.equal(after.bonusSavings,12);assert.equal(after.quantity,10);assert.equal(after.bonusQuantity,2);assert.equal(after.createdAt,10);assert.equal(after.updatedAt,20);
 for(const totalCost of [-1,Infinity,NaN,1.234])assert.throws(()=>correctedPurchase(before,{...patch,totalCost},20,'owner'));
 assert.throws(()=>correctedPurchase({...before,updatedAt:15},patch,20,'owner'),/outro aparelho/);
 assert.equal(before.totalCost,100);
});
test('repricing only remaining FIFO lots preserves stock, old sale costs, returns and retail prices',()=>{
 const product={id:'p',ownerId:'shop',type:'comum',stock:8,unitCost:10,lastCost:10,basePrice:20,fifoLots:[{id:'receipt:0',purchaseId:'receipt',kind:'purchase',quantity:8,unitCost:10,createdAt:10}]};
 const sold=consumeLots([{...product.fifoLots[0],quantity:10}],2),oldSale=structuredClone(sold.allocations);
 const after=correctedPurchase(purchase,patch,20,'owner'),updated=correctedProductCosts(product,purchase,after,[purchase],patch.correctionId,20);
 assert.equal(updated.stock,8);assert.equal(updated.unitCost,6);assert.equal(updated.lastCost,6);assert.equal(updated.basePrice,undefined);assert.equal(product.basePrice,20);assert.deepEqual(sold.allocations,oldSale);
 assert.notEqual(updated.fifoLots[0].id,'receipt:0');const returned=restoreLots(updated.fifoLots,sold.allocations);assert.equal(returned.reduce((n,l)=>n+l.quantity,0),10);
 assert.ok(returned.some(l=>l.unitCost===10&&l.quantity===2));assert.ok(returned.some(l=>l.unitCost===6&&l.quantity===8));
});
test('older receipt corrections do not replace a newer last cost; same-product and other-product bonus lots share corrected effective cost',()=>{
 const before={...purchase,bonusQuantity:2,bonusProductId:'q'},after=correctedPurchase(before,patch,20,'owner');
 const product={id:'q',type:'comum',stock:1,unitCost:100/12,lastCost:15,basePrice:20,fifoLots:[{id:'receipt:1',purchaseId:'receipt',kind:'bonus',quantity:1,unitCost:100/12,createdAt:10}]};
 const newer={...purchase,id:'newer',productId:'q',createdAt:15};
 const updated=correctedProductCosts(product,before,after,[before,newer],patch.correctionId,20);
 assert.equal(updated.stock,1);assert.equal(updated.unitCost,5);assert.equal(updated.lastCost,undefined);assert.equal(product.lastCost,15);
});
