import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
let server, dir, store, client, api, responseError, forcedConflicts = 0;
const transactionalWrites = [];
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
      if (body.read_versions.length) {
        transactionalWrites.push(body);
        if (forcedConflicts > 0) {
          forcedConflicts--; res.statusCode=400;
          res.end(JSON.stringify({code:'P0001',message:'TRANSACTION_CONFLICT'})); return;
        }
      }
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
    let rows=[...records.entries()].filter(([k,row])=>k.startsWith(table+'/')&&(!path||row.collection_path===path)&&(!id||row.id===id)&&(!owner||row.owner_id===owner)).map(([,row])=>row);
    const emailFilter=url.searchParams.get('data->>email')?.replace(/^eq\./,'');
    if(emailFilter)rows=rows.filter(row=>row.data.email===emailFilter);
    if(url.searchParams.get('select')?.includes('customer_id:data->>customerId')){
      const type=url.searchParams.get('data->>type')?.replace(/^eq\./,'');
      rows=rows.filter(row=>!type||row.data.type===type).map(row=>({customer_id:row.data.customerId,created_at:String(row.data.createdAt)}));
    }
    if(id)res.end(JSON.stringify(rows[0]||null));else { const offset=Number(url.searchParams.get('offset')||0);const limit=Number(url.searchParams.get('limit')||rows.length);res.end(JSON.stringify(rows.slice(offset,offset+limit))); }
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
    b.onLoad({filter:/.*/,namespace:'api-test'},args=>({contents:args.path==='firebase'?'export const auth={currentUser:{uid:"owner",email:"owner@test.invalid"}};':'export const supabase=globalThis.__cloudClient;export const assertSupabaseConfigured=()=>{};export const postToGoogleSheets=async payload=>{if(globalThis.__sheetsFail){globalThis.__failedSheetType=payload.tipo;throw new Error("Simulated Sheets outage");}};export const GOOGLE_SHEETS_WEBHOOK_URL="";',loader:'js'}));
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
  assert.ok((await store.getDoc(ref)).data().lastMovementAt>0);
  await api.recordPayment('customer',0.10,'cash');
  assert.equal((await store.getDoc(ref)).data().totalDebt,0);
});


test('two HTTP 400 conflicts trigger fresh reads and succeed on the third attempt', async()=>{
  const ref=store.doc(store.db,'products','p1');
  await store.updateDoc(ref,{stock:10});
  forcedConflicts=2; let reads=0;
  const before=transactionalWrites.length;
  await store.runTransaction(store.db,async tx=>{reads++;const snapshot=await tx.get(ref);tx.update(ref,{stock:snapshot.data().stock+1});});
  assert.equal(reads,3);assert.equal(transactionalWrites.length-before,3);
  assert.equal((await store.getDoc(ref)).data().stock,11);
});

test('three conflicts fail once and do not change the stock', async()=>{
  const ref=store.doc(store.db,'products','p1');
  const before=transactionalWrites.length;
  forcedConflicts=3;let reads=0;
  await assert.rejects(store.runTransaction(store.db,async tx=>{reads++;const snapshot=await tx.get(ref);tx.update(ref,{stock:snapshot.data().stock+1});}),/3 tentativas/);
  assert.equal(reads,3);assert.equal(transactionalWrites.length-before,3);
  assert.equal((await store.getDoc(ref)).data().stock,11);
});

test('rapid stock clicks preserve order and use the previous confirmed balance', async()=>{
  const ref=store.doc(store.db,'products','p1');await store.updateDoc(ref,{stock:20});
  const deltas=[1,1,-1,1,-1,1,1,-1,1,1];
  const before=transactionalWrites.length;
  const results=await Promise.all(deltas.map(delta=>api.adjustProductStock('p1',delta)));
  let expected=20;
  assert.deepEqual(results,deltas.map(delta=>expected+=delta));
  const writes=transactionalWrites.slice(before);
  assert.equal(writes.length,deltas.length);
  assert.equal((await store.getDoc(ref)).data().stock,expected);
  assert.ok(writes.every((write,index)=>index===0||write.read_versions[0].revision===writes[index-1].read_versions[0].revision+1));
});

test('a rejected stock click does not block later writes for the same product', async()=>{
  const ref=store.doc(store.db,'products','p1');await store.updateDoc(ref,{stock:0});
  const result=await Promise.allSettled([api.adjustProductStock('p1',-1),api.adjustProductStock('p1',1),api.updateProduct('p1',{name:'Renomeado'})]);
  assert.deepEqual(result.map(item=>item.status),['rejected','fulfilled','fulfilled']);
  const product=(await store.getDoc(ref)).data();assert.equal(product.stock,1);assert.equal(product.name,'Renomeado');
});

test('purchase retries rebuild the stock adjustment without duplicating the purchase', async()=>{
  const ref=store.doc(store.db,'products','p1');await store.updateDoc(ref,{stock:1});
  forcedConflicts=2;
  const before=await store.getDocs(store.collection(store.db,'purchases'));
  await api.recordPurchase({productId:'p1',productName:'Renomeado',quantity:2,unitCost:1,totalCost:2,date:Date.now()});
  assert.equal((await store.getDoc(ref)).data().stock,3);
  assert.equal((await store.getDocs(store.collection(store.db,'purchases'))).size,before.size+1);
});


test('all five feedback types survive resubscription and are read by an independent Supabase client',async()=>{
 const categories=['suggestion','praise','bug','question','other'];
 for(const category of categories)await api.submitFeedback({category,message:`Teste local: ${category}`,rating:5,storeName:'Loja de teste'});
 let history=[];
 const stop=api.subscribeFeedbacks(value=>{history=value;});
 try{await waitFor(()=>history.length===5);assert.deepEqual(new Set(history.map(item=>item.category)),new Set(categories));}finally{stop();}
 history=[];const reopened=api.subscribeFeedbacks(value=>{history=value;});
 try{await waitFor(()=>history.length===5);assert.ok(history.every(item=>item.message.startsWith('Teste local:')));}finally{reopened();}
 const secondDevice=createClient(`http://127.0.0.1:${server.address().port}`,'test-only-public-key',{accessToken:async()=> 'test-firebase-jwt',auth:{persistSession:false,autoRefreshToken:false}});
 const result=await secondDevice.from('eu_feedbacks').select('id,data').eq('collection_path','feedbacks').eq('owner_id','owner');
 assert.equal(result.error,null);assert.equal(result.data.length,5);
 assert.deepEqual(new Set(result.data.map(item=>item.data.category)),new Set(categories));
});

test('Sheets export failure cannot roll back a confirmed Supabase sale or stock deduction',async()=>{
 const ref=store.doc(store.db,'products','p1');await store.updateDoc(ref,{stock:2});
 globalThis.__sheetsFail=true;
 try{
  await api.recordSale({total:5,type:'cash',customerId:''},[{productId:'p1',name:'Produto',format:'Padrão',quantity:1,price:5,unitCost:2,stockDeduction:1}],[]);
  await waitFor(()=>globalThis.__failedSheetType==='sale');
  assert.equal((await store.getDoc(ref)).data().stock,1);
 }finally{delete globalThis.__sheetsFail;delete globalThis.__failedSheetType;}
});

test('duplicate lookup uses current owner cloud data and excludes the product being edited',async()=>{
 await store.setDoc(store.doc(store.db,'products','duplicate-a'),{ownerId:'owner',name:'Café Teste',barcode:'00123',type:'comum',stock:3,initialStock:4,unitCost:1,basePrice:2});
 await store.setDoc(store.doc(store.db,'products','duplicate-b'),{ownerId:'owner',name:'CAFE  teste',barcode:'00123',type:'comum',stock:7,initialStock:8,unitCost:5,basePrice:9});
 const matches=await api.getProductDuplicates({name:'cafe teste'},'duplicate-a');
 assert.deepEqual(matches.map(product=>product.id),['duplicate-b']);
});

test('merge retries atomically, preserves history and redirects old purchase stock adjustments',async()=>{
 forcedConflicts=2;
 await api.mergeProducts('duplicate-a','duplicate-b');
 const target=await store.getDoc(store.doc(store.db,'products','duplicate-a'));
 const source=await store.getDoc(store.doc(store.db,'products','duplicate-b'));
 assert.equal(target.data().stock,10);assert.equal(target.data().unitCost,3.8);assert.equal(target.data().basePrice,2);
 assert.ok(source.exists());assert.equal(source.data().stock,0);assert.equal(source.data().mergedIntoId,'duplicate-a');
 assert.equal((await api.getProductDuplicates({name:'cafe teste'},'duplicate-a')).length,0);
 await assert.rejects(api.adjustProductStock('duplicate-b',1),/mesclado/);
 const purchase=await api.recordPurchase({productId:'duplicate-b',productName:'Café',quantity:2,unitCost:1,totalCost:2,date:Date.now()});
 assert.equal((await store.getDoc(target.ref)).data().stock,12);
 await api.deletePurchase(purchase,{productId:'duplicate-b',quantityToSubtract:2});
 assert.equal((await store.getDoc(target.ref)).data().stock,10);
 assert.equal((await store.getDoc(source.ref)).data().stock,0);
});

test('different stock units cannot be merged even with an identical barcode',async()=>{
 await store.setDoc(store.doc(store.db,'products','cigarette-copy'),{ownerId:'owner',name:'Café Teste',barcode:'00123',type:'cigarro',stockUnit:'carteira',stock:1,unitCost:2,basePrice:5});
 await assert.rejects(api.mergeProducts('duplicate-a','cigarette-copy'),/carteiras/);
 assert.equal((await store.getDoc(store.doc(store.db,'products','duplicate-a'))).data().stock,10);
});

test('POS sales ranking reads actual owner-scoped history beyond the 1000-row limit',async()=>{
 for(let index=0;index<1001;index++){
  const id=`rank-${index}`;const path='sales/ranking/saleItems';
  records.set(key('eu_sale_items',path,id),{id,collection_path:path,owner_id:'owner',revision:1,data:{ownerId:'owner',productId:'ranking-product',quantity:1,format:'Fardo (6 un.)',stockDeduction:6}});
 }
 records.set(key('eu_sale_items','sales/other/saleItems','other-rank'),{id:'other-rank',collection_path:'sales/other/saleItems',owner_id:'another-shop',revision:1,data:{ownerId:'another-shop',productId:'ranking-product',quantity:9999,stockDeduction:1}});
 const result=await api.getProductSalesTotals([{id:'ranking-product',name:'Mais vendido',type:'comum',unitsPerPackage:6}]);
 assert.equal(result['ranking-product'],6006);
 assert.ok(calls.some(call=>call.url.includes('eu_sale_items?')&&call.url.includes('owner_id=eq.owner')&&call.url.includes('offset=1000')));
});

test('catalogue retry uses stable draft IDs and confirms without duplicating or overwriting stock',async()=>{
 const product={name:'Produto importado por foto',category:'Diversos',type:'comum',unitsPerPackage:1,purchaseForm:'unidade',unitCost:2,basePrice:5,stock:5,initialStock:5,safetyStock:0,dailyAverageSales:0,replacementDays:3};
 const before=(await store.getDocs(store.collection(store.db,'products'))).size;
 assert.equal(await api.importSupplierCatalog([product],{allowDuplicates:true,draftIds:['review-photo-test']}),1);
 const all=await store.getDocs(store.collection(store.db,'products'));
 assert.equal(all.size,before+1);
 const saved=all.docs.find(doc=>doc.data().name===product.name);
 assert.equal(saved.data().stock,5);assert.equal(saved.data().initialStock,5);
 await store.updateDoc(saved.ref,{stock:7});
 assert.equal(await api.importSupplierCatalog([product],{allowDuplicates:true,draftIds:['review-photo-test']}),0);
 assert.equal((await store.getDocs(store.collection(store.db,'products'))).size,before+1);
 assert.equal((await store.getDoc(saved.ref)).data().stock,7);
});


test('cigarette sales save exact fractional balances and the committed balance in history',async()=>{
 const ref=store.doc(store.db,'products','fraction-history');
 await store.setDoc(ref,{ownerId:'owner',name:'Cigarro fracionado',type:'cigarro',stockUnit:'carteira',unitsPerPackage:10,stock:2,unitCost:8,basePrice:12,priceCart:12,priceHalfCart:6,priceUnit:1});
 const item=(format,price,stockDeduction,quantity=1)=>({productId:'fraction-history',name:'Cigarro fracionado',format,quantity,price,unitCost:0,stockDeduction});
 await api.recordSale({total:6,type:'cash',customerId:''},[item('Meia Carteira (10 unidades)',6,0.5)],[]);
 assert.equal((await store.getDoc(ref)).data().stock,1.5);
 const sales=await store.getDocs(store.collection(store.db,'sales'));
 assert.ok(sales.docs.some(doc=>doc.data().itemsSummary.includes('Venda: meia carteira; estoque agora 1 carteira e meia')));
 await store.updateDoc(ref,{stock:1});
 for(let index=0;index<20;index++)await api.recordSale({total:1,type:'cash',customerId:''},[item('Unidade Avulsa (1 cigarro)',1,0.05)],[]);
 assert.equal((await store.getDoc(ref)).data().stock,0);
 const before=(await store.getDocs(store.collection(store.db,'sales'))).size;
 await assert.rejects(api.recordSale({total:1,type:'cash',customerId:''},[item('Unidade Avulsa (1 cigarro)',1,0.05)],[]),/insuficiente/);
 assert.equal((await store.getDocs(store.collection(store.db,'sales'))).size,before);
 await store.updateDoc(ref,{stock:2});
 await api.recordSale({total:15,type:'cash',customerId:''},[item('Carteira (1 carteira fechada)',12,1),item('Unidade Avulsa (1 cigarro)',1,0.05,3)],[]);
 assert.equal((await store.getDoc(ref)).data().stock,0.85);
});


test('editing cigarette stock canonicalizes floating drift and rejects non-cigarette fractions',async()=>{
 const ref=store.doc(store.db,'products','fraction-edit');
 await store.setDoc(ref,{ownerId:'owner',name:'Cigarro',type:'cigarro',stockUnit:'carteira',unitsPerPackage:10,stock:2,unitCost:8,basePrice:12});
 await api.updateProduct('fraction-edit',{stock:1.9000000000000001});
 assert.equal((await store.getDoc(ref)).data().stock,1.9);
 await assert.rejects(api.updateProduct('fraction-edit',{stock:0.03}),/Estoque inválido/);
 assert.equal((await store.getDoc(ref)).data().stock,1.9);
});

test('sales persist machine Pix fees, keep direct Pix free and validate card surcharge against cloud settings',async t=>{
 const settingsRef=store.doc(store.db,'settings','owner');
 const previous=await store.getDoc(settingsRef);
 t.after(async()=>{if(previous.exists())await store.setDoc(settingsRef,previous.data());else await store.deleteDoc(settingsRef);});
 await store.setDoc(settingsRef,{ownerId:'owner',enableCardFees:true,pixRate:0.49,creditCardRate:3,cardFeeCalculationMode:'surcharge',passCardFeeToCustomer:true});
 const ref=store.doc(store.db,'products','pix-fee-test');
 await store.setDoc(ref,{ownerId:'owner',name:'Produto Pix',type:'comum',stock:10,unitCost:50,basePrice:100,unitsPerPackage:1});
 const item={productId:'pix-fee-test',name:'Produto Pix',format:'Padrão',quantity:1,price:100,unitCost:50,stockDeduction:1};
 await api.recordSale({total:100,type:'card',paymentMethod:'pix_machine',customerId:''},[item],[]);
 await api.recordSale({total:100,type:'card',paymentMethod:'pix',customerId:''},[item],[]);
 await assert.rejects(api.recordSale({total:100,type:'card',paymentMethod:'credit',customerId:''},[item],[]),/taxa mudou/);
 assert.equal((await store.getDoc(ref)).data().stock,8);
 await api.recordSale({total:103,type:'card',paymentMethod:'credit',customerId:''},[item],[]);
 const rows=(await store.getDocs(store.collection(store.db,'sales'))).docs.map(doc=>doc.data()).filter(row=>row.itemsSummary.includes('Produto Pix'));
 const machine=rows.find(row=>row.paymentMethod==='pix_machine'),direct=rows.find(row=>row.paymentMethod==='pix');
 assert.equal(machine.total,100);assert.equal(machine.feeAmount,0.49);assert.equal(machine.netTotal,99.51);assert.equal(machine.surchargeAmount,0);
 assert.equal(direct.total,100);assert.equal(direct.feeAmount,0);assert.equal(direct.netTotal,100);
 await store.updateDoc(settingsRef,{pixRate:10});
 assert.equal(machine.feeAmount,0.49);
});

test('shop currency persists independently of language without converting product values',async t=>{
 const ref=store.doc(store.db,'settings','owner'),before=await store.getDoc(ref);
 t.after(async()=>{if(before.exists())await store.setDoc(ref,before.data());else await store.deleteDoc(ref);});
 const productRef=store.doc(store.db,'products','currency-product');
 await store.setDoc(productRef,{ownerId:'owner',name:'Original',type:'comum',stock:5,basePrice:100,unitCost:40});
 await api.updateSettings({currency:'USD'});
 await api.updateSettings({language:'es'});
 assert.equal((await store.getDoc(ref)).data().currency,'USD');
 assert.equal((await store.getDoc(ref)).data().language,'es');
 assert.equal((await store.getDoc(productRef)).data().basePrice,100);assert.equal((await store.getDoc(productRef)).data().unitCost,40);
 await assert.rejects(api.updateSettings({currency:'GBP'}),/BRL, USD ou EUR/);
 assert.equal((await store.getDoc(ref)).data().currency,'USD');
});


test('last Fiado activity reads paginated financial dates only and excludes cash sales and another shop',async()=>{
 for(let i=0;i<1001;i++){
  const id='legacy-date-'+i;
  records.set(key('eu_sales','sales',id),{id,collection_path:'sales',owner_id:'owner',revision:1,data:{ownerId:'owner',customerId:'legacy-client',type:'fiado',createdAt:i+10}});
 }
 for(const [table,id,owner,customer,type,createdAt]of [
  ['eu_payments','legacy-payment','owner','legacy-client',undefined,1100],
  ['eu_sales','cash-not-fiado','owner','legacy-client','cash',99999],
  ['eu_payments','foreign-payment','other','foreign-client',undefined,999999]
 ]){
  records.set(key(table,table==='eu_sales'?'sales':'payments',id),{id,collection_path:table==='eu_sales'?'sales':'payments',owner_id:owner,revision:1,data:{ownerId:owner,customerId:customer,type,createdAt}});
 }
 const dates=await api.getCustomerLastMovements();
 assert.equal(dates['legacy-client'],1100);assert.equal(dates['foreign-client'],undefined);
 assert.ok(calls.some(call=>call.url.includes('offset=1000')&&call.url.includes('eu_sales')));
});
test('editing customer details keeps the last financial activity date unchanged',async()=>{
 const ref=store.doc(store.db,'customers','dated-customer');
 await store.setDoc(ref,{ownerId:'owner',name:'Original',previousDebt:0,totalDebt:10,lastMovementAt:12345});
 await api.updateCustomer('dated-customer',{name:'Nome atualizado'});
 assert.equal((await store.getDoc(ref)).data().lastMovementAt,12345);
 await api.recordPayment('dated-customer',1,'cash');
 assert.ok((await store.getDoc(ref)).data().lastMovementAt>12345);
});

test('notebook import adds debt atomically, records lines without sales and is safe to retry',async()=>{
 const ref=store.doc(store.db,'customers','notebook-existing');
 await store.setDoc(ref,{ownerId:'owner',name:'José',previousDebt:10,totalDebt:25,createdAt:1});
 const entries=[{id:'notebook-first',customerId:'notebook-existing',name:'JOSE',lines:[{description:'Pão',amount:2.1},{description:'Leite',amount:3.2}],readTotal:6,amount:5.3},{id:'notebook-second',customerId:'notebook-existing',name:'José',lines:[{description:'Café',amount:4.7}],readTotal:4.7,amount:4.7}];
 const beforeSales=[...records.keys()].filter(k=>k.startsWith('eu_sales/')).length;
 await assert.rejects(api.importDebtNotebook(entries,false),/Confirme/);
 forcedConflicts=1;
 await api.importDebtNotebook(entries,true);
 await api.importDebtNotebook(entries,true);
 const customer=(await store.getDoc(ref)).data();
 assert.equal(customer.totalDebt,35);assert.equal(customer.previousDebt,10);assert.equal(customer.name,'José');
 assert.equal(customer.debtImports.length,2);assert.equal(customer.debtImports[0].summedTotal,5.3);assert.equal(customer.debtImports[0].readTotal,6);
 assert.match(customer.debtImports[0].description,/Importado da caderneta em \d{2}\/\d{2}/);
 assert.equal([...records.keys()].filter(k=>k.startsWith('eu_sales/')).length,beforeSales);
 assert.doesNotMatch(JSON.stringify(customer),/base64|imageUrl|fileBase64/);
 await api.importDebtNotebook([{...entries[0],id:'notebook-new',customerId:undefined,name:'Maria'}],true);
 await api.importDebtNotebook([{...entries[0],id:'notebook-new',customerId:undefined,name:'Maria'}],true);
 assert.equal((await store.getDoc(store.doc(store.db,'customers','notebook_notebook-new'))).data().totalDebt,5.3);
});

test('employees accept simple temporary PINs and require a durable first-access change without changing unrelated data',async()=>{
 for(const pin of ['1234','1111','0000']) {
  const temporaryId=await api.addEmployee({name:'Inicial',role:'Caixa',pin,isActive:true});
  const temporary=(await store.getDoc(store.doc(store.db,'employees',temporaryId))).data();
  assert.equal(temporary.pin,pin);assert.equal(temporary.mustChangePin,true);
  await api.changeEmployeeFirstPin(temporaryId,pin,'6248');
  const personal=(await store.getDoc(store.doc(store.db,'employees',temporaryId))).data();
  assert.equal(personal.pin,'6248');assert.equal(personal.mustChangePin,false);
 }
 const id=await api.addEmployee({name:'Ana',role:'Caixa',pin:'5739',email:'ana@example.com',isActive:true});
 const ref=store.doc(store.db,'employees',id);
 assert.equal((await store.getDoc(ref)).data().mustChangePin,true);
 await assert.rejects(api.changeEmployeeFirstPin(id,'wrong','6248'),/incorreta/);
 await assert.rejects(api.changeEmployeeFirstPin(id,'5739','0000'),/sequências/);
 await assert.rejects(api.changeEmployeeFirstPin(id,'5739','5739'),/diferente/);
 forcedConflicts=1;await api.changeEmployeeFirstPin(id,'5739','6248');
 const changed=(await store.getDoc(ref)).data();
 assert.equal(changed.pin,'6248');assert.equal(changed.mustChangePin,false);assert.ok(changed.pinChangedAt);assert.equal(changed.name,'Ana');
 await api.updateEmployee(id,{name:'Ana Maria',pin:'6248'});assert.equal((await store.getDoc(ref)).data().mustChangePin,false);
 await api.updateEmployee(id,{pin:'9537'});assert.equal((await store.getDoc(ref)).data().mustChangePin,true);
 await api.updateEmployee(id,{pin:'1111'});
 assert.equal((await store.getDoc(ref)).data().pin,'1111');
 assert.equal((await store.getDoc(ref)).data().mustChangePin,true);
});
test('team invitation creates only one employee, uses store name and never places a PIN in the invitation document',async()=>{
 await store.setDoc(store.doc(store.db,'settings','owner'),{ownerId:'owner',storeName:'Banca da Lu'});
 await assert.rejects(api.createTeamInvitation({email:'invite@test.invalid',name:'Convidada',role:'Caixa',pin:'12'}),/4 a 64/);
 const first=await api.createTeamInvitation({email:'invite@test.invalid',name:'Convidada',role:'Caixa',pin:'1234'});
 const second=await api.createTeamInvitation({email:'invite@test.invalid',name:'Convidada',role:'Caixa',pin:'6248'});
 assert.equal(first.storeName,'Banca da Lu');assert.notEqual(first.inviteId,second.inviteId);
 const invite=(await store.getDoc(store.doc(store.db,'teamInvitations',first.inviteId))).data();
 assert.equal(invite.storeName,'Banca da Lu');assert.equal(invite.pin,undefined);
 // Check both the invitation and employee records.
 const employees=await store.getDocs(store.query(store.collection(store.db,'employees'),store.where('ownerId','==','owner')));
 assert.equal(employees.docs.filter(row=>row.data().email==='invite@test.invalid').length,1);
 assert.ok(employees.docs.some(row=>row.data().email==='ana@example.com'));
});

test('bonus rules persist per store without overwriting settings and validate both products',async()=>{
 const products=['bonus-camel','bonus-winston'];
 for(const id of products)await store.setDoc(store.doc(store.db,'products',id),{ownerId:'owner',name:id,type:'cigarro',stockUnit:'carteira',stock:0,unitCost:10,basePrice:15,unitsPerPackage:10});
 const settingsRef=store.doc(store.db,'settings','owner'),before=(await store.getDoc(settingsRef)).data();
 const rule={id:'bonus-rule',supplier:'Distribuidora',productId:products[0],buyQuantity:10,buyUnit:'maco',bonusProductId:products[1],bonusQuantity:1,bonusUnit:'maco'};
 await api.saveBonusRule(rule);
 const settings=(await store.getDoc(settingsRef)).data();assert.equal(settings.storeName,before.storeName);assert.deepEqual(settings.bonusRules,[rule]);
 await assert.rejects(api.saveBonusRule({...rule,buyQuantity:0}),/quantidades/);
 await api.saveBonusRule(null,rule.id);assert.deepEqual((await store.getDoc(settingsRef)).data().bonusRules,[]);
});
test('same-product bonus updates stock and effective cost atomically, retries do not duplicate bonus entries or create sales',async()=>{
 const id='bonus-camel',ref=store.doc(store.db,'products',id);await store.updateDoc(ref,{stock:0,unitCost:10});
 const salesBefore=(await store.getDocs(store.collection(store.db,'sales'))).size;
 forcedConflicts=2;
 const purchaseId=await api.recordPurchase({productId:id,productName:'Camel',quantity:100,bonusQuantity:10,bonusProductId:id,unitCost:10,totalCost:1000,date:'2026-10-21'},{updateUnitCost:true});
 const p=(await store.getDoc(ref)).data(),purchase=(await store.getDoc(store.doc(store.db,'purchases',purchaseId))).data();
 assert.equal(p.stock,110);assert.equal(p.unitCost,1000/110);assert.equal(purchase.effectiveUnitCost,1000/110);assert.equal(purchase.bonusSavings,100);
 const bonusEntries=(await store.getDocs(store.collection(store.db,'movements'))).docs.map(d=>d.data()).filter(m=>m.entryKind==='bonus' && m.notes===`Compra ${purchaseId}`);
 assert.equal(bonusEntries.length,1);assert.equal(bonusEntries[0].quantity,10);assert.equal(bonusEntries[0].type,'stock_in');assert.equal(bonusEntries[0].amount,0);
 assert.equal((await store.getDocs(store.collection(store.db,'sales'))).size,salesBefore);
 await api.deletePurchase(purchaseId,{productId:id,quantityToSubtract:1});assert.equal((await store.getDoc(ref)).data().stock,0);
});
test('cross-product bonus splits acquisition cost, uses actual stock and rolls back both products on deletion',async()=>{
 const ref=store.doc(store.db,'products','bonus-camel'),other=store.doc(store.db,'products','bonus-winston');
 await store.updateDoc(ref,{stock:5});await store.updateDoc(other,{stock:2});
 const id=await api.recordPurchase({productId:ref.id,productName:'Camel',quantity:100,bonusProductId:other.id,bonusQuantity:10,unitCost:10,totalCost:1000,date:'2026-10-21'},{updateUnitCost:false});
 assert.equal((await store.getDoc(ref)).data().stock,105);assert.equal((await store.getDoc(other)).data().stock,12);
 assert.equal((await store.getDoc(ref)).data().unitCost,1000/110);assert.equal((await store.getDoc(other)).data().unitCost,(2*10+10*(1000/110))/12);
 await store.updateDoc(other,{stock:1});
 await assert.rejects(api.deletePurchase(id,{productId:ref.id,quantityToSubtract:100}),/já saiu/);
 assert.ok((await store.getDoc(store.doc(store.db,'purchases',id))).exists());assert.equal((await store.getDoc(ref)).data().stock,105);
 await store.updateDoc(other,{stock:12});await api.deletePurchase(id,{productId:ref.id,quantityToSubtract:100});
 assert.equal((await store.getDoc(ref)).data().stock,5);assert.equal((await store.getDoc(other)).data().stock,2);
});
test('a later sale uses the effective purchase cost for profit, while bonus itself creates no revenue',async()=>{
 const ref=store.doc(store.db,'products','bonus-profit');
 await store.setDoc(ref,{ownerId:'owner',name:'Produto bônus',type:'comum',stock:0,unitCost:10,basePrice:15,unitsPerPackage:1});
 await api.recordPurchase({productId:ref.id,productName:'Produto bônus',quantity:100,bonusQuantity:10,bonusProductId:ref.id,unitCost:10,totalCost:1000,date:'2026-10-21'});
 await api.recordSale({total:15,type:'cash',customerId:''},[{productId:ref.id,name:'Produto bônus',format:'Padrão',quantity:1,price:15,unitCost:999,stockDeduction:1}],[]);
 const sales=(await store.getDocs(store.collection(store.db,'sales'))).docs.filter(d=>d.data().itemsSummary?.includes('Produto bônus'));
 assert.equal(sales.length,1);assert.equal(sales[0].data().total,15);
 const items=await api.getSaleItems(sales[0].id);assert.equal(items[0].unitCost,1000/110);
 assert.ok(Math.abs((items[0].price-items[0].unitCost)-(15-1000/110))<1e-10);
 assert.equal((await store.getDoc(ref)).data().stock,109);
});

test('weighted purchases keep last receipt cost separate, never change prices or rewrite previous sales/purchases',async()=>{
 const ref=store.doc(store.db,'products','average-cost');
 await store.setDoc(ref,{ownerId:'owner',name:'Média',type:'comum',stock:100,unitCost:10,basePrice:15,unitsPerPackage:1});
 const pastPurchase=store.doc(store.db,'purchases','historical-average'),pastSale=store.doc(store.db,'sales','historical-average');
 await store.setDoc(pastPurchase,{ownerId:'owner',productId:ref.id,unitCost:7,totalCost:70,quantity:10});await store.setDoc(pastSale,{ownerId:'owner',total:20});
 const id=await api.recordPurchase({productId:ref.id,productName:'Média',quantity:100,unitCost:12,totalCost:1200,date:'2026-10-21'},{updateUnitCost:false});
 const current=(await store.getDoc(ref)).data();assert.equal(current.stock,200);assert.equal(current.unitCost,11);assert.equal(current.lastCost,12);assert.equal(current.basePrice,15);
 assert.equal(current.pendingPriceReview.prices[0].newPrice,16.5);
 const purchase=(await store.getDoc(store.doc(store.db,'purchases',id))).data();assert.equal(purchase.unitCost,12);assert.equal(purchase.effectiveUnitCost,12);assert.equal(purchase.averageCostAfter,11);
 assert.equal((await store.getDoc(pastPurchase)).data().unitCost,7);assert.equal((await store.getDoc(pastSale)).data().total,20);
 await api.recordSale({total:15,type:'cash',customerId:''},[{productId:ref.id,name:'Média',format:'Padrão',quantity:1,price:15,unitCost:999,stockDeduction:1}],[]);
 const sale=(await store.getDocs(store.collection(store.db,'sales'))).docs.find(d=>d.data().itemsSummary?.includes('Média'));
 assert.equal((await api.getSaleItems(sale.id))[0].unitCost,11);
});
test('Accept is atomic and audited, Keep never changes prices, and outdated cost reviews cannot overwrite newer decisions',async()=>{
 const ref=store.doc(store.db,'products','average-cost');let p=(await store.getDoc(ref)).data();
 await api.resolvePriceReview(ref.id,p.pendingPriceReview.id,false);p=(await store.getDoc(ref)).data();assert.equal(p.basePrice,15);assert.equal(p.pendingPriceReview,null);
 await api.recordPurchase({productId:ref.id,productName:'Média',quantity:100,unitCost:15,totalCost:1500,date:'2026-10-21'});
 p=(await store.getDoc(ref)).data();const review=p.pendingPriceReview;
 forcedConflicts=2;await api.resolvePriceReview(ref.id,review.id,true);
 const after=(await store.getDoc(ref)).data();assert.equal(after.basePrice,review.prices[0].newPrice);assert.equal(after.pendingPriceReview,null);
 const audit=(await store.getDocs(store.collection(store.db,'movements'))).docs.map(d=>d.data()).filter(m=>m.entityId===ref.id && m.priceChanges?.length);
 assert.equal(audit.length,1);assert.equal(audit[0].priceChanges[0].oldPrice,15);assert.equal(audit[0].priceChanges[0].newPrice,after.basePrice);assert.equal(audit[0].actorUserId,'owner');assert.ok(audit[0].timestamp);
 await assert.rejects(api.resolvePriceReview(ref.id,review.id,true),/outro aparelho/);
});
test('all direct product price edits are audited with exact previous prices, and manual edits clear stale reviews',async()=>{
 const ref=store.doc(store.db,'products','average-cost');const p=(await store.getDoc(ref)).data();
 await api.updateProduct(ref.id,{basePrice:p.basePrice+0.5});
 const audits=(await store.getDocs(store.collection(store.db,'movements'))).docs.map(d=>d.data()).filter(m=>m.entityId===ref.id && m.priceChanges?.length);
 assert.equal(audits.length,2);const edit=audits.find(m=>m.priceChanges[0].oldPrice===p.basePrice);assert.equal(edit.priceChanges[0].newPrice,p.basePrice+0.5);
});
test('cigarette receipt averages carteiras and accepts all enabled fractional prices together',async()=>{
 const ref=store.doc(store.db,'products','average-cigarette');
 await store.setDoc(ref,{ownerId:'owner',name:'Média Cigarro',type:'cigarro',stockUnit:'carteira',stock:10,unitCost:10,priceCart:15,priceHalfCart:8,priceUnit:1,pricePack:0,basePrice:1,unitsPerPackage:10});
 await api.recordPurchase({productId:ref.id,productName:'Média Cigarro',quantity:10,unitCost:12,totalCost:120,date:'2026-10-21'});
 const p=(await store.getDoc(ref)).data();assert.equal(p.stock,20);assert.equal(p.unitCost,11);assert.equal(p.lastCost,12);
 assert.deepEqual(p.pendingPriceReview.prices.map(x=>x.field),['priceCart','priceHalfCart','priceUnit']);
 await api.resolvePriceReview(ref.id,p.pendingPriceReview.id,true);
 const next=(await store.getDoc(ref)).data();assert.equal(next.priceCart,16.5);assert.equal(next.priceHalfCart,9);assert.equal(next.priceUnit,1);assert.equal(next.pricePack,0);
 const audits=(await store.getDocs(store.collection(store.db,'movements'))).docs.map(d=>d.data()).filter(m=>m.entityId===ref.id && m.priceChanges?.length);
 assert.equal(audits.length,1);assert.deepEqual(audits[0].priceChanges.map(c=>c.field),['priceCart','priceHalfCart']);
});
