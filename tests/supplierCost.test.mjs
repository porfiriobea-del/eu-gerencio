import test from 'node:test';import assert from 'node:assert/strict';
import {supplierPackageCost,supplierUnitCost} from '../src/lib/supplierCost.ts';
import {invoiceLine,newInvoiceLine} from '../src/lib/purchaseInvoice.ts';
test('supplier package price is independent of current FIFO and last receipt cost',()=>{
 const p={id:'heineken',name:'Heineken Long',type:'comum',purchaseForm:'fardo',unitsPerPackage:24,supplierPackageCost:150,unitCost:4.5,lastCost:5.5};
 assert.equal(supplierPackageCost(p),150);assert.equal(supplierUnitCost(p),6.25);assert.equal(p.unitCost,4.5);assert.equal(p.lastCost,5.5);
 const row=invoiceLine({...newInvoiceLine(),productId:p.id,measure:'package',quantity:'1'},[p],[],'Fornecedor');assert.equal(row.quantity,24);assert.equal(row.cost,150);assert.equal(row.valid,true);
});
test('non-terminating per-unit divisions do not alter the original package price',()=>{
 const p={type:'comum',purchaseForm:'fardo',unitsPerPackage:12,supplierPackageCost:100,unitCost:5};assert.equal(supplierPackageCost(p),100);assert.equal(supplierUnitCost(p),100/12);
 const row=invoiceLine({...newInvoiceLine(),productId:'p',measure:'package'},[{...p,id:'p',name:'Produto'}],[],'');assert.equal(row.cost,100);
});
test('legacy costs fall back to last purchase while cigarette supplier halves keep five carteiras',()=>{
 assert.equal(supplierPackageCost({type:'comum',unitsPerPackage:24,lastCost:6.25,unitCost:4}),150);
 assert.equal(supplierPackageCost({type:'cigarro',supplierPackageUnits:5,unitsPerPackage:10,supplierPackageCost:150}),150);
 assert.equal(supplierUnitCost({type:'cigarro',supplierPackageUnits:5,supplierPackageCost:150}),30);
 assert.equal(supplierPackageCost({type:'comum',unitsPerPackage:24,supplierPackageCost:0,unitCost:4}),0);
});
