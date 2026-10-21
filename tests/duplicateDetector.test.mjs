import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductName, findDuplicateProducts, analyzeDuplicates, similarProductNames, suspiciousProductPairs } from '../src/lib/duplicateDetector.ts';
import { buildSupplierProducts, parseSupplierDraft } from '../src/lib/supplierCatalog.ts';

test('names ignore accents, case and excess whitespace; barcodes preserve leading zeroes',()=>{
 assert.equal(normalizeProductName('  CAFÉ   Extra  '),normalizeProductName('cafe extra'));
 const products=[{id:'1',name:'Café',barcode:'00123'},{id:'2',name:'Outro',barcode:'00999'},{id:'3',name:'Café',mergedIntoId:'1'}];
 assert.deepEqual(findDuplicateProducts({name:'cafe'},products).map(row=>row.id),['1']);
 assert.deepEqual(findDuplicateProducts({name:'Novo',barcode:'00 123'},products).map(row=>row.id),['1']);
 assert.equal(findDuplicateProducts({name:'Novo',barcode:'123'},products).length,0);
 assert.equal(findDuplicateProducts({name:'Café'},products,'1').length,0);
 assert.equal(findDuplicateProducts({name:'',barcode:''},products).length,0);
});
test('duplicate groups include barcode matches and exclude archived records',()=>{
 const result=analyzeDuplicates([{id:'a',name:'A',barcode:'1'},{id:'b',name:'B',barcode:'1'},{id:'c',name:'B',mergedIntoId:'b'}]);
 assert.deepEqual([...result.duplicateIdSet].sort(),['a','b']);
});
test('catalog duplicates require approval and retain the barcode',()=>{
 const row=parseSupplierDraft({name:'Café',barcode:'00123',category:'Bebidas',type:'comum',purchaseCost:1,costBasis:'unidade',unitsPerPackage:1,purchaseForm:'unidade',basePrice:2});
 assert.equal(buildSupplierProducts([row],['cafe']).length,0);
 const products=buildSupplierProducts([{...row,allowDuplicate:true}],['cafe']);
 assert.equal(products.length,1);assert.equal(products[0].barcode,'00123');
});

const acceptedPairs=[['Brahma (LATAO)','Bhrama Latão'],['Budwiser latao','Budweiser Latão'],['Budweiser (long)','Budweiser Long Neck']];
for(const [a,b] of acceptedPairs)test(`acceptance: ${a} and ${b} are reviewable suspects`,()=>{
 assert.equal(similarProductNames(a,b),true);
 assert.equal(findDuplicateProducts({name:a},[{id:'existing',name:b}]).length,1);
 assert.equal(analyzeDuplicates([{id:'a',name:a},{id:'b',name:b}]).duplicateGroups.size,1);
});
test('word order, accents, punctuation and missing spaces do not hide a suspicion',()=>{
 for(const [a,b] of [['OCB','OBC'],['Água','Agua'],['Caçula','Cacula'],['Latão Brahma','Brahma latao'],['Budweiser Long Neck','neck long Budweiser'],['agua mineral','aguamineral']])assert.equal(similarProductNames(a,b),true);
});
test('different presentations, sizes and short unrelated names stay distinct',()=>{
 for(const [a,b]of [['Brahma Latão','Brahma Long Neck'],['Brahma lata','Brahma latao'],['Cerveja 350ml','Cerveja 355ml'],['Cerveja 350ml','Cerveja 350l'],['A','B']])assert.equal(similarProductNames(a,b),false);
 const list=acceptedPairs.flatMap((pair,i)=>pair.map((name,j)=>({id:`${i}-${j}`,name}))).concat({id:'different',name:'Brahma Long Neck'});
 const pairs=suspiciousProductPairs(list);for(const [a,b] of acceptedPairs)assert.ok(pairs.some(([x,y])=>x.name===a&&y.name===b));
 assert.ok(!pairs.some(([a,b])=>(a.name==='Brahma (LATAO)'&&b.name==='Brahma Long Neck')||(b.name==='Brahma (LATAO)'&&a.name==='Brahma Long Neck')));
});
test('long names over 85 percent similar can be suspected even with more than two edits',()=>{
 assert.equal(similarProductNames('Cerveja Budweiser Premium Long Neck 330ml','Cervaja Budweisar Premiun Long Neck 330ml'),true);
});
