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
const {MemoryRouter}=await import('react-router-dom');
const {render,fireEvent,act,cleanup,within}=await import('@testing-library/react');
const {AppToast}=await import('../src/components/AppToast.tsx');
let desktop=false;const mediaListeners=new Set();
window.matchMedia=()=>({get matches(){return desktop;},addEventListener(_event,fn){mediaListeners.add(fn);},removeEventListener(_event,fn){mediaListeners.delete(fn);}});
const cache=new URL('../node_modules/.cache/',import.meta.url);await mkdir(cache,{recursive:true});const dir=await mkdtemp(new URL('pos-cart-',cache));
const names=['getProductSalesTotals','subscribeProducts','subscribeCustomers','addCustomer','recordSale','subscribeTodaySales','saveCashClosure','subscribeCashClosures','subscribeSettings'];
await build({stdin:{contents:"export {default} from './src/pages/POS'; export {CurrencyContext} from './src/lib/useCurrency';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',format:'esm',platform:'node',jsx:'automatic',outfile:`${dir}/POS.mjs`,plugins:[{name:'mock-business',setup(b){
 b.onResolve({filter:/\/(api|preferencesContext|employeeContext|categories|PocketTip)$/},args=>({path:args.path.split('/').at(-1),namespace:'pos-test'}));
 b.onLoad({filter:/.*/,namespace:'pos-test'},args=>({loader:'js',contents:args.path==='api'?names.map(name=>`export const ${name}=(...args)=>globalThis.__posApi.${name}(...args);`).join('\n'):args.path==='preferencesContext'?"export const usePreferences=()=>({v:(k,f)=>f||k,entityName:()=> 'Produto',languageMode:'neutral',isBasicMode:false,simpleViewMode:false});":args.path==='employeeContext'?"export const useEmployee=()=>({currentEmployee:null,openSwitchModal(){}});":args.path==='categories'?"export const getAllCategories=()=>['Bebidas','Cigarros'];":"export const PocketTip=()=>null;"}));
}}]});
const {default:POS,CurrencyContext}=await import(pathToFileURL(`${dir}/POS.mjs`).href);
const standard={id:'p1',name:'Suco',category:'Bebidas',type:'comum',stock:10,basePrice:5,unitCost:1,unitsPerPackage:1,safetyStock:0,dailyAverageSales:0,replacementDays:3};
const cigarettes={...standard,id:'p2',name:'Cigarro',category:'Cigarros',type:'cigarro',stockUnit:'carteira',stock:20,unitsPerPackage:10,unitCost:10,basePrice:20,pricePack:180,priceCart:20,priceHalfCart:11,priceUnit:2};
function setup(onSale=async()=>{},isDesktop=false,feeSettings={},initialCustomers=[],initialEntries=['/caixa']){
 desktop=isDesktop;
 globalThis.__posApi={getProductSalesTotals:async()=>globalThis.__posRanking||{},subscribeProducts(cb){cb([standard,cigarettes]);return()=>{};},subscribeCustomers(cb){cb(initialCustomers);return()=>{};},subscribeTodaySales(cb){cb([]);return()=>{};},subscribeCashClosures(cb){cb([]);return()=>{};},subscribeSettings(cb){cb({enableCardFees:false,...feeSettings});return()=>{};},recordSale:onSale};
 return render(React.createElement(CurrencyContext.Provider,{value:{currency:feeSettings.currency||'BRL',language:feeSettings.language||'pt'}},React.createElement(React.Fragment,null,React.createElement(MemoryRouter,{initialEntries},React.createElement(POS)),React.createElement(AppToast))));
}
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__posApi;delete globalThis.__posRanking;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();for(const [name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const addStandard=ui=>fireEvent.click(ui.getByRole('button',{name:/Vender.*5[.,]00/}));
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
 openCart(ui);assert.ok(ui.getByText(/Baixa: 1 cigarro/));
 fireEvent.click(ui.getByRole('button',{name:'Finalizar Compra / Receber'}));assert.equal(ui.queryByRole('dialog',{name:/Carrinho/}),null);
 fireEvent.click(ui.getByRole('button',{name:'Pix (direto na conta)'}));
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

test('POS shows the best seller first and preserves ranking while searching',async()=>{
 globalThis.__posRanking={p1:2,p2:25};
 let ui;
 await act(async()=>{ui=setup();});
 const names=()=>Array.from(ui.container.querySelectorAll('h3')).map(node=>node.textContent).filter(name=>['Suco','Cigarro'].includes(name));
 assert.deepEqual(names(),['Cigarro','Suco']);
 fireEvent.change(ui.getByPlaceholderText(/Buscar.*nome/),{target:{value:'Suco'}});
 assert.deepEqual(names(),['Suco']);
 fireEvent.change(ui.getByPlaceholderText(/Buscar.*nome/),{target:{value:''}});
 assert.deepEqual(names(),['Cigarro','Suco']);
});


for(const [method,total] of [['Pix (direto na conta)',5],['Pix na maquininha',5],['Crédito',5.5],['Débito',5.5],['Voucher',5.5]]){
 test(`checkout applies customer surcharges only to cards: ${method}`,async()=>{
  let saved;
  const ui=setup(async sale=>{saved=sale;},false,{enableCardFees:true,pixRate:10,creditCardRate:10,debitCardRate:10,voucherRate:10,cardFeeCalculationMode:'surcharge',passCardFeeToCustomer:true});
  addStandard(ui);openCart(ui);fireEvent.click(ui.getByRole('button',{name:'Finalizar Compra / Receber'}));
  if(method.startsWith('Pix'))fireEvent.click(ui.getByRole('button',{name:method}));
  else{fireEvent.click(ui.getByRole('button',{name:/Cartão$/}));fireEvent.click(ui.getByRole('button',{name:method==='Voucher'?'Vale':method}));}
  await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirmar'}));});
  assert.equal(saved.total,total);
  assert.equal(saved.paymentMethod,method==='Pix na maquininha'?'pix_machine':method.startsWith('Pix')?'pix':method==='Crédito'?'credit':method==='Débito'?'debit':'voucher');
 });
}

test('product names retain the stored text and explicitly opt out of browser translation in POS and cart',()=>{
 const original=standard.name;
 try{
  standard.name='Orange Light — Café São João';
  const ui=setup();
  const heading=ui.getByRole('heading',{name:standard.name});
  assert.equal(heading.textContent,standard.name);assert.equal(heading.getAttribute('translate'),'no');assert.ok(heading.classList.contains('notranslate'));
  addStandard(ui);openCart(ui);
  const name=ui.getAllByText(standard.name).find(node=>node!==heading);
  assert.equal(name.textContent,standard.name);assert.equal(name.getAttribute('translate'),'no');assert.ok(name.classList.contains('notranslate'));
 }finally{standard.name=original;}
});


for(const [currency,language] of [['USD','en'],['EUR','es']]){
 test(`foreign currency checkout formats ${currency} and hides Pix without changing the price`,async()=>{
  let sale;
  const ui=setup(async value=>{sale=value;},false,{currency,language});
  addStandard(ui);openCart(ui);fireEvent.click(ui.getByRole('button',{name:'Finalizar Compra / Receber'}));
  assert.equal(ui.queryByRole('button',{name:'Pix (direto na conta)'}),null);
  assert.equal(ui.queryByRole('button',{name:'Pix na maquininha'}),null);
  assert.equal(ui.queryAllByText(/Pix/).filter(node=>!node.closest('[hidden]')).length,0);
  fireEvent.click(ui.getByRole('button',{name:/Cartão$/}));
  await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirmar'}));});
  assert.equal(sale.total,5);assert.equal(sale.paymentMethod,'debit');
 });
}


test('Anotar compra keeps the chosen customer and fiado payment through cart checkout',async()=>{
 const sales=[];
 const customer={id:'customer-1',name:'Cliente ORIGINAL',ownerId:'owner',previousDebt:0,totalDebt:10,createdAt:Date.now(),updatedAt:Date.now()};
 let ui;await act(async()=>{ui=setup(async(...args)=>sales.push(args),false,{},[customer],['/caixa?fiado_cliente=customer-1']);});
 assert.ok(ui.getByText('Cliente ORIGINAL'));
 addStandard(ui);openCart(ui);
 fireEvent.click(ui.getByRole('button',{name:'Finalizar Compra / Receber'}));
 const select=within(ui.getByRole('dialog',{name:'Finalizar venda'})).getByRole('combobox');
 assert.equal(select.value,'customer-1');
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Confirmar'})));
 assert.equal(sales.length,1);assert.equal(sales[0][0].type,'fiado');assert.equal(sales[0][0].customerId,'customer-1');
});


test('checkout category list contains only product categories, closes on selection and clears through its tag',async()=>{
 let ui;await act(async()=>{ui=setup();});
 fireEvent.click(ui.getByRole('button',{name:'Categoria'}));
 assert.deepEqual(ui.getAllByRole('option').map(option=>option.textContent),['Todas as categorias2','Bebidas1','Cigarros1']);
 fireEvent.click(ui.getByRole('option',{name:/Cigarros.*1/}));
 assert.equal(ui.queryByRole('listbox'),null);
 const names=()=>[...ui.container.querySelectorAll('h3')].map(node=>node.textContent).filter(name=>['Suco','Cigarro'].includes(name));
 assert.deepEqual(names(),['Cigarro']);
 fireEvent.click(ui.getByRole('button',{name:'Limpar categoria Cigarros'}));
 assert.equal(names().length,2);
});
