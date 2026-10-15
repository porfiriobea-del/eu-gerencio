import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost'});
for(const key of ['window','document','navigator','HTMLElement','Node','CustomEvent','Event','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=(await import('react')).default;
const {MemoryRouter}=await import('react-router-dom');
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../node_modules/language-test-',import.meta.url));
const mocks = {
 api: `export const subscribeMovements=cb=>{globalThis.__records=cb;cb(globalThis.__initialRecords||[]);return()=>{};};
 export const subscribeSettings=cb=>{cb(globalThis.__initialSettings||{storeName:'Loja Teste',theme:'standard',languageMode:'neutral',simpleViewMode:false});return()=>{};};
 export const subscribeCustomers=cb=>{cb([]);return()=>{};};export const subscribeProducts=subscribeCustomers;
 export const importSupplierCatalog=async()=>0;export const adjustProductStock=async()=>{};
 export const updateSettings=async patch=>{globalThis.__settingsPatches.push(patch);};
 export const getSalesByDateRange=async()=>[];export const getPurchasesByDateRange=async()=>[];export const deleteEntireAccountData=async()=>{};`,
 auth: 'export const deleteUserAccountAuth=async()=>{};',
 sheets:'export const exportToSheets=async()=>{};',
 exportUtils:'export const exportFullReportToCSV=()=>{};export const exportDailySalesAndSafetyStockToCSV=()=>{};',
 emailNotification:'export const openWelcomeEmail=()=>{};export const getGmailComposeUrl=()=>"";',
 backupService:'export const generateFullUserDataBackup=async()=>({});export const downloadBackupJsonFile=()=>{};export const checkAndRunDailyAutomatedBackup=async()=>({});export const getLastBackupTimestamp=()=>null;',
 employeeContext:'export const useEmployee=()=>({employees:[],currentEmployee:null,openSwitchModal(){}});',
 categories:'export const BUSINESS_SECTORS=[];export const getSavedBusinessSector=()=>"mercearia";export const saveBusinessSector=()=>{};export const getCustomCategories=()=>[];export const setCustomCategories=()=>{};export const saveCustomCategory=()=>{};export const removeCustomCategory=()=>{};export const getAllCategories=()=>["Bebidas"];',
 supabase:'export const GOOGLE_SHEETS_WEBHOOK_URL="";export const getGoogleSheetsWebhookUrl=()=>"";export const setGoogleSheetsWebhookUrl=()=>{};export const testGoogleSheetsWebhook=async()=>({});export const getGoogleSheetsLogs=()=>[];export const clearGoogleSheetsLogs=()=>{};export const isGoogleSheetsWebhookEnabled=()=>false;export const setGoogleSheetsWebhookEnabled=()=>{};'
};
for(const name of ['ExportPeriodModal','ThemeSelectorDropdown','CardFeeSettingsSection','FeedbackSection']) mocks[name]=`export const ${name}=()=>null;`;
await build({stdin:{contents:"export * from './src/lib/preferencesContext'; export * from './src/components/GlobalMovementHistory'; export {default as SettingsView} from './src/pages/SettingsView'; export {CatalogImportModal} from './src/components/CatalogImportModal';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:`${dir}/language.mjs`,plugins:[{name:'records',setup(b){
 b.onResolve({filter:/.*/},args=>{const name=args.path.split('/').at(-1);return mocks[name]?{path:name,namespace:'mock-records'}:undefined;});
 b.onLoad({filter:/.*/,namespace:'mock-records'},args=>({contents:mocks[args.path],loader:'js'}));
}}]});
const {PreferencesProvider,usePreferences,GlobalMovementHistory,VOCABULARY,SettingsView,CatalogImportModal}=await import(pathToFileURL(`${dir}/language.mjs`));
let prefs;
function Controls(){prefs=usePreferences();return React.createElement('div',null,['technical','neutral','basic'].map(mode=>React.createElement('button',{key:mode,onClick:()=>prefs.setLanguageMode(mode)},mode)),React.createElement('output',null,`${prefs.languageMode}/${prefs.simpleViewMode}/${prefs.v('debt.balance')}`));}
function setup(){return render(React.createElement(MemoryRouter,null,React.createElement(PreferencesProvider,null,React.createElement(Controls),React.createElement(GlobalMovementHistory))));}
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__initialRecords;delete globalThis.__records;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();});

test('three modes update shared vocabulary and compact layout immediately and persist one coherent patch',()=>{
 const patches=[];const listener=e=>patches.push(e.detail);window.addEventListener('cloud-preference-change',listener);
 try{
  const ui=setup();
  for(const [mode,simple,title] of [['technical',false,'Registro de operações'],['basic',true,'Registros da loja'],['neutral',false,'Histórico de movimentações']]){
   fireEvent.click(ui.getByRole('button',{name:mode}));
   assert.equal(prefs.languageMode,mode);assert.equal(prefs.simpleViewMode,simple);
   assert.ok(ui.getByRole('heading',{name:title}));
   assert.deepEqual(patches.at(-1),{languageMode:mode,simpleViewMode:simple});
   assert.equal(localStorage.getItem('app_lang_mode'),mode);
   assert.equal(localStorage.getItem('app_simple_view_mode'),String(simple));
  }
 }finally{window.removeEventListener('cloud-preference-change',listener);}
});
test('cloud preference changes propagate across the interface without echoing a write',()=>{
 let writes=0;const listener=()=>writes++;window.addEventListener('cloud-preference-change',listener);
 try{
  const ui=setup();act(()=>window.dispatchEvent(new CustomEvent('cloud-preferences',{detail:{languageMode:'basic'}})));
  assert.equal(prefs.simpleViewMode,true);assert.ok(ui.getByText('basic/true/Quanto falta receber'));
  assert.equal(writes,0);assert.equal(localStorage.getItem('app_lang_mode'),'basic');
 }finally{window.removeEventListener('cloud-preference-change',listener);}
});
test('collapsed footer receives new records and switching to simple mode collapses an open history',()=>{
 globalThis.__initialRecords=[{id:'1',type:'sale',description:'Primeira venda',timestamp:Date.now(),employeeName:'Dona'}];
 const ui=setup();
 act(()=>globalThis.__records([{id:'2',type:'sale',description:'Nova venda recebida',timestamp:Date.now(),employeeName:'Dona'},...globalThis.__initialRecords]));
 assert.ok(ui.getByText('Nova venda recebida'));
 const toggle=ui.getAllByRole('button').find(button=>button.getAttribute('aria-expanded')==='false');
 fireEvent.keyDown(toggle,{key:'Enter'});assert.equal(toggle.getAttribute('aria-expanded'),'true');
 fireEvent.click(ui.getByRole('button',{name:'basic'}));assert.equal(toggle.getAttribute('aria-expanded'),'false');
});
test('invalid cached mode falls back safely and critical vocabulary exists in all modes',()=>{
 localStorage.setItem('app_lang_mode','obsolete');setup();assert.equal(prefs.languageMode,'neutral');
 for(const mode of ['technical','neutral','basic']) for(const key of ['movements.title','movements.history','nav.movements','settings.advanced','debt.balance','reports.note','stock.title','pos.cart']) assert.ok(VOCABULARY[mode][key],`${mode} missing ${key}`);
});

test('Settings uses compact sections in simple mode and autosaves the current layout after switching modes',async()=>{
 globalThis.__settingsPatches=[];
 globalThis.__initialSettings={storeName:'Loja Teste',theme:'standard',languageMode:'basic',simpleViewMode:true};
 localStorage.setItem('app_lang_mode','basic');localStorage.setItem('app_simple_view_mode','true');
 const ui=render(React.createElement(PreferencesProvider,null,React.createElement(SettingsView)));
 const advanced=ui.getByText('Mais opções: planilhas e cópias de segurança').closest('details');
 assert.equal(advanced.open,false);
 assert.ok(ui.getByText('Total vendido'));
 assert.ok(ui.getByText('Vendas menos compras'));
 // Preferences are expanded only when requested.
 fireEvent.click(ui.getByText('Personalização e Tema'));
 fireEvent.click(ui.getByRole('button',{name:/Neutro \(Comercial\)/}));
 assert.equal(ui.getByText('Integrações e segurança').closest('details').open,true);
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,760));});
 assert.equal(globalThis.__settingsPatches.at(-1).languageMode,'neutral');
 assert.equal(globalThis.__settingsPatches.at(-1).simpleViewMode,false);
 globalThis.__initialSettings.languageMode='neutral';globalThis.__initialSettings.simpleViewMode=false;
 fireEvent.click(ui.getByRole('button',{name:/Simples \/ Descomplicado/}));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,760));});
 assert.equal(globalThis.__settingsPatches.at(-1).languageMode,'basic');
 assert.equal(globalThis.__settingsPatches.at(-1).simpleViewMode,true);
 delete globalThis.__settingsPatches;delete globalThis.__initialSettings;
});

test('catalog save action and validation use the active language mode',()=>{
 for(const [mode,action,prefix] of [
  ['basic','Salvar produtos marcados','Falta preencher alguns dados.'],
  ['neutral','Cadastrar selecionados','Revise os dados dos produtos selecionados.'],
  ['technical','Confirmar cadastros selecionados','Corrija os dados inválidos antes de confirmar o lote.']
 ]){
  localStorage.setItem('app_lang_mode',mode);
  const ui=render(React.createElement(PreferencesProvider,null,React.createElement(CatalogImportModal,{isOpen:true,onClose(){},availableCategories:['Diversos'],existingProductNames:[]})));
  fireEvent.click(ui.getByRole('button',{name:'Adicionar produto manualmente'}));
  fireEvent.change(ui.getByLabelText('Categoria'),{target:{value:'Cigarros'}});
  const basis=ui.getByLabelText(VOCABULARY[mode]['catalog.costBasis']);
  assert.deepEqual(Array.from(basis.options,option=>option.value),['','maco','meio_maco','carteira']);
  assert.equal(basis.options[2].text,VOCABULARY[mode]['catalog.costHalf']);
  fireEvent.click(ui.getByRole('button',{name:action}));
  assert.ok(ui.getByRole('alert').textContent.startsWith(prefix));
  assert.ok(ui.getByRole('dialog'));cleanup();
 }
});
