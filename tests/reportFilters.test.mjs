import test from 'node:test';import assert from 'node:assert/strict';
import {filterReport,emptyReportFilters,activeReportFilterCount} from '../src/lib/reportFilters.ts';
import {invoiceLine,newInvoiceLine} from '../src/lib/purchaseInvoice.ts';
import * as legacy from '../src/lib/googleSheets.ts';
const products=[{id:'a',name:'Água',category:'Bebidas',unitCost:1,lastCost:2,type:'comum',unitsPerPackage:6},{id:'b',name:'Seda',category:'Sedas',type:'comum',unitsPerPackage:1}];
test('category reports apportion mixed-sale amounts and fees, matching purchase/category/employee without mutating history',async()=>{
 const sales=[{id:'s',ownerId:'owner',employeeId:'e',type:'card',paymentMethod:'credit',total:30,subtotal:30,feeAmount:.9,netTotal:29.1}],purchases=[{productId:'a',employeeId:'e',quantity:1,totalCost:5},{productId:'b',employeeId:'e',quantity:1,totalCost:9}];
 const before=structuredClone(sales);const r=await filterReport(sales,purchases,products,{payment:'credit',employee:'e',category:'Bebidas'},async()=>[{productId:'a',name:'Água ORIGINAL',price:10,quantity:1},{productId:'b',name:'Seda ORIGINAL',price:20,quantity:1}]);
 assert.equal(r.sales.length,1);assert.equal(r.sales[0].total,10);assert.equal(r.sales[0].feeAmount,.3);assert.equal(r.sales[0].netTotal,9.7);assert.equal(r.purchases.length,1);assert.equal(r.purchases[0].totalCost,5);assert.equal(r.sales[0].itemsSummary,'1x Água ORIGINAL');assert.deepEqual(sales,before);
});
test('payment formats distinguish both Pix types and card methods, owner matches legacy records, cancelled sales stay excluded',async()=>{
 const sales=[{id:'direct',type:'card',paymentMethod:'pix',employeeId:'e'},{id:'machine',type:'card',paymentMethod:'pix_machine',employeeId:'e'},{id:'old',type:'cash',ownerId:'owner'},{id:'cancelled',type:'cash',cancelledAt:1}];
 assert.deepEqual((await filterReport(sales,[],[],{...emptyReportFilters,payment:'pix'},async()=>[])).sales.map(s=>s.id),['direct']);
 assert.deepEqual((await filterReport(sales,[],[],{...emptyReportFilters,payment:'pix_machine'},async()=>[])).sales.map(s=>s.id),['machine']);
 assert.deepEqual((await filterReport(sales,[],[],{...emptyReportFilters,employee:'owner'},async()=>[])).sales.map(s=>s.id),['old']);
 assert.equal(activeReportFilterCount({payment:'cash',employee:'e',category:'Bebidas'}),3);
});
test('invoice drafts calculate supplier packaging and bonus rules while preserving manual overrides and exact carteira fractions',()=>{
 const cigarette={id:'c',name:'Cigarro',type:'cigarro',unitsPerPackage:10,supplierPackageUnits:5,unitCost:10,lastCost:12};
 const line={...newInvoiceLine(),productId:'c',quantity:'2',measure:'package'};
 const rule={productId:'c',supplier:'Fornecedor Á',buyQuantity:1,buyUnit:'pacote',bonusProductId:'c',bonusQuantity:1,bonusUnit:'carteira'};
 const r=invoiceLine(line,[cigarette],[rule],'FORNECEDOR A');assert.equal(r.quantity,10);assert.equal(r.cost,120);assert.equal(r.bonusQuantity,2);assert.equal(r.valid,true);
 const none=invoiceLine({...line,manualBonus:true,bonusProductId:'',bonusQuantity:'9'},[cigarette],[rule],'Fornecedor A');assert.equal(none.bonusQuantity,0);assert.equal(none.bonusProductId,'');
 assert.equal(invoiceLine({...line,measure:'unit',quantity:'.03'},[cigarette],[],'').valid,false);assert.equal(invoiceLine({...line,measure:'unit',quantity:'.05'},[cigarette],[],'').quantity,.05);
 assert.equal(invoiceLine({...line,cost:''},[cigarette],[],'').valid,false);
});
test('legacy browser webhook is inert even with enabled cloud settings or explicit URL and test calls',async()=>{
 const old=globalThis.fetch;let called=0;globalThis.fetch=async()=>{called++;throw Error('must not send');};
 try{legacy.hydrateCloudSheets('store','https://example.invalid/exec',true);legacy.setGoogleSheetsWebhookEnabled(true);legacy.setGoogleSheetsWebhookUrl('https://example.invalid/exec');assert.equal(legacy.isGoogleSheetsWebhookEnabled(),false);assert.equal((await legacy.postToGoogleSheets({tipo:'sale'})).success,false);assert.equal((await legacy.testGoogleSheetsWebhook('https://example.invalid/exec')).success,false);assert.equal(called,0);assert.deepEqual(legacy.getGoogleSheetsLogs(),[]);}finally{globalThis.fetch=old;}
});

test('active report filters scope exported customer and product lists without rewriting their balances',async()=>{
 const {reportExportEntities}=await import('../src/lib/reportFilters.ts');const customers=[{id:'c1',totalDebt:90},{id:'c2',totalDebt:50}],sales=[{type:'fiado',customerId:'c1'}];
 const scoped=reportExportEntities(sales,customers,products,{...emptyReportFilters,category:'Bebidas'});assert.deepEqual(scoped.customers,[customers[0]]);assert.deepEqual(scoped.products,[products[0]]);assert.equal(customers[0].totalDebt,90);assert.equal(reportExportEntities(sales,customers,products,emptyReportFilters).customers.length,2);
});
