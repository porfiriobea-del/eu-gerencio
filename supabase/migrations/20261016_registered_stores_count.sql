-- Aggregate only: never returns store names, owner ids or contact details.
-- Run after 20261014_cloud_source_of_truth.sql.
create or replace function public.eu_registered_stores_count()
returns bigint language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if public.eu_user_id() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  return (
    select count(distinct owner_id) from public.eu_store_settings
    where collection_path='settings' and id=owner_id
      and length(btrim(coalesce(data->>'storeName','')))>0
      and coalesce(data->>'accountDataCleared','false')<>'true'
  );
end;
$$;
revoke all on function public.eu_registered_stores_count() from public;
grant execute on function public.eu_registered_stores_count() to authenticated,anon;
