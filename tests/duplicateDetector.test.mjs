import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductName, findDuplicateProducts, analyzeDuplicates } from '../src/lib/duplicateDetector.ts';
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
