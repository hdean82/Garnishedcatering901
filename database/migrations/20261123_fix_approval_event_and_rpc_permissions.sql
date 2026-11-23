-- DRAFT ONLY: Review and test with fictional accounts before applying to Garnished production.
-- Fixes GitHub issue #41. Preserve the approved invoice snapshot and access checks.
BEGIN;

CREATE OR REPLACE FUNCTION public.garnished_queue_approved_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_i public.invoices%rowtype; v_event uuid;
begin
 select * into v_i from public.invoices where id=new.invoice_id and business_id=new.business_id and customer_id=new.customer_id;
 if not found then raise exception 'Approved invoice unavailable'; end if;
 if v_i.event_id is null then
  insert into public.events(business_id,customer_id,title,status,event_at,menu_notes,delivery_notes)
  values(new.business_id,new.customer_id,
   case when v_i.document_type='quote' then 'Approved quote ' else 'Approved order ' end||v_i.invoice_number,
   'confirmed',null,
   'Approved document '||v_i.invoice_number||'. Menu line items remain on the linked document. Confirm event date and fulfillment.',
   'Date and time not provided by approval. Schedule in Studio before placing on a calendar day.'
  ) returning id into v_event;
  update public.invoices set event_id=v_event where id=v_i.id and business_id=new.business_id and event_id is null;
 else
  update public.events set status='confirmed' where id=v_i.event_id and business_id=new.business_id and status in ('inquiry','quoted');
 end if;
 return new;
end $function$


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
 'notes',v_i.notes,'fulfillment_method',v_i.fulfillment_method,'delivery_place_name',v_i.delivery_place_name,
 'delivery_address',v_i.delivery_address,'status_at_approval',v_i.status,
 'tax_amount',v_i.tax_amount,'discount_amount',v_i.discount_amount,'deposit_required',v_i.deposit_required,
 'items',(select coalesce(jsonb_agg(jsonb_build_object('description',it.description,'quantity',it.quantity,'unit_price',it.unit_price,'category',it.item_category) order by it.position),'[]'::jsonb) from public.invoice_items it where it.invoice_id=v_i.id and it.business_id=v_i.business_id),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('amount',p.amount,'paid_at',p.paid_at)),'[]'::jsonb) from public.payments p where p.invoice_id=v_i.id and p.business_id=v_i.business_id)
 ) into v_snapshot;
 insert into public.garnished_client_approvals(business_id,invoice_id,customer_id,approved_by,approved_email,terms_snapshot,invoice_snapshot)
 values(v_i.business_id,v_i.id,v_i.customer_id,v_user,v_email,v_terms,v_snapshot) returning id into v_record;
 -- The AFTER INSERT approval trigger is the single owner of event creation.
 return jsonb_build_object('approved',true,'approval_id',(select a.id from public.garnished_client_approvals a where a.invoice_id=v_i.id));
end $function$


-- The approval RPC is for signed-in, verified customers; public access is unnecessary.
REVOKE EXECUTE ON FUNCTION public.garnished_approve_invoice(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.garnished_approve_invoice(uuid,boolean) TO authenticated;
-- This trigger routine is not a client RPC.
REVOKE EXECUTE ON FUNCTION public.garnished_queue_approved_order() FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
 IF has_function_privilege('anon', 'public.garnished_approve_invoice(uuid,boolean)', 'EXECUTE') THEN
  RAISE EXCEPTION 'Anonymous users still have approval RPC permission';
 END IF;
 IF NOT has_function_privilege('authenticated', 'public.garnished_approve_invoice(uuid,boolean)', 'EXECUTE') THEN
  RAISE EXCEPTION 'Authenticated approval RPC permission missing';
 END IF;
 IF has_function_privilege('anon', 'public.garnished_queue_approved_order()', 'EXECUTE')
    OR has_function_privilege('authenticated','public.garnished_queue_approved_order()','EXECUTE') THEN
  RAISE EXCEPTION 'Trigger function still client-executable';
 END IF;
END;
$verify$;
COMMIT;

-- Separate release test (transaction rollback): approve one fictional invoice and assert
-- exactly one linked confirmed event; assert second approval fails and anon cannot approve.
-- Do not use customer records for this test.
