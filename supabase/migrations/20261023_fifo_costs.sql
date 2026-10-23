-- PEPS: JSON lots inside existing product and sale-item documents; no new tables.
-- Apply after team permissions and owner-product-merges. Historical records are not rewritten.
begin;
create or replace function public.eu_fifo_inventory(store_id text, product_id text, product jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare remaining bigint:=round((product->>'stock')::numeric*20); lot jsonb; lots jsonb:='[]'; ticks bigint; total bigint;
begin
 if product ? 'fifoLots' then
  select coalesce(sum(round((value->>'quantity')::numeric*20)),0) into total from jsonb_array_elements(product->'fifoLots');
  if total<>remaining then raise exception 'FIFO stock mismatch';end if;
  return product;
 end if;
 for lot in
  with receipts as (
   select p.id,p.data,
    coalesce((p.data->>'effectiveUnitCost')::numeric,(p.data->>'totalCost')::numeric/nullif((p.data->>'quantity')::numeric+coalesce((p.data->>'bonusQuantity')::numeric,0),0),(p.data->>'unitCost')::numeric,0) cost,
    coalesce((p.data->>'createdAt')::bigint,extract(epoch from (p.data->>'date')::date)*1000,0) ts
   from public.eu_purchases p where p.owner_id=store_id and coalesce((p.data->>'stockUpdated')::boolean,true)
  ), entries as (
   select jsonb_build_object('id',id||':0','purchaseId',id,'kind','purchase','quantity',(data->>'quantity')::numeric,'unitCost',cost,'createdAt',ts) value from receipts
   where data->>'productId'=product_id or coalesce(product->'mergedProductIds','[]') ? (data->>'productId')
   union all
   select jsonb_build_object('id',id||':1','purchaseId',id,'kind','bonus','quantity',(data->>'bonusQuantity')::numeric,'unitCost',cost,'createdAt',ts) from receipts
   where (coalesce(data->>'bonusProductId',data->>'productId')=product_id or coalesce(product->'mergedProductIds','[]') ? coalesce(data->>'bonusProductId',data->>'productId')) and coalesce((data->>'bonusQuantity')::numeric,0)>0
  ) select value from entries order by (value->>'createdAt')::bigint desc,value->>'id' desc
 loop
  exit when remaining=0;
  ticks:=least(remaining,round((lot->>'quantity')::numeric*20));
  if ticks>0 then lots:=jsonb_build_array(lot||jsonb_build_object('quantity',ticks::numeric/20))||lots;end if;
  remaining:=remaining-ticks;
 end loop;
 if remaining>0 then lots:=jsonb_build_array(jsonb_build_object('id','initial:'||product_id,'kind','initial','quantity',remaining::numeric/20,'unitCost',coalesce((product->>'initialUnitCost')::numeric,(product->>'unitCost')::numeric,0),'createdAt',0))||lots;end if;
 return product||jsonb_build_object('fifoLots',lots,'initialUnitCost',coalesce((product->>'initialUnitCost')::numeric,(product->>'unitCost')::numeric,0));
end $$;
create or replace function public.eu_fifo_consume(product jsonb,quantity numeric) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare remaining bigint:=round(quantity*20);lot jsonb;ticks bigint;available bigint;lots jsonb:='[]';allocations jsonb:='[]';cost numeric:=0;known boolean:=true;
begin
 if quantity<=0 or quantity*20<>remaining then raise exception 'Invalid FIFO quantity';end if;
 for lot in select value from jsonb_array_elements(product->'fifoLots') order by (value->>'kind'='initial') desc,(value->>'createdAt')::bigint,value->>'id' loop
  available:=round((lot->>'quantity')::numeric*20);ticks:=least(available,remaining);
  if ticks>0 then
   allocations:=allocations||jsonb_build_array(lot||jsonb_build_object('quantity',ticks::numeric/20));
   cost:=cost+ticks::numeric/20*(lot->>'unitCost')::numeric;
   known:=known and coalesce((lot->>'unitCost')::numeric,0)>0;
  end if;
  if available>ticks then lots:=lots||jsonb_build_array(lot||jsonb_build_object('quantity',(available-ticks)::numeric/20));end if;
  remaining:=remaining-ticks;
 end loop;
 if remaining>0 then raise exception 'Insufficient stock';end if;
 return jsonb_build_object('product',product||jsonb_build_object('fifoLots',lots,'stock',((product->>'stock')::numeric*20-round(quantity*20))/20,'unitCost',coalesce((lots->0->>'unitCost')::numeric,(product->>'lastCost')::numeric,(product->>'unitCost')::numeric,0)),
 'allocations',allocations,'costKnown',known,'totalCost',case when known then cost else null end);
end $$;
revoke all on function public.eu_fifo_inventory(text,text,jsonb) from public,authenticated,anon;
revoke all on function public.eu_fifo_consume(jsonb,numeric) from public,authenticated,anon;
create or replace function public.eu_staff_sale(store_id text,request_id text,sale_input jsonb,items_input jsonb,acting_employee_id text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_employee text:=case when public.eu_access_level(store_id) in('owner','manager') then acting_employee_id else public.eu_actor_employee(store_id) end;employee jsonb;item jsonb;product jsonb;product_id text;units numeric;price numeric;subtotal numeric:=0;balance numeric;payment jsonb;
 field text;sale_id text:=request_id;now_ms bigint:=extract(epoch from now())*1000;changed integer;customer jsonb;fifo jsonb;method text:=coalesce(sale_input->>'paymentMethod',sale_input->>'type');summary text:='';
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
 product:=public.eu_fifo_inventory(store_id,item->>'productId',product);
 fifo:=public.eu_fifo_consume(product,units*(item->>'quantity')::numeric);
 update public.eu_products set data=(fifo->'product')||jsonb_build_object('updatedAt',now_ms) where owner_id=store_id and id=item->>'productId';
 subtotal:=subtotal+price*(item->>'quantity')::numeric;
 summary:=left(summary||case when summary='' then '' else '; ' end||(item->>'quantity')||'x '||(product->>'name')||' ('||(item->>'format')||')',950);
 insert into public.eu_sale_items(collection_path,id,data) values('sales/'||sale_id||'/saleItems',gen_random_uuid()::text,
 jsonb_build_object('ownerId',store_id,'productId',item->>'productId','name',product->>'name','format',item->>'format','quantity',(item->>'quantity')::numeric,'price',price,'stockDeduction',units,'stockAfter',balance,'costMethod','fifo','costKnown',fifo->'costKnown','costAllocations',fifo->'allocations','unitCost',(fifo->>'totalCost')::numeric/(item->>'quantity')::numeric,'createdAt',now_ms));
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
 if table_name='eu_sale_items' then clean:=clean-'unitCost'-'costAllocations'-'costKnown'-'costMethod';end if;
 if table_name='eu_sales' then select coalesce(jsonb_object_agg(key,value),'{}') into clean from jsonb_each(clean) where key=any(array['ownerId','total','type','paymentMethod','customerId','itemsSummary','subtotal','surchargeAmount','employeeId','employeeName','createdAt','cancelledAt']);end if;
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


create or replace function public.eu_staff_sale_fifo(store_id text,request_id text,sale_input jsonb,items_input jsonb,acting_employee_id text default null) returns void
language sql security definer set search_path=public,pg_temp as $$
 select public.eu_staff_sale(store_id,request_id,sale_input,items_input,acting_employee_id);
$$;
revoke all on function public.eu_staff_sale_fifo(text,text,jsonb,jsonb,text) from public;
grant execute on function public.eu_staff_sale_fifo(text,text,jsonb,jsonb,text) to authenticated,anon;
-- Cached lots are updated atomically with stock. Old clients must not desynchronize them.
create or replace function public.eu_validate_fifo_lots() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare lot jsonb;total numeric:=0;ids text[]:=array[]::text[];
begin
 if not(new.data ? 'fifoLots') then return new;end if;
 if jsonb_typeof(new.data->'fifoLots') is distinct from 'array' then raise exception 'Invalid FIFO lots';end if;
 for lot in select value from jsonb_array_elements(new.data->'fifoLots') loop
  if jsonb_typeof(lot->'quantity') is distinct from 'number' or (lot->>'quantity')::numeric<=0 or mod((lot->>'quantity')::numeric*20,1)<>0
     or jsonb_typeof(lot->'unitCost') is distinct from 'number' or (lot->>'unitCost')::numeric<0 or coalesce(lot->>'id','')='' or (lot->>'id')=any(ids) then raise exception 'Invalid FIFO lot';end if;
  total:=total+(lot->>'quantity')::numeric;ids:=array_append(ids,lot->>'id');
 end loop;
 if total<>(new.data->>'stock')::numeric then raise exception 'FIFO stock mismatch: update the app before changing stock';end if;
 return new;
end $$;
revoke all on function public.eu_validate_fifo_lots() from public;
drop trigger if exists eu_validate_fifo_lots on public.eu_products;
create trigger eu_validate_fifo_lots before insert or update on public.eu_products for each row execute function public.eu_validate_fifo_lots();
create or replace function public.eu_product_popularity(store_id text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if public.eu_access_level(store_id) is null then raise exception 'Permission denied';end if;
 select coalesce(jsonb_object_agg(product_id,quantity),'{}') into result from(
 select data->>'productId' product_id,sum((data->>'quantity')::numeric*coalesce((data->>'stockDeduction')::numeric,1)) quantity from public.eu_sale_items where owner_id=store_id and not exists(select 1 from public.eu_sales s where s.owner_id=store_id and s.id=split_part(eu_sale_items.collection_path,'/',2) and s.data ? 'cancelledAt') group by data->>'productId') counts;
 return result;
end $$;
revoke all on function public.eu_product_popularity(text) from public;
grant execute on function public.eu_product_popularity(text) to authenticated,anon;


commit;
