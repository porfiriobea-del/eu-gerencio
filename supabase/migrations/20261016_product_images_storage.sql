-- Run after 20261014_cloud_source_of_truth.sql in the same Supabase project.
-- Immutable content-addressed product photos; no Base64 is written by the app.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('produtos','produtos',true,30720,array['image/webp'])
on conflict(id) do update set public=true,file_size_limit=30720,allowed_mime_types=array['image/webp'];

drop policy if exists eu_product_images_read on storage.objects;
create policy eu_product_images_read on storage.objects for select to authenticated,anon
using(bucket_id='produtos' and public.eu_can_access_store((storage.foldername(name))[1]));
drop policy if exists eu_product_images_insert on storage.objects;
create policy eu_product_images_insert on storage.objects for insert to authenticated,anon
with check(bucket_id='produtos' and public.eu_can_access_store((storage.foldername(name))[1]));
drop policy if exists eu_product_images_update on storage.objects;
create policy eu_product_images_update on storage.objects for update to authenticated,anon
using(bucket_id='produtos' and public.eu_can_access_store((storage.foldername(name))[1]))
with check(bucket_id='produtos' and public.eu_can_access_store((storage.foldername(name))[1]));
