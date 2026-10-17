import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'});
const previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage']){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let width=390;const listeners=new Set();
window.matchMedia=query=>({get matches(){return query.includes('max-width')?width<=767:width>=Number(query.match(/\d+/)?.[0]||1024);},addEventListener(_type,fn){listeners.add(fn);},removeEventListener(_type,fn){listeners.delete(fn);}});
Object.defineProperty(window,'innerHeight',{value:800,configurable:true});
const viewport=new dom.window.EventTarget();viewport.height=800;viewport.scale=1;
Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
const React=await import('react');
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {MemoryRouter}=await import('react-router-dom');
const {PreferencesProvider}=await import('../src/lib/preferencesContext.tsx');
const {MobileNavigation}=await import('../src/components/MobileNavigation.tsx');
const {MobileStockList}=await import('../src/components/MobileStockList.tsx');
const {CategoryChips}=await import('../src/components/CategoryChips.tsx');
const {QuickProducts,useProductShortcuts}=await import('../src/components/QuickProducts.tsx');
const {PocketTip}=await import('../src/components/PocketTip.tsx');
const {QuickProductDialog}=await import('../src/components/QuickProductDialog.tsx');
const {categoryAppearance}=await import('../src/lib/categoryAppearance.ts');
function wrap(component){return React.createElement(PreferencesProvider,null,component);}
afterEach(()=>{cleanup();localStorage.clear();viewport.height=800;width=390;});
after(()=>{dom.window.close();for(const [name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

test('bottom navigation has a central larger checkout, More links, and disappears for the on-screen keyboard',async()=>{
 const ui=render(wrap(React.createElement(MemoryRouter,null,React.createElement(React.Fragment,null,React.createElement(MobileNavigation),React.createElement('input',{'aria-label':'Search'})))));
 const nav=ui.getByRole('navigation',{name:'Navegação rápida'});
 assert.deepEqual([...nav.querySelectorAll(':scope > a')].map(a=>a.textContent),['Início','Estoque','Caixa','Fiado']);
 assert.ok(nav.querySelector('a[href="/caixa"] span').className.includes('h-12'));
 fireEvent.click(ui.getByText('Mais'));
 assert.ok(nav.querySelector('a[href="/precos"]'));assert.ok(nav.querySelector('a[href="/ajustes"]'));assert.ok(nav.querySelector('a[href="/tutorial"]'));
 await act(async()=>{ui.getByRole('textbox',{name:'Search'}).focus();viewport.height=430;viewport.dispatchEvent(new Event('resize'));});
 assert.equal(ui.queryByRole('navigation',{name:'Navegação rápida'}),null);
 await act(async()=>{viewport.height=800;viewport.dispatchEvent(new Event('resize'));});
 assert.ok(ui.getByRole('navigation',{name:'Navegação rápida'}));
 await act(async()=>{width=1200;listeners.forEach(fn=>fn());});
 assert.equal(ui.queryByRole('navigation',{name:'Navegação rápida'}),null);
});
const product={id:'p1',name:'Nome ORIGINAL',type:'comum',stock:5,category:'Bebidas',safetyStock:1,maxStock:10,dailyAverageSales:0,replacementDays:1,basePrice:5,unitCost:2,imageUrl:'https://image.test/p.webp'};
test('mobile stock stays one line, exposes quantity controls only in details, and keeps creation and batch actions in menus',async()=>{
 let added=0,edited=0,photo=0;
 const ui=render(wrap(React.createElement(MobileStockList,{products:[product],selected:[],onSelect(){},onSelectAll(){},onDelete(){},onEdit(){edited++;},async onAdjust(_p,amount){added+=amount;},onPhoto(){photo++;},onCatalog(){},onNew(){}})));
 assert.equal(ui.queryByRole('button',{name:'Somar 1 ao estoque'}),null);
 assert.ok(ui.getByRole('img',{name:'Estoque Normal'}));
 const row=ui.getByRole('button',{name:/Nome ORIGINAL/});fireEvent.click(row);
 assert.equal(row.getAttribute('aria-expanded'),'true');
 const images=ui.container.querySelectorAll('img');assert.ok(images[0].className.includes('h-14'));assert.ok(images[1].className.includes('h-40'));
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Somar 1 ao estoque'})));assert.equal(added,1);
 fireEvent.click(ui.getByRole('button',{name:/Editar produto/i}));assert.equal(edited,1);
 fireEvent.click(ui.getByRole('button',{name:'Adicionar produto'}));
 fireEvent.click(ui.getByRole('button',{name:/Cadastrar por Foto/i}));assert.equal(photo,1);
});
test('category identity is deterministic, chips scroll and selecting one preserves its actual name',()=>{
 assert.deepEqual(categoryAppearance('BÉBIDAS'),categoryAppearance('bebidas'));
 let selected;
 const ui=render(wrap(React.createElement(CategoryChips,{categories:['Todas','Bebidas','Cigarros'],value:'Todas',onChange:value=>{selected=value;}})));
 const chip=ui.getByRole('button',{name:'Cigarros'}),className=chip.className;
 fireEvent.click(chip);assert.equal(selected,'Cigarros');assert.ok(chip.querySelector('svg'));
 ui.rerender(wrap(React.createElement(CategoryChips,{categories:['Cigarros','Bebidas','Todas'],value:'Todas',onChange(){}})));
 assert.equal(ui.getByRole('button',{name:'Cigarros'}).className,className);
 assert.ok(ui.getByRole('group').className.includes('overflow-x-auto'));
});
test('shortcuts show six best sellers and favorites persist per shop without leaking into another shop',async()=>{
 const products=Array.from({length:8},(_,i)=>({...product,id:'p'+i,name:'Produto '+i}));
 let chosen;
 function Harness({scope}){const shortcuts=useProductShortcuts(scope);return React.createElement(QuickProducts,{products,totals:{p7:50,p6:40},...shortcuts,onFavorite:shortcuts.toggleFavorite,onChoose:p=>{chosen=p.id;shortcuts.remember(p.id);}});}
 let ui=render(wrap(React.createElement(Harness,{scope:'shop-a'})));
 assert.equal(ui.getAllByRole('button',{name:/^Escolher Produto/}).length,6);
 fireEvent.click(ui.getAllByRole('button',{name:/^Escolher Produto/})[0]);assert.equal(chosen,'p7');
 fireEvent.click(ui.getByRole('button',{name:'Favoritar Produto 7'}));
 fireEvent.click(ui.getByRole('button',{name:'Favoritos'}));
 assert.ok(ui.getByRole('button',{name:'Escolher Produto 7'}));
 ui.unmount();ui=render(wrap(React.createElement(Harness,{scope:'shop-a'})));
 fireEvent.click(ui.getByRole('button',{name:'Recentes'}));assert.ok(ui.getByRole('button',{name:'Escolher Produto 7'}));
 fireEvent.click(ui.getByRole('button',{name:'Favoritos'}));assert.ok(ui.getByRole('button',{name:'Escolher Produto 7'}));
 ui.rerender(wrap(React.createElement(Harness,{scope:'shop-b'})));assert.equal(ui.queryByRole('button',{name:'Escolher Produto 7'}),null);
});
test('checkout tip starts as a small question button even if previously expanded',()=>{
 localStorage.setItem('pocket_tip_open_pos-guide','true');
 const ui=render(wrap(React.createElement(PocketTip,{id:'pos-guide',compact:true,title:'Dica do Caixa',sections:[]})));
 const button=ui.getByRole('button',{name:'Abrir dica do Caixa'});assert.equal(button.textContent,'?');assert.equal(ui.queryByText('Dica do Caixa'),null);
 fireEvent.click(button);assert.ok(ui.getByText('Dica do Caixa'));
});


test('quick cigarette sale requires an enabled format, keeps fractional deduction and supports Escape',()=>{
 const calls=[];let closed=0;
 const p={...product,type:'cigarro',stock:1.5,pricePack:100,priceCart:20,priceHalfCart:11,priceUnit:2};
 const ui=render(wrap(React.createElement(QuickProductDialog,{product:p,onClose(){closed++;},onAdd(...args){calls.push(args);}})));
 assert.equal(ui.getByRole('button',{name:/10 carteiras fechadas/}).disabled,true);
 fireEvent.click(ui.getByRole('button',{name:/Meia Carteira/}));
 assert.equal(calls[0][3],0.5);assert.equal(calls[0][2],11);assert.equal(closed,1);
 fireEvent.keyDown(document,{key:'Escape'});assert.equal(closed,2);
});
