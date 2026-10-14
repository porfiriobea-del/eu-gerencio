import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
let server, dir, store, client, api, responseError;
const records=new Map(), calls=[], listeners=new Set();
const key=(table,path,id)=>`${table}/${path}/${id}`;
before(async()=>{
  server=http.createServer(async(req,res)=>{
    calls.push({url:req.url,authorization:req.headers.authorization});
    res.setHeader('content-type','application/json');
    if(responseError){res.statusCode=404;res.end(JSON.stringify(responseError));return;}
    if(req.headers.authorization!=='Bearer test-firebase-jwt') {res.statusCode=401;res.end(JSON.stringify({message:'Denied'}));return;}
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.endsWith('/rpc/eu_user_id')){res.end(JSON.stringify('owner'));return;}
    if(url.pathname.endsWith('/rpc/eu_apply_changes')){
      let text='';for await(const chunk of req)text+=chunk;
      const body=JSON.parse(text);
      for(const read of body.read_versions){if((records.get(key(read.table,read.path,read.id))?.revision||0)!==read.revision){res.statusCode=409;res.end(JSON.stringify({code:'P0001',message:'TRANSACTION_CONFLICT'}));return;}}
      for(const op of body.operations){
        const id=key(op.table,op.path,op.id),old=records.get(id);
        if(op.action==='delete')records.delete(id);
        else {const data=op.action==='update'||op.merge?{...old?.data,...op.data}:op.data;records.set(id,{id:op.id,collection_path:op.path,owner_id:data.ownerId,revision:(old?.revision||0)+1,data});}
      }
      res.end('null');for(const notify of listeners)notify();return;
    }
    const table=url.pathname.split('/').at(-1);
    const path=url.searchParams.get('collection_path')?.replace(/^eq\./,'');
    const id=url.searchParams.get('id')?.replace(/^eq\./,'');
    const owner=url.searchParams.get('owner_id')?.replace(/^eq\./,'');
    const rows=[...records.entries()].filter(([k,row])=>k.startsWith(table+'/')&&row.collection_path===path&&(!id||row.id===id)&&(!owner||row.owner_id===owner)).map(([,row])=>row);
    if(id)res.end(JSON.stringify(rows[0]||null));else res.end(JSON.stringify(rows));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  client=createClient(`http://127.0.0.1:${server.address().port}`,'test-only-public-key',{accessToken:async()=> 'test-firebase-jwt',auth:{persistSession:false,autoRefreshToken:false}});
  client.channel=()=>{let handler;const channel={on(_type,_filter,callback){handler=callback;return channel;},subscribe(){listeners.add(handler);return channel;},handler:()=>handler};return channel;};
  client.removeChannel=async channel=>{listeners.delete(channel.handler());};
  globalThis.__cloudClient=client;
  const cache=new URL('../node_modules/.cache/',import.meta.url);await mkdir(cache,{recursive:true});dir=await mkdtemp(new URL('cloud-store-',cache));
  await build({entryPoints:[new URL('../src/lib/cloudStore.ts',import.meta.url).pathname],bundle:true,packages:'external',platform:'node',format:'esm',outfile:`${dir}/store.mjs`,plugins:[{name:'inject-client',setup(b){b.onResolve({filter:/\/supabase$/},()=>({path:'client',namespace:'test-client'}));b.onLoad({filter:/.*/,namespace:'test-client'},()=>({contents:'export const supabase=globalThis.__cloudClient;export const assertSupabaseConfigured=()=>{};',loader:'js'}));}}]});
  store=await import(pathToFileURL(`${dir}/store.mjs`).href);
  await build({entryPoints:[new URL('../src/lib/api.ts',import.meta.url).pathname],bundle:true,packages:'external',platform:'node',format:'esm',outfile:`${dir}/api.mjs`,plugins:[{name:'inject-api-client',setup(b){
    b.onResolve({filter:/\/(supabase|firebase)$/},args=>({path:args.path.split('/').at(-1),namespace:'api-test'}));
    b.onLoad({filter:/.*/,namespace:'api-test'},args=>({contents:args.path==='firebase'?'export const auth={currentUser:{uid:"owner",email:"owner@test.invalid"}};':'export const supabase=globalThis.__cloudClient;export const assertSupabaseConfigured=()=>{};export const postToGoogleSheets=async()=>{};export const GOOGLE_SHEETS_WEBHOOK_URL="";',loader:'js'}));
  }}]});
  api=await import(pathToFileURL(`${dir}/api.mjs`).href);
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});delete globalThis.__cloudClient;});
const waitFor=async condition=>{for(let n=0;n<100;n++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Cloud refresh did not arrive');};

test('real Supabase SDK sends Firebase JWTs and reads settings remotely with a verified identity',async()=>{
  await store.verifyCloudIdentity('owner');
  await assert.rejects(store.verifyCloudIdentity('different-user'),/não foi reconhecida/);
  const ref=store.doc(store.db,'settings','owner');
  await store.setDoc(ref,{ownerId:'owner',storeName:'Loja em Nuvem'});
  assert.equal((await store.getDoc(ref)).data().storeName,'Loja em Nuvem');
  assert.ok(calls.some(call=>call.url.includes('/eu_store_settings?')&&call.authorization==='Bearer test-firebase-jwt'));
});

test('two independent subscriptions refresh after a mutation and recover without local storage',async()=>{
  const ref=store.doc(store.db,'products','p1');
  await store.setDoc(ref,{ownerId:'owner',name:'Produto',stock:10});
  const source=store.query(store.collection(store.db,'products'),store.where('ownerId','==','owner'));
  const first=[],second=[];
  const stop1=store.onSnapshot(source,snapshot=>first.push(snapshot.docs[0].data().stock));
  const stop2=store.onSnapshot(source,snapshot=>second.push(snapshot.docs[0].data().stock));
  try{
    await waitFor(()=>first.length&&second.length);
    const remote=createClient(`http://127.0.0.1:${server.address().port}`,'test-only-public-key',{accessToken:async()=> 'test-firebase-jwt',auth:{persistSession:false,autoRefreshToken:false}});
    const mutation=await remote.rpc('eu_apply_changes',{operations:[{table:'eu_products',path:'products',id:'p1',action:'update',data:{stock:9}}],read_versions:[],request_id:crypto.randomUUID()});
    assert.equal(mutation.error,null);
    await waitFor(()=>first.at(-1)===9&&second.at(-1)===9);
    assert.ok(calls.some(call=>call.url.includes('owner_id=eq.owner')));
    assert.deepEqual(first,[10,9]);assert.deepEqual(second,[10,9]);
  }finally{stop1();stop2();}
  assert.equal(listeners.size,0);
});

test('transaction retry reads the new cloud balance instead of overwriting a competing write',async()=>{
  const ref=store.doc(store.db,'products','p1');let attempts=0;
  await store.runTransaction(store.db,async transaction=>{
    attempts++;const snapshot=await transaction.get(ref);
    if(attempts===1)await store.updateDoc(ref,{stock:8});
    transaction.update(ref,{stock:snapshot.data().stock-1});
  });
  assert.equal(attempts,2);assert.equal((await store.getDoc(ref)).data().stock,7);
});

test('cloud deletions remove the authoritative record and reopening reads the remote absence',async()=>{
  const ref=store.doc(store.db,'products','p1');await store.deleteDoc(ref);
  assert.equal((await store.getDoc(ref)).exists(),false);
});


test('POS commits against current cloud stock, not a stale balance supplied by another screen',async()=>{
  const ref=store.doc(store.db,'products','p1');
  await store.setDoc(ref,{ownerId:'owner',name:'Produto',type:'comum',stock:7,unitCost:2,basePrice:5});
  await api.recordSale({total:5,type:'cash',customerId:''},[{productId:'p1',name:'Produto',format:'Padrão',quantity:1,price:5,unitCost:999,stockDeduction:1}],[{id:'p1',newStock:9}]);
  assert.equal((await store.getDoc(ref)).data().stock,6);
  const sales=await store.getDocs(store.query(store.collection(store.db,'sales'),store.where('ownerId','==','owner')));
  assert.equal(sales.docs.length,1);
  const items=await api.getSaleItems(sales.docs[0].id);
  assert.equal(items[0].unitCost,2);
});

test('POS rejects an insufficient current balance without recording a sale',async()=>{
  const ref=store.doc(store.db,'products','p1');await store.updateDoc(ref,{stock:0});
  await assert.rejects(api.recordSale({total:5,type:'cash',customerId:''},[{productId:'p1',name:'Produto',format:'Padrão',quantity:1,price:5,unitCost:2,stockDeduction:1}],[{id:'p1',newStock:9}]),/insuficiente/);
  const sales=await store.getDocs(store.query(store.collection(store.db,'sales'),store.where('ownerId','==','owner')));
  assert.equal(sales.docs.length,1);
});

test('missing production schema gives actionable instructions without an empty store fallback',async()=>{
  responseError={code:'PGRST202',message:'Could not find function'};
  try {await assert.rejects(store.verifyCloudIdentity('owner'),/20261014_cloud_source_of_truth.sql/);}
  finally {responseError=null;}
});

test('POS rejects stale package measures and invalid prices before committing stock',async()=>{
  const ref=store.doc(store.db,'products','p1');
  await store.updateDoc(ref,{stock:10,unitsPerPackage:6});
  const item={productId:'p1',name:'Produto',format:'Fardo (12 unidades)',quantity:1,price:5,unitCost:2,stockDeduction:12};
  await assert.rejects(api.recordSale({total:5,type:'cash',customerId:''},[item],[]),/medida/);
  await assert.rejects(api.recordSale({total:5,type:'cash',customerId:''},[{...item,price:NaN}],[]),/Preço/);
  assert.equal((await store.getDoc(ref)).data().stock,10);
});

test('a fiado payment above the current debt is rejected without recording money',async()=>{
  const ref=store.doc(store.db,'customers','customer');
  await store.setDoc(ref,{ownerId:'owner',name:'Cliente',totalDebt:10});
  const query=store.query(store.collection(store.db,'payments'),store.where('ownerId','==','owner'));
  const before=(await store.getDocs(query)).size;
  await assert.rejects(api.recordPayment('customer',15,'cash'),/excede/);
  assert.equal((await store.getDoc(ref)).data().totalDebt,10);
  assert.equal((await store.getDocs(query)).size,before);
  await api.recordPayment('customer',9.90,'cash');
  assert.equal((await store.getDoc(ref)).data().totalDebt,0.10);
  await api.recordPayment('customer',0.10,'cash');
  assert.equal((await store.getDoc(ref)).data().totalDebt,0);
});
