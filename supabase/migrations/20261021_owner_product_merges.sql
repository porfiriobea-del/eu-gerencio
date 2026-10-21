-- Apply after 20261017_team_permissions_shifts.sql. Existing product JSON is preserved.
begin;
create or replace function public.eu_owner_product_merge() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous jsonb := '{}';
begin
  if tg_op = 'UPDATE' then previous := coalesce(old.data,'{}'); end if;
  if (new.data->'mergedIntoId' is distinct from previous->'mergedIntoId'
      or new.data->'mergedAt' is distinct from previous->'mergedAt'
      or new.data->'mergedProductIds' is distinct from previous->'mergedProductIds')
     and public.eu_user_id() is not null
     and public.eu_access_level(new.data->>'ownerId') is distinct from 'owner' then
    raise exception 'Only the store owner can merge products';
  end if;
  return new;
end $$;
revoke all on function public.eu_owner_product_merge() from public;
drop trigger if exists eu_owner_product_merge on public.eu_products;
create trigger eu_owner_product_merge before insert or update on public.eu_products
for each row execute function public.eu_owner_product_merge();
commit;
