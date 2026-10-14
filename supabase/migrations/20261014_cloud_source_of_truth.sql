-- Authoritative cloud tables. Legacy uppercase mirror tables are preserved but no longer used.
-- Enable Firebase Third-Party Auth in Supabase before using this migration with the existing login.
-- Some Firebase JWTs have no role claim and use the anon database role.
-- Both roles remain subject to RLS and a verified JWT sub; an API key alone has no store access.
create or replace function public.eu_user_id() returns text language sql stable as $$
  select case when auth.jwt()->>'iss' = 'https://securetoken.google.com/comercio-em-crescimento'
    and auth.jwt()->>'aud' = 'comercio-em-crescimento'
    and auth.jwt()->>'email_verified' = 'true'
    then nullif(auth.jwt()->>'sub', '') else null end
$$;

do $$
declare entry text[];
begin
  foreach entry slice 1 in array array[
    ['eu_store_settings','settings'],['eu_products','products'],['eu_customers','customers'],
    ['eu_sales','sales'],['eu_sale_items','saleItems'],['eu_payments','payments'],
    ['eu_purchases','purchases'],['eu_cash_closures','cashClosures'],['eu_employees','employees'],
    ['eu_movements','movements'],['eu_feedbacks','feedbacks'],['eu_team_invitations','teamInvitations'],['eu_user_stores','userStores']
  ] loop
    execute format('create table if not exists public.%I (
      collection_path text not null, id text not null check(length(id) between 1 and 128),
      data jsonb not null check(jsonb_typeof(data) = ''object''),
      owner_id text generated always as (data->>''ownerId'') stored not null,
      revision bigint not null default 1,
      primary key(collection_path,id),
      check(length(owner_id) between 1 and 128),
      check(collection_path = %L or (%L = ''saleItems'' and collection_path ~ ''^sales/[^/]+/saleItems$''))
    )',entry[1],entry[2],entry[2]);
    execute format('create index if not exists %I on public.%I(owner_id)',entry[1]||'_owner_idx',entry[1]);
    execute format('alter table public.%I enable row level security',entry[1]);
    execute format('grant select,insert,update,delete on public.%I to authenticated, anon',entry[1]);

  end loop;
end $$;

-- Definer reads only the caller's membership, avoiding recursive RLS evaluation.
create or replace function public.eu_can_access_store(store_id text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.eu_user_id() is not null and (store_id = public.eu_user_id() or exists(
    select 1 from public.eu_user_stores m where m.id = public.eu_user_id()
      and m.collection_path = 'userStores' and m.owner_id = store_id
      and m.data->>'userUid' = public.eu_user_id()
  ))
$$;

create or replace function public.eu_validate_record() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.data->>'ownerId' is distinct from old.data->>'ownerId' or new.id <> old.id or new.collection_path <> old.collection_path then
      raise exception 'Record ownership and identity are immutable';
    end if;
    new.revision := old.revision + 1;
  else new.revision := 1;
  end if;
  if tg_table_name = 'eu_products' then
    if jsonb_typeof(new.data->'stock') is distinct from 'number' or jsonb_typeof(new.data->'unitCost') is distinct from 'number' or (new.data->>'stock')::numeric < 0 or
       (new.data->>'unitCost')::numeric < 0 then raise exception 'Invalid stock or cost'; end if;
    if new.data->>'type' = 'cigarro' and new.data->>'stockUnit' = 'carteira' and mod((new.data->>'stock')::numeric * 20,1) <> 0 then
      raise exception 'Cigarette stock requires increments of 0.05 carteira';
    end if;
  end if;
  return new;
end $$;

do $$
declare name text;
begin
  foreach name in array array['eu_store_settings','eu_products','eu_customers','eu_sales','eu_sale_items','eu_payments','eu_purchases','eu_cash_closures','eu_employees','eu_movements','eu_feedbacks','eu_team_invitations','eu_user_stores'] loop
    execute format('drop trigger if exists eu_record_validation on public.%I',name);
    execute format('create trigger eu_record_validation before insert or update on public.%I for each row execute function public.eu_validate_record()',name);
    if name not in ('eu_team_invitations','eu_user_stores') then
      execute format('drop policy if exists eu_store_access on public.%I',name);
      execute format('create policy eu_store_access on public.%I to authenticated, anon using(public.eu_can_access_store(owner_id)) with check(public.eu_can_access_store(owner_id))',name);
    end if;
    execute format('alter table public.%I replica identity full',name);
    if exists(select 1 from pg_publication where pubname = 'supabase_realtime') and not exists(
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = name
    ) then execute format('alter publication supabase_realtime add table public.%I',name); end if;
  end loop;
end $$;

-- Invitations and membership can never be created merely by modifying browser storage.
drop policy if exists eu_invitation_read on public.eu_team_invitations;
create policy eu_invitation_read on public.eu_team_invitations for select to authenticated, anon using(
  public.eu_can_access_store(owner_id) or (lower(data->>'email') = lower(auth.jwt()->>'email') and auth.jwt()->>'email_verified' = 'true')
);
drop policy if exists eu_invitation_owner_write on public.eu_team_invitations;
create policy eu_invitation_owner_write on public.eu_team_invitations for all to authenticated,anon
  using(owner_id = public.eu_user_id()) with check(owner_id = public.eu_user_id());
drop policy if exists eu_membership_read on public.eu_user_stores;
create policy eu_membership_read on public.eu_user_stores for select to authenticated,anon
  using(id = public.eu_user_id() or owner_id = public.eu_user_id());
drop policy if exists eu_membership_owner_write on public.eu_user_stores;
create policy eu_membership_owner_write on public.eu_user_stores for all to authenticated,anon
  using(owner_id = public.eu_user_id()) with check(owner_id = public.eu_user_id());
drop policy if exists eu_membership_leave on public.eu_user_stores;
create policy eu_membership_leave on public.eu_user_stores for delete to authenticated, anon using(id = public.eu_user_id());

create table if not exists public.eu_write_receipts (
  user_id text not null, request_id text not null, primary key(user_id, request_id), created_at timestamptz not null default now()
);
alter table public.eu_write_receipts enable row level security;
drop policy if exists eu_receipt_self on public.eu_write_receipts;
create policy eu_receipt_self on public.eu_write_receipts to authenticated, anon using(user_id = public.eu_user_id()) with check(user_id = public.eu_user_id());
grant select,insert on public.eu_write_receipts to authenticated,anon;


-- Atomic sales, payments, purchases and catalogue writes. RLS stays active (security invoker).
create or replace function public.eu_apply_changes(operations jsonb, read_versions jsonb, request_id text) returns void
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
revoke all on function public.eu_apply_changes(jsonb,jsonb,text) from public, anon;
grant execute on function public.eu_apply_changes(jsonb,jsonb,text) to authenticated,anon;

-- Accept an invitation and its membership together, only for the verified recipient.
create or replace function public.eu_accept_invitation(invite_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare invitation jsonb; membership jsonb; caller text := public.eu_user_id();
begin
  if caller is null or auth.jwt()->>'email_verified' is distinct from 'true' then raise exception 'Verified identity required'; end if;
  select data into invitation from public.eu_team_invitations where id=invite_id and collection_path='teamInvitations' for update;
  if invitation is null or lower(invitation->>'email') is distinct from lower(auth.jwt()->>'email') then raise exception 'Invitation is not for this user'; end if;
  if invitation->>'status' <> 'pending' then raise exception 'Invitation is not pending'; end if;
  membership := jsonb_build_object('userUid',caller,'ownerId',invitation->>'ownerId','storeName',invitation->>'storeName','email',lower(auth.jwt()->>'email'),'name',invitation->>'name','role',invitation->>'role','linkedAt',extract(epoch from now())*1000);
  insert into public.eu_user_stores(collection_path,id,data) values('userStores',caller,membership);
  update public.eu_team_invitations set data=data||jsonb_build_object('status','accepted','acceptedByUid',caller,'acceptedAt',extract(epoch from now())*1000) where id=invite_id and collection_path='teamInvitations';
  return membership;
end $$;
revoke all on function public.eu_accept_invitation(text) from public,anon;
grant execute on function public.eu_accept_invitation(text) to authenticated,anon;

-- Seal the obsolete unscoped mirror, retaining all legacy rows for administrative recovery.
do $$ declare legacy text; begin
  foreach legacy in array array['PRODUTOS','MOVIMENTAÇOES'] loop
    if to_regclass(format('public.%I',legacy)) is not null then
      execute format('alter table public.%I enable row level security',legacy);
      execute format('revoke all on public.%I from anon,authenticated',legacy);
    end if;
  end loop;
end $$;

-- Clear only the verified caller's owned store and own memberships in one transaction.
-- The empty profile marker prevents an intentional deletion from restoring the old archive.
create or replace function public.eu_clear_account_data() returns void
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
revoke all on function public.eu_clear_account_data() from public,anon;
grant execute on function public.eu_clear_account_data() to authenticated,anon;
