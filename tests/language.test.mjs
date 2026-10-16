import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PreferencesProvider,usePreferences} from '../src/lib/preferencesContext.tsx';
import {readDeviceLanguage,normalizeLanguage,formatDate} from '../src/lib/language.ts';
import {resolveVocabulary} from '../src/lib/interfaceLanguages.ts';

test('defaults to pt-BR regardless of browser, changes immediately and survives reload without changing product names or BRL',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://app.test'});
 const before={CustomEvent:globalThis.CustomEvent,window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{CustomEvent:dom.window.CustomEvent,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
 t.after(()=>{Object.assign(globalThis,before);dom.window.close();});
 Object.defineProperty(dom.window.navigator,'language',{value:'es-ES'});
 let prefs;
 function View(){prefs=usePreferences();return React.createElement('div',null,
  React.createElement('span',{id:'product',translate:'no',className:'notranslate'},'Lucky Strike ORIGINAL'),
  React.createElement('span',{id:'stock'},prefs.v('stock.title')),
  React.createElement('span',{id:'missing'},prefs.v('missing.translation','Texto em português')));}
 let root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(PreferencesProvider,null,React.createElement(View))));
 assert.equal(prefs.language,'pt-BR');assert.equal(document.documentElement.lang,'pt-BR');assert.equal(prefs.currency,'BRL');
 for(const language of ['en','es','pt-BR']){
  await React.act(async()=>prefs.setLanguage(language));
  assert.equal(prefs.language,language);assert.equal(document.documentElement.lang,language);
  assert.equal(document.getElementById('product').textContent,'Lucky Strike ORIGINAL');
  assert.equal(document.getElementById('missing').textContent,'Texto em português');
  assert.equal(prefs.t('unknown.translation'),'');assert.equal(prefs.currency,'BRL');
  assert.equal(localStorage.getItem('app_lang'),language);
 }
 await React.act(async()=>prefs.setLanguage('en'));
 await React.act(async()=>root.unmount());
 root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(PreferencesProvider,null,React.createElement(View))));
 assert.equal(prefs.language,'en');assert.equal(document.getElementById('stock').textContent,'Inventory');
 // A store snapshot must not overwrite the user's language.
 await React.act(async()=>window.dispatchEvent(new dom.window.CustomEvent('cloud-preferences',{detail:{language:'es'}})));
 assert.equal(prefs.language,'en');
 await React.act(async()=>root.unmount());
 localStorage.setItem('app_lang','pt');assert.equal(readDeviceLanguage(),'pt-BR');
 assert.equal(normalizeLanguage('de'),'pt-BR');
});
test('all language modes have translated stock wording with Portuguese fallback and locale dates',()=>{
 for(const lang of ['en','es'])for(const mode of ['basic','neutral','technical']){
  assert.notEqual(resolveVocabulary(lang,mode,'stock.title',{'stock.title':'Estoque'}),'Estoque');
  assert.equal(resolveVocabulary(lang,mode,'untranslated',{'untranslated':'Português'}),'Português');
  assert.equal(resolveVocabulary(lang,mode,'missing',{}),'');
 }
 const day=new Date(2026,9,13,12);
 for(const [lang,locale] of [['pt-BR','pt-BR'],['en','en-US'],['es','es-ES']])
  assert.equal(formatDate(day,lang),day.toLocaleDateString(locale));
});

test('cloud language belongs to the signed-in user, survives a new device and ignores stale loads',async t=>{
 const {build}=await import('esbuild');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const folder=await mkdtemp(new URL('../.language-test-',import.meta.url).pathname);
 t.after(()=>rm(folder,{recursive:true,force:true}));
 const result=await build({entryPoints:['src/lib/userLanguage.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'cloud',setup(b){
  b.onResolve({filter:/^\.\/supabase$/},()=>({path:'cloud',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__languageSupabase',loader:'js'}));
 }}]});
 await writeFile(folder+'/language.mjs',result.outputFiles[0].text);
 const dom=new JSDOM('',{url:'https://language.test'});
 const before={window:globalThis.window,localStorage:globalThis.localStorage,CustomEvent:globalThis.CustomEvent,__languageSupabase:globalThis.__languageSupabase};
 Object.assign(globalThis,{window:dom.window,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent});
 t.after(()=>{Object.assign(globalThis,before);dom.window.close();});
 const rows=new Map(),writes=[];
 let release;
 let delay=false,offline=false;
 globalThis.__languageSupabase={from(table){
  assert.equal(table,'eu_user_preferences');
  return {
   select(){return this;},eq(column,id){assert.equal(column,'user_id');this.id=id;return this;},
   maybeSingle(){const result={data:rows.get(this.id)||null,error:null};return delay?new Promise(resolve=>{release=()=>resolve(result);}):Promise.resolve(result);},
   async upsert(row){if(offline)return {error:new Error('offline')};writes.push(row);rows.set(row.user_id,{language:row.language});return {error:null};}
  };
 }};
 const {syncUserLanguage}=await import(folder+'/language.mjs');
 const loaded=[];window.addEventListener('user-language-loaded',e=>loaded.push(e.detail));
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 let stop=syncUserLanguage('user-a');await tick();
 window.dispatchEvent(new CustomEvent('user-language-change',{detail:'en'}));await tick();
 assert.equal(rows.get('user-a').language,'en');assert.equal(localStorage.getItem('app_lang:user-a'),'en');
 assert.ok(writes.every(row=>row.user_id==='user-a'));
 stop();localStorage.clear(); // a different device receives the same user's cloud preference
 stop=syncUserLanguage('user-a');await tick();assert.equal(loaded.at(-1),'en');stop();
 stop=syncUserLanguage('user-b');await tick();assert.equal(loaded.at(-1),'pt-BR');stop();
 delay=true;stop=syncUserLanguage('user-a');
 const loadedBefore=loaded.length;
 window.dispatchEvent(new CustomEvent('user-language-change',{detail:'es'}));
 release();await tick();
 assert.equal(loaded.length,loadedBefore); // late English response cannot overwrite the new choice
 assert.equal(rows.get('user-a').language,'es');stop();
 delay=false;stop=syncUserLanguage('user-a');await tick();
 offline=true;
 window.dispatchEvent(new CustomEvent('user-language-change',{detail:'en'}));await tick();stop();
 assert.equal(rows.get('user-a').language,'es');
 offline=false;stop=syncUserLanguage('user-a');await tick();
 assert.equal(loaded.at(-1),'en');assert.equal(rows.get('user-a').language,'en');stop();
});
