import test from 'node:test';import assert from 'node:assert/strict';
import {inventoryLots,receiptLots,consumeLots,restoreLots,lotFields} from '../src/lib/fifoCost.ts';
const p={id:'p',stock:56,unitCost:5,type:'comum'};
const purchase={id:'new',productId:'p',quantity:36,totalCost:198,createdAt:2};
test('PEPS: 20 at 5 plus 36 at 5.50 sells 25 at 5.10 and leaves 31 at 5.50',()=>{
 const lots=inventoryLots(p,[purchase]);assert.equal(lots[0].quantity,20);assert.equal(lotFields(p,lots).initialUnitCost,5);
 const result=consumeLots(lots,25);assert.equal(result.totalCost/25,5.1);assert.deepEqual(result.allocations.map(l=>[l.quantity,l.unitCost]),[[20,5],[5,5.5]]);
 assert.equal(result.lots.length,1);assert.equal(result.lots[0].quantity,31);assert.equal(lotFields(p,result.lots).unitCost,5.5);
 assert.deepEqual(restoreLots(result.lots,result.allocations),lots);
});
test('bootstrap keeps only the most recent receipts needed by current stock, deterministic on timestamps',()=>{
 const old={...purchase,id:'old',quantity:20,totalCost:100,createdAt:1};
 const lots=inventoryLots({...p,stock:31},[purchase,old]);assert.deepEqual(lots.map(l=>[l.quantity,l.unitCost]),[[31,5.5]]);
 assert.throws(()=>inventoryLots({...p,fifoLots:lots}),/não conferem/);
});
test('bonus is a separate lot and shares actual cost, including other products',()=>{
 const bought={...purchase,quantity:100,bonusQuantity:10,totalCost:1000};
 const lots=receiptLots(bought,'p');assert.equal(lots.length,2);assert.equal(lots[1].kind,'bonus');assert.equal(lots[0].unitCost,1000/110);
 const other={...bought,bonusProductId:'q'};assert.equal(receiptLots(other,'p')[0].quantity,100);assert.equal(receiptLots(other,'q')[0].quantity,10);assert.equal(receiptLots(other,'q')[0].unitCost,1000/110);
});
test('halves and avulsos stay in integer twentieths across depletion and exact returns',()=>{
 const product={...p,stock:2,type:'cigarro',unitCost:10};const lots=inventoryLots(product);
 const half=consumeLots(lots,.5);assert.equal(lotFields(product,half.lots).stock,1.5);assert.equal(half.totalCost,5);
 let state=inventoryLots({...product,stock:1});for(let i=0;i<20;i++){const r=consumeLots(state,.05);state=r.lots;assert.ok(Number.isInteger(lotFields(product,state).stock*20));}
 assert.equal(state.length,0);assert.throws(()=>consumeLots(state,.05),/insuficiente/);assert.throws(()=>consumeLots(lots,.03),/0,05/);
 assert.equal(lotFields(product,consumeLots(consumeLots(lots,1).lots,.15).lots).stock,.85);
 assert.deepEqual(restoreLots(half.lots,half.allocations),lots);
});
test('unreported cost never becomes free inventory profit, and losses consume oldest lots',()=>{
 const unknown=consumeLots(inventoryLots({...p,stock:1,unitCost:0}),1);assert.equal(unknown.costKnown,false);assert.equal(unknown.totalCost,null);
 const loss=consumeLots(inventoryLots(p,[purchase]),22);assert.equal(loss.lots[0].quantity,34);assert.equal(loss.lots[0].unitCost,5.5);
});

test('initial stock stays oldest even when historical purchases have no timestamp',()=>{
 const lots=inventoryLots({...p,stock:56},[{...purchase,createdAt:undefined}]);assert.equal(lots[0].kind,'initial');assert.equal(consumeLots(lots,25).totalCost/25,5.1);
});
