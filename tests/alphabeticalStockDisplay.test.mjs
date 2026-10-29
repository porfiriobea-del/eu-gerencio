import test from 'node:test';
import assert from 'node:assert/strict';
import {sortByName,sortCategories,compareAlphabetical} from '../src/lib/alphabetical.ts';
import {formatProductStock,formatCigaretteStock,formatStockNumber,stockInputValue} from '../src/lib/productUnits.ts';
import {getAllCategories} from '../src/lib/categories.ts';
import {rankProductsBySales} from '../src/lib/productSalesRanking.ts';

test('A-Z uses pt-BR ignoring case and accents and preserves original names and arrays',()=>{
 const rows=[{name:'Zebra'},{name:'Érica'},{name:'banana'},{name:'Água'},{name:'água'},{name:'café'}];
 const original=rows.map(r=>r.name);
 assert.equal(compareAlphabetical('ÁGUA','agua'),0);
 assert.deepEqual(sortByName(rows).map(r=>r.name),['Água','água','banana','café','Érica','Zebra']);
 assert.deepEqual(rows.map(r=>r.name),original);
 assert.deepEqual(sortCategories(['zebra','Ética','Todas as categorias','banana','Água']),['Todas as categorias','Água','banana','Ética','zebra']);
 const categories=getAllCategories(['Zebra','Água','banana']);
 assert.deepEqual(categories,[...categories].sort(compareAlphabetical));
});
test('POS sales ranking remains primary, with A-Z only for equal sales',()=>{
 const products=[{id:'a',name:'Água'},{id:'z',name:'Zebra'},{id:'c',name:'Café'}];
 assert.deepEqual(rankProductsBySales(products,{a:1,z:20,c:1}).map(p=>p.id),['z','a','c']);
});
test('physical stock never exposes floating point residue and cigarette labels use whole cigarettes',()=>{
 const original=243.14999999999995;
 assert.equal(formatCigaretteStock(original),'243 carteiras e 3 cigarros');
 assert.equal(formatProductStock({type:'cigarro',stock:original}),'243 carteiras e 3 cigarros');
 assert.equal(formatCigaretteStock(1.9499999999999997),'1 carteira e 19 cigarros');
 assert.equal(formatCigaretteStock(1.5),'1 carteira e meia');
 assert.equal(formatProductStock({type:'comum',stock:original}),'243,15 unidades');
 assert.equal(formatStockNumber(1.9000000000000001),'1,9');
 assert.equal(formatStockNumber(0.1+0.2),'0,3');
 assert.equal(stockInputValue(original),243.15);
 assert.equal(stockInputValue(undefined),'');
 assert.equal(formatStockNumber(-0),'0');
 assert.equal(original,243.14999999999995); // presentation does not mutate persisted balances
 for(const language of ['pt-BR','en','es']){
  const label=formatProductStock({type:'comum',stock:original},original,language);
  assert.ok(!label.includes('9999'));
  assert.ok(!formatCigaretteStock(original,language).includes('9999'));
 }
});

test('stock inputs retain numeric strings from React change events instead of clearing entered limits',()=>{
 for(const [input,value] of [['50',50],['5',5],['0',0],['33.1',33.1],['3,1',3.1],['0.05',0.05],[' 12 ',12]])assert.equal(stockInputValue(input),value);
 for(const input of ['', ' ', 'invalid', null, undefined, NaN, Infinity])assert.equal(stockInputValue(input),'');
 assert.equal(stockInputValue('0.03'),0.03); // display must not silently force an invalid cigarette quantity to a valid one
});
