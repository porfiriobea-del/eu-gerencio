import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'}),previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage','MutationObserver']){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const folder=await mkdtemp(new URL('../.replenish-ui-',import.meta.url).pathname);
const names=['subscribeProducts','subscribePurchases','recordPurchase','deletePurchase','getReplenishmentSales','mergeProducts'];
await build({stdin:{contents:"export {default as Purchases} from './src/pages/Purchases';export {PreferencesProvider} from './src/lib/preferencesContext';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:folder+'/ui.mjs',plugins:[{name:'bank',setup(b){b.onResolve({filter:/\/lib\/api$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({loader:'js',contents:names.map(n=>`export const ${n}=(...args)=>globalThis.__replenish.${n}(...args);`).join('\n')}));}}]});
const {Purchases,PreferencesProvider}=await import(folder+'/ui.mjs');
const product={id:'p',name:'Água Mineral ORIGINAL',type:'comum',purchaseForm:'fardo',unitsPerPackage:6,stock:3,safetyStock:4,maxStock:10,unitCost:2,dailyAverageSales:9999,category:'Bebidas'};
function bank({fail=false,duplicates=false}={}){globalThis.__replenish={subscribeProducts(cb){cb(duplicates?[product,{...product,id:'b',name:'aguaMineral ORIGINAL'}]:[product]);return()=>{};},subscribePurchases(cb){cb([{productId:'p',supplier:'Fornecedor ORIGINAL',date:'2026-10-20',createdAt:1,totalCost:12,quantity:6}]);return()=>{};},async getReplenishmentSales(){if(fail)throw Error('unavailable');return [];},async recordPurchase(){},async deletePurchase(){},async mergeProducts(...args){globalThis.__merged=args;}};}
async function view(){let ui;await act(async()=>{ui=render(React.createElement(PreferencesProvider,null,React.createElement(Purchases)));});return ui;}
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__merged;});
after(async()=>{await rm(folder,{recursive:true,force:true});dom.window.close();for(const [n,d]of previous){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}});
test('groups by supplier, shows no-history and package-rounded cost in all three modes',async()=>{
 for(const mode of ['basic','neutral','technical']){localStorage.setItem('app_lang_mode',mode);bank();const ui=await view();
 assert.ok(ui.getByRole('heading',{name:'Fornecedor ORIGINAL'}));assert.ok(ui.getByText('Ainda sem histórico de vendas'));assert.match(ui.container.textContent,/24,00/);
 assert.ok(ui.getByText(mode==='basic'?/Está acabando: compre 12/:mode==='technical'?/Ressuprimento sugerido: 12/:/Compra sugerida: 12/));
 fireEvent.click(ui.getByRole('button',{name:mode==='basic'?'Anotar compra':'Registrar compra'}));
 const supplierInput=ui.container.querySelector('input[list="used-suppliers"]');assert.ok(supplierInput);assert.equal(supplierInput.value,'Fornecedor ORIGINAL');
 assert.equal(ui.container.querySelector('datalist option').value,'Fornecedor ORIGINAL');
 let saved;globalThis.__replenish.recordPurchase=async(...args)=>{saved=args;};
 fireEvent.change(supplierInput,{target:{value:'Novo fornecedor'}});
 await act(async()=>fireEvent.submit(supplierInput.closest('form')));
 assert.equal(saved[0].supplier,'Novo fornecedor');assert.equal(saved[0].quantity,12);assert.equal(saved[0].totalCost,24);
 assert.equal(ui.container.querySelector('input[list="used-suppliers"]'),null);cleanup();
 }
});
test('failed history fetch does not fabricate a zero-sales replenishment list',async()=>{bank({fail:true});const ui=await view();assert.match(ui.getByRole('alert').textContent,/Não foi possível consultar as vendas/);assert.equal(ui.queryByText('Ainda sem histórico de vendas'),null);assert.equal(ui.queryByRole('article'),null);});
test('suspected duplicates require explicit confirmation before merging',async()=>{bank({duplicates:true});const ui=await view();fireEvent.click(ui.getByRole('button',{name:'Juntar produtos'}));assert.equal(globalThis.__merged,undefined);assert.ok(ui.getByRole('dialog'));await act(async()=>fireEvent.click(ui.getAllByRole('button',{name:'Juntar produtos'}).at(-1)));assert.deepEqual(globalThis.__merged,['p','b',true]);assert.equal(ui.queryByRole('dialog'),null);});
