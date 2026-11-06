import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Node','Event','CustomEvent','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=(await import('react')).default;
const {MemoryRouter}=await import('react-router-dom');
const {render,act,fireEvent,cleanup}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../node_modules/stock-edit-regression-',import.meta.url));
const mocks={
 api:`export const subscribeProducts=cb=>{globalThis.__stockRefresh=cb;cb([globalThis.__stockProduct]);return()=>{};};export const subscribeTodaySales=cb=>{cb([]);return()=>{};};export const updateProduct=async(id,data)=>{globalThis.__stockSaved={id,data};};export const getProductDuplicates=async()=>[];export const adjustProductStock=async()=>{};export const addProduct=async()=>{};export const addMultipleProducts=async()=>{};export const deleteProduct=async()=>{};export const deleteMultipleProducts=async()=>{};export const recordMovement=async()=>{};export const mergeProducts=async()=>{};export const getEffectiveOwnerId=()=> 'owner';`,
 preferencesContext:`export const usePreferences=()=>({languageMode:globalThis.__stockMode||'neutral',isBasicMode:false,simpleViewMode:false,v:(key,fallback)=>fallback||key,entityName:plural=>plural?'Produtos':'Produto'});`,
 permissionsContext:`export const usePermissions=()=>({isOwner:true});`,
 categories:`export const getAllCategories=()=>['Cigarros','Diversos','Bebidas'];export const saveCustomCategory=()=>{};`,
 cloudStore:`export const deleteField=()=>({deleted:true});`,
 usageReporting:`export const reportUsage=()=>{};`,
 actionFeedback:`export class ConfirmationTimeoutError extends Error{};export const showToast=()=>{};export const showActionError=e=>{throw e;};`,
 geminiProductScanner:`export const recognizeProductFromImage=async()=>({});export const prepareProductImage=async()=>'';`,
 MobileStockList:`import React from 'react';export const MobileStockList=({products,onEdit})=>React.createElement('button',{onClick:()=>onEdit(products[0])},'Editar teste');`
};
for(const name of ['CostPriceReview','ProductCosts','ReplenishmentDuplicates','ProductImage','CigarettePurchaseOptions','StockLevelSuggestion','ProductDuplicateDialog','PocketTip','CatalogImportModal','CameraCaptureModal']){
 const file=name==='ProductCosts'?'CostPriceReview':name;
 mocks[file]=(mocks[file]||'')+`export const ${name}=()=>null;`;
}
await build({stdin:{contents:"export {default as Stock} from './src/pages/Stock';",resolveDir:process.cwd()},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:`${dir}/stock.mjs`,plugins:[{name:'mock',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',external:true}));b.onResolve({filter:/.*/},a=>{const name=a.path.split('/').at(-1);return mocks[name]?{path:name,namespace:'mock'}:undefined;});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
const {Stock}=await import(pathToFileURL(`${dir}/stock.mjs`));
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__stockProduct;delete globalThis.__stockSaved;delete globalThis.__stockMode;delete globalThis.__stockRefresh;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();});
async function setup(type,overrides={}){
 globalThis.__stockProduct={id:'p1',name:'Produto ORIGINAL',type,stockUnit:type==='cigarro'?'carteira':'unidade',category:type==='cigarro'?'Cigarros':'Diversos',stock:type==='cigarro'?33.1:4,initialStock:4,safetyStock:0,maxStock:50,unitCost:1,basePrice:2,priceCart:5,purchaseForm:type==='cigarro'?'pacote':'unidade',unitsPerPackage:type==='cigarro'?10:1,supplierPackageUnits:10,createdAt:1,dailyAverageSales:0,replacementDays:3,...overrides};
 let ui;await act(async()=>{ui=render(React.createElement(MemoryRouter,null,React.createElement(Stock)));});
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Editar teste'})));return ui;
}
for(const mode of ['basic','neutral','technical'])test(`stock edit retains the entered limits and saves exact cigarette fractions (${mode})`,async()=>{
 globalThis.__stockMode=mode;const ui=await setup('cigarro');
 const max=ui.getByPlaceholderText('Ex: 50');fireEvent.change(max,{target:{value:'100'}});assert.equal(max.value,'100');
 const reserve=ui.getByText('Reserva de segurança (além das vendas até a entrega)').parentElement.querySelector('input');
 fireEvent.change(reserve,{target:{value:'5'}});assert.equal(reserve.value,'5');
 const group=ui.getByText('Estoque Atual Físico em Prateleira/Depósito:').parentElement.parentElement;
 const [packages,loose]=group.querySelectorAll('input');
 fireEvent.change(packages,{target:{value:'2'}});fireEvent.change(loose,{target:{value:'3.05'}});
 assert.equal(loose.value,'3.05');assert.ok(ui.getByText('Total Atual Físico: 23 carteiras e 1 cigarro'));
 const form=max.closest('form');assert.equal(form.checkValidity(),true);
 await act(async()=>fireEvent.submit(form));
 assert.equal(globalThis.__stockSaved.id,'p1');assert.equal(globalThis.__stockSaved.data.stock,23.05);assert.equal(globalThis.__stockSaved.data.maxStock,100);assert.equal(globalThis.__stockSaved.data.safetyStock,5);
});
test('ordinary-product stock can be edited, cleared and entered again without disappearing',async()=>{
 const ui=await setup('comum');
 const input=ui.getByText('Estoque Atual Físico (Unidades) *').parentElement.querySelector('input');
 fireEvent.change(input,{target:{value:'12'}});assert.equal(input.value,'12');
 fireEvent.change(input,{target:{value:''}});assert.equal(input.value,'');
 fireEvent.change(input,{target:{value:'8'}});assert.equal(input.value,'8');
 await act(async()=>fireEvent.submit(input.closest('form')));assert.equal(globalThis.__stockSaved.data.stock,8);
});

for(const mode of ['basic','neutral','technical'])test(`Heineken Long saves 24 units and a 150 supplier package cost and reopens independently of FIFO (${mode})`,async()=>{
 globalThis.__stockMode=mode;const ui=await setup('comum',{name:'Heineken Long',category:'Bebidas',purchaseForm:'fardo',unitsPerPackage:6,unitCost:4.5,lastCost:5.5});
 const qty=ui.getByText(/^Quantas unidades vêm no fardo/).parentElement.querySelector('input');
 const cost=ui.getByPlaceholderText('Ex: 38.00');
 fireEvent.change(qty,{target:{value:''}});assert.equal(qty.value,'');
 fireEvent.change(qty,{target:{value:'24'}});fireEvent.change(cost,{target:{value:'150'}});
 assert.equal(qty.value,'24');assert.equal(cost.value,'150');assert.equal(cost.closest('form').checkValidity(),true);
 await act(async()=>fireEvent.submit(cost.closest('form')));
 const payload=globalThis.__stockSaved.data;assert.equal(payload.unitsPerPackage,24);assert.equal(payload.supplierPackageCost,150);assert.equal(payload.unitCost,6.25);assert.equal(payload.stock,undefined);assert.equal(payload.basePrice,undefined);
 // Simulate the server keeping the old FIFO cost, as it must for known existing lots.
 const updated={...globalThis.__stockProduct};for(const [key,value] of Object.entries(payload)){if(value&&typeof value==='object'&&value.deleted)delete updated[key];else updated[key]=value;}updated.unitCost=4.5;
 await act(async()=>globalThis.__stockRefresh([updated]));await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Editar teste'})));
 assert.equal(ui.getByPlaceholderText('Ex: 38.00').value,'150');assert.equal(ui.getByText(/^Quantas unidades vêm no fardo/).parentElement.querySelector('input').value,'24');
});
