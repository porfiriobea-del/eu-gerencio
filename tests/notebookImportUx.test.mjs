import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'});
const original=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage']){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const folder=await mkdtemp(new URL('../.notebook-ui-',import.meta.url).pathname);
await build({stdin:{contents:"export {NotebookImport} from './src/components/NotebookImport';export {PreferencesProvider} from './src/lib/preferencesContext';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:folder+'/ui.mjs',plugins:[{name:'bank',setup(b){
 b.onResolve({filter:/\/lib\/(api|geminiCatalogScanner)$/},args=>({path:args.path.split('/').at(-1),namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:args.path==='api'?'export const importDebtNotebook=(...args)=>globalThis.__notebookSave(...args);':"export const prepareCatalogFile=async()=> 'data:image/jpeg;base64,YWJjZA==';"}));
}}]});
const {NotebookImport,PreferencesProvider}=await import(folder+'/ui.mjs');
after(async()=>{cleanup();await rm(folder,{recursive:true,force:true});dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
test('photo requires editable confirmation, flags mismatch and offers accent-insensitive merge without sending photo to save',async()=>{
 const oldFetch=globalThis.fetch;let payload,saved,closed=false;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/gemini/recognize-notebook');payload=JSON.parse(options.body);return {ok:true,json:async()=>({clients:[{name:'JOSE',lines:[{description:'Pão',amount:3},{description:'Leite',amount:2}],readTotal:6}]})};};
 globalThis.__notebookSave=async(...args)=>{saved=args;};
 try{
 const ui=render(React.createElement(PreferencesProvider,null,React.createElement(NotebookImport,{customers:[{id:'j',name:'José',totalDebt:10}],onClose:()=>{closed=true;}})));
 await act(async()=>{fireEvent.change(ui.getByLabelText('Tirar ou escolher foto'),{target:{files:[new dom.window.File(['a'],'caderneta.jpg',{type:'image/jpeg'})]}});});
 assert.equal(saved,undefined);assert.equal(payload.fileBase64,'YWJjZA==');
 assert.ok(ui.getByText(/Os totais estão diferentes/));
 assert.equal(ui.getByRole('button',{name:'Confirmar e somar às dívidas'}).disabled,true);
 fireEvent.change(ui.getByRole('combobox'),{target:{value:'j'}});
 assert.match(ui.getByRole('option',{name:/Juntar com/}).textContent,/José/);
 fireEvent.change(ui.getByLabelText('Valor a somar à dívida'),{target:{value:'6'}});
 fireEvent.click(ui.getByRole('checkbox'));
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Confirmar e somar às dívidas'})));
 assert.equal(saved[1],true);assert.equal(saved[0][0].customerId,'j');assert.equal(saved[0][0].amount,6);assert.equal(closed,true);
 assert.doesNotMatch(JSON.stringify(saved),/base64|image|photo|YWJj/);
 }finally{cleanup();globalThis.fetch=oldFetch;delete globalThis.__notebookSave;}
});
