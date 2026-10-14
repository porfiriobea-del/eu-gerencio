import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
let database;
before(async () => {
  database = new PGlite();
  await database.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema public,auth to authenticated,anon;
    grant execute on function auth.jwt() to authenticated,anon;`);
  await database.exec(await readFile(new URL('../supabase/migrations/20261014_cloud_source_of_truth.sql', import.meta.url),'utf8'));
});
after(async () => { await database?.close(); });
async function user(id, email=`${id}@test.invalid`) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,email,email_verified:true,iss:'https://securetoken.google.com/comercio-em-crescimento',aud:'comercio-em-crescimento'})]);
  await database.exec('set role authenticated');
}
const op=(id,data,action='set',table='eu_products',path='products')=>({table,path,id,data,action});
const product=(owner,stock=10)=>({ownerId:owner,name:'Produto',type:'comum',stock,unitCost:1});
async function apply(operations,reads=[],id=crypto.randomUUID()){
  return database.query('select public.eu_apply_changes($1::jsonb,$2::jsonb,$3::text)',[JSON.stringify(operations),JSON.stringify(reads),id]);
}

test('real PostgreSQL migration is repeatable and store data persists across independent sessions',async()=>{
  await user('owner-a');
  await apply([op('p1',product('owner-a')),op('owner-a',{ownerId:'owner-a',storeName:'Minha Loja'},'set','eu_store_settings','settings')]);
  await database.exec('reset role');
  await database.exec(await readFile(new URL('../supabase/migrations/20261014_cloud_source_of_truth.sql', import.meta.url),'utf8'));
  await user('owner-a');
  assert.equal((await database.query('select data from eu_store_settings')).rows[0].data.storeName,'Minha Loja');
  assert.equal((await database.query('select data from eu_products')).rows[0].data.stock,10);
});

test('RLS prevents other stores from reading, editing, creating and deleting another owner records',async()=>{
  await user('owner-b');
  assert.equal((await database.query('select * from eu_products')).rows.length,0);
  await assert.rejects(apply([op('p2',product('owner-a'))]),/row-level security/);
  await assert.rejects(apply([op('p1',{stock:0},'update')]),/does not exist|denied/);
  await apply([op('p1',undefined,'delete')]);
  await user('owner-a');
  assert.equal((await database.query('select data from eu_products')).rows[0].data.stock,10);
});

test('version checks prevent stale stock updates and roll back a whole sale',async()=>{
  await user('owner-a');
  const [row]=(await database.query('select revision from eu_products where id=$1',['p1'])).rows;
  const reads=[{table:'eu_products',path:'products',id:'p1',revision:row.revision}];
  await apply([op('p1',{stock:8},'update')],reads);
  await assert.rejects(apply([op('s1',{ownerId:'owner-a',total:2},'set','eu_sales','sales'),op('p1',{stock:8},'update')],reads),/TRANSACTION_CONFLICT/);
  assert.equal((await database.query('select * from eu_sales')).rows.length,0);
  assert.equal((await database.query('select data from eu_products where id=$1',['p1'])).rows[0].data.stock,8);
});

test('idempotency receipts avoid duplicate writes after repeated confirmations',async()=>{
  await user('owner-a');
  const request='duplicate-confirmation';
  await apply([op('p1',{stock:7},'update')],[],request);
  const revision=(await database.query('select revision from eu_products where id=$1',['p1'])).rows[0].revision;
  await apply([op('p1',{stock:6},'update')],[],request);
  const row=(await database.query('select data,revision from eu_products where id=$1',['p1'])).rows[0];
  assert.equal(row.data.stock,7);assert.equal(row.revision,revision);
});

test('cloud patches preserve unrelated settings and implement field removal',async()=>{
  await user('owner-a');
  await apply([op('owner-a',{phone:'123'},'update','eu_store_settings','settings')]);
  await apply([op('owner-a',{phone:{__eu_delete_field:true},darkMode:true},'update','eu_store_settings','settings')]);
  const row=(await database.query('select data from eu_store_settings')).rows[0].data;
  assert.equal(row.storeName,'Minha Loja');assert.equal(row.darkMode,true);assert.equal(row.phone,undefined);
});

test('invitation acceptance is atomic and membership cannot be forged by another email',async()=>{
  await user('owner-a');
  await apply([op('invite-1',{ownerId:'owner-a',email:'employee@test.invalid',name:'Funcionário',role:'Operador',status:'pending'},'set','eu_team_invitations','teamInvitations')]);
  await user('intruder');
  await assert.rejects(database.query('select public.eu_accept_invitation($1)',['invite-1']),/not for this user/);
  await assert.rejects(apply([op('intruder',{ownerId:'owner-a',userUid:'intruder'},'set','eu_user_stores','userStores')]),/row-level security/);
  await user('employee');
  await database.query('select public.eu_accept_invitation($1)',['invite-1']);
  assert.equal((await database.query('select * from eu_products')).rows.length,1);
  assert.equal((await database.query('select data from eu_user_stores')).rows[0].data.ownerId,'owner-a');
});

test('invalid cigarette balances fail atomically and ownership is immutable',async()=>{
  await user('owner-a');
  await assert.rejects(apply([op('cig',{ownerId:'owner-a',name:'Cigarro',type:'cigarro',stockUnit:'carteira',stock:0.03,unitCost:8})]),/increments/);
  await assert.rejects(apply([op('p1',{ownerId:'owner-b'},'update')]),/immutable|row-level security/);
  assert.equal((await database.query('select owner_id from eu_products where id=$1',['p1'])).rows[0].owner_id,'owner-a');
});


test('API-key-only requests cannot access records or mutations; verified Firebase sub works without a role claim',async()=>{
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'anon'})]);
  await database.exec('set role anon');
  assert.equal((await database.query('select * from eu_products')).rows.length,0);
  await assert.rejects(apply([op('anonymous',product('owner-a'))]),/Authentication required/);
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'owner-a',email:'owner-a@test.invalid',email_verified:true,iss:'https://securetoken.google.com/comercio-em-crescimento',aud:'comercio-em-crescimento'})]);
  await database.exec('set role anon');
  assert.equal((await database.query('select * from eu_products')).rows.length,1);
});


test('a signed identity from another issuer cannot impersonate a Firebase store UID',async()=>{
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'owner-a',email:'owner-a@test.invalid',email_verified:true,iss:'https://other-provider.invalid',aud:'other-project'})]);
  await database.exec('set role authenticated');
  assert.equal((await database.query('select public.eu_user_id() as id')).rows[0].id,null);
  assert.equal((await database.query('select * from eu_products')).rows.length,0);
});

test('account clearing is atomic, stays inside the caller store and prevents archive resurrection',async()=>{
  await user('owner-b');await apply([op('b-product',product('owner-b'))]);
  await user('owner-a');await database.query('select public.eu_clear_account_data()');
  assert.equal((await database.query('select * from eu_products')).rows.length,0);
  const profile=(await database.query('select data from eu_store_settings')).rows[0].data;
  assert.equal(profile.accountDataCleared,true);assert.equal(profile.storeName,'');
  await user('owner-b');assert.equal((await database.query('select * from eu_products')).rows.length,1);
});
