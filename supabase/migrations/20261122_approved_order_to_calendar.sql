create or replace function public.garnished_queue_approved_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_i public.invoices%rowtype; v_event uuid;
begin
 select * into v_i from public.invoices where id=new.invoice_id and business_id=new.business_id and customer_id=new.customer_id;
 if not found then raise exception 'Approved invoice unavailable'; end if;
 if v_i.event_id is null then
  insert into public.events(business_id,customer_id,title,status,event_at,menu_notes,delivery_notes)
  values(new.business_id,new.customer_id,
   case when v_i.document_type='quote' then 'Approved quote ' else 'Approved order ' end||v_i.invoice_number,
   'approved',null,
   'Approved document '||v_i.invoice_number||'. Menu line items remain on the linked document. Confirm event date and fulfillment.',
   'Date and time not provided by approval. Schedule in Studio before placing on a calendar day.'
  ) returning id into v_event;
  update public.invoices set event_id=v_event where id=v_i.id and business_id=new.business_id and event_id is null;
 else
  update public.events set status='approved' where id=v_i.event_id and business_id=new.business_id and status<>'cancelled';
 end if;
 return new;
end $$;
drop trigger if exists garnished_approved_order_calendar on public.garnished_client_approvals;
create trigger garnished_approved_order_calendar after insert on public.garnished_client_approvals
for each row execute function public.garnished_queue_approved_order();