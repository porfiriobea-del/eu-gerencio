-- Run after 20261014_cloud_source_of_truth.sql.
create table if not exists public.eu_user_preferences (
  user_id text primary key,
  language text not null default 'pt-BR' check (language in ('pt-BR','en','es')),
  updated_at timestamptz not null default now()
);
alter table public.eu_user_preferences enable row level security;
grant select,insert,update on public.eu_user_preferences to authenticated,anon;
drop policy if exists eu_user_preferences_read on public.eu_user_preferences;
create policy eu_user_preferences_read on public.eu_user_preferences for select to authenticated,anon
using (user_id=public.eu_user_id());
drop policy if exists eu_user_preferences_insert on public.eu_user_preferences;
create policy eu_user_preferences_insert on public.eu_user_preferences for insert to authenticated,anon
with check (user_id=public.eu_user_id());
drop policy if exists eu_user_preferences_update on public.eu_user_preferences;
create policy eu_user_preferences_update on public.eu_user_preferences for update to authenticated,anon
using (user_id=public.eu_user_id()) with check (user_id=public.eu_user_id());
