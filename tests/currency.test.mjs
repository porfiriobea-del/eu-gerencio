import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMoney,formatAmount,getCurrencySymbol,normalizeCurrency,moneyLocales} from '../src/lib/currency.ts';
import {calculatePayment} from '../src/lib/paymentFees.ts';
for(const language of ['pt','en','es']){
 test(`currency formatting follows ${language} without changing the shop's selected currency or numeric amount`,()=>{
  for(const currency of ['BRL','USD','EUR']){
   const value=123456.78;
   const expected=new Intl.NumberFormat(moneyLocales[language],{style:'currency',currency,currencyDisplay:currency==='BRL'?'narrowSymbol':'symbol'}).format(value);
   assert.equal(formatMoney(value,{language,currency}),expected);
   assert.equal(value,123456.78);
   assert.equal(getCurrencySymbol({language,currency}),new Intl.NumberFormat(moneyLocales[language],{style:'currency',currency,currencyDisplay:currency==='BRL'?'narrowSymbol':'symbol'}).formatToParts(0).find(part=>part.type==='currency').value);
  }
  assert.equal(formatMoney(100,{language}),formatMoney(100,{language,currency:'BRL'}));
  assert.ok(formatMoney(100,{language}).includes('R$'));
  assert.equal(formatAmount(1234.56,{language}),language==='en'?'1234.56':'1234,56');
 });
}
test('missing currency is BRL and non-BRL shops cannot submit stale Pix payments',()=>{
 for(const value of [null,undefined,'en','es','GBP'])assert.equal(normalizeCurrency(value),'BRL');
 for(const currency of ['USD','EUR'])for(const method of ['pix','pix_machine'])assert.throws(()=>calculatePayment(100,method,{currency,pixRate:0.49,enableCardFees:true}),/BRL/);
 assert.equal(calculatePayment(100,'credit',{currency:'USD'}).total,100);
});

test('CSV uses shop currency headers and locale decimal separators without converting or changing product names',async t=>{
 const {exportPurchasesToCSV,exportFullReportToCSV,exportDailySalesAndSafetyStockToCSV}=await import('../src/lib/exportUtils.ts');
 const previous=globalThis.document;let blob;
 t.after(()=>{globalThis.document=previous;});
 globalThis.document={createElement:()=>({click(){}}),body:{appendChild(){},removeChild(){}}};
 t.mock.method(URL,'createObjectURL',value=>{blob=value;return 'blob:test';});t.mock.method(URL,'revokeObjectURL',()=>{});
 const purchase={productName:'Original R$ Product',category:'Teste',quantity:1,unitCost:1234.56,totalCost:1234.56,date:'2026-10-15',createdAt:Date.now()};
 for(const language of ['pt','en','es'])for(const currency of ['BRL','USD','EUR']){
  const options={currency,language};
  exportPurchasesToCSV([purchase],'test',options);
  const text=await blob.text();
  assert.ok(text.includes(`Custo Unitário (${currency})`));assert.ok(text.includes('Original R$ Product'));
  assert.ok(text.includes(formatAmount(1234.56,options)));assert.equal(purchase.totalCost,1234.56);
  exportFullReportToCSV({purchases:[],sales:[{type:'cash',total:100,createdAt:Date.now(),feeAmount:0}],customers:[],periodLabel:'Teste',...options});
  assert.ok((await blob.text()).includes(`Valor Total (${currency})`));
  exportDailySalesAndSafetyStockToCSV([],undefined,'test',options);
  assert.ok((await blob.text()).includes(`Custo Unitário (${currency})`));
 }
});
