import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('user language RLS isolates accounts regardless of their store membership',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role authenticated; create role anon; create function public.eu_user_id() returns text language sql stable as $$select current_setting('test.user',true)$$;");
  const migration=await readFile(new URL('../supabase/migrations/20261016_user_language.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration); // rerunning is safe
  await db.exec("set role anon; select set_config('test.user','owner',false);");
  await db.query("insert into eu_user_preferences(user_id,language) values('owner','en')");
  await assert.rejects(db.query("insert into eu_user_preferences(user_id,language) values('employee','es')"));
  await db.exec("select set_config('test.user','employee',false)");
  assert.equal((await db.query('select * from eu_user_preferences')).rows.length,0);
  await db.query("insert into eu_user_preferences(user_id,language) values('employee','es')");
  await db.query("update eu_user_preferences set language='pt-BR' where user_id='owner'");
  await db.exec("select set_config('test.user','owner',false)");
  assert.equal((await db.query('select language from eu_user_preferences')).rows[0].language,'en');
 }finally{await db.close();}
});
