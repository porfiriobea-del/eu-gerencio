import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {enviarParaPlanilha} from '../server/relatorio.ts';

test('registered-store RPC counts valid stores across RLS, excludes empty profiles and rejects unauthenticated calls',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;
   create function public.eu_user_id() returns text language sql stable as $$select nullif(current_setting('test.user',true),'')$$;
   create table eu_store_settings(collection_path text,id text,owner_id text,data jsonb);
   alter table eu_store_settings enable row level security;
   grant select on eu_store_settings to anon;
   create policy own on eu_store_settings using(owner_id=public.eu_user_id());
   insert into eu_store_settings values
   ('settings','a','a','{"storeName":"Loja A"}'),
   ('settings','b','b','{"storeName":"Loja B"}'),
   ('settings','c','c','{"storeName":"   "}'),
   ('settings','d','d','{"storeName":"Apagada","accountDataCleared":true}'),
   ('settings','extra','a','{"storeName":"Duplicada"}');`);
  const sql=await readFile(new URL('../supabase/migrations/20261016_registered_stores_count.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec("set role anon;select set_config('test.user','a',false)");
  const own=await db.query('select * from eu_store_settings');assert.equal(own.rows.length,2);
  const count=await db.query('select eu_registered_stores_count() as total');
  assert.equal(Number(count.rows[0].total),2);
  await db.exec("select set_config('test.user','',false)");
  await assert.rejects(db.query('select eu_registered_stores_count()'));
 }finally{await db.close();}
});

test('report route uses the database total, never a browser count or store identity',async t=>{
 const old={url:process.env.APPS_SCRIPT_URL,secret:process.env.APPS_SCRIPT_SECRET};
 process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/test/exec';process.env.APPS_SCRIPT_SECRET='test-secret';
 t.after(()=>{for(const [key,value] of [['APPS_SCRIPT_URL',old.url],['APPS_SCRIPT_SECRET',old.secret]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const exports=[];let total=17,unavailable=false;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(String(url).endsWith('/rpc/eu_user_id'))return Response.json('owner');
  if(String(url).endsWith('/rpc/eu_registered_stores_count'))return unavailable?new Response('missing function',{status:404}):Response.json(total);
  assert.equal(init.headers['Content-Type'],'text/plain');exports.push(JSON.parse(init.body));return Response.json({ok:true});
 });
 const invoke=async()=>{
  const result={};const res={status(v){result.status=v;return this;},json(v){result.body=v;return this;}};
  await enviarParaPlanilha({method:'POST',headers:{authorization:'Bearer test'},body:{categoria:'comercios',totalComercios:999999,loja:'Private shop'}},res);
  return result;
 };
 assert.equal((await invoke()).body.success,true);assert.equal(exports[0].totalComercios,17);
 assert.match(exports[0].loja,/^loja_[a-f0-9]{64}$/);assert.equal(exports[0].secret,'test-secret');
 total=0;assert.equal((await invoke()).body.success,true);assert.equal(exports[1].totalComercios,0);
 unavailable=true;assert.equal((await invoke()).status,202);assert.equal(exports.length,2);
});

test('Apps Script creates and refreshes Comércios with a numeric total and update date, without usage or feedback rows',async()=>{
 const source=await readFile(new URL('../integrations/feedback-apps-script.gs',import.meta.url),'utf8');
 const tabs=new Map();let writes=0;
 const book={getSheetByName:n=>tabs.get(n),insertSheet(n){const sheet={getRange(){return {setValues(values){sheet.values=values;writes++;},setFontWeight(){},setNumberFormat(){}};},setFrozenRows(){}};tabs.set(n,sheet);return sheet;}};
 const context={console,Number,Date,JSON,isFinite,
  LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='APPS_SCRIPT_SECRET'?'secret':'sheet-id'})},
  SpreadsheetApp:{openById:()=>book,flush(){}},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})}
 };
 vm.createContext(context);vm.runInContext(source,context);
 const send=total=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({secret:'secret',categoria:'comercios',totalComercios:total,loja:'loja_'+'a'.repeat(64),usuario:'usuario_'+'b'.repeat(64)})}}));
 assert.equal(send(17).ok,true);assert.equal(tabs.size,1);
 assert.equal(tabs.get('Comércios').values[2][1],17);
 assert.ok(tabs.get('Comércios').values[3][1] instanceof Date);
 assert.equal(send(18).ok,true);assert.equal(tabs.get('Comércios').values[2][1],18);
 assert.equal(send(-1).ok,false);assert.equal(writes,2);
});
