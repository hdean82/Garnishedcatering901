-- Already applied to the Garnished Catering Supabase project.
-- Invoice delivery preferences do not modify customer records or event venue addresses.
alter table public.invoices
 add column if not exists fulfillment_method text not null default 'not_specified'
 check(fulfillment_method in ('not_specified','pickup','delivery')),
 add column if not exists delivery_address_mode text not null default 'saved'
 check(delivery_address_mode in ('saved','custom')),
 add column if not exists delivery_address text,
 add column if not exists delivery_place_name text;
alter table public.invoices
 add constraint garnished_invoice_delivery_address_length check(delivery_address is null or length(delivery_address)<=500),
 add constraint garnished_invoice_delivery_place_length check(delivery_place_name is null or length(delivery_place_name)<=160);
