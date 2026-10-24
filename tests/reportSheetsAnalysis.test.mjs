import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(new URL('../node_modules/report-sheets-test-',import.meta.url));
await build({stdin:{contents:"export {exportToSheets} from './src/lib/sheets.ts';",resolveDir:process.cwd()},bundle:true,packages:'external',platform:'node',format:'esm',outfile:`${dir}/sheets.mjs`,plugins:[{name:'auth',setup(b){b.onResolve({filter:/^\.\/auth$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getAccessToken=async()=>"test-token";'}));}}]});
const {exportToSheets}=await import(pathToFileURL(`${dir}/sheets.mjs`));
after(()=>rm(dir,{recursive:true,force:true}));
const data={sales:[{total:25,type:'cash',createdAt:new Date(2026,9,23,12).getTime(),feeAmount:0}],purchases:[],customers:[{name:'=not_a_formula',totalDebt:12}],expenses:[],startDate:'2026-10-23',endDate:'2026-10-23'};
test('Google Sheets export creates an analysis tab and editable charts using RAW numeric and literal text cells',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});return Response.json(calls.length===1?{spreadsheetId:'sheet-test'}:{});});
 assert.equal(await exportToSheets(data),'https://docs.google.com/spreadsheets/d/sheet-test/edit#gid=101');
 assert.equal(calls.length,3);
 assert.ok(calls[0].body.sheets.some(s=>s.properties.title==='Análise'&&s.properties.sheetId===100));
 assert.equal(calls[1].body.valueInputOption,'RAW');
 assert.equal(calls[1].body.data.find(d=>d.range==='Fiado!A1').values[1][0],'=not_a_formula');
 const rows=calls[1].body.data.find(d=>d.range==="'Análise'!A1").values;
 const charts=calls[2].body.requests.filter(r=>r.addChart);
 assert.equal(charts.length,3);
 assert.equal(charts[0].addChart.chart.spec.pieChart.pieHole,0.55);assert.equal(charts[2].addChart.chart.spec.basicChart.chartType,'BAR');
 assert.equal(calls[0].body.sheets[0].properties.title,'Painel visual');
 const panel=calls[1].body.data.find(d=>d.range==="'Painel visual'!A1").values;assert.equal(panel[27][0],25);
 for(const {addChart:{chart}} of charts){
  const series=(chart.spec.pieChart?.series || chart.spec.basicChart.series[0].series).sourceRange.sources[0];
  const values=rows.slice(series.startRowIndex,series.endRowIndex).map(r=>r[series.startColumnIndex]);
  assert.ok(values.length);assert.ok(values.every(v=>typeof v==='number'&&Number.isFinite(v)));
  assert.equal(chart.position.overlayPosition.anchorCell.sheetId,101);
 }
});
test('chart failure never reports a fully successful analysis export',async t=>{
 let count=0;t.mock.method(globalThis,'fetch',async()=>{count++;return count===3?new Response('Unavailable',{status:503}):Response.json(count===1?{spreadsheetId:'test'}:{});});
 await assert.rejects(()=>exportToSheets(data),/não foi possível concluir os gráficos/);
});
