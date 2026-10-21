import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;const migration=await readFile(new URL('../supabase/migrations/20261017_team_permissions_shifts.sql',import.meta.url),'utf8');
const claims=id=>({sub:id,email:id+'@test.invalid',email_verified:true,iss:'https://securetoken.google.com/comercio-em-crescimento',aud:'comercio-em-crescimento'});
async function user(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims(id))]);await db.exec('set role authenticated');}
async function rpc(name,args){const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query(`select public.${name}(${placeholders}) as value`,args)).rows[0].value;}
const op=(table,id,data,action='set')=>({table:'eu_'+table,path:{store_settings:'settings',sale_items:'saleItems',team_invitations:'teamInvitations',user_stores:'userStores'}[table]||table,id,data,action});
const apply=ops=>rpc('eu_apply_changes',[JSON.stringify(ops),'[]',crypto.randomUUID()]);
before(async()=>{
 db=new PGlite();await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.jwt() to authenticated,anon;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261014_cloud_source_of_truth.sql',import.meta.url),'utf8'));
 await db.exec(migration);await db.exec(migration);
 const merges=await readFile(new URL('../supabase/migrations/20261021_owner_product_merges.sql',import.meta.url),'utf8');await db.exec(merges);await db.exec(merges);
 await user('owner');await apply([op('store_settings','owner',{ownerId:'owner',storeName:'Loja',dailyGoal:100,enableCardFees:true,pixRate:.49,creditCardRate:3.5,passCardFeeToCustomer:true,cardFeeCalculationMode:'surcharge'}),op('products','p',{ownerId:'owner',name:'Produto',type:'comum',stock:10,unitCost:3,basePrice:5,unitsPerPackage:6}),op('products','c',{ownerId:'owner',name:'Cigarro',type:'cigarro',stockUnit:'carteira',stock:2,unitCost:10,priceCart:20,priceHalfCart:11,priceUnit:2,pricePack:180,unitsPerPackage:10}),op('customers','customer',{ownerId:'owner',name:'Cliente',totalDebt:20})]);
 for(const [id,role]of [['staff','Operador de Caixa'],['manager','Gerente de Loja']]){
  await user('owner');await apply([op('employees',id+'-record',{ownerId:'owner',name:id,email:id+'@test.invalid',role,pin:'6248',isActive:true,mustChangePin:false}),op('team_invitations','invite-'+id,{ownerId:'owner',email:id+'@test.invalid',name:id,role,status:'pending'})]);
  await user(id);await rpc('eu_accept_invitation',['invite-'+id]);
 }
});
after(async()=>await db?.close());
test('staff raw reads do not expose costs, fees or other employee PINs; safe projection enforces store ownership',async()=>{
 await user('staff');assert.equal((await rpc('eu_access_context',['owner'])).role,'employee');
 for(const table of ['eu_products','eu_store_settings','eu_employees','eu_purchases'])assert.equal((await db.query('select * from '+table)).rows.length,0);
 const products=await rpc('eu_staff_read',['owner','eu_products','products',null,'[]',0]);assert.equal(products.length,2);assert.equal(products[0].data.unitCost,undefined);
 const settings=await rpc('eu_staff_read',['owner','eu_store_settings','settings',null,'[]',0]);assert.equal(settings[0].data.pixRate,undefined);assert.equal(settings[0].data.dailyGoal,100);
 const employees=await rpc('eu_staff_read',['owner','eu_employees','employees',null,'[]',0]);assert.deepEqual(employees.map(r=>r.id),['staff-record']);
 await assert.rejects(rpc('eu_staff_read',['another','eu_products','products',null,'[]',0]),/Permission denied/);
 await assert.rejects(apply([op('employees','manager-record',{pin:'1111'},'update')]),/Permission denied/);
 await assert.rejects(apply([op('products','p',{unitCost:0},'update')]),/Permission denied/);
 await assert.rejects(rpc('eu_apply_changes_internal',['[]','[]','bypass']),/permission denied/);
 await assert.rejects(rpc('eu_set_owner_pin',['owner','5739','']),/Owner required/);
});
test('staff shift starts once, sale deducts exact fractions and records true internal cost without exposing it',async()=>{
 await user('staff');const first=await rpc('eu_shift_action',['owner','start','staff-record']),second=await rpc('eu_shift_action',['owner','start','staff-record']);assert.equal(first.id,second.id);
 const input={type:'cash',paymentMethod:'cash',total:11,employeeId:'owner'};
 const items=[{productId:'c',format:'Meia carteira',quantity:1,price:11,stockDeduction:.5,unitCost:0}];
 await rpc('eu_staff_sale',['owner','sale-one',JSON.stringify(input),JSON.stringify(items)]);
 await rpc('eu_staff_sale',['owner','sale-one',JSON.stringify(input),JSON.stringify(items)]);
 const safe=await rpc('eu_staff_read',['owner','eu_sales','sales',null,'[]',0]);assert.equal(safe.length,1);assert.equal(safe[0].data.employeeId,'staff-record');assert.equal(safe[0].data.feeAmount,undefined);
 await user('owner');assert.equal((await db.query("select data from eu_products where id='c'")).rows[0].data.stock,1.5);
 assert.equal((await db.query("select data from eu_sale_items where collection_path='sales/sale-one/saleItems'")).rows[0].data.unitCost,5);
 await user('staff');await rpc('eu_shift_action',['owner','end','staff-record']);
 await assert.rejects(rpc('eu_staff_sale',['owner','no-shift',JSON.stringify(input),JSON.stringify(items)]),/Start your shift/);
});
test('midnight reconciliation closes forgotten shifts at the correct boundary and writes an idempotent end event',async()=>{
 await user('owner');await db.exec('reset role');
 const started=Date.UTC(2026,0,1,20),boundary=Date.UTC(2026,0,2,3);
 await db.query("insert into eu_shifts values('old','owner','manager','manager',$1,null,'open')",[started]);
 await db.query('select public.eu_close_overdue_shifts()');await db.query('select public.eu_close_overdue_shifts()');
 const row=(await db.query("select * from eu_shifts where id='old'")).rows[0];assert.equal(Number(row.ended_at),boundary);assert.equal(row.status,'not_closed');
 assert.equal((await db.query("select * from eu_movements where id='shift_end_old'")).rows.length,1);
 await user('owner');
});
test('product/customer deletions and clear-all require a server-validated one-time owner PIN approval',async()=>{
 await user('owner');await assert.rejects(apply([op('products','p',undefined,'delete')]),/Owner PIN required/);
 await assert.rejects(db.query("delete from eu_products where id='p'"),/Owner PIN required/);
 await rpc('eu_set_owner_pin',['owner','5739','']);
 const wrong=await rpc('eu_approve_deletion',['owner','0000',JSON.stringify([{table:'eu_products',id:'p'}])]);assert.equal(wrong.ok,false);
 const grant=await rpc('eu_approve_deletion',['owner','5739',JSON.stringify([{table:'eu_products',id:'p'}])]);assert.equal(grant.ok,true);
 await apply([{...op('products','p',undefined,'delete'),ownerApproval:grant.token}]);
 await assert.rejects(apply([{...op('customers','customer',undefined,'delete'),ownerApproval:grant.token}]),/Owner PIN required/);
 await assert.rejects(rpc('eu_clear_account_data',[null]),/Owner PIN required/);
 await user('manager');assert.equal((await rpc('eu_access_context',['owner'])).role,'manager');
 const approval=await rpc('eu_approve_deletion',['owner','5739',JSON.stringify([{table:'eu_customers',id:'customer'}])]);
 await apply([{...op('customers','customer',undefined,'delete'),ownerApproval:approval.token}]);
 await assert.rejects(rpc('eu_set_owner_pin',['owner','9537','5739']),/Owner required/);
});
test('receiving debt is atomic and idempotent, requires own open shift and a changed personal PIN',async()=>{
 await user('owner');await apply([op('customers','receive-customer',{ownerId:'owner',name:'Receber',totalDebt:15})]);
 await user('staff');await rpc('eu_shift_action',['owner','start','staff-record']);
 await rpc('eu_staff_receive',['owner','payment-1','receive-customer',5,'cash']);await rpc('eu_staff_receive',['owner','payment-1','receive-customer',5,'cash']);
 await assert.rejects(rpc('eu_staff_receive',['owner','payment-too-large','receive-customer',100,'cash']),/Invalid debt/);
 await assert.rejects(rpc('eu_shift_action',['owner','end','manager-record']),/Own shift/);
 await user('owner');assert.equal((await db.query("select data from eu_customers where id='receive-customer'")).rows[0].data.totalDebt,10);
 await apply([op('employees','staff-record',{pin:'0000',mustChangePin:true},'update')]);
 await user('staff');await assert.rejects(rpc('eu_staff_receive',['owner','temporary-pin','receive-customer',1,'cash']),/Change your temporary PIN/);
 await assert.rejects(rpc('eu_change_own_pin',['owner','0000','1111']),/personal PIN/);
 await rpc('eu_change_own_pin',['owner','0000','9537']);
 await rpc('eu_staff_receive',['owner','personal-pin','receive-customer',1,'cash']);
 await user('owner');assert.equal((await db.query("select data from eu_customers where id='receive-customer'")).rows[0].data.totalDebt,9);
 assert.equal((await db.query("select data from eu_employees where id='manager-record'")).rows[0].data.pin,'6248');
});
test('a shared owner terminal can sell as its selected operator, but staff cannot impersonate another operator',async()=>{
 await user('staff');const items=[{productId:'c',format:'Unidade',quantity:1,price:2,stockDeduction:.05}];
 await assert.rejects(rpc('eu_staff_sale',['owner','impersonation',JSON.stringify({type:'cash',total:2}),JSON.stringify(items),'manager-record']),/Own employee/);
 await user('owner');await rpc('eu_staff_sale',['owner','delegated',JSON.stringify({type:'cash',total:2}),JSON.stringify(items),'staff-record']);
 assert.equal((await db.query("select data from eu_sales where id='delegated'")).rows[0].data.employeeId,'staff-record');
});
test('disabled latest employee stays denied even with an older active duplicate or forged browser role',async()=>{
 await user('owner');await apply([op('employees','old-staff',{ownerId:'owner',name:'Old',email:'staff@test.invalid',role:'Gerente',isActive:true,updatedAt:1}),op('employees','staff-record',{role:'Auxiliar Geral',updatedAt:2},'update')]);
 await user('staff');assert.equal((await rpc('eu_access_context',['owner'])).role,'employee');
 await assert.rejects(apply([op('employees','staff-record',{role:'Gerente'},'update')]),/Permission denied/);
 await user('owner');await apply([op('employees','staff-record',{isActive:false,updatedAt:3},'update')]);
 await user('staff');await assert.rejects(rpc('eu_access_context',['owner']),/Permission denied/);
 await assert.rejects(rpc('eu_staff_read',['owner','eu_employees','employees',null,'[]',0]),/Permission denied/);
});
test('only the owner may archive a merged product or change historical merge IDs, including raw REST-style updates',async()=>{
 await user('owner');await apply([op('products','merge-guard',{ownerId:'owner',name:'Guard',type:'comum',stock:2,unitCost:1})]);
 await user('manager');await apply([op('products','merge-guard',{stock:3},'update')]);
 await assert.rejects(apply([op('products','merge-guard',{mergedIntoId:'p',stock:0},'update')]),/Only the store owner/);
 await assert.rejects(db.query("update eu_products set data=data || '{\"mergedProductIds\":[\"source\"]}'::jsonb where id='merge-guard'"),/Only the store owner/);
 await user('owner');await apply([op('products','merge-guard',{mergedIntoId:'p',mergedAt:Date.now(),stock:0},'update')]);
 assert.equal((await db.query("select data->>'mergedIntoId' as target from eu_products where id='merge-guard'")).rows[0].target,'p');
});

test('clear-all also needs a correctly scoped approval and cannot call the private primitive',async()=>{
 await user('manager');await assert.rejects(rpc('eu_clear_account_data_internal',[]),/permission denied/);
 await assert.rejects(rpc('eu_clear_account_data',[null]),/Owner PIN required/);
 await user('owner');const approval=await rpc('eu_approve_deletion',['owner','5739',JSON.stringify([{table:'*',id:'*'}])]);
 await rpc('eu_clear_account_data',[approval.token]);
 assert.equal((await db.query('select * from eu_products')).rows.length,0);assert.equal((await db.query('select * from eu_customers')).rows.length,0);
 await assert.rejects(rpc('eu_clear_account_data',[approval.token]),/Owner PIN required/);
});
