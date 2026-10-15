import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
const previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','MutationObserver','localStorage']){
 previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {AppToast}=await import('../src/components/AppToast.tsx');
let desktop=false;const mediaListeners=new Set();
window.matchMedia=()=>({get matches(){return desktop;},addEventListener(_event,fn){mediaListeners.add(fn);},removeEventListener(_event,fn){mediaListeners.delete(fn);}});
const cache=new URL('../node_modules/.cache/',import.meta.url);await mkdir(cache,{recursive:true});const dir=await mkdtemp(new URL('pos-cart-',cache));
const names=['subscribeProducts','subscribeCustomers','addCustomer','recordSale','subscribeTodaySales','saveCashClosure','subscribeCashClosures','subscribeSettings'];
await build({entryPoints:[new URL('../src/pages/POS.tsx',import.meta.url).pathname],bundle:true,packages:'external',format:'esm',platform:'node',jsx:'automatic',outfile:`${dir}/POS.mjs`,plugins:[{name:'mock-business',setup(b){
 b.onResolve({filter:/\/(api|preferencesContext|employeeContext|categories|PocketTip)$/},args=>({path:args.path.split('/').at(-1),namespace:'pos-test'}));
 b.onLoad({filter:/.*/,namespace:'pos-test'},args=>({loader:'js',contents:args.path==='api'?names.map(name=>`export const ${name}=(...args)=>globalThis.__posApi.${name}(...args);`).join('\n'):args.path==='preferencesContext'?"export const usePreferences=()=>({v:(k,f)=>f||k,entityName:()=> 'Produto',languageMode:'neutral',isBasicMode:false,simpleViewMode:false});":args.path==='employeeContext'?"export const useEmployee=()=>({currentEmployee:null,openSwitchModal(){}});":args.path==='categories'?"export const getAllCategories=()=>['Bebidas','Cigarros'];":"export const PocketTip=()=>null;"}));
}}]});
const {default:POS}=await import(pathToFileURL(`${dir}/POS.mjs`).href);
const standard={id:'p1',name:'Suco',category:'Bebidas',type:'comum',stock:10,basePrice:5,unitCost:1,unitsPerPackage:1,safetyStock:0,dailyAverageSales:0,replacementDays:3};
const cigarettes={...standard,id:'p2',name:'Cigarro',category:'Cigarros',type:'cigarro',stockUnit:'carteira',stock:20,unitsPerPackage:10,unitCost:10,basePrice:20,pricePack:180,priceCart:20,priceHalfCart:11,priceUnit:2};
function setup(onSale=async()=>{},isDesktop=false){
 desktop=isDesktop;
 globalThis.__posApi={subscribeProducts(cb){cb([standard,cigarettes]);return()=>{};},subscribeCustomers(cb){cb([]);return()=>{};},subscribeTodaySales(cb){cb([]);return()=>{};},subscribeCashClosures(cb){cb([]);return()=>{};},subscribeSettings(cb){cb({enableCardFees:false});return()=>{};},recordSale:onSale};
 return render(React.createElement(React.Fragment,null,React.createElement(POS),React.createElement(AppToast)));
}
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__posApi;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();for(const [name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const addStandard=ui=>fireEvent.click(ui.getByRole('button',{name:/Vender.*5\.00/}));
const openCart=ui=>fireEvent.click(ui.getByRole('button',{name:/Abrir carrinho/}));

test('mobile cart stays in a small floating icon and badge updates after rapid additions',async()=>{
 const ui=setup();assert.equal(ui.queryByRole('complementary'),null);assert.equal(ui.queryByRole('dialog'),null);
 addStandard(ui);addStandard(ui);
 assert.ok(ui.getByRole('button',{name:'Abrir carrinho, 2 itens'}));openCart(ui);
 assert.ok(ui.getByRole('dialog',{name:/Carrinho/}));assert.equal(ui.getAllByText(/R\$ 10,00/).length,2);
 fireEvent.click(ui.getByRole('button',{name:'Diminuir Suco, Padrão'}));
 assert.ok(ui.getByRole('button',{name:'Abrir carrinho, 1 item'}));
 fireEvent.keyDown(document,{key:'Escape'});assert.equal(ui.queryByRole('dialog'),null);assert.equal(document.body.style.overflow,'');
});

test('desktop cart can be pinned, unpinned and restored from localStorage',()=>{
 const ui=setup(undefined,true);assert.ok(ui.getByRole('complementary'));
 fireEvent.click(ui.getByRole('button',{name:'Desfixar carrinho'}));assert.equal(localStorage.getItem('eu_gerencio_pos_cart_pinned'),'false');assert.equal(ui.queryByRole('complementary'),null);
 ui.unmount();const reopened=setup(undefined,true);assert.equal(reopened.queryByRole('complementary'),null);openCart(reopened);
 fireEvent.click(reopened.getByRole('button',{name:'Fixar carrinho'}));assert.equal(localStorage.getItem('eu_gerencio_pos_cart_pinned'),'true');assert.ok(reopened.getByRole('complementary'));
});

test('resizing to mobile preserves the desktop pin preference and collapses the cart',async()=>{
 const ui=setup(undefined,true);
 await act(async()=>{desktop=false;for(const fn of mediaListeners)fn();});
 assert.equal(ui.queryByRole('complementary'),null);assert.ok(ui.getByRole('button',{name:'Abrir carrinho, 0 itens'}));assert.equal(localStorage.getItem('eu_gerencio_pos_cart_pinned'),'true');
});

test('PIX checkout preserves fractional deductions, waits for confirmation and clears only on success',async()=>{
 let finish,recorded;const ui=setup((...args)=>{recorded=args;return new Promise(resolve=>{finish=resolve;});});
 fireEvent.click(ui.getByRole('button',{name:/Carteira \(1 carteira fechada\)/}));
 fireEvent.click(ui.getByRole('button',{name:/Unidade Avulsa \(1 cigarro\)/}));
 openCart(ui);assert.ok(ui.getByText(/Baixa: 0.05 carteiras/));
 fireEvent.click(ui.getByRole('button',{name:'Finalizar Compra / Receber'}));assert.equal(ui.queryByRole('dialog',{name:/Carrinho/}),null);
 fireEvent.click(ui.getByRole('button',{name:'PIX'}));
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirmar'}));});
 assert.equal(recorded[0].paymentMethod,'pix');assert.equal(recorded[0].total,22);
 assert.deepEqual(recorded[1].map(item=>item.stockDeduction),[1,0.05]);assert.equal(recorded[2][0].newStock,18.95);
 assert.ok(ui.getByRole('button',{name:'Abrir carrinho, 2 itens'}));assert.equal(ui.getByRole('button',{name:'Cancelar'}).disabled,true);
 await act(async()=>{finish();});
 assert.ok(ui.getByRole('button',{name:'Abrir carrinho, 0 itens'}));assert.ok(ui.getByText('✓ Venda concluída com sucesso!'));
});

test('failed checkout keeps the cart available and releases payment loading',async()=>{
 const ui=setup(async()=>{throw new Error('Cloud unavailable');});addStandard(ui);openCart(ui);
 fireEvent.click(ui.getByRole('button',{name:'Finalizar Compra / Receber'}));
 await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirmar'}));});
 assert.ok(ui.getByRole('button',{name:'Abrir carrinho, 1 item'}));assert.equal(ui.queryByRole('dialog',{name:'Finalizar venda'}),null);
 openCart(ui);assert.equal(ui.getByRole('button',{name:'Finalizar Compra / Receber'}).disabled,false);
});
