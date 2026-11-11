import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'});
for(const key of ['window','document','navigator','HTMLElement','Node','Event','CustomEvent','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const React=await import('react'),{render,fireEvent,cleanup,act}=await import('@testing-library/react');
const {MemoryRouter}=await import('react-router-dom');
const folder=await mkdtemp(new URL('../node_modules/reports-nav-',import.meta.url));
await build({stdin:{resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx',contents:"export {PreferencesProvider,usePreferences} from './src/lib/preferencesContext';export {ReportsShortcut} from './src/components/ReportsShortcut';export {useReportsPinned,REPORTS_PIN_KEY} from './src/lib/useReportsPinned';export {canAccessPath} from './src/lib/accessControl';"},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:folder+'/ui.mjs'});
const {PreferencesProvider,usePreferences,ReportsShortcut,useReportsPinned,REPORTS_PIN_KEY,canAccessPath}=await import(folder+'/ui.mjs');
afterEach(()=>{cleanup();localStorage.clear();});after(async()=>{await rm(folder,{recursive:true,force:true});dom.window.close();});
function Observer(){const {pinned}=useReportsPinned();return React.createElement('output',null,String(pinned));}
function ModeSwitch(){const {setLanguageMode}=usePreferences();return React.createElement('button',{onClick:()=>setLanguageMode('technical')},'technical');}
function view(page=false){return React.createElement(MemoryRouter,null,React.createElement(PreferencesProvider,null,React.createElement(ReportsShortcut,{page}),React.createElement(Observer),React.createElement(ModeSwitch)));}
test('reports shortcut defaults optional, opens dedicated page and synchronizes pinning immediately in all language modes',()=>{
 for(const mode of ['basic','neutral','technical']){
 localStorage.setItem('app_lang_mode',mode);const ui=render(view());
 assert.equal(ui.getByRole('link',{name:'Abrir relatórios'}).getAttribute('href'),'/relatorios');
 assert.equal(ui.getByRole('status').textContent,'false');
 fireEvent.click(ui.getByRole('button',{name:'Fixar no menu'}));
 assert.equal(localStorage.getItem(REPORTS_PIN_KEY),'true');assert.equal(ui.getByRole('status').textContent,'true');assert.equal(ui.getByRole('button',{name:'Desafixar do menu'}).getAttribute('aria-pressed'),'true');
 cleanup();const reopened=render(view(true));assert.equal(reopened.queryByRole('link'),null);assert.equal(reopened.getByRole('status').textContent,'true');
 fireEvent.click(reopened.getByRole('button',{name:'Desafixar do menu'}));assert.equal(reopened.getByRole('status').textContent,'false');cleanup();
 }
});
test('reports pin follows storage updates and language mode changes without reloading',()=>{
 const ui=render(view());fireEvent.click(ui.getByRole('button',{name:'technical'}));assert.ok(ui.getByText(/demonstrativos e exportações/));
 act(()=>{localStorage.setItem(REPORTS_PIN_KEY,'true');window.dispatchEvent(new Event('storage'));});assert.equal(ui.getByRole('status').textContent,'true');
});
test('reports remain unavailable to employees, including a direct URL',()=>{assert.equal(canAccessPath('employee','/relatorios'),false);assert.equal(canAccessPath('owner','/relatorios'),true);assert.equal(canAccessPath('manager','/relatorios'),true);});
