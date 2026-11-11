import test,{after} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';
const store=new Map();globalThis.window={};globalThis.sessionStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.__user={uid:'owner',email:'owner@example.invalid'};let calls=0,release;
globalThis.__popup=(user,provider)=>{calls++;assert.equal(user.uid,globalThis.__user.uid);assert.equal(provider.params.prompt,'consent');return new Promise(resolve=>release=()=>resolve({user,token:'fresh-token'}));};
const folder=await mkdtemp(new URL('../node_modules/google-auth-',import.meta.url));
const mocks={firebase:`export const auth={get currentUser(){return globalThis.__user;},signOut:async()=>{}};`,supabase:`export const supabase={realtime:{setAuth:async()=>{}},removeAllChannels:async()=>{}};`,sdk:`export class GoogleAuthProvider{addScope(){}setCustomParameters(params){this.params=params;}static credentialFromResult(result){return {accessToken:result.token};}}export const reauthenticateWithPopup=(...args)=>globalThis.__popup(...args);export const signInWithPopup=reauthenticateWithPopup;export const onAuthStateChanged=()=>()=>{};export const onIdTokenChanged=()=>()=>{};export const deleteUser=async()=>{};`};
await build({entryPoints:[new URL('../src/lib/auth.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:folder+'/auth.mjs',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^(\.\/firebase|\.\/supabase|firebase\/auth)$/},a=>({path:a.path==='firebase/auth'?'sdk':a.path.slice(2),namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
const {getAccessToken,invalidateGoogleAccessToken}=await import(folder+'/auth.mjs');
after(async()=>{await rm(folder,{recursive:true,force:true});delete globalThis.window;delete globalThis.sessionStorage;delete globalThis.__user;delete globalThis.__popup;});
test('export obtains consent in the click stack, shares pending authorization, caches with expiry and renews stale/rejected tokens',async()=>{
 const first=getAccessToken();assert.equal(calls,1);assert.equal(getAccessToken(),first);release();assert.equal(await first,'fresh-token');assert.equal(await getAccessToken(),'fresh-token');assert.equal(calls,1);
 store.set('eu_gerencio_google_token_expires','1');const next=getAccessToken();assert.equal(calls,2);release();await next;
 invalidateGoogleAccessToken();const retry=getAccessToken();assert.equal(calls,3);release();await retry;
 globalThis.__user={uid:'other',email:'other@example.invalid'};const other=getAccessToken();assert.equal(calls,4);release();await other;
 globalThis.__user=null;assert.equal(await getAccessToken(),null);
});
test('dismissed consent releases pending authorization and permits a new attempt',async()=>{
 globalThis.__user={uid:'owner',email:'owner@example.invalid'};invalidateGoogleAccessToken();globalThis.__popup=()=>Promise.reject(Object.assign(new Error('closed'),{code:'auth/popup-closed-by-user'}));await assert.rejects(()=>getAccessToken(),e=>e.code==='auth/popup-closed-by-user');
 globalThis.__popup=user=>Promise.resolve({user,token:'retry-token'});assert.equal(await getAccessToken(),'retry-token');
});
