import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://app.test'}),previous=new Map();
for(const name of ['window','document','navigator','HTMLElement','SVGElement','Node','CustomEvent','Event','localStorage']){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const folder=await mkdtemp(new URL('../.employee-pin-test-',import.meta.url).pathname);
await build({stdin:{contents:"export {InviteModal} from './src/components/InviteModal';export {EmployeeFirstPin} from './src/components/EmployeeFirstPin';export {PreferencesProvider,usePreferences} from './src/lib/preferencesContext';",resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',outfile:folder+'/ui.mjs',plugins:[{name:'employee',setup(b){
 b.onResolve({filter:/\/lib\/(api|employeeContext)$/},a=>({path:a.path.split('/').at(-1),namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='api'?'export const changeEmployeeFirstPin=(...args)=>globalThis.__employee.change(...args);export const getActiveStoreSession=()=>globalThis.__employee.session;export const createTeamInvitation=(...args)=>globalThis.__employee.invite(...args);export const recordMovement=async()=>{};':'export const useEmployee=()=>globalThis.__employee.context;'}));
}}]});
const {InviteModal,EmployeeFirstPin,PreferencesProvider,usePreferences}=await import(folder+'/ui.mjs');
afterEach(()=>{cleanup();localStorage.clear();delete globalThis.__employee;});
after(async()=>{await rm(folder,{recursive:true,force:true});dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}});
test('Google employee is matched by invitation email, must confirm a strong different PIN, and persists before gate closes',async()=>{
 const employee={id:'employee-record',email:'ana@example.com',name:'Ana',pin:'1234',mustChangePin:true,isActive:true};let saved;
 globalThis.__employee={session:{isEmployee:true,employeeEmail:'ana@example.com'},context:{employees:[employee],currentEmployee:{id:'google-uid'},isLoadingEmployees:false},change:async(...args)=>{saved=args;employee.mustChangePin=false;employee.pin='6248';}};
 const view=()=>React.createElement(PreferencesProvider,null,React.createElement(EmployeeFirstPin));
 const ui=render(view());assert.ok(ui.getByRole('dialog'));assert.equal(saved,undefined);
 fireEvent.change(ui.getByLabelText('Senha provisória do convite'),{target:{value:'1234'}});
 fireEvent.change(ui.getByLabelText('Nova senha do Caixa'),{target:{value:'1234'}});
 fireEvent.change(ui.getByLabelText('Repita a nova senha'),{target:{value:'1234'}});
 await act(async()=>fireEvent.submit(ui.getByRole('button',{name:'Salvar minha senha'}).closest('form')));
 assert.equal(saved,undefined);assert.match(ui.getByRole('alert').textContent,/sem repetições/);
 fireEvent.change(ui.getByLabelText('Nova senha do Caixa'),{target:{value:'6248'}});
 fireEvent.change(ui.getByLabelText('Repita a nova senha'),{target:{value:'6248'}});
 await act(async()=>fireEvent.submit(ui.getByRole('button',{name:'Salvar minha senha'}).closest('form')));
 assert.deepEqual(saved,['employee-record','1234','6248']);assert.equal(ui.queryByRole('dialog'),null);
});
test('first access copy follows all three language modes during the session and default language stays pt-BR',()=>{
 const employee={id:'e',name:'Original NAME',pin:'5739',mustChangePin:true,isActive:true};globalThis.__employee={session:null,context:{employees:[employee],currentEmployee:employee,isLoadingEmployees:false}};
 let preferences;function Capture(){preferences=usePreferences();return React.createElement(EmployeeFirstPin);}
 const ui=render(React.createElement(PreferencesProvider,null,React.createElement(Capture)));
 assert.equal(preferences.language,'pt-BR');
 for(const [mode,title]of [['technical','Defina sua senha individual do Caixa'],['neutral','Troque sua senha do Caixa'],['basic','Crie sua senha do Caixa']]){
  act(()=>preferences.setLanguageMode(mode));assert.ok(ui.getByRole('heading',{name:title}));assert.equal(employee.name,'Original NAME');
 }
});

test('copy invitation accepts a simple temporary PIN, uses persisted store name, and creates only one invitation',async()=>{
 let copied,invites=[];
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
 globalThis.__employee={invite:async data=>{invites.push(data);return {inviteId:'i',inviteUrl:'https://app.test/?invite=i',storeName:'Banca da Lu'};}};
 const ui=render(React.createElement(PreferencesProvider,null,React.createElement(InviteModal,{isOpen:true,storeName:'Nome antigo',onClose(){}})));
 fireEvent.change(ui.getByPlaceholderText('Ex: Carlos Oliveira, Maria Atendente...'),{target:{value:'José'}});
 fireEvent.change(ui.getByPlaceholderText('email.do.funcionario@gmail.com'),{target:{value:'JOSE@EXAMPLE.COM'}});
 fireEvent.change(ui.getByPlaceholderText('Senha provisória do Caixa'),{target:{value:'1234'}});
 await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Cadastrar e Copiar Texto do Convite'})));
 assert.equal(invites[0].pin,'1234');
 assert.equal(invites.length,1);assert.equal(invites[0].email,'jose@example.com');
 assert.match(copied,/Olá, José!/);assert.match(copied,/\*Banca da Lu\*/);assert.doesNotMatch(copied,/Nome antigo|do estabelecimento/);
 assert.match(copied,/1234/);assert.match(copied,/primeiro acesso/);
});
