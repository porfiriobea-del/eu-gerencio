import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm}from'node:fs/promises';
import {pathToFileURL}from'node:url';
import {build}from'esbuild';
import {JSDOM}from'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
const saved=new Map();
for(const name of ['window','document','navigator','HTMLElement','Node','Event','CustomEvent','MutationObserver','sessionStorage','localStorage']){
 saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const{render,cleanup,act}=await import('@testing-library/react');
const cache=new URL('../node_modules/.cache/',import.meta.url);await mkdir(cache,{recursive:true});const dir=await mkdtemp(new URL('cloud-startup-',cache));
const content={
 PermissionsProvider:'export const PermissionsProvider=({children})=>children;',
 AccessPage:'export const AccessPage=({children})=>children;',
 usageReporting:'export const sendReport=async()=>false;',
 userLanguage:'export const syncUserLanguage=()=>()=>{};',
 auth:"export const initAuth=(success)=>{let active=true;queueMicrotask(()=>{if(active)void success({uid:'owner',email:'owner@test.invalid'});});return()=>{active=false;};};export const googleSignIn=async()=>{};",
 cloudStore:"export const db={};export const doc=(...args)=>args;export const verifyCloudIdentity=async()=>{if(globalThis.__bootError)throw new Error(globalThis.__bootError);};export const getDoc=async()=>({exists:()=>!!globalThis.__bootProfile,data:()=>globalThis.__bootProfile});export const onSnapshot=(_ref,callback,onError)=>{globalThis.__bootOnError=onError;callback({exists:()=>!!globalThis.__bootProfile,data:()=>globalThis.__bootProfile});return()=>{};};",
 api:"export const checkAndAcceptPendingInvitation=async()=>null;export const getStoreInvitationById=async()=>null;export const getEffectiveOwnerId=()=> 'owner';export const setActiveStoreSession=()=>{};export const updateSettings=async()=>{};",
 backupService:'export const checkAndRunDailyAutomatedBackup=async()=>({executed:false});',
 categories:'export const hydrateCloudCategories=()=>{};',
 googleSheets:'export const hydrateCloudSheets=()=>{};',
 legacyMigration:"export const migrateLegacyStore=async()=>{globalThis.__migrationCalls++;return false;};",
 employeeContext:'export const EmployeeProvider=({children})=>children;',
 LegalModals:'export const TermsModal=()=>null;export const PrivacyModal=()=>null;',
 Layout:"export const Layout=()=> 'Loja reconhecida na nuvem';"
};
await build({entryPoints:[new URL('../src/App.tsx',import.meta.url).pathname],bundle:true,packages:'external',format:'esm',platform:'node',jsx:'automatic',outfile:`${dir}/App.mjs`,plugins:[{name:'mock-cloud-boot',setup(b){
 b.onResolve({filter:/.*/},args=>{if(!args.path.startsWith('.'))return;const name=args.path.replace(/\.tsx?$/,'').split('/').at(-1);if(content[name])return{path:name,namespace:'boot-test'};if(args.path.includes('/pages/'))return{path:name,namespace:'page-test'};});
 b.onLoad({filter:/.*/,namespace:'boot-test'},args=>({contents:content[args.path],loader:'js'}));
 b.onLoad({filter:/.*/,namespace:'page-test'},args=>({contents:`export default()=>${JSON.stringify(args.path==='Onboarding'?'Cadastrar novo comércio':'Página')};`,loader:'js'}));
}}]});
const{default:App}=await import(pathToFileURL(`${dir}/App.mjs`).href);
afterEach(()=>{cleanup();delete globalThis.__bootError;delete globalThis.__bootProfile;delete globalThis.__migrationCalls;delete globalThis.__bootOnError;});
after(async()=>{await rm(dir,{recursive:true,force:true});dom.window.close();for(const[name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

test('an existing cloud profile opens the store on a clean browser without onboarding or migration',async()=>{
 localStorage.clear();globalThis.__bootProfile={ownerId:'owner',storeName:'Loja já cadastrada'};globalThis.__migrationCalls=0;
 const ui=render(React.createElement(App));assert.ok(await ui.findByText('Loja reconhecida na nuvem'));assert.equal(ui.queryByText('Cadastrar novo comércio'),null);assert.equal(globalThis.__migrationCalls,0);
});
test('cloud authentication errors show recovery instead of mistakenly asking to create a store',async()=>{
 globalThis.__bootError='Integração da conta indisponível';globalThis.__migrationCalls=0;
 const ui=render(React.createElement(App));assert.ok(await ui.findByText('Não foi possível carregar sua loja'));assert.equal(ui.queryByText('Cadastrar novo comércio'),null);assert.equal(globalThis.__migrationCalls,0);assert.ok(ui.getByRole('button',{name:'Tentar novamente'}));
});
test('only a confirmed absence of cloud and legacy profiles opens initial registration',async()=>{
 globalThis.__migrationCalls=0;const ui=render(React.createElement(App));assert.ok(await ui.findByText('Cadastrar novo comércio'));assert.equal(globalThis.__migrationCalls,1);
});


test('temporary connection loss after recognition preserves the open store and does not reopen onboarding',async()=>{
 globalThis.__bootProfile={ownerId:'owner',storeName:'Loja já cadastrada'};globalThis.__migrationCalls=0;
 const ui=render(React.createElement(App));await ui.findByText('Loja reconhecida na nuvem');
 await act(async()=>{globalThis.__bootOnError(new Error('Network disconnected'));});
 assert.ok(ui.getByText('Loja reconhecida na nuvem'));assert.equal(ui.queryByText('Cadastrar novo comércio'),null);assert.equal(ui.queryByText('Não foi possível carregar sua loja'),null);
});
