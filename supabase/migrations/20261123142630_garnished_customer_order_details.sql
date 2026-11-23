-- Existing document notes stay separate from details explicitly written for the customer.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_order_details text;

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
 insert into public.invoices(business_id,invoice_number,customer_id,event_id,issue_date,due_date,deposit_required,tax_amount,discount_amount,reference_number,event_service_notes,payment_terms,payment_methods,notes,client_order_details)
 values(p_business_id,p_invoice->>'invoice_number',nullif(p_invoice->>'customer_id','')::uuid,nullif(p_invoice->>'event_id','')::uuid,coalesce(nullif(p_invoice->>'issue_date','')::date,current_date),nullif(p_invoice->>'due_date','')::date,coalesce(nullif(p_invoice->>'deposit_required','')::numeric,0),coalesce(nullif(p_invoice->>'tax_amount','')::numeric,0),coalesce(nullif(p_invoice->>'discount_amount','')::numeric,0),nullif(p_invoice->>'reference_number',''),nullif(p_invoice->>'event_service_notes',''),nullif(p_invoice->>'payment_terms',''),nullif(p_invoice->>'payment_methods',''),nullif(p_invoice->>'notes',''),nullif(pg_catalog.btrim(p_invoice->>'client_order_details'),''))
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
 if coalesce(p_invoice->>'document_type','invoice') not in ('invoice','quote') then raise exception 'Invalid document type'; end if;
 update public.invoices set document_type=coalesce(p_invoice->>'document_type','invoice') where id=v_id and business_id=p_business_id;
 if nullif(p_invoice->>'source_inquiry_id','') is not null then
  if not exists(select 1 from public.garnished_inquiries q where q.id=(p_invoice->>'source_inquiry_id')::uuid and q.business_id=p_business_id) then raise exception 'Inquiry does not belong to this business'; end if;
  update public.invoices set source_inquiry_id=(p_invoice->>'source_inquiry_id')::uuid where id=v_id and business_id=p_business_id;
  update public.garnished_inquiries set status='quoted' where id=(p_invoice->>'source_inquiry_id')::uuid and business_id=p_business_id and status in ('new','contacted','quoted');
 end if;
 return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.garnished_approve_invoice(p_invoice_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();v_email text;v_i public.invoices%rowtype;v_terms text;v_record uuid;v_snapshot jsonb;v_count int;
begin
 if v_user is null then raise exception 'Sign in first'; end if;
 if p_accept is distinct from true then raise exception 'You must accept the terms'; end if;
 select u.email into v_email from auth.users u where u.id=v_user and u.email_confirmed_at is not null;
 if v_email is null then raise exception 'Verify your email to approve'; end if;
 select * into v_i from public.invoices where id=p_invoice_id and status in ('sent','partial','paid','overdue') for share;
 if not found then raise exception 'This invoice is not open for approval'; end if;
 if not exists(select 1 from public.garnished_client_access ca where ca.user_id=v_user and ca.business_id=v_i.business_id and ca.customer_id=v_i.customer_id) then raise exception 'Access denied'; end if;
 select pg_catalog.btrim(b.client_approval_terms) into v_terms from public.businesses b where b.id=v_i.business_id;
 if coalesce(v_terms,'')='' then raise exception 'Garnished must publish terms before approvals are enabled'; end if;
 if exists(select 1 from public.garnished_client_approvals a where a.invoice_id=v_i.id) then raise exception 'Already approved'; end if;
 select count(*) into v_count from public.invoice_items it where it.invoice_id=v_i.id and it.business_id=v_i.business_id;
 if v_count=0 then raise exception 'Invoice has no items'; end if;
 select jsonb_build_object(
 'document_type',v_i.document_type,'invoice_number',v_i.invoice_number,'issue_date',v_i.issue_date,'due_date',v_i.due_date,
 'notes',v_i.notes,'client_order_details',v_i.client_order_details,'fulfillment_method',v_i.fulfillment_method,'delivery_place_name',v_i.delivery_place_name,
 'delivery_address',v_i.delivery_address,'status_at_approval',v_i.status,
 'tax_amount',v_i.tax_amount,'discount_amount',v_i.discount_amount,'deposit_required',v_i.deposit_required,
 'items',(select coalesce(jsonb_agg(jsonb_build_object('description',it.description,'quantity',it.quantity,'unit_price',it.unit_price,'category',it.item_category) order by it.position),'[]'::jsonb) from public.invoice_items it where it.invoice_id=v_i.id and it.business_id=v_i.business_id),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('amount',p.amount,'paid_at',p.paid_at)),'[]'::jsonb) from public.payments p where p.invoice_id=v_i.id and p.business_id=v_i.business_id)
 ) into v_snapshot;
 insert into public.garnished_client_approvals(business_id,invoice_id,customer_id,approved_by,approved_email,terms_snapshot,invoice_snapshot)
 values(v_i.business_id,v_i.id,v_i.customer_id,v_user,v_email,v_terms,v_snapshot) returning id into v_record;
 if v_i.event_id is not null then
   update public.events set status='confirmed'
   where id=v_i.event_id and business_id=v_i.business_id and customer_id=v_i.customer_id and status in ('quoted','inquiry');
 else
   insert into public.events(business_id,customer_id,title,status,event_at,menu_notes)
   values(v_i.business_id,v_i.customer_id,coalesce(v_i.document_type,'invoice')||' '||v_i.invoice_number||' — approved', 'confirmed',null,'Approved catering document. Confirm service date and time before scheduling.')
   returning id into v_record;
   update public.invoices set event_id=v_record where id=v_i.id and business_id=v_i.business_id;
 end if;
 return jsonb_build_object('approved',true,'approval_id',(select a.id from public.garnished_client_approvals a where a.invoice_id=v_i.id));
end $function$;
