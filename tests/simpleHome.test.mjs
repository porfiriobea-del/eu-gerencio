import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {activeMonthlyBalances,activeMonthStats,simpleDayBalance} from '../src/lib/simpleHome.ts';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
const at=(year,month)=>new Date(year,month,15,12).getTime();
test('monthly series omits inactive gaps, retains only six recent active months and accounts for fees',()=>{
 const sales=Array.from({length:8},(_,i)=>({createdAt:at(2025,i*2),total:100+i,feeAmount:2}));
 const months=activeMonthlyBalances(sales,[{createdAt:at(2025,6),totalCost:20}]);
 assert.equal(months.length,6);
 assert.deepEqual(months.map(row=>row.monthKey),['2025-05','2025-07','2025-09','2025-11','2026-01','2026-03']);
 assert.equal(months[1].profit,81);assert.equal(months[0].profit,100);
 const sparse=activeMonthlyBalances([{createdAt:at(2024,0),total:120,feeAmount:10}],[{createdAt:at(2026,5),totalCost:50}]);
 assert.equal(sparse.length,2);assert.equal(activeMonthStats(sparse).average,30);
 assert.equal(activeMonthStats(sparse).best.monthKey,'2024-01');
 assert.equal(activeMonthStats(sparse.slice(0,1)).average,undefined);
 assert.equal(activeMonthStats([]).average,undefined);
 const losing=activeMonthlyBalances([],[{createdAt:at(2026,1),totalCost:100},{createdAt:at(2026,4),totalCost:40}]);
 assert.equal(activeMonthStats(losing).best.profit,-40);
 assert.deepEqual(simpleDayBalance(100,20,3),{sales:100,spent:23,left:77});
 assert.deepEqual(simpleDayBalance(0.3,0.1,0.2),{sales:0.3,spent:0.3,left:0});
});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'});
const previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage']){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');
const {MemoryRouter}=await import('react-router-dom');
const {render,fireEvent,act,cleanup,within}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../.simple-home-test-',import.meta.url).pathname);
const apiNames=['subscribeProducts','subscribeTodaySales','subscribeCustomers','subscribeSettings','getSaleItems','getSalesByDateRange','getPurchasesByDateRange'];
const childNames=['MonthlyProfitChart','VisualReportsPanel','GuidedTour','ExportPeriodModal','PocketTip','PaymentSummary'];
await build({stdin:{contents:"export {default as Dashboard} from './src/pages/Dashboard';export {PreferencesProvider,usePreferences} from './src/lib/preferencesContext';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:dir+'/ui.mjs',plugins:[{name:'chart-bank',setup(b){
 b.onResolve({filter:/^react$/},args=>({path:args.path,external:true}));
 b.onResolve({filter:/.*/},args=>{if(args.path==='recharts')return {path:'recharts',namespace:'mock'};if(!args.path.startsWith('.'))return;const name=args.path.split('/').at(-1);if(name==='api'||childNames.includes(name))return {path:name,namespace:'mock'};});
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:args.path==='api'?apiNames.map(name=>`export const ${name}=(...args)=>globalThis.__homeBank.${name}(...args);`).join('\n'):args.path==='recharts'?`
 import React from 'react';
 export const ResponsiveContainer=({children})=>React.createElement('div',null,children);
 export const BarChart=props=>{globalThis.__homeChart=props;return React.createElement('div',null,props.children);};
 export const Bar=props=>{globalThis.__homeBar=props;return React.createElement('div',null,props.children);};
 export const YAxis=props=>{globalThis.__homeAxis=props;return null;};
 export const Cell=()=>null;export const XAxis=()=>null;export const CartesianGrid=()=>null;export const ReferenceLine=()=>null;
 export const Tooltip=()=>{throw new Error('Simple mode must not render a floating tooltip');};
 `:`import React from 'react';export const ${args.path}=()=>${args.path==='MonthlyProfitChart'?"React.createElement('p',null,'Gráfico técnico original')":"null"};`}));
}}]});
const {Dashboard,PreferencesProvider,usePreferences}=await import(dir+'/ui.mjs');
let historySales,historyPurchases;
function setup(mode='basic'){
 localStorage.setItem('app_lang_mode',mode);
 globalThis.__homeBank={
  subscribeProducts(cb){cb([]);return()=>{};},subscribeCustomers(cb){cb([]);return()=>{};},
  subscribeTodaySales(cb){cb([{id:'today',total:100,feeAmount:3,createdAt:Date.now(),type:'card'}]);return()=>{};},
  subscribeSettings(cb){cb({dailyGoal:500});return()=>{};},async getSaleItems(){return [];},
  async getSalesByDateRange(){return historySales;},
  async getPurchasesByDateRange(start){return start===0?historyPurchases:[{totalCost:20,createdAt:Date.now()}];}
 };
 function Control(){const p=usePreferences();return React.createElement('button',{onClick:()=>p.setLanguageMode('technical')},'Modo técnico');}
 return render(React.createElement(MemoryRouter,null,React.createElement(PreferencesProvider,null,React.createElement(Control),React.createElement(Dashboard))));
}
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__homeBank;delete globalThis.__homeChart;delete globalThis.__homeBar;delete globalThis.__homeAxis;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();for(const[name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
test('basic dashboard has three clear balances and hides the profit caveat and the rest behind explicit buttons',async()=>{
 historySales=[{total:100,feeAmount:0,createdAt:at(2026,0)},{total:60,feeAmount:0,createdAt:at(2026,4)}];historyPurchases=[];
 let ui;await act(async()=>{ui=setup();});
 const summary=ui.container.querySelector('#dashboard-simple-summary');
 assert.match(summary.textContent,/Você vendeu.*100,00/);
 assert.match(summary.textContent,/Gastou em compras e taxas.*23,00/);
 assert.match(summary.textContent,/Sobrou.*77,00/);
 assert.equal(summary.querySelectorAll('strong').length,3);
 assert.equal(ui.queryByText(/Isso não é o lucro/),null);
 assert.equal(ui.container.querySelector('#dashboard-summary-card'),null);
 fireEvent.click(ui.getByRole('button',{name:'Entender a sobra'}));
 assert.ok(ui.getByText(/Isso não é o lucro/));
 assert.ok(ui.getByText(/Mês que mais sobrou/));assert.ok(ui.getByText(/Média por mês/));
 assert.match(globalThis.__homeAxis.tickFormatter(1234),/R\$/);
 assert.equal(globalThis.__homeChart.data.length,2);
 assert.equal(globalThis.__homeChart.data.some(month=>month.sales===0&&month.purchases===0),false);
 await act(async()=>globalThis.__homeBar.onClick({payload:globalThis.__homeChart.data[0]}));
 const chart=ui.container.querySelector('#dashboard-monthly-profit');
 assert.match(within(chart).getByRole('status').textContent,/janeiro.*100,00/);
 fireEvent.click(ui.getByRole('button',{name:'Ver detalhes'}));
 assert.ok(ui.container.querySelector('#dashboard-summary-card'));
 fireEvent.click(ui.getByRole('button',{name:'Ocultar detalhes'}));
 assert.equal(ui.container.querySelector('#dashboard-summary-card'),null);
 fireEvent.click(ui.getByRole('button',{name:'Modo técnico'}));
 assert.ok(ui.getByText('Gráfico técnico original'));
 assert.equal(ui.container.querySelector('#dashboard-simple-summary'),null);
 assert.ok(ui.container.querySelector('#dashboard-summary-card'));
});
test('one active month has no average and an empty history has no padded bars',async()=>{
 historySales=[{total:100,createdAt:at(2026,0)}];historyPurchases=[];
 let ui;await act(async()=>{ui=setup();});
 assert.equal(ui.queryByText(/Média por mês/),null);assert.equal(globalThis.__homeChart.data.length,1);
 cleanup();historySales=[];
 await act(async()=>{ui=setup();});
 assert.ok(ui.getByText('Ainda não há movimento para mostrar.'));
 assert.equal(ui.queryByText(/Média por mês/),null);
});
