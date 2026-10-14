import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{mkdtemp,mkdir,rm}from'node:fs/promises';
import{pathToFileURL}from'node:url';
import{build}from'esbuild';
let dir,migrate;
const source=new Map(),destination=new Map(),writes=[];
const snapshot=(path,data)=>({id:path.split('/').at(-1),ref:{path},exists:()=>!!data,data:()=>structuredClone(data)});
const docRead=ref=>snapshot(`${ref.path}/${ref.id}`,source.get(`${ref.path}/${ref.id}`));
const queryRead=ref=>({docs:[...source.entries()].filter(([key,data])=>key.slice(0,key.lastIndexOf('/'))===ref.path&&data.ownerId===ref.owner).map(([path,data])=>snapshot(path,data))});
before(async()=>{
 globalThis.__legacyRead=(ref,isQuery,cached)=>{if(globalThis.__legacyOffline&&!cached)throw new Error('Source offline');return isQuery?queryRead(ref):docRead(ref);};
 globalThis.__cloudRead=ref=>snapshot(ref.path,destination.get(ref.path));
 globalThis.__newBatch=()=>{const operations=[];return{expect(){},set(ref,data){operations.push({ref,data});},update(ref,data){operations.push({ref,data:{...destination.get(ref.path),...data}});},async commit(){if(globalThis.__migrationFail)throw new Error('Destination denied');for(const op of operations){writes.push(op.ref.path);destination.set(op.ref.path,structuredClone(op.data));}}};};
 const cache=new URL('../node_modules/.cache/',import.meta.url);await mkdir(cache,{recursive:true});dir=await mkdtemp(new URL('legacy-migration-',cache));
 await build({entryPoints:[new URL('../src/lib/legacyMigration.ts',import.meta.url).pathname],bundle:true,packages:'external',platform:'node',format:'esm',outfile:`${dir}/migration.mjs`,plugins:[{name:'inject-databases',setup(b){
 b.onResolve({filter:/^(firebase\/app|firebase\/firestore)$/},args=>({path:args.path,namespace:'source-db'}));
 b.onLoad({filter:/.*/,namespace:'source-db'},args=>({contents:args.path==='firebase/app'?'export const getApp=()=>({});':`export const initializeFirestore=()=>({});export const persistentLocalCache=()=>({});export const persistentMultipleTabManager=()=>({});export const doc=(_db,path,id)=>({path,id});export const collection=(_db,path)=>({path});export const where=(_field,_operator,owner)=>owner;export const query=(ref,owner)=>({...ref,owner});export const getDocFromServer=async ref=>globalThis.__legacyRead(ref,false,false);export const getDocsFromServer=async ref=>globalThis.__legacyRead(ref,true,false);export const getDocFromCache=async ref=>globalThis.__legacyRead(ref,false,true);export const getDocsFromCache=async ref=>globalThis.__legacyRead(ref,true,true);`,loader:'js'}));
 b.onResolve({filter:/\/cloudStore$/},()=>({path:'cloud',namespace:'target-db'}));
 b.onLoad({filter:/.*/,namespace:'target-db'},()=>({contents:'export const db={};export const doc=(_db,path,id)=>({path:path+"/"+id,id});export const getDoc=async ref=>globalThis.__cloudRead(ref);export const writeBatch=()=>globalThis.__newBatch();',loader:'js'}));
 }}]});
 migrate=(await import(pathToFileURL(`${dir}/migration.mjs`).href)).migrateLegacyStore;
});
after(async()=>{await rm(dir,{recursive:true,force:true});for(const key of ['__legacyRead','__cloudRead','__newBatch','__legacyOffline','__migrationFail'])delete globalThis[key];});
function setup(){source.clear();destination.clear();writes.length=0;globalThis.__legacyOffline=false;globalThis.__migrationFail=false;
 source.set('settings/owner',{ownerId:'owner',storeName:'Loja antiga'});
 source.set('products/p1',{ownerId:'owner',name:'Produto',type:'comum',stock:10,unitCost:2});
 source.set('products/cig',{ownerId:'owner',name:'Cigarro',type:'cigarro',stock:20,unitCost:.5});
 source.set('sales/s1',{ownerId:'owner',total:5});source.set('sales/s1/saleItems/i1',{ownerId:'owner',productId:'p1',unitCost:2});
}
test('legacy migration preserves live cloud rows, stock conversions, IDs and history; profile is last',async()=>{
 setup();destination.set('products/p1',{ownerId:'owner',name:'Produto editado',stock:3,unitCost:4});
 assert.equal(await migrate('owner'),true);
 assert.equal(destination.get('products/p1').stock,3);assert.equal(destination.get('products/p1').name,'Produto editado');
 assert.equal(destination.get('products/cig').stock,1);assert.equal(destination.get('products/cig').unitCost,10);assert.equal(destination.get('products/cig').stockUnit,'carteira');
 assert.ok(destination.has('sales/s1/saleItems/i1'));assert.equal(writes.at(-1),'settings/owner');
 assert.equal(source.get('products/p1').stock,10);
 const count=writes.length;await migrate('owner');assert.equal(writes.length,count);
});
test('source outage recovers available local cache and marks incomplete migration for later reconciliation',async()=>{
 setup();globalThis.__legacyOffline=true;assert.equal(await migrate('owner'),true);assert.equal(destination.get('settings/owner').legacyMigrationPending,true);
 globalThis.__legacyOffline=false;await migrate('owner');assert.equal(destination.get('settings/owner').legacyMigrationPending,false);
});
test('destination failure never marks the store ready or deletes the legacy records',async()=>{
 setup();globalThis.__migrationFail=true;await assert.rejects(migrate('owner'),/Destination denied/);assert.equal(destination.has('settings/owner'),false);assert.equal(source.size,5);
});
test('unavailable source and an absent cache are not mistaken for a new merchant',async()=>{
 setup();source.clear();globalThis.__legacyOffline=true;await assert.rejects(migrate('owner'),/Source offline/);assert.equal(destination.size,0);
});
