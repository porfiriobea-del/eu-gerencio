import test from 'node:test';
import assert from 'node:assert/strict';
import {exportFullReportToCSV,exportPurchasesToCSV,exportDailySalesAndSafetyStockToCSV} from '../src/lib/exportUtils.ts';

test('commercial CSV imports all sections without interpreting decorative separators as formulas', async t => {
  let blob;
  const previous = globalThis.document;
  globalThis.document = {createElement: () => ({click() {}}), body: {appendChild() {}, removeChild() {}}};
  t.after(() => {globalThis.document = previous;});
  t.mock.method(URL, 'createObjectURL', value => {blob = value; return 'blob:report';});
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const product = {name: 'Água mineral', category: 'Bebidas', stock: 12, dailyAverageSales: 1, replacementDays: 3, safetyStock: 2};
  const purchase = {productName: product.name, category: product.category, quantity: 12, unitCost: 2, totalCost: 24, date: '2026-10-23'};
  const sale = {type: 'cash', total: 10, feeAmount: 0, createdAt: Date.UTC(2026, 9, 23, 15), itemsSummary: '2x Água mineral'};
  for (const products of [undefined, [product]]) {
    exportFullReportToCSV({storeName: 'Loja teste', periodLabel: 'Hoje', purchases: [purchase], sales: [sale], customers: [{name: 'João', totalDebt: 15}], products});
    const text = await blob.text();
    const rows = text.replace(/^\uFEFF/, '').split('\r\n');
    // The former "====" rows are formulas even when CSV-quoted by an exporter.
    assert.equal(rows.some(row => /^\s*"?=/.test(row)), false);
    for (const title of ['RESUMO FINANCEIRO DO PERÍODO', '1. DETALHAMENTO DE VENDAS REALIZADAS', '2. COMPRAS E REPOSIÇÕES NO PERÍODO', '3. CLIENTES COM SALDO EM FIADO (CADERNETA)']) {
      assert.ok(rows.includes(title), title);
    }
    assert.ok(text.includes('TOTAL VENDAS;;1 vendas;10,00'));
    assert.ok(text.includes('TOTAL COMPRAS;;;12;;;24,00'));
    assert.ok(text.includes('TOTAL FIADO PENDENTE;;15,00'));
    assert.ok(text.includes('Água mineral'));
    assert.ok(text.includes('João'));
    assert.equal(text.includes('4. VENDA DIÁRIA E SUGESTÃO DE ESTOQUE DE SEGURANÇA'), !!products);
  }
});

// Read the resulting file as a spreadsheet importer would, including multiline quoted cells.
function parseCSV(text) {
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===';'&&!quoted){row.push(cell);cell='';}
  else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 row.push(cell);rows.push(row);return rows;
}
test('CSV round-trip preserves semicolons, quotes and newlines in metadata, names and package descriptions',async t=>{
 let blob;const previous=globalThis.document;
 globalThis.document={createElement:()=>({click(){}}),body:{appendChild(){},removeChild(){}}};
 t.after(()=>{globalThis.document=previous;});
 t.mock.method(URL,'createObjectURL',value=>{blob=value;return 'blob:test';});t.mock.method(URL,'revokeObjectURL',()=>{});
 const name='Água; "Especial"\n500 ml',category='Bebidas; geladas',pack='caixa; "retornável"';
 const product={name,category,stock:1,safetyStock:1,dailyAverageSales:1,replacementDays:1,unitCost:2};
 const purchase={productName:name,category,quantity:1,unitCost:2,totalCost:2,date:'2026-10-23',packageQuantity:1,packageType:pack,supplier:'Fornecedor; Norte'};
 exportFullReportToCSV({storeName:'Loja; Centro',periodLabel:'Hoje; caixa',purchases:[purchase],sales:[],customers:[{name,totalDebt:10}],products:[product]});
 let rows=parseCSV(await blob.text());
 assert.equal(rows[0].length,1);assert.ok(rows[0][0].endsWith('LOJA; CENTRO'));
 assert.equal(rows.find(r=>r[0]==='O que sobrou para você (Saldo Operacional)').length,3);
 const p=rows.find(r=>r[1]===name);assert.equal(p.length,9);assert.equal(p[4],`1 ${pack}`);assert.equal(p[7],purchase.supplier);
 assert.ok(rows.some(r=>r[0]===name&&r[2]==='10,00'));
 exportPurchasesToCSV([purchase]);rows=parseCSV(await blob.text());assert.equal(rows.find(r=>r[1]===name)[4],`1 ${pack}`);
 exportDailySalesAndSafetyStockToCSV([product],'Loja; Centro');rows=parseCSV(await blob.text());assert.equal(rows.find(r=>r[0]===name)[1],category);
});
