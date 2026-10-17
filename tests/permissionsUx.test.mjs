import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';import {JSDOM} from 'jsdom';import {mkdtemp,rm} from 'node:fs/promises';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'}),previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','Event','CustomEvent','localStorage','MutationObserver']){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {MemoryRouter,Routes,Route}=await import('react-router-dom');const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const dir=await mkdtemp(new URL('../.permissions-ui-',import.meta.url).pathname);
const apiNames=['subscribeProducts','subscribeCustomers','subscribeSettings','subscribeTodaySales','recordPayment','getActiveStoreSession'];
const stubs=['EmployeeSwitchModal','EmployeeFirstPin','InviteModal','TutorialModal','GlobalMovementHistory'];
await build({stdin:{contents:"export {AccessPage} from './src/components/AccessPage';export {OwnerPinDialog} from './src/components/OwnerPinDialog';export {TeamShifts} from './src/components/TeamShifts';export {Layout} from './src/components/Layout';export {PermissionsContext} from './src/lib/permissionsContext';export * from './src/lib/accessControl';export {PreferencesProvider,usePreferences} from './src/lib/preferencesContext';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:dir+'/ui.mjs',plugins:[{name:'access-bank',setup(b){
 b.onResolve({filter:/.*/},a=>{if(!a.path.startsWith('.'))return;const n=a.path.split('/').at(-1);if(['api','employeeContext','workforceApi','auth','useOnlineStatus',...stubs].includes(n))return {path:n,namespace:'bank'};});
 b.onLoad({filter:/.*/,namespace:'bank'},a=>({loader:'js',contents:a.path==='api'?apiNames.map(n=>`export const ${n}=(...args)=>globalThis.__accessUI.${n}(...args);`).join('\n'):a.path==='employeeContext'?'export const useEmployee=()=>globalThis.__accessUI.employee;':a.path==='workforceApi'?'export const getShifts=async()=>globalThis.__accessUI.shifts;export const shiftAction=async()=>{};export const workforceRpc=(...args)=>globalThis.__accessUI.rpc(...args);':a.path==='auth'?'export const logout=async()=>{};':a.path==='useOnlineStatus'?'export const useOnlineStatus=()=>({isOnline:true,wasOffline:false,syncNow(){}});':`export const ${a.path}=()=>null;`}));
}}]});
const m=await import(dir+'/ui.mjs');
const person={id:'staff',name:'José ORIGINAL',role:'Operador de Caixa',currentShiftStartedAt:Date.now()-3600000};
function bank(){let received;globalThis.__accessUI={shifts:[{id:'s',employee_id:'staff',employee_name:person.name,started_at:person.currentShiftStartedAt,status:'open'}],employee:{employees:[person],currentEmployee:person,activeAnnouncement:null,clearAnnouncement(){},openSwitchModal(){},logoutEmployee:async()=>{},loginEmployee:async()=>{}},getActiveStoreSession:()=>null,subscribeSettings:cb=>{cb({ownerId:'shop',storeName:'Loja',dailyGoal:50});return()=>{};},subscribeProducts:cb=>{cb([{id:'p',name:'Produto ORIGINAL',stock:3,type:'comum',category:'Bebidas',unitCost:9876,basePrice:10}]);return()=>{};},subscribeCustomers:cb=>{cb([{id:'c',name:'Maria',totalDebt:15}]);return()=>{};},subscribeTodaySales:cb=>{cb([{id:'mine',employeeId:'staff',total:10},{id:'other',employeeId:'other',total:99999}]);return()=>{};},recordPayment:async(...args)=>{received=args;},rpc:async(name)=>name==='eu_owner_pin_state'?true:{ok:true,token:'approved'}};return()=>received;}
function view(child,role='employee',initialEntries=['/']){m.configureAccess({enabled:true,role,storeId:'shop',employeeId:'staff',scoped:role==='employee'});return render(React.createElement(m.PreferencesProvider,null,React.createElement(m.PermissionsContext.Provider,{value:{role,isEmployee:role==='employee',isOwner:role==='owner',employeeId:'staff',ready:true,canAccess:path=>m.canAccessPath(role,path)}},React.createElement(MemoryRouter,{initialEntries},child))));}
afterEach(()=>{cleanup();localStorage.clear();m.configureAccess({enabled:false,role:'owner',storeId:'',scoped:false,employeeId:undefined});delete globalThis.__accessUI;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();for(const [n,d]of previous){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}});
test('roles map known job labels conservatively and guard direct URLs as well as navigation',async()=>{
 assert.equal(m.normalizeAccessRole('Gerente de Loja'),'manager');for(const role of ['Funcionário','Operador de Caixa','Auxiliar Geral','Dono','unknown'])assert.equal(m.normalizeAccessRole(role),'employee');
 bank();let mounted=false;function Secret(){mounted=true;return React.createElement('div',null,'secret report');}
 let ui;await act(async()=>{ui=view(React.createElement(Routes,null,React.createElement(Route,{path:'/precos',element:React.createElement(m.AccessPage,{path:'/precos'},React.createElement(Secret))}),React.createElement(Route,{path:'/',element:React.createElement('p',null,'allowed home')})),'employee',['/precos']);});
 assert.equal(mounted,false);assert.ok(ui.getByText('allowed home'));cleanup();
 await act(async()=>{ui=view(React.createElement(m.Layout,{menuPinned:false,onToggleMenuPinned(){}}));});fireEvent.click(ui.getByRole('button',{name:'Abrir menu de navegação'}));
 const paths=[...ui.container.querySelectorAll('a')].map(a=>a.getAttribute('href'));
 assert.deepEqual([...new Set(paths)].sort(),['/','/caixa','/estoque','/fiado'].sort());assert.equal(ui.queryByText('Convidar Equipe'),null);assert.equal(ui.queryByText('Trocar com senha • Equipe'),null);
});
test('employee home contains only shift, own sale count and goal; stock has no cost or edit actions',async()=>{
 bank();let ui;await act(async()=>{ui=view(React.createElement(m.AccessPage,{path:'/'},React.createElement('div',null,'secret management')));});
 assert.ok(ui.getByRole('heading',{name:'Meu turno'}));assert.match(ui.container.textContent,/Minhas vendas de hoje: 1/);assert.doesNotMatch(ui.container.textContent,/99.999|secret management|Lucro|Faturamento/);assert.ok(ui.getByRole('button',{name:'Encerrar turno'}));cleanup();
 await act(async()=>{ui=view(React.createElement(m.AccessPage,{path:'/estoque'},React.createElement('div',null,'secret costs')));});assert.ok(ui.getByText('Produto ORIGINAL'));assert.doesNotMatch(ui.container.textContent,/9.876|9876|secret costs/);assert.equal(ui.queryByRole('button'),null);
});
test('employee Fiado receives payments without client creation or purchase/history controls',async()=>{
 const received=bank();let ui;await act(async()=>{ui=view(React.createElement(m.AccessPage,{path:'/fiado'},null));});
 assert.equal(ui.queryByText(/Novo cliente/i),null);fireEvent.click(ui.getByRole('button',{name:'Receber'}));fireEvent.change(ui.getByLabelText('Valor recebido'),{target:{value:'5'}});
 await act(async()=>fireEvent.submit(ui.getByRole('dialog').querySelector('form')));assert.deepEqual(received(),['c',5,'cash']);assert.equal(ui.queryByRole('dialog'),null);
});
test('deletion waits for owner PIN, wrong PIN never resolves approval, and staff cannot request it',async()=>{
 bank();let attempts=0;globalThis.__accessUI.rpc=async name=>name==='eu_owner_pin_state'?true:++attempts===1?{ok:false,code:'WRONG_PIN'}:{ok:true,token:'one-time'};
 const ui=view(React.createElement(m.OwnerPinDialog),'manager');let result;
 await act(async()=>{result=m.requestDeletionApproval([{table:'eu_products',id:'p'}]);result.then(value=>{globalThis.__approved=value;});});
 assert.equal(globalThis.__approved,undefined);fireEvent.change(ui.getByLabelText('PIN do dono',{selector:'input'}),{target:{value:'0000'}});await act(async()=>fireEvent.submit(ui.getByRole('dialog').querySelector('form')));assert.equal(globalThis.__approved,undefined);assert.match(ui.getByRole('alert').textContent,/incorreto/);
 fireEvent.change(ui.getByLabelText('PIN do dono',{selector:'input'}),{target:{value:'5739'}});await act(async()=>fireEvent.submit(ui.getByRole('dialog').querySelector('form')));assert.equal(await result,'one-time');assert.equal(ui.queryByRole('dialog'),null);delete globalThis.__approved;
 m.configureAccess({role:'employee'});assert.throws(()=>m.requestDeletionApproval([{table:'eu_products',id:'p'}]),/apenas/);
});
test('read-only stock keeps the selected language mode and original product names in all three modes',async()=>{
 bank();for(const [mode,title]of [['basic','Consultar estoque'],['neutral','Estoque para consulta'],['technical','Estoque — somente leitura']]){
  localStorage.setItem('app_lang_mode',mode);let ui;await act(async()=>{ui=view(React.createElement(m.AccessPage,{path:'/estoque'},null));});
  assert.ok(ui.getByRole('heading',{name:title}));assert.ok(ui.getByText('Produto ORIGINAL'));assert.equal(localStorage.getItem('app_lang_mode'),mode);assert.equal(ui.queryByRole('button'),null);cleanup();
 }
});
test('owner team board shows names, times, duration and forgotten shift status, and stays hidden for managers',async()=>{
 bank();const start=Date.now()-3600000;globalThis.__accessUI.shifts=[{id:'old',employee_id:'staff',employee_name:'José ORIGINAL',started_at:start,ended_at:start+3600000,status:'not_closed'}];
 let ui;await act(async()=>{ui=view(React.createElement(m.TeamShifts),'owner');});assert.ok(ui.getByRole('heading',{name:'Equipe e turnos'}));assert.ok(ui.getByText('José ORIGINAL'));assert.ok(ui.getByText('Não encerrado'));assert.match(ui.container.textContent,/1h 0min/);cleanup();
 await act(async()=>{ui=view(React.createElement(m.TeamShifts),'manager');});assert.equal(ui.queryByRole('heading'),null);
});
