import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Node','Event'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=(await import('react')).default;
const {render,act,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../node_modules/export-period-regression-',import.meta.url));
const mocks={
 auth:`export const getAccessToken=async()=>{if(globalThis.__googleAuthFailure)throw globalThis.__googleAuthFailure;return "token";};`,
 api:`export const subscribeCustomers=cb=>{cb([]);return()=>{};};export const subscribeProducts=subscribeCustomers;export const subscribeSettings=cb=>{cb({storeName:'Loja'});return()=>{};};export const getSalesByDateRange=async()=>globalThis.__periodSales;export const getPurchasesByDateRange=async()=>[{totalCost:5,date:'2026-10-23'}];`,
 preferencesContext:`export const usePreferences=()=>({languageMode:'basic',v:key=>({'report.csvOnly':'Somente dados CSV','report.analysisDownload':'Análise XLSX','report.balanceTitle':'Vendas menos compras e taxas','report.balanceNote':'Inclui fiado. Não é o lucro.','report.loadError':'Falha ao carregar','report.invalidDates':'Datas inválidas'}[key]||key)});`,
 exportUtils:`export const exportFullReportToCSV=async data=>{globalThis.__periodExport=data;if(globalThis.__periodFileFailure)throw globalThis.__periodFileFailure;};`,
 sheets:`export const exportToSheets=async()=>{globalThis.__sheetCalls=(globalThis.__sheetCalls||0)+1;await globalThis.__sheetPending;if(globalThis.__sheetFailure)throw globalThis.__sheetFailure;return 'https://docs.google.com/spreadsheets/d/test/edit';};`,
 actionFeedback:`export const showToast=(text,kind='success')=>{(globalThis.__exportToasts||=[]).push({text,kind});};export const showActionError=()=>{};export const withActionDeadline=fn=>fn;`
};
await build({stdin:{contents:"export {ExportPeriodModal} from './src/components/ExportPeriodModal';",resolveDir:process.cwd()},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:`${dir}/modal.mjs`,plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>{const name=a.path.split('/').at(-1);return mocks[name]?{path:name,namespace:'mock'}:undefined;});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
const {ExportPeriodModal}=await import(pathToFileURL(`${dir}/modal.mjs`));
afterEach(()=>{cleanup();delete globalThis.__periodSales;delete globalThis.__periodExport;for(const k of ['__sheetCalls','__sheetPending','__sheetFailure','__periodFileFailure','__exportToasts','__googleAuthFailure'])delete globalThis[k];});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();});
async function setup(props={}){
 globalThis.__periodSales=[{total:18.1,type:'card',feeAmount:0.6,createdAt:new Date(2026,9,23,12).getTime()},{total:10,type:'cash',feeAmount:0,createdAt:new Date(2026,9,23,12).getTime()},{total:1000,type:'cash',feeAmount:0,cancelledAt:2,createdAt:new Date(2026,9,23,12).getTime()}];
 let ui;await act(async()=>{ui=render(React.createElement(ExportPeriodModal,{isOpen:true,onClose(){},defaultStartDate:'2026-10-23',defaultEndDate:'2026-10-23',...props}));});return ui;
}
test('period report excludes cancelled sales and deducts historical fees in both preview and downloaded CSV',async()=>{
 const ui=await setup();assert.ok(ui.getByText(/22,50/));assert.ok(ui.getByText('Inclui fiado. Não é o lucro.'));
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Somente dados CSV'})));
 const payload=globalThis.__periodExport;
 assert.equal(payload.sales.length,2);assert.equal(payload.inflow,28.1);assert.equal(payload.balance,22.5);assert.equal(payload.outflow,5);
});
test('clearing a date does not crash the modal or allow a stale export',async t=>{
 t.mock.method(console,'error',()=>{});const ui=await setup();
 await act(async()=>fireEvent.change(ui.container.querySelector('input[type="date"]'),{target:{value:''}}));
 assert.ok(ui.getByText('Falha ao carregar'));assert.equal(ui.getByRole('button',{name:'Análise XLSX'}).disabled,true);
 assert.equal(ui.getByRole('button',{name:'Somente dados CSV'}).disabled,true);assert.equal(globalThis.__periodExport,undefined);
});

test('a failed Sheets attempt clears previous success, stays open and only publishes an error result',async t=>{
 t.mock.method(console,'warn',()=>{});let started=0,closed=0;const results=[];
 const ui=await setup({onExportStart:()=>started++,onExportResult:r=>results.push(r),onClose:()=>closed++});
 // First download succeeds, then a different format fails in the same export context.
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Somente dados CSV'})));
 globalThis.__sheetFailure=Object.assign(new Error('secret provider body'),{code:'GOOGLE_AUTH'});
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Google Sheets'})));
 assert.equal(started,2);assert.equal(closed,1);assert.deepEqual(results.map(r=>r.type),['success','error']);
 assert.equal(results[1].text,'report.exportAuth');
 assert.ok(ui.getByText('report.exportAuth'));assert.equal(ui.queryByText('report.exportCsvSuccess'),null);
 assert.deepEqual(globalThis.__exportToasts.map(t=>t.kind),['success','error']);
});
test('rapid export clicks produce only one Google request, and a blocked popup does not report export failure',async t=>{
 let release;globalThis.__sheetPending=new Promise(resolve=>{release=resolve;});
 t.mock.method(window,'open',()=>{throw new Error('Popup blocked');});
 const results=[];const ui=await setup({onExportResult:r=>results.push(r)});const csvButton=ui.getByRole('button',{name:'Somente dados CSV'});
 await act(async()=>{const button=ui.getByRole('button',{name:'Google Sheets'});fireEvent.click(button);fireEvent.click(button);});
 assert.equal(globalThis.__sheetCalls,1);assert.equal(csvButton.disabled,true);
 await act(async()=>{release();});
 assert.equal(results.length,1);assert.equal(results[0].type,'success');assert.ok(results[0].url.startsWith('https://docs.google.com/'));
});
test('file failure remains in the dialog and permits retry without mixing success and error',async t=>{
 t.mock.method(console,'warn',()=>{});let closed=0;const ui=await setup({onClose:()=>closed++});
 globalThis.__periodFileFailure=new Error('download failed');
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Somente dados CSV'})));
 assert.equal(closed,0);assert.ok(ui.getByText('report.exportFailed'));
 assert.equal(ui.getByRole('button',{name:'Somente dados CSV'}).disabled,false);
 delete globalThis.__periodFileFailure;
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Somente dados CSV'})));
 assert.equal(closed,1);
});

test('the actual XLSX button produces a ZIP workbook with native charts before publishing success',async t=>{
 const {default:JSZip}=await import('jszip');let blob,closed=0;const results=[];
 t.mock.method(URL,'createObjectURL',value=>{blob=value;return 'blob:workbook';});t.mock.method(URL,'revokeObjectURL',()=>{});
 t.mock.method(dom.window.HTMLAnchorElement.prototype,'click',()=>{});
 const originalTimeout=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>originalTimeout(fn,ms===10000?1:ms,...args));
 const ui=await setup({onClose:()=>closed++,onExportResult:r=>results.push(r)});
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Análise XLSX'}));await waitFor(()=>assert.ok(blob),{timeout:5000});});
 assert.ok(blob);assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());assert.ok(zip.file('xl/workbook.xml'));
 assert.equal(Object.keys(zip.files).filter(n=>/^xl\/charts\/chart\d+\.xml$/.test(n)).length,3);
 assert.equal(closed,1);assert.equal(results.length,1);assert.equal(results[0].type,'success');
});

test('reopening the period dialog uses the current parent dates, not a previous export selection',async()=>{
 const ui=await setup();
 await act(async()=>ui.rerender(React.createElement(ExportPeriodModal,{isOpen:false,onClose(){},defaultStartDate:'2026-11-01',defaultEndDate:'2026-11-04'})));
 await act(async()=>ui.rerender(React.createElement(ExportPeriodModal,{isOpen:true,onClose(){},defaultStartDate:'2026-11-01',defaultEndDate:'2026-11-04'})));
 const inputs=ui.container.querySelectorAll('input[type="date"]');assert.equal(inputs[0].value,'2026-11-01');assert.equal(inputs[1].value,'2026-11-04');
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Somente dados CSV'})));
 assert.equal(globalThis.__periodExport.startDate,'2026-11-01');assert.equal(globalThis.__periodExport.endDate,'2026-11-04');
});

test('cancelled Google permission does not start a sheet and releases export loading',async()=>{
 globalThis.__googleAuthFailure=Object.assign(new Error('cancelled'),{code:'auth/popup-closed-by-user'});const ui=await setup();await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Google Sheets'})));assert.equal(globalThis.__sheetCalls,undefined);assert.equal(ui.getByRole('button',{name:'Google Sheets'}).disabled,false);
});
