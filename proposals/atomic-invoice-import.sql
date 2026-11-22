-- PROPOSAL ONLY: NOT RUN ON PRODUCTION.
-- Create a formal Supabase migration via the CLI when approved and tested locally.
-- One RPC call = one PostgreSQL transaction: any failure rolls back customer, invoice, and item inserts.
-- Uses SECURITY INVOKER so Garnished RLS policies remain in effect.
create or replace function public.import_garnished_invoices(p_business_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j jsonb;
  first_row jsonb;
  item jsonb;
  number_text text;
  cust_name text;
  cust_email text;
  new_customer uuid;
  new_invoice uuid;
  invoice_count integer := 0;
  item_count integer := 0;
  n numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to import invoices';
  end if;
  if not exists (select 1 from public.businesses b where b.id=p_business_id and b.owner_id=auth.uid())
     and not exists (select 1 from public.business_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='manager') then
    raise exception 'Only owners and managers may import invoices';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 200 then
    raise exception 'Import must contain between 1 and 200 line items';
  end if;
  -- Serialize all imports for this workspace; catches repeated invoice numbers safely.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text, 0));
  for j in select value from jsonb_array_elements(p_rows) loop
    if pg_catalog.length(pg_catalog.btrim(j->>'invoice_number'))=0
       or pg_catalog.length(pg_catalog.btrim(j->>'customer_name'))=0
       or pg_catalog.length(pg_catalog.btrim(j->>'item_description'))=0 then
      raise exception 'Invoice number, customer and description are required';
    end if;
    if pg_catalog.length(j->>'invoice_number')>100 or pg_catalog.length(j->>'customer_name')>200 or pg_catalog.length(j->>'item_description')>500 then
      raise exception 'Import fields exceed their allowed lengths';
    end if;
    n := (j->>'quantity')::numeric;
    if n<=0 or n>100000 then raise exception 'Quantity must be positive'; end if;
    n := (j->>'unit_price')::numeric;
    if n<0 or n>10000000 then raise exception 'Unit price is invalid'; end if;
    item_count := item_count+1;
  end loop;
  for number_text in
    select distinct value->>'invoice_number' from jsonb_array_elements(p_rows)
    order by 1
  loop
    if exists(select 1 from public.invoices i where i.business_id=p_business_id and lower(i.invoice_number)=lower(number_text)) then
      raise exception 'Invoice % already exists', number_text;
    end if;
    select value into first_row from jsonb_array_elements(p_rows)
      where value->>'invoice_number'=number_text limit 1;
    cust_name:=pg_catalog.btrim(first_row->>'customer_name');
    cust_email:=nullif(pg_catalog.btrim(first_row->>'customer_email'),'');
    if exists(select 1 from jsonb_array_elements(p_rows) q
       where q.value->>'invoice_number'=number_text
         and lower(q.value->>'customer_name')<>lower(cust_name)) then
      raise exception 'Conflicting customer names in invoice %', number_text;
    end if;
    select c.id into new_customer from public.customers c
    where c.business_id=p_business_id
      and (cust_email is not null and lower(c.email)=lower(cust_email)
           or lower(c.name)=lower(cust_name))
    order by c.created_at limit 1;
    if new_customer is null then
      insert into public.customers(business_id,name,email)
      values(p_business_id,cust_name,cust_email) returning id into new_customer;
    end if;
    insert into public.invoices(
      business_id,invoice_number,customer_id,issue_date,due_date,
      deposit_required,tax_amount,discount_amount,notes
    ) values (
      p_business_id,number_text,new_customer,
      coalesce(nullif(first_row->>'issue_date','')::date,current_date),
      nullif(first_row->>'due_date','')::date,
      coalesce(nullif(first_row->>'deposit_required','')::numeric,0),
      coalesce(nullif(first_row->>'tax_amount','')::numeric,0),
      coalesce(nullif(first_row->>'discount_amount','')::numeric,0),
      nullif(first_row->>'notes','')
    ) returning id into new_invoice;
    for item in select value from jsonb_array_elements(p_rows)
      where value->>'invoice_number'=number_text
    loop
      insert into public.invoice_items(business_id,invoice_id,description,quantity,unit_price)
      values(p_business_id,new_invoice,item->>'item_description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric);
    end loop;
    invoice_count:=invoice_count+1;
  end loop;
  return jsonb_build_object('imported_invoices',invoice_count,'imported_items',item_count);
end;
$$;
revoke all on function public.import_garnished_invoices(uuid,jsonb) from public,anon;
grant execute on function public.import_garnished_invoices(uuid,jsonb) to authenticated;
