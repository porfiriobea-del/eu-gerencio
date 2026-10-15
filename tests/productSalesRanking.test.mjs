import test from 'node:test';
import assert from 'node:assert/strict';
import {rankProductsBySales,soldBaseQuantity} from '../src/lib/productSalesRanking.ts';
test('real quantities outrank catalogue order and alphabetical ties do not mutate products',()=>{
 const products=[{id:'a',name:'Zulu'},{id:'b',name:'Água'},{id:'c',name:'Café'}];
 assert.deepEqual(rankProductsBySales(products,{a:10,c:2,b:10}).map(p=>p.id),['b','a','c']);
 assert.deepEqual(products.map(p=>p.id),['a','b','c']);
 assert.deepEqual(rankProductsBySales(products,{}).map(p=>p.id),['b','c','a']);
});
test('formats use base inventory quantities, not revenue or number of receipts',()=>{
 assert.equal(soldBaseQuantity({quantity:2,format:'Fardo (12 un.)',stockDeduction:12}),24);
 assert.equal(soldBaseQuantity({quantity:1,format:'Maço/Pacote (10 carteiras)',stockDeduction:10}),10);
 assert.equal(soldBaseQuantity({quantity:20,format:'Unidade Avulsa (1 cigarro)',stockDeduction:0.05}),1);
 assert.equal(soldBaseQuantity({quantity:1,format:'Meia Carteira (10 unidades)'},{type:'cigarro',unitsPerPackage:10}),0.5);
 assert.equal(soldBaseQuantity({quantity:2,format:'Fardo (6 un.)'},{type:'comum',unitsPerPackage:6}),12);
 assert.equal(soldBaseQuantity({quantity:1,format:'Carteira (20 cigarros)'},{type:'cigarro',unitsPerPackage:10}),1);
 assert.equal(soldBaseQuantity({quantity:NaN,format:'Padrão',stockDeduction:1}),0);
});
