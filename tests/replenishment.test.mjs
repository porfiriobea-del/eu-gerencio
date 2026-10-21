import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReplenishment,stockLimitError,usedSuppliers} from '../src/lib/replenishment.ts';
import {similarProductNames,suspiciousProductPairs} from '../src/lib/duplicateDetector.ts';
const day=86400000,now=new Date(2026,9,21,12).getTime();
const product={id:'p',name:'Produto',type:'comum',purchaseForm:'fardo',unitsPerPackage:6,stock:3,safetyStock:2,maxStock:10,stockCoverageDays:7,unitCost:2,dailyAverageSales:9999};
const sale=(quantity,days=1,extra={})=>({productId:'p',quantity,format:'Unidade',stockDeduction:1,createdAt:now-days*day,...extra});
test('uses a full 14-day window, not stored averages or only days with sales',()=>{
 const [r]=buildReplenishment([product],[sale(28),sale(900,15)],[],now);
 assert.equal(r.average,2);assert.equal(r.coverage,1.5);assert.equal(r.days,14);
 assert.equal(r.suggestedBuyUnits,12);assert.equal(r.suggestedPackages,2);assert.equal(r.estimatedCost,24);
});
test('recent initial stock shortens the period and excludes earlier sales; today has a one-day minimum',()=>{
 const initialStockDate=new Date(now-2*day); const date=`${initialStockDate.getFullYear()}-${String(initialStockDate.getMonth()+1).padStart(2,'0')}-${String(initialStockDate.getDate()).padStart(2,'0')}`;
 const [r]=buildReplenishment([{...product,initialStockDate:date}],[sale(5),sale(100,3)],[],now);
 assert.equal(r.average,5/2.5);
 const [today]=buildReplenishment([{...product,initialStockDate:'2026-10-21'}],[sale(2,0.1)],[],now);
 assert.equal(today.days,1);assert.equal(today.average,2);
});
test('includes empty/safety/coverage alerts, excludes equality and healthy stock',()=>{
 const make=(id,stock,safetyStock=0)=>({...product,id,stock,safetyStock,maxStock:15});
 const list=buildReplenishment([make('healthy',30),make('empty',0),make('safety',4,5),make('coverage',4),make('equal',5,5)], [sale(14,1,{productId:'coverage'})],[],now);
 assert.deepEqual(list.map(x=>x.product.id),['empty','safety','coverage']);
 assert.equal(list[0].average,null);assert.equal(list[0].coverage,null);
});
test('uses larger target and costs full packages, including supplier half packs and fractional cigarettes',()=>{
 let [r]=buildReplenishment([{...product,stock:0,maxStock:19}],[],[],now);
 assert.equal(r.suggestedBuyUnits,24);assert.equal(r.estimatedCost,48);
 [r]=buildReplenishment([{...product,type:'cigarro',stock:1.5,safetyStock:2,maxStock:10,supplierPackageUnits:5}],[],[],now);
 assert.equal(r.suggestedBuyUnits,10);assert.equal(r.suggestedPackages,2);
 [r]=buildReplenishment([{...product,type:'cigarro',stock:0,maxStock:1,supplierPackageUnits:5}], [sale(1,1,{stockDeduction:0.05})],[],now);
 assert.equal(r.average,0.05/14);assert.equal(r.suggestedBuyUnits,5);
});
test('prefers the last dated supplier, deduplicates supplier names and keeps unknown suppliers empty',()=>{
 const purchases=[{productId:'p',supplier:' Ácme ',date:'2026-10-20',createdAt:20},{productId:'p',supplier:'Other',date:'2026-10-19',createdAt:21},{productId:'p',supplier:'acme',date:'2026-10-18',createdAt:18}];
 assert.equal(buildReplenishment([{...product,stock:0}],[],purchases,now)[0].supplier,'Ácme');
 assert.deepEqual(usedSuppliers(purchases),['Ácme','Other']);
 assert.equal(buildReplenishment([{...product,stock:0}],[],[],now)[0].supplier,'');
});
test('validates maximum vs safety and warns about current balances without changing them',()=>{
 assert.equal(stockLimitError({maxStock:2,safetyStock:3}),true);
 assert.equal(stockLimitError({maxStock:3,safetyStock:3}),false);
 const [r]=buildReplenishment([{...product,stock:8,maxStock:5,stockCoverageDays:14}], [sale(28)],[],now);
 assert.equal(r.aboveMaximum,true);assert.equal(product.stock,3);
});
test('similar names ignore case/accents/all whitespace but keep sizes distinct',()=>{
 assert.equal(similarProductNames('Água Mineral','  aguaMINERAL '),true);
 assert.equal(similarProductNames('Heineken lata','Heinekem lata'),true);
 assert.equal(similarProductNames('Cerveja 350 ml','Cerveja 355 ml'),false);
 const a={...product,name:'Água Mineral'},b={...product,id:'b',name:'aguamineral'};
 assert.equal(suspiciousProductPairs([a,b]).length,1);
 assert.equal(suspiciousProductPairs([a,{...b,mergedIntoId:'p'}]).length,0);
});
test('joining products preserves historical demand and supplier from source IDs',()=>{
 const [r]=buildReplenishment([{...product,mergedProductIds:['source']}],[sale(14,1,{productId:'source'}),sale(14)], [{productId:'source',date:'2026-10-20',createdAt:1,supplier:'Original'}],now);
 assert.equal(r.average,2);assert.equal(r.supplier,'Original');
});
