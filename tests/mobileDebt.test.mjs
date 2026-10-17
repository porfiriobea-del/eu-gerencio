import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {debtOverview,orderDebtCustomers,customerLastMovement} from '../src/lib/debtOverview.ts';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'});
const previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage']){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let mobile=true;
window.matchMedia=q=>({get matches(){return q.includes('max-width')?mobile:!mobile;},addEventListener(){},removeEventListener(){}});
const React=await import('react');
const {MemoryRouter,Routes,Route,useLocation}=await import('react-router-dom');
const {render,fireEvent,act,cleanup,within}=await import('@testing-library/react');
const folder=await mkdtemp(new URL('../.debt-ui-',import.meta.url).pathname);
const names=['subscribeCustomers','addCustomer','recordPayment','deleteCustomer','subscribeCustomerSales','subscribeCustomerPayments','getCustomerLastMovements'];
await build({stdin:{contents:"export {default as Debt} from './src/pages/Debt';export {PreferencesProvider} from './src/lib/preferencesContext';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:folder+'/ui.mjs',plugins:[{name:'bank',setup(b){
 b.onResolve({filter:/\/lib\/(api|employeeContext)$/},args=>({path:args.path.split('/').at(-1),namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:args.path==='api'?names.map(name=>`export const ${name}=(...args)=>globalThis.__debtBank.${name}(...args);`).join('\n'):'export const useEmployee=()=>({currentEmployee:null});'}));
}}]});
const {Debt,PreferencesProvider}=await import(folder+'/ui.mjs');
const date=new Date(2026,9,15,12).getTime();
const rows=[
 {id:'z',name:'Zé ORIGINAL',totalDebt:80,previousDebt:0,lastMovementAt:date},
 {id:'a',name:'Álvaro',totalDebt:10,previousDebt:0},
 {id:'b',name:'Bia',totalDebt:0,previousDebt:20,lastMovementAt:date},
 {id:'c',name:'Crédito',totalDebt:-5,previousDebt:0,lastMovementAt:0},
].map(row=>({...row,createdAt:date-86400000,updatedAt:date+86400000,ownerId:'shop'}));
function setup(){
 globalThis.__debtBank={
  subscribeCustomers(callback){callback(rows);return()=>{};},
  async getCustomerLastMovements(){return {a:date};},
  subscribeCustomerSales(_id,callback){callback([]);return()=>{};},
  subscribeCustomerPayments(_id,callback){callback([]);return()=>{};},
  async recordPayment(){},async addCustomer(){},async deleteCustomer(){}
 };
 function Destination(){return React.createElement('output',null,useLocation().search);}
 return render(React.createElement(PreferencesProvider,null,React.createElement(MemoryRouter,{initialEntries:['/fiado']},React.createElement(Routes,null,React.createElement(Route,{path:'/fiado',element:React.createElement(Debt)}),React.createElement(Route,{path:'/caixa',element:React.createElement(Destination)})))));
}
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__debtBank;mobile=true;});
after(async()=>{await rm(folder,{recursive:true,force:true});dom.window.close();for(const[name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
test('summary counts only debtors; ordering ignores accents and biggest debt is optional',()=>{
 assert.deepEqual(debtOverview(rows),{count:2,total:90});
 assert.deepEqual(orderDebtCustomers(rows,'name').map(c=>c.id),['a','b','c','z']);
 assert.deepEqual(orderDebtCustomers(rows,'debt').map(c=>c.id),['z','a','b','c']);
 assert.equal(customerLastMovement(rows[1],{a:date}),date);
 assert.notEqual(customerLastMovement(rows[1],{a:date}),rows[1].updatedAt);
});
test('mobile replaces table with full-width cards, correct totals, real activity dates and debt sorting',async()=>{
 let ui;await act(async()=>{ui=setup();});
 assert.equal(ui.queryByRole('table'),null);
 assert.match(ui.container.textContent,/Falta receber R\$\s*90,00 \(2 devendo\)/);
 const cards=()=>[...ui.container.querySelectorAll('article')];
 assert.deepEqual(cards().map(card=>card.querySelector('[translate="no"]').textContent),['Álvaro','Bia','Crédito','Zé ORIGINAL']);
 assert.match(cards()[0].textContent,/Último movimento: 15\/10\/2026/);
 assert.match(cards()[1].textContent,/Quitado/);
 assert.equal(within(cards()[1]).getByRole('button',{name:'Receber'}).disabled,true);
 fireEvent.change(ui.getByRole('combobox',{name:'Ordenar por'}),{target:{value:'debt'}});
 assert.equal(cards()[0].querySelector('[translate="no"]').textContent,'Zé ORIGINAL');
 fireEvent.click(within(cards()[0]).getByRole('button',{name:/Ver histórico/}));
 assert.ok(ui.getByText('Ficha do Cliente'));
});
test('record purchase opens checkout with the selected customer; receive opens the existing payment form',async()=>{
 let ui;await act(async()=>{ui=setup();});
 const card=ui.container.querySelector('article');
 fireEvent.click(within(card).getByRole('button',{name:'Receber'}));
 assert.ok(ui.getByRole('button',{name:/Confirmar/}));
 cleanup();await act(async()=>{ui=setup();});
 fireEvent.click(within(ui.container.querySelector('article')).getByRole('link',{name:'Anotar compra'}));
 assert.equal(ui.container.querySelector('output').textContent,'?fiado_cliente=a');
});
test('desktop retains its customer table',async()=>{
 mobile=false;let ui;await act(async()=>{ui=setup();});
 assert.ok(ui.getByRole('table'));assert.equal(ui.container.querySelectorAll('article').length,0);
});
