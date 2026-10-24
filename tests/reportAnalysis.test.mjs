import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReport, analysisSheet} from '../src/lib/reportAnalysis.ts';
import {buildReportWorkbook} from '../src/lib/reportWorkbook.ts';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
const sale=(id,total,paymentMethod='cash',day=1,feeAmount=0)=>({id,total,paymentMethod,type:paymentMethod==='fiado'?'fiado':paymentMethod==='cash'?'cash':'card',createdAt:new Date(2026,9,day,12).getTime(),feeAmount,ownerId:'owner'});
const input=()=>({startDate:'2026-10-01',endDate:'2026-10-03',periodLabel:'Teste',currency:'BRL',sales:[sale('1',100),sale('2',50,'pix'),sale('3',40,'pix_machine',3,0.2),sale('4',10,'fiado',3)],purchases:[{id:'p1',date:'2026-10-02',quantity:2,unitCost:15,totalCost:30,productName:'Água mineral',supplier:'Fornecedor teste'}],customers:[{name:'João',totalDebt:10}],products:[{name:'Cigarro original',category:'Cigarros',type:'cigarro',stock:1.95}]});
test('analysis reconciles sales, fees, purchases, both Pix types, credit, calendar days and zero-movement days',()=>{
 const data=input(),a=analyzeReport(data);
 assert.equal(a.revenue,200);assert.equal(a.fees,0.2);assert.equal(a.bought,30);assert.equal(a.balance,169.8);assert.equal(a.ticket,50);assert.equal(a.credit,10);
 assert.equal(a.calendarDays,3);assert.equal(a.activeDays,2);assert.equal(a.dailyRows.length,3);
 assert.equal(a.dailyRows[1].count,0);assert.equal(a.dailyRows[1].balance,-30);
 assert.equal(a.paymentRows.find(p=>p.label==='Pix (direto na conta)').revenue,50);
 assert.equal(a.paymentRows.find(p=>p.label==='Pix na maquininha').fees,0.2);
 assert.equal(a.paymentRows.reduce((sum,p)=>sum+p.share,0),1);
 assert.equal(a.dailyRows.reduce((sum,d)=>sum+Math.round(d.revenue*100),0),20000);
});
test('cancelled, invalid, outside-period records and missing fees are disclosed without corrupting totals or mutating source',()=>{
 const data=input();data.sales.push({...sale('cancel',99),cancelledAt:1},sale('outside',15,'cash',5),sale('bad',NaN),{...sale('bad-date',50),createdAt:NaN},{...sale('missing',0.1),feeAmount:Infinity},sale('cents',0.2));
 data.purchases.push({date:'invalid',totalCost:20});
 const before=structuredClone(data),a=analyzeReport(data);
 assert.equal(a.cancelled,1);assert.equal(a.invalidSales,2);assert.equal(a.invalidPurchases,1);assert.equal(a.outsidePeriod,1);assert.equal(a.missingFees,1);assert.equal(a.revenue,200.3);assert.equal(a.balance,170.1);
 assert.deepEqual(data,before);
});
test('empty input has no invented ticket, best day or period and invalid intervals fail explicitly',()=>{
 const data={sales:[],purchases:[],customers:[]};
 const a=analyzeReport(data);assert.equal(a.ticket,null);assert.equal(a.calendarDays,0);assert.equal(a.count,0);
 const sheet=analysisSheet(data);assert.ok(sheet.rows.some(r=>r.includes('Sem vendas')));assert.equal(sheet.charts.length,1);
 assert.throws(()=>analyzeReport({...data,startDate:'2026-10-03',endDate:'2026-10-01'}),/datas/);
 assert.throws(()=>analyzeReport({...data,startDate:'invalid'}),/datas/);
});
test('long periods aggregate only chart series by month; every chart refers to its exact numeric source rows',()=>{
 const data={...input(),startDate:'2026-01-01',endDate:'2026-12-31'};
 const sheet=analysisSheet(data);assert.equal(sheet.analysis.calendarDays,365);assert.equal(sheet.charts[0].title,'Vendas por mês');
 for(const chart of sheet.charts){
  const source=sheet.rows.slice(chart.dataStart-1,chart.dataEnd);
  assert.deepEqual(source.map(r=>r[0]),chart.labels);assert.deepEqual(source.map(r=>r[chart.column]),chart.values);
 }
});
for(const languageMode of ['basic','neutral','technical'])test(`workbook ${languageMode} has valid editable charts, numeric sources and literal user names, without formulas`,async()=>{
 const data={...input(),languageMode};data.customers.push({name:'=SUM(1,2)',totalDebt:2});
 const bytes=await buildReportWorkbook(data),zip=await JSZip.loadAsync(bytes);
 assert.equal(Object.keys(zip.files).filter(p=>/^xl\/charts\/chart\d+\.xml$/.test(p)).length,3);
 for(let i=1;i<=3;i++){
  const chart=await zip.file(`xl/charts/chart${i}.xml`).async('string');
  assert.ok(chart.includes('<c:barChart>'));assert.ok(chart.includes('Análise'));assert.ok(chart.includes('<c:numCache>'));
 }
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.deepEqual(book.worksheets.map(w=>w.name),['Análise','Vendas','Compras','Fiado atual','Estoque atual']);
 assert.equal(book.getWorksheet('Fiado atual').getCell('A3').value,'=SUM(1,2)');
 assert.equal(book.getWorksheet('Estoque atual').getCell('C2').value,1.95);
 assert.equal(book.getWorksheet('Vendas').getCell('D2').value,100);
 book.eachSheet(ws=>ws.eachRow(row=>row.eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula))));
 assert.ok((await zip.file('xl/worksheets/sheet1.xml').async('string')).includes('rIdCharts'));
});
