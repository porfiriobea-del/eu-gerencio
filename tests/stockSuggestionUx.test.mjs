import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=(await import('react')).default;
const {render,fireEvent,cleanup}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../node_modules/stock-suggestion-test-',import.meta.url));
await build({stdin:{contents:"export * from './src/components/StockLevelSuggestion'; export {PreferencesProvider} from './src/lib/preferencesContext'; export {CigarettePurchaseOptions} from './src/components/CigarettePurchaseOptions';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:`${dir}/ui.mjs`});
const {StockLevelSuggestion,PreferencesProvider,CigarettePurchaseOptions}=await import(pathToFileURL(`${dir}/ui.mjs`));
function setup(product,onApply){
 function Form(){const [coverage,setCoverage]=React.useState(7);return React.createElement(StockLevelSuggestion,{product,coverageDays:coverage,onCoverageChange:setCoverage,onApply});}
 return render(React.createElement(PreferencesProvider,null,React.createElement(Form)));
}
afterEach(()=>{cleanup();localStorage.clear();});after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();});
test('suggestions update with coverage and apply only reserve and maximum after a deliberate click',()=>{
 const calls=[];
 const product={type:'comum',stock:5,dailyAverageSales:4,replacementDays:3};
 const ui=setup(product,values=>calls.push(values));
 assert.ok(ui.getByText('15 unidades'));assert.ok(ui.getByText('43 unidades'));
 assert.equal(calls.length,0);
 fireEvent.change(ui.getByLabelText('Intervalo entre compras (dias)'),{target:{value:'14'}});
 assert.ok(ui.getByText('71 unidades'));
 fireEvent.click(ui.getByRole('button',{name:'Usar limites sugeridos'}));
 assert.deepEqual(calls,[{safetyStock:3,maxStock:71}]);assert.equal(product.stock,5);
});
test('zero average explains what to fill and offers no apply button',()=>{
 const ui=setup({type:'cigarro',stock:1,dailyAverageSales:0,replacementDays:3},()=>assert.fail('Unexpected apply'));
 assert.match(ui.getByRole('status').textContent,/média de vendas maior que zero/);
 assert.equal(ui.queryByRole('button',{name:'Usar limites sugeridos'}),null);
});

test('suggestion text and supplier options follow all three language modes',()=>{
 const variants=[
  ['basic','Quanto manter na loja?','De quantos em quantos dias você compra?','Preencher para mim'],
  ['neutral','Sugestão de estoque mínimo e máximo','Intervalo entre compras (dias)','Usar limites sugeridos'],
  ['technical','Parâmetros sugeridos de ressuprimento','Ciclo de aquisição (dias)','Aplicar parâmetros sugeridos']
 ];
 for(const [mode,title,label,action] of variants){
  localStorage.setItem('app_lang_mode',mode);
  const ui=setup({type:'cigarro',stock:0,dailyAverageSales:1,replacementDays:3},()=>{});
  assert.ok(ui.getByRole('heading',{name:title}));assert.ok(ui.getByLabelText(label));assert.ok(ui.getByRole('button',{name:action}));
  const details=ui.container.querySelector('details');assert.equal(details.open,mode!=='basic');
  if(mode==='basic'){assert.ok(ui.getByText('Você está sem estoque.'));assert.ok(ui.getByText('Está na hora de comprar mais.'));}
  cleanup();
  const supplier=render(React.createElement(PreferencesProvider,null,React.createElement(CigarettePurchaseOptions,{value:10,onChange:()=>{}})));
  assert.ok(supplier.getByRole('option',{name:mode==='technical'?'Maço integral — 10 carteiras':'Maço inteiro — 10 carteiras'}));
  assert.ok(supplier.getByRole('option',{name:'Meio maço — 5 carteiras'}));
  cleanup();
 }
});
test('supplier cigarette size has only full and half pack options, with full selected by default',()=>{
 let selected;
 const ui=render(React.createElement(PreferencesProvider,null,React.createElement(CigarettePurchaseOptions,{value:10,onChange:value=>{selected=value;}})));
 const selector=ui.getByRole('combobox');assert.equal(selector.value,'10');
 assert.deepEqual(Array.from(selector.options,option=>option.value),['10','5']);
 fireEvent.change(selector,{target:{value:'5'}});assert.equal(selected,5);
});
