-- Live Garnished Catering RPC, updated to support atomic delivery fields.
CREATE OR REPLACE FUNCTION public.create_garnished_invoice_with_items(p_business_id uuid, p_invoice jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_item jsonb; v_count int; v_status text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=auth.uid())
  and not exists(select 1 from public.business_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='manager')
 then raise exception 'Only managers can create invoices'; end if;
 if jsonb_typeof(p_invoice)<>'object' then raise exception 'Invalid invoice'; end if;
 if coalesce(pg_catalog.btrim(p_invoice->>'invoice_number'),'')='' then raise exception 'Invoice number required'; end if;
 if jsonb_typeof(p_items)<>'array' then raise exception 'Items must be a list'; end if;
 v_count:=jsonb_array_length(p_items);
 if v_count<1 or v_count>50 then raise exception 'Add 1 to 50 items'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text,42));
 if exists(select 1 from public.invoices where business_id=p_business_id and lower(invoice_number)=lower(p_invoice->>'invoice_number')) then raise exception 'Invoice number already in use'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if coalesce(pg_catalog.btrim(v_item->>'description'),'')='' or
    (v_item->>'quantity')::numeric<=0 or (v_item->>'unit_price')::numeric<0
  then raise exception 'Each item needs a name, positive quantity and nonnegative price'; end if;
 end loop;
 insert into public.invoices(business_id,invoice_number,customer_id,event_id,issue_date,due_date,deposit_required,tax_amount,discount_amount,reference_number,event_service_notes,payment_terms,payment_methods,notes)
 values(p_business_id,p_invoice->>'invoice_number',nullif(p_invoice->>'customer_id','')::uuid,nullif(p_invoice->>'event_id','')::uuid,coalesce(nullif(p_invoice->>'issue_date','')::date,current_date),nullif(p_invoice->>'due_date','')::date,coalesce(nullif(p_invoice->>'deposit_required','')::numeric,0),coalesce(nullif(p_invoice->>'tax_amount','')::numeric,0),coalesce(nullif(p_invoice->>'discount_amount','')::numeric,0),nullif(p_invoice->>'reference_number',''),nullif(p_invoice->>'event_service_notes',''),nullif(p_invoice->>'payment_terms',''),nullif(p_invoice->>'payment_methods',''),nullif(p_invoice->>'notes',''))
 returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  insert into public.invoice_items(business_id,invoice_id,description,item_category,quantity,unit_price,position)
  values(p_business_id,v_id,v_item->>'description',nullif(v_item->>'item_category',''),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce(nullif(v_item->>'position','')::integer,0));
 end loop;
 if coalesce(p_invoice->>'fulfillment_method','not_specified') not in ('not_specified','pickup','delivery') then raise exception 'Invalid fulfillment method'; end if;
 if coalesce(p_invoice->>'delivery_address_mode','saved') not in ('saved','custom') then raise exception 'Invalid delivery address selection'; end if;
 if p_invoice->>'fulfillment_method'='delivery' and p_invoice->>'delivery_address_mode'='custom'
   and coalesce(pg_catalog.btrim(p_invoice->>'delivery_address'),'')=''
 then raise exception 'Enter a custom delivery address'; end if;
 if p_invoice->>'fulfillment_method'='delivery' and p_invoice->>'delivery_address_mode'='saved'
   and not exists(
     select 1 from public.customers c where c.business_id=p_business_id
       and c.id=nullif(p_invoice->>'customer_id','')::uuid
       and length(pg_catalog.btrim(coalesce(c.address,'')))>0
   )
   and not exists(
     select 1 from public.events e where e.business_id=p_business_id
       and e.id=nullif(p_invoice->>'event_id','')::uuid
       and length(pg_catalog.btrim(coalesce(e.address,'')))>0
   )
 then raise exception 'No saved delivery address is available; enter the delivery address'; end if;
 update public.invoices set
    fulfillment_method=coalesce(p_invoice->>'fulfillment_method','not_specified'),
    delivery_address_mode=case when p_invoice->>'fulfillment_method'='delivery'
      then coalesce(p_invoice->>'delivery_address_mode','saved') else 'saved' end,
    delivery_address=case when p_invoice->>'fulfillment_method'='delivery'
      and p_invoice->>'delivery_address_mode'='custom'
      then nullif(pg_catalog.btrim(p_invoice->>'delivery_address'),'') else null end,
    delivery_place_name=case when p_invoice->>'fulfillment_method'='delivery'
      then nullif(pg_catalog.btrim(p_invoice->>'delivery_place_name'),'') else null end
 where id=v_id and business_id=p_business_id;
 return v_id;
end;
$function$
