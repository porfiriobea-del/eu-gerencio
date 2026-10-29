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
 api:`export const subscribeProducts=cb=>{cb([globalThis.__stockProduct]);return()=>{};};export const subscribeTodaySales=cb=>{cb([]);return()=>{};};export const updateProduct=async(id,data)=>{globalThis.__stockSaved={id,data};};export const getProductDuplicates=async()=>[];export const adjustProductStock=async()=>{};export const addProduct=async()=>{};export const addMultipleProducts=async()=>{};export const deleteProduct=async()=>{};export const deleteMultipleProducts=async()=>{};export const recordMovement=async()=>{};export const mergeProducts=async()=>{};export const getEffectiveOwnerId=()=> 'owner';`,
 preferencesContext:`export const usePreferences=()=>({languageMode:globalThis.__stockMode||'neutral',isBasicMode:false,simpleViewMode:false,v:(key,fallback)=>fallback||key,entityName:plural=>plural?'Produtos':'Produto'});`,
 permissionsContext:`export const usePermissions=()=>({isOwner:true});`,
 categories:`export const getAllCategories=()=>['Cigarros','Diversos'];export const saveCustomCategory=()=>{};`,
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
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__stockProduct;delete globalThis.__stockSaved;delete globalThis.__stockMode;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();});
async function setup(type){
 globalThis.__stockProduct={id:'p1',name:'Produto ORIGINAL',type,stockUnit:type==='cigarro'?'carteira':'unidade',category:type==='cigarro'?'Cigarros':'Diversos',stock:type==='cigarro'?33.1:4,initialStock:4,safetyStock:0,maxStock:50,unitCost:1,basePrice:2,priceCart:5,purchaseForm:type==='cigarro'?'pacote':'unidade',unitsPerPackage:type==='cigarro'?10:1,supplierPackageUnits:10,createdAt:1,dailyAverageSales:0,replacementDays:3};
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
