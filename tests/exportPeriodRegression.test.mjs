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
const {render,act,fireEvent,cleanup}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../node_modules/export-period-regression-',import.meta.url));
const mocks={
 api:`export const subscribeCustomers=cb=>{cb([]);return()=>{};};export const subscribeProducts=subscribeCustomers;export const subscribeSettings=cb=>{cb({storeName:'Loja'});return()=>{};};export const getSalesByDateRange=async()=>globalThis.__periodSales;export const getPurchasesByDateRange=async()=>[{totalCost:5,date:'2026-10-23'}];`,
 preferencesContext:`export const usePreferences=()=>({languageMode:'basic',v:key=>({'report.csvOnly':'Somente dados CSV','report.analysisDownload':'Análise XLSX','report.balanceTitle':'Vendas menos compras e taxas','report.balanceNote':'Inclui fiado. Não é o lucro.','report.loadError':'Falha ao carregar','report.invalidDates':'Datas inválidas'}[key]||key)});`,
 exportUtils:`export const exportFullReportToCSV=data=>{globalThis.__periodExport=data;};`,
 sheets:`export const exportToSheets=async()=>'';`,
 actionFeedback:`export const showToast=()=>{};export const showActionError=()=>{};export const withActionDeadline=fn=>fn;`
};
await build({stdin:{contents:"export {ExportPeriodModal} from './src/components/ExportPeriodModal';",resolveDir:process.cwd()},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:`${dir}/modal.mjs`,plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>{const name=a.path.split('/').at(-1);return mocks[name]?{path:name,namespace:'mock'}:undefined;});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
const {ExportPeriodModal}=await import(pathToFileURL(`${dir}/modal.mjs`));
afterEach(()=>{cleanup();delete globalThis.__periodSales;delete globalThis.__periodExport;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();});
async function setup(){
 globalThis.__periodSales=[{total:18.1,type:'card',feeAmount:0.6,createdAt:1},{total:10,type:'cash',feeAmount:0,createdAt:1},{total:1000,type:'cash',feeAmount:0,cancelledAt:2,createdAt:1}];
 let ui;await act(async()=>{ui=render(React.createElement(ExportPeriodModal,{isOpen:true,onClose(){},defaultStartDate:'2026-10-23',defaultEndDate:'2026-10-23'}));});return ui;
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
