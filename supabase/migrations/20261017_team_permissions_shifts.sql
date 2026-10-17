begin;
-- Apply after the existing migrations. Permissions use verified identity and live employee records.
-- PIN hashes and deletion approvals are private; never place an owner PIN in store settings.
create table if not exists public.eu_owner_credentials(owner_id text primary key,salt text not null,pin_hash text not null);
create table if not exists public.eu_delete_approvals(token text primary key,user_id text not null,owner_id text not null,targets jsonb not null,expires_at timestamptz not null);
create table if not exists public.eu_pin_attempts(user_id text not null,owner_id text not null,attempts integer not null default 0,window_at timestamptz not null default now(),primary key(user_id,owner_id));
alter table public.eu_owner_credentials enable row level security;
alter table public.eu_delete_approvals enable row level security;
alter table public.eu_pin_attempts enable row level security;
revoke all on public.eu_owner_credentials,public.eu_delete_approvals,public.eu_pin_attempts from public,anon,authenticated;
create table if not exists public.eu_shifts(
 id text primary key,owner_id text not null,employee_id text not null,employee_name text not null,
 started_at bigint not null,ended_at bigint,status text not null default 'open' check(status in('open','ended','not_closed')),
 check(ended_at is null or ended_at>=started_at));
create unique index if not exists eu_one_open_shift on public.eu_shifts(owner_id,employee_id) where status='open';
alter table public.eu_shifts enable row level security;
revoke all on public.eu_shifts from public,anon,authenticated;

create or replace function public.eu_access_level(store_id text) returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare member jsonb; employee jsonb; caller text:=public.eu_user_id();
begin
 if caller is null then return null; end if;
 if caller=store_id then return 'owner'; end if;
 select data into member from public.eu_user_stores where id=caller and owner_id=store_id and data->>'userUid'=caller;
 if member is null then return null;end if;
 select data into employee from public.eu_employees where owner_id=store_id
 and (lower(trim(data->>'email'))=lower(trim(auth.jwt()->>'email')) or id=caller) order by coalesce((data->>'updatedAt')::bigint,(data->>'createdAt')::bigint,0) desc,id limit 1;
 if employee is null or not coalesce((employee->>'isActive')::boolean,true) then return null;end if;
 return case when lower(employee->>'role') like 'gerente%' or lower(employee->>'role') like 'manager%' then 'manager' else 'employee' end;
end $$;
create or replace function public.eu_actor_employee(store_id text) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select id from (select id,data from public.eu_employees where owner_id=store_id
 and (lower(trim(data->>'email'))=lower(trim(auth.jwt()->>'email')) or id=public.eu_user_id())
 order by coalesce((data->>'updatedAt')::bigint,(data->>'createdAt')::bigint,0) desc,id limit 1) employee
 where coalesce((data->>'isActive')::boolean,true) and public.eu_access_level(store_id) is not null
$$;

-- Deny raw reads/writes for staff: safe projection RPCs below hide costs and other people's PINs.
do $$declare name text;begin
 foreach name in array array['eu_store_settings','eu_products','eu_customers','eu_sales','eu_sale_items','eu_payments','eu_purchases','eu_cash_closures','eu_employees','eu_movements','eu_feedbacks'] loop
 execute format('drop policy if exists eu_store_access on public.%I',name);
 execute format('create policy eu_store_access on public.%I to authenticated,anon using(public.eu_access_level(owner_id) in (''owner'',''manager'')) with check(public.eu_access_level(owner_id) in (''owner'',''manager''))',name);
 end loop;
end $$;
drop policy if exists eu_invitation_read on public.eu_team_invitations;
create policy eu_invitation_read on public.eu_team_invitations for select to authenticated,anon using(
 public.eu_access_level(owner_id) in ('owner','manager') or (data->>'status'='pending' and lower(data->>'email')=lower(auth.jwt()->>'email') and public.eu_user_id() is not null));

update public.eu_team_invitations set data=data-'pin' where data ? 'pin';

create or replace function public.eu_owner_pin_state(store_id text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$begin
 if public.eu_access_level(store_id) not in ('owner','manager') or public.eu_access_level(store_id) is null then raise exception 'Permission denied';end if;
 return exists(select 1 from public.eu_owner_credentials where owner_id=store_id);
end $$;
create or replace function public.eu_set_owner_pin(store_id text,new_pin text,old_pin text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare credential public.eu_owner_credentials; new_salt text:=gen_random_uuid()::text;
begin
 if public.eu_user_id() is distinct from store_id then raise exception 'Owner required';end if;
 if length(trim(new_pin))<4 or length(trim(new_pin))>64 or trim(new_pin) in ('1234','1111','0000','4321') then raise exception 'Choose a personal owner PIN';end if;
 perform pg_advisory_xact_lock(hashtextextended(store_id,7));
 select * into credential from public.eu_owner_credentials where owner_id=store_id for update;
 if found and credential.pin_hash<>encode(sha256(convert_to(credential.salt||old_pin,'UTF8')),'hex') then raise exception 'Wrong owner PIN';end if;
 insert into public.eu_owner_credentials values(store_id,new_salt,encode(sha256(convert_to(new_salt||trim(new_pin),'UTF8')),'hex'))
 on conflict(owner_id) do update set salt=excluded.salt,pin_hash=excluded.pin_hash;
 delete from public.eu_delete_approvals where owner_id=store_id;
end $$;
create or replace function public.eu_approve_deletion(store_id text,pin text,targets jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare credential public.eu_owner_credentials; attempt public.eu_pin_attempts; approval text:=gen_random_uuid()::text;
begin
 if coalesce(public.eu_access_level(store_id),'') not in ('owner','manager') then raise exception 'Management required';end if;
 if jsonb_typeof(targets)<>'array' or jsonb_array_length(targets) not between 1 and 500 then raise exception 'Invalid targets';end if;
 insert into public.eu_pin_attempts(user_id,owner_id) values(public.eu_user_id(),store_id) on conflict do nothing;
 select * into attempt from public.eu_pin_attempts where user_id=public.eu_user_id() and owner_id=store_id for update;
 if attempt.window_at<now()-interval '15 minutes' then
 update public.eu_pin_attempts set attempts=0,window_at=now() where user_id=public.eu_user_id() and owner_id=store_id;attempt.attempts:=0;
 end if;
 if attempt.attempts>=5 then return jsonb_build_object('ok',false,'code','PIN_LOCKED');end if;
 select * into credential from public.eu_owner_credentials where owner_id=store_id;
 if not found then return jsonb_build_object('ok',false,'code','PIN_NOT_CONFIGURED');end if;
 if credential.pin_hash<>encode(sha256(convert_to(credential.salt||pin,'UTF8')),'hex') then
 update public.eu_pin_attempts set attempts=attempts+1 where user_id=public.eu_user_id() and owner_id=store_id;
 return jsonb_build_object('ok',false,'code','WRONG_PIN');end if;
 update public.eu_pin_attempts set attempts=0 where user_id=public.eu_user_id() and owner_id=store_id;
 delete from public.eu_delete_approvals where expires_at<now();
 insert into public.eu_delete_approvals values(approval,public.eu_user_id(),store_id,targets,now()+interval '2 minutes');
 return jsonb_build_object('ok',true,'token',approval);
end $$;
create or replace function public.eu_apply_changes_internal(operations jsonb, read_versions jsonb, request_id text) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare op jsonb; rd jsonb; actual_revision bigint; target_table text; expected bigint; current_data jsonb; merged jsonb; field record; affected integer;
  allowed text[] := array['eu_store_settings','eu_products','eu_customers','eu_sales','eu_sale_items','eu_payments','eu_purchases','eu_cash_closures','eu_employees','eu_movements','eu_feedbacks','eu_team_invitations','eu_user_stores'];
begin
  if public.eu_user_id() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 500 or jsonb_typeof(read_versions) <> 'array' then raise exception 'Invalid batch'; end if;
  insert into public.eu_write_receipts(user_id,request_id) values(public.eu_user_id(),request_id) on conflict do nothing;
  get diagnostics affected = row_count;
  if affected = 0 then return; end if;
  -- Consistent lock order prevents competing checkout deadlocks.
  for rd in select value from jsonb_array_elements(read_versions) order by value->>'table',value->>'path',value->>'id' loop
    target_table := rd->>'table';
    if not(target_table = any(allowed)) then raise exception 'Invalid table'; end if;
    actual_revision := null;
    execute format('select revision from public.%I where collection_path=$1 and id=$2 for update',target_table)
      into actual_revision using rd->>'path',rd->>'id';
    if coalesce(actual_revision,0) <> (rd->>'revision')::bigint then raise exception 'TRANSACTION_CONFLICT'; end if;
  end loop;
  for op in select value from jsonb_array_elements(operations) loop
    target_table := op->>'table';
    if not(target_table = any(allowed)) then raise exception 'Invalid table'; end if;
    if op->>'action' = 'delete' then
      execute format('delete from public.%I where collection_path=$1 and id=$2',target_table) using op->>'path',op->>'id';
    elsif op->>'action' = 'set' and coalesce((op->>'merge')::boolean,false) = false then
      select (value->>'revision')::bigint into expected from jsonb_array_elements(read_versions)
        where value->>'table'=target_table and value->>'path'=op->>'path' and value->>'id'=op->>'id' limit 1;
      if expected = 0 then
        execute format('insert into public.%I(collection_path,id,data) values($1,$2,$3) on conflict do nothing',target_table)
          using op->>'path',op->>'id',op->'data';
        get diagnostics affected = row_count;
        if affected = 0 then raise exception 'TRANSACTION_CONFLICT'; end if;
      else
        execute format('insert into public.%I(collection_path,id,data) values($1,$2,$3) on conflict(collection_path,id) do update set data=excluded.data',target_table)
          using op->>'path',op->>'id',op->'data';
      end if;
    elsif op->>'action' in ('update','set') then
      current_data := null;
      execute format('select data from public.%I where collection_path=$1 and id=$2 for update',target_table)
        into current_data using op->>'path',op->>'id';
      if current_data is null and op->>'action' = 'update' then raise exception 'Record does not exist or access denied'; end if;
      merged := coalesce(current_data,'{}'::jsonb);
      for field in select key,value from jsonb_each(op->'data') loop
        if field.value = '{"__eu_delete_field":true}'::jsonb then merged := merged - field.key;
        else merged := jsonb_set(merged,array[field.key],field.value,true); end if;
      end loop;
      execute format('insert into public.%I(collection_path,id,data) values($1,$2,$3) on conflict(collection_path,id) do update set data=excluded.data',target_table)
        using op->>'path',op->>'id',merged;
    else raise exception 'Invalid operation'; end if;
  end loop;
end $$;
revoke all on function public.eu_apply_changes_internal(jsonb,jsonb,text) from public,anon,authenticated;
create or replace function public.eu_apply_changes(operations jsonb,read_versions jsonb,request_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare op jsonb; rd jsonb; old_owner text; target_owner text; level text; approval public.eu_delete_approvals; tokens text[]:=array[]::text[];
 allowed text[]:=array['eu_store_settings','eu_products','eu_customers','eu_sales','eu_sale_items','eu_payments','eu_purchases','eu_cash_closures','eu_employees','eu_movements','eu_feedbacks','eu_team_invitations','eu_user_stores'];
begin
 if public.eu_user_id() is null then raise exception 'Authentication required';end if;
 if jsonb_typeof(operations)<>'array' or jsonb_array_length(operations)>500 then raise exception 'Invalid batch';end if;
 -- Even reads in a transaction cannot be used to inspect another store.
 for rd in select value from jsonb_array_elements(read_versions) loop
 if not(rd->>'table'=any(allowed)) then raise exception 'Invalid table';end if;
 execute format('select owner_id from public.%I where collection_path=$1 and id=$2',rd->>'table') into old_owner using rd->>'path',rd->>'id';
 if old_owner is not null and coalesce(public.eu_access_level(old_owner),'') not in('owner','manager') then raise exception 'Permission denied';end if;
 end loop;
 for op in select value from jsonb_array_elements(operations) loop
 if not(op->>'table'=any(allowed)) then raise exception 'Invalid table';end if;
 old_owner:=null;
 execute format('select owner_id from public.%I where collection_path=$1 and id=$2 for update',op->>'table') into old_owner using op->>'path',op->>'id';
 target_owner:=coalesce(old_owner,op->'data'->>'ownerId');level:=public.eu_access_level(target_owner);
 if coalesce(level,'') not in ('owner','manager') then raise exception 'Permission denied';end if;
 if op->'data' ? 'ownerId' and op->'data'->>'ownerId'<>target_owner then raise exception 'Owner mismatch';end if;
 if op->>'table' in ('eu_user_stores','eu_team_invitations') and level<>'owner' then raise exception 'Owner required';end if;
 if op->>'action'='delete' and op->>'table' in ('eu_products','eu_customers') then
 select * into approval from public.eu_delete_approvals where token=op->>'ownerApproval' and user_id=public.eu_user_id() and owner_id=target_owner and expires_at>now() for update;
 if not found or not (approval.targets @> jsonb_build_array(jsonb_build_object('table',op->>'table','id',op->>'id'))) then raise exception 'Owner PIN required';end if;
 tokens:=array_append(tokens,approval.token);
 end if;
 -- Deleting by upserting an archive, or changing membership roles from an employee account, is not a loophole.
 if op->>'table'='eu_movements' and op->'data'->>'type' in ('shift_start','shift_end') then raise exception 'Use shift RPC';end if;
 end loop;
 perform set_config('eu.delete_tokens',to_jsonb(tokens)::text,true);
 perform public.eu_apply_changes_internal(operations,read_versions,request_id);
 delete from public.eu_delete_approvals where token=any(tokens);
end $$;
create or replace function public.eu_clear_account_data_internal() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare caller text := public.eu_user_id(); name text;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  foreach name in array array['eu_products','eu_customers','eu_sales','eu_sale_items','eu_payments','eu_purchases','eu_cash_closures','eu_employees','eu_movements','eu_feedbacks','eu_team_invitations','eu_user_stores'] loop
    execute format('delete from public.%I where owner_id=$1',name) using caller;
  end loop;
  delete from public.eu_user_stores where collection_path='userStores' and id=caller;
  delete from public.eu_write_receipts where user_id=caller;
  insert into public.eu_store_settings(collection_path,id,data)
    values('settings',caller,jsonb_build_object('ownerId',caller,'storeName','','accountDataCleared',true,'updatedAt',extract(epoch from now())*1000))
    on conflict(collection_path,id) do update set data=excluded.data;
end $$;
revoke all on function public.eu_clear_account_data_internal() from public,anon,authenticated;
drop function if exists public.eu_clear_account_data();
create or replace function public.eu_clear_account_data(owner_approval text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare approval public.eu_delete_approvals;
begin
 if public.eu_user_id() is null then raise exception 'Owner required';end if;
 select * into approval from public.eu_delete_approvals where token=owner_approval and user_id=public.eu_user_id() and owner_id=public.eu_user_id() and expires_at>now() and targets @> '[{"table":"*","id":"*"}]'::jsonb for update;
 if not found then raise exception 'Owner PIN required';end if;
 perform set_config('eu.delete_tokens',jsonb_build_array(owner_approval)::text,true);
 perform public.eu_clear_account_data_internal();
 delete from public.eu_shifts where owner_id=public.eu_user_id();
 delete from public.eu_delete_approvals where token=owner_approval;
end $$;

create or replace function public.eu_require_delete_approval() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare tokens jsonb:=coalesce(nullif(current_setting('eu.delete_tokens',true),'')::jsonb,'[]'::jsonb);
begin
 if public.eu_user_id() is null then return old;end if; -- SQL maintenance; unauthenticated REST remains denied by RLS.
 if not exists(select 1 from public.eu_delete_approvals a where to_jsonb(a.token)<@tokens and a.user_id=public.eu_user_id() and a.owner_id=old.owner_id and a.expires_at>now()
 and (a.targets @> jsonb_build_array(jsonb_build_object('table',tg_table_name,'id',old.id)) or a.targets @> '[{"table":"*","id":"*"}]'::jsonb)) then raise exception 'Owner PIN required';end if;
 return old;
end $$;
drop trigger if exists eu_delete_pin on public.eu_products;
create trigger eu_delete_pin before delete on public.eu_products for each row execute function public.eu_require_delete_approval();
drop trigger if exists eu_delete_pin on public.eu_customers;
create trigger eu_delete_pin before delete on public.eu_customers for each row execute function public.eu_require_delete_approval();

create or replace function public.eu_close_overdue_shifts() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare shift public.eu_shifts; boundary bigint;
begin
 for shift in select * from public.eu_shifts where status='open' and started_at < extract(epoch from(date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))*1000 for update loop
 boundary:=extract(epoch from((date_trunc('day',to_timestamp(shift.started_at/1000.0) at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo'))*1000;
 update public.eu_shifts set ended_at=boundary,status='not_closed' where id=shift.id;
 update public.eu_employees set data=data||jsonb_build_object('currentShiftStartedAt',null,'lastShiftEndedAt',boundary) where owner_id=shift.owner_id and id=shift.employee_id and (data->>'currentShiftStartedAt')::numeric<=boundary;
 insert into public.eu_movements(collection_path,id,data) values('movements','shift_end_'||shift.id,jsonb_build_object('ownerId',shift.owner_id,'employeeId',shift.employee_id,'employeeName',shift.employee_name,'type','shift_end','timestamp',boundary,'createdAt',boundary,'shiftId',shift.id,'status','not_closed','description','Turno não encerrado: fechado automaticamente à meia-noite')) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.eu_close_overdue_shifts() from public,anon,authenticated;
create or replace function public.eu_shift_action(store_id text,action text,employee_id text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare level text:=public.eu_access_level(store_id); employee jsonb; target text; shift public.eu_shifts; now_ms bigint:=extract(epoch from clock_timestamp())*1000;
begin
 if level is null then raise exception 'Permission denied';end if;
 perform public.eu_close_overdue_shifts();
 target:=case when level='employee' then public.eu_actor_employee(store_id) else employee_id end;
 if target is null or (level='employee' and employee_id is not null and employee_id<>target) then raise exception 'Own shift only';end if;
 select data into employee from public.eu_employees where owner_id=store_id and id=target and coalesce((data->>'isActive')::boolean,true) for update;
 if employee is null then raise exception 'Employee unavailable';end if;
 select * into shift from public.eu_shifts where owner_id=store_id and eu_shifts.employee_id=target and status='open' for update;
 if action='start' then
 if found then return to_jsonb(shift);end if;
 insert into public.eu_shifts(id,owner_id,employee_id,employee_name,started_at) values(gen_random_uuid()::text,store_id,target,employee->>'name',now_ms) returning * into shift;
 update public.eu_employees set data=data||jsonb_build_object('currentShiftStartedAt',now_ms,'updatedAt',now_ms) where id=target and owner_id=store_id;
 insert into public.eu_movements(collection_path,id,data) values('movements','shift_start_'||shift.id,jsonb_build_object('ownerId',store_id,'employeeId',target,'employeeName',employee->>'name','employeeRole',employee->>'role','type','shift_start','timestamp',now_ms,'createdAt',now_ms,'shiftId',shift.id,'description','Entrada no turno'));
 elsif action='end' then
 if not found then return null;end if;
 update public.eu_shifts set ended_at=now_ms,status='ended' where id=shift.id returning * into shift;
 update public.eu_employees set data=data||jsonb_build_object('currentShiftStartedAt',null,'lastShiftEndedAt',now_ms,'updatedAt',now_ms) where id=target and owner_id=store_id;
 insert into public.eu_movements(collection_path,id,data) values('movements','shift_end_'||shift.id,jsonb_build_object('ownerId',store_id,'employeeId',target,'employeeName',employee->>'name','employeeRole',employee->>'role','type','shift_end','timestamp',now_ms,'createdAt',now_ms,'shiftId',shift.id,'status','ended','description','Saída do turno')) on conflict do nothing;
 else raise exception 'Invalid shift action';end if;
 return to_jsonb(shift);
end $$;
create or replace function public.eu_access_context(store_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare level text:=public.eu_access_level(store_id);begin
 if level is null then raise exception 'Permission denied';end if;
 perform public.eu_close_overdue_shifts();
 return jsonb_build_object('role',level,'employeeId',public.eu_actor_employee(store_id),'schemaVersion',1);
end $$;
create or replace function public.eu_list_shifts(store_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare level text:=public.eu_access_level(store_id);result jsonb;begin
 if level is null then raise exception 'Permission denied';end if;
 perform public.eu_close_overdue_shifts();
 select coalesce(jsonb_agg(to_jsonb(s) order by started_at desc),'[]'::jsonb) into result from
 (select * from public.eu_shifts where owner_id=store_id and (level in('owner','manager') or employee_id=public.eu_actor_employee(store_id)) order by started_at desc limit 200) s;
 return result;
end $$;

create or replace function public.eu_staff_read(store_id text,table_name text,path text,record_id text default null,filters jsonb default '[]',page_offset integer default 0) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare level text:=public.eu_access_level(store_id);employee text:=public.eu_actor_employee(store_id);row record;clean jsonb;result jsonb:='[]';f jsonb;matches boolean;val jsonb;
 allowed text[]:=array['eu_store_settings','eu_products','eu_customers','eu_sales','eu_sale_items','eu_payments','eu_purchases','eu_cash_closures','eu_employees','eu_movements','eu_feedbacks'];
begin
 if level is null or not(table_name=any(allowed)) then raise exception 'Permission denied';end if;
 if level='employee' and table_name in('eu_purchases','eu_cash_closures','eu_feedbacks') then return '[]';end if;
 if jsonb_typeof(filters)<>'array' or jsonb_array_length(filters)>20 or page_offset<0 then raise exception 'Invalid query';end if;
 for row in execute format('select id,collection_path,owner_id,revision,data from public.%I where owner_id=$1 and collection_path=$2 and ($3 is null or id=$3) order by id',table_name) using store_id,path,record_id loop
 clean:=row.data;
 if level='employee' then
 if table_name='eu_employees' and row.id<>employee then continue;end if;
 if table_name in ('eu_sales','eu_payments','eu_movements') and coalesce(clean->>'employeeId','') not in(employee,public.eu_user_id()) then continue;end if;
 if table_name in('eu_sales','eu_payments') and clean->>'employeeId'=public.eu_user_id() then clean:=clean||jsonb_build_object('employeeId',employee);end if;
 if table_name='eu_sale_items' and not exists(select 1 from public.eu_sales where owner_id=store_id and id=split_part(path,'/',2) and data->>'employeeId' in(employee,public.eu_user_id())) then continue;end if;
 if table_name='eu_products' then select coalesce(jsonb_object_agg(key,value),'{}') into clean from jsonb_each(clean) where key=any(array['ownerId','name','type','stockUnit','category','imageUrl','barcode','mergedIntoId','mergedAt','purchaseForm','unitsPerPackage','supplierPackageUnits','stock','safetyStock','maxStock','stockCoverageDays','initialStock','initialStockDate','dailyAverageSales','replacementDays','basePrice','pricePackage','pricePack','priceCart','priceHalfCart','priceUnit','expirationDate','hasPromoSuggestion','promoPrice','promoDiscountPercent','promoNotes','createdAt','updatedAt']);end if;
 if table_name='eu_sale_items' then clean:=clean-'unitCost';end if;
 if table_name='eu_sales' then select coalesce(jsonb_object_agg(key,value),'{}') into clean from jsonb_each(clean) where key=any(array['ownerId','total','type','paymentMethod','customerId','itemsSummary','subtotal','surchargeAmount','employeeId','employeeName','createdAt']);end if;
 if table_name='eu_store_settings' then
 select coalesce(jsonb_object_agg(key,value),'{}') into clean from jsonb_each(clean) where key=any(array['ownerId','storeName','logoUrl','currency','dailyGoal','customCategories','businessSector','theme','darkMode','languageMode','fontSize']);
 end if;
 if table_name='eu_customers' then select coalesce(jsonb_object_agg(key,value),'{}') into clean from jsonb_each(clean) where key=any(array['ownerId','name','phone','totalDebt','lastMovementAt','createdAt','updatedAt']);end if;
 if table_name='eu_movements' and clean->>'type' not in('shift_start','shift_end') then continue;end if;
 end if;
 matches:=true;
 for f in select value from jsonb_array_elements(filters) loop
 if f->>'kind'<>'where' then continue;end if;
 val:=clean->(f->>'field');
 if (case f->>'operator' when '==' then val is distinct from f->'value' when '!=' then val is not distinct from f->'value'
 when '>=' then not(coalesce(val,'null')>=f->'value') when '<=' then not(coalesce(val,'null')<=f->'value')
 when '>' then not(coalesce(val,'null')>f->'value') when '<' then not(coalesce(val,'null')<f->'value') else true end) then matches:=false;exit;end if;
 end loop;
 if matches then result:=result||jsonb_build_array(jsonb_build_object('id',row.id,'collection_path',row.collection_path,'owner_id',row.owner_id,'revision',row.revision,'data',clean));end if;
 end loop;
 select coalesce(jsonb_agg(value),'[]') into result from(select value from jsonb_array_elements(result) with ordinality where ordinality>page_offset and ordinality<=page_offset+1000) rows;
 return result;
end $$;

create or replace function public.eu_change_own_pin(store_id text,old_pin text,new_pin text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare employee text:=public.eu_actor_employee(store_id);record jsonb;value text:=trim(new_pin);begin
 if employee is null then raise exception 'Employee unavailable';end if;
 if length(value) not between 4 and 64 or value in('1234','0000','1111','4321','123123','112233','1212','password','senha','senha123','admin','qwerty','abcd') or value ~ '^(.{1,4})\1+$'
 or position(lower(value) in '01234567890123456789876543210abcdefghijklmnopqrstuvwxyzzyxwvutsrqponmlkjihgfedcbaqwertyuiopasdfghjklzxcvbnm')>0 then raise exception 'Choose a personal PIN';end if;
 select data into record from public.eu_employees where owner_id=store_id and id=employee for update;
 if coalesce(record->>'pin','')<>trim(old_pin) or coalesce(record->>'pin','')=value then raise exception 'Wrong temporary PIN';end if;
 update public.eu_employees set data=data||jsonb_build_object('pin',value,'mustChangePin',false,'pinChangedAt',extract(epoch from now())*1000) where id=employee and owner_id=store_id;
end $$;

create or replace function public.eu_payment_values(store_id text,subtotal numeric,method text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare settings jsonb;rate numeric:=0;surcharge numeric:=0;total numeric;fee numeric;begin
 if subtotal is null or subtotal<0 or subtotal::text in('NaN','Infinity','-Infinity') or method is null or method not in('cash','credit','debit','voucher','pix','pix_machine','fiado') then raise exception 'Invalid payment';end if;
 select data into settings from public.eu_store_settings where owner_id=store_id;
 if coalesce(settings->>'currency','BRL')<>'BRL' and method in('pix','pix_machine') then raise exception 'Pix only for BRL';end if;
 if coalesce((settings->>'enableCardFees')::boolean,false) then rate:=case method when 'credit' then coalesce((settings->>'creditCardRate')::numeric,3.5) when 'debit' then coalesce((settings->>'debitCardRate')::numeric,1.5) when 'voucher' then coalesce((settings->>'voucherRate')::numeric,2) when 'pix_machine' then coalesce((settings->>'pixRate')::numeric,0) else 0 end;end if;
 if rate<0 or rate>100 then raise exception 'Invalid fee';end if;
 if method in('credit','debit','voucher') and settings->>'cardFeeCalculationMode'='surcharge' and coalesce((settings->>'passCardFeeToCustomer')::boolean,false) then surcharge:=round(subtotal*rate/100,2);end if;
 total:=round(subtotal+surcharge,2);fee:=round(total*rate/100,2);
 return jsonb_build_object('subtotal',round(subtotal,2),'total',total,'feeRate',rate,'feeAmount',fee,'surchargeAmount',surcharge,'netTotal',total-fee);
end $$;
revoke all on function public.eu_payment_values(text,numeric,text) from public,anon,authenticated;
create or replace function public.eu_sale_quote(store_id text,subtotal numeric,method text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin
 if public.eu_access_level(store_id) is null then raise exception 'Permission denied';end if;
 return public.eu_payment_values(store_id,subtotal,method)-'feeRate'-'feeAmount'-'netTotal';
end $$;

create or replace function public.eu_staff_sale(store_id text,request_id text,sale_input jsonb,items_input jsonb,acting_employee_id text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_employee text:=case when public.eu_access_level(store_id) in('owner','manager') then acting_employee_id else public.eu_actor_employee(store_id) end;employee jsonb;item jsonb;product jsonb;product_id text;units numeric;price numeric;subtotal numeric:=0;balance numeric;payment jsonb;
 field text;sale_id text:=request_id;now_ms bigint:=extract(epoch from now())*1000;changed integer;customer jsonb;method text:=coalesce(sale_input->>'paymentMethod',sale_input->>'type');summary text:='';
begin
 if public.eu_access_level(store_id) is null or actor_employee is null then raise exception 'Employee required';end if;
 if public.eu_access_level(store_id)='employee' and acting_employee_id is not null and acting_employee_id<>actor_employee then raise exception 'Own employee only';end if;
 perform public.eu_close_overdue_shifts();
 select data into employee from public.eu_employees where id=actor_employee and owner_id=store_id and coalesce((data->>'isActive')::boolean,true);
 if employee is null then raise exception 'Employee unavailable';end if;
 if coalesce((employee->>'mustChangePin')::boolean,false) or coalesce(employee->>'pin','')='' then raise exception 'Change your temporary PIN first';end if;
 if not exists(select 1 from public.eu_shifts where owner_id=store_id and eu_shifts.employee_id=actor_employee and status='open') then raise exception 'Start your shift first';end if;
 if jsonb_typeof(sale_input->'total') is distinct from 'number' or (sale_input->>'total')::numeric<=0 or method is null then raise exception 'Invalid sale total';end if;
 if jsonb_typeof(items_input)<>'array' or jsonb_array_length(items_input) not between 1 and 100 or sale_input->>'type' not in('cash','card','fiado') or length(request_id) not between 1 and 80 then raise exception 'Invalid sale';end if;
 if (sale_input->>'type'='card' and method not in('credit','debit','voucher','pix','pix_machine')) or (sale_input->>'type'<>'card' and method<>sale_input->>'type') then raise exception 'Invalid payment method';end if;
 insert into public.eu_write_receipts(user_id,request_id) values(public.eu_user_id(),'staff-sale-'||request_id) on conflict do nothing;
 get diagnostics changed=row_count;if changed=0 then return;end if;
 -- Consistent product lock order, followed by the customer lock, prevents competing sales deadlocks.
 for product_id in select distinct value->>'productId' from jsonb_array_elements(items_input) order by 1 loop
 perform 1 from public.eu_products where owner_id=store_id and id=product_id for update;
 end loop;
 for item in select value from jsonb_array_elements(items_input) loop
 select data into product from public.eu_products where owner_id=store_id and id=item->>'productId';
 if jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'price') is distinct from 'number' or jsonb_typeof(item->'stockDeduction') is distinct from 'number' then raise exception 'Invalid item amounts';end if;
 if product->>'type'='cigarro' and coalesce(product->>'stockUnit','')<>'carteira' then
 for field in select unnest(array['stock','initialStock','safetyStock','maxStock','dailyAverageSales']) loop
 if product ? field then product:=jsonb_set(product,array[field],to_jsonb((product->>field)::numeric/20));end if;end loop;
 product:=product||jsonb_build_object('unitCost',(product->>'unitCost')::numeric*20,'stockUnit','carteira','unitsPerPackage',10,'purchaseForm','pacote');
 update public.eu_products set data=product where owner_id=store_id and id=item->>'productId';
 end if;
 if product is null or product ? 'mergedIntoId' or (item->>'quantity')::numeric<=0 or mod((item->>'quantity')::numeric,1)<>0 then raise exception 'Invalid item';end if;
 units:=(item->>'stockDeduction')::numeric;price:=(item->>'price')::numeric;
 if units is null or price is null or units<=0 or price<=0 or units::text='NaN' or price::text='NaN' then raise exception 'Invalid format';end if;
 if product->>'type'='cigarro' then
 if units not in(10,1,0.5,0.05) or price<>(case units when 10 then coalesce((product->>'pricePack')::numeric,0) when 1 then coalesce((product->>'priceCart')::numeric,0) when 0.5 then coalesce((product->>'priceHalfCart')::numeric,0) else coalesce((product->>'priceUnit')::numeric,0) end) then raise exception 'Price or format changed';end if;
 else
 if units not in(1,coalesce((product->>'unitsPerPackage')::numeric,1)) then raise exception 'Invalid format';end if;
 if units=1 then
 if price<>coalesce((product->>'basePrice')::numeric,0) and not(coalesce((product->>'hasPromoSuggestion')::boolean,false) and price=coalesce((product->>'promoPrice')::numeric,0)) then raise exception 'Price changed';end if;
 elsif price<>coalesce((product->>'pricePackage')::numeric,0) then raise exception 'Price changed';end if;
 end if;
 -- All arithmetic uses integer twentieths. No floating-point stock is persisted.
 balance:=(round((product->>'stock')::numeric*20)-round(units*20)*(item->>'quantity')::numeric)/20;
 if balance<0 then raise exception 'Insufficient stock';end if;
 update public.eu_products set data=data||jsonb_build_object('stock',balance,'updatedAt',now_ms) where owner_id=store_id and id=item->>'productId';
 subtotal:=subtotal+price*(item->>'quantity')::numeric;
 summary:=left(summary||case when summary='' then '' else '; ' end||(item->>'quantity')||'x '||(product->>'name')||' ('||(item->>'format')||')',950);
 insert into public.eu_sale_items(collection_path,id,data) values('sales/'||sale_id||'/saleItems',gen_random_uuid()::text,
 jsonb_build_object('ownerId',store_id,'productId',item->>'productId','name',product->>'name','format',item->>'format','quantity',(item->>'quantity')::numeric,'price',price,'stockDeduction',units,'stockAfter',balance,'unitCost',(product->>'unitCost')::numeric*units,'createdAt',now_ms));
 end loop;
 payment:=public.eu_payment_values(store_id,subtotal,method);
 if abs((sale_input->>'total')::numeric-(payment->>'total')::numeric)>0.001 then raise exception 'Payment changed';end if;
 if sale_input->>'type'='fiado' then
 select data into customer from public.eu_customers where owner_id=store_id and id=sale_input->>'customerId' for update;
 if customer is null then raise exception 'Customer unavailable';end if;
 update public.eu_customers set data=data||jsonb_build_object('totalDebt',round((customer->>'totalDebt')::numeric+(payment->>'total')::numeric,2),'lastMovementAt',now_ms,'updatedAt',now_ms) where owner_id=store_id and id=sale_input->>'customerId';
 end if;
 insert into public.eu_sales(collection_path,id,data) values('sales',sale_id,payment||jsonb_build_object('ownerId',store_id,'type',sale_input->>'type','paymentMethod',method,'customerId',sale_input->>'customerId','itemsSummary',summary,'employeeId',actor_employee,'employeeName',employee->>'name','createdAt',now_ms));
 insert into public.eu_movements(collection_path,id,data) values('movements','sale_'||sale_id,jsonb_build_object('ownerId',store_id,'employeeId',actor_employee,'employeeName',employee->>'name','type','sale','timestamp',now_ms,'createdAt',now_ms,'description',summary,'entityId',sale_id,'amount',(payment->>'total')::numeric));
end $$;
create or replace function public.eu_staff_receive(store_id text,request_id text,customer_id text,amount numeric,method text,acting_employee_id text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_employee text:=case when public.eu_access_level(store_id) in('owner','manager') then acting_employee_id else public.eu_actor_employee(store_id) end;employee jsonb;customer jsonb;now_ms bigint:=extract(epoch from now())*1000;changed integer;
begin
 if public.eu_access_level(store_id) is null or actor_employee is null then raise exception 'Employee required';end if;
 if public.eu_access_level(store_id)='employee' and acting_employee_id is not null and acting_employee_id<>actor_employee then raise exception 'Own employee only';end if;
 select data into employee from public.eu_employees where owner_id=store_id and id=actor_employee and coalesce((data->>'isActive')::boolean,true);
 if employee is null then raise exception 'Employee unavailable';end if;
 if coalesce((employee->>'mustChangePin')::boolean,false) or coalesce(employee->>'pin','')='' then raise exception 'Change your temporary PIN first';end if;
 perform public.eu_close_overdue_shifts();
 if not exists(select 1 from public.eu_shifts where owner_id=store_id and eu_shifts.employee_id=actor_employee and status='open') then raise exception 'Start your shift first';end if;
 if amount is null or round(amount,2)<=0 or amount::text in('NaN','Infinity','-Infinity') or method not in('cash','card') or length(request_id) not between 1 and 80 then raise exception 'Invalid payment';end if;
 insert into public.eu_write_receipts(user_id,request_id) values(public.eu_user_id(),'staff-payment-'||request_id) on conflict do nothing;
 get diagnostics changed=row_count;if changed=0 then return;end if;
 select data into customer from public.eu_customers where owner_id=store_id and id=customer_id for update;
 if customer is null or round(amount,2)>(customer->>'totalDebt')::numeric then raise exception 'Invalid debt balance';end if;
 update public.eu_customers set data=data||jsonb_build_object('totalDebt',round((customer->>'totalDebt')::numeric-round(amount,2),2),'lastMovementAt',now_ms,'updatedAt',now_ms) where owner_id=store_id and id=customer_id;
 insert into public.eu_payments(collection_path,id,data) values('payments',request_id,jsonb_build_object('ownerId',store_id,'customerId',customer_id,'amount',round(amount,2),'method',method,'employeeId',actor_employee,'employeeName',employee->>'name','createdAt',now_ms));
 insert into public.eu_movements(collection_path,id,data) values('movements','payment_'||request_id,jsonb_build_object('ownerId',store_id,'employeeId',actor_employee,'employeeName',employee->>'name','type','debt_payment','timestamp',now_ms,'createdAt',now_ms,'description','Recebimento de fiado','entityId',customer_id,'amount',round(amount,2)));
end $$;

-- Supabase provides pg_cron. Reconciliation also runs on access/resume for robustness.
do $$begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
 execute 'create extension if not exists pg_cron';
 perform cron.schedule('eu-close-overdue-shifts','* * * * *','select public.eu_close_overdue_shifts()');
 else raise notice 'pg_cron unavailable: install/schedule eu_close_overdue_shifts in production; access reconciliation remains active';end if;
end $$;
-- Explicit grants: private primitives cannot be called directly over PostgREST.
do $$declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
 'eu_access_level','eu_actor_employee','eu_owner_pin_state','eu_set_owner_pin','eu_approve_deletion','eu_apply_changes','eu_clear_account_data','eu_shift_action','eu_access_context','eu_list_shifts','eu_staff_read','eu_change_own_pin','eu_sale_quote','eu_staff_sale','eu_staff_receive']) loop
 execute format('revoke all on function %s from public',fn.signature);
 execute format('grant execute on function %s to authenticated,anon',fn.signature);
 end loop;
end $$;

-- Product photos are read-only for staff as well.
do $$begin
 if to_regclass('storage.objects') is not null then
 execute 'drop policy if exists eu_product_images_insert on storage.objects';
 execute 'create policy eu_product_images_insert on storage.objects for insert to authenticated,anon with check(bucket_id=''produtos'' and public.eu_access_level((storage.foldername(name))[1]) in (''owner'',''manager''))';
 execute 'drop policy if exists eu_product_images_update on storage.objects';
 execute 'create policy eu_product_images_update on storage.objects for update to authenticated,anon using(bucket_id=''produtos'' and public.eu_access_level((storage.foldername(name))[1]) in (''owner'',''manager'')) with check(bucket_id=''produtos'' and public.eu_access_level((storage.foldername(name))[1]) in (''owner'',''manager''))';
 end if;
end $$;

create or replace function public.eu_product_popularity(store_id text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if public.eu_access_level(store_id) is null then raise exception 'Permission denied';end if;
 select coalesce(jsonb_object_agg(product_id,quantity),'{}') into result from(
 select data->>'productId' product_id,sum((data->>'quantity')::numeric*coalesce((data->>'stockDeduction')::numeric,1)) quantity from public.eu_sale_items where owner_id=store_id group by data->>'productId') counts;
 return result;
end $$;
revoke all on function public.eu_product_popularity(text) from public;
grant execute on function public.eu_product_popularity(text) to authenticated,anon;

commit;
