-- Applied to Garnished Catering Supabase on 2026-11-22.
-- Approval terms start NULL. Nothing may be approved until the owner publishes terms.
alter table public.businesses add column if not exists client_approval_terms text;
alter table public.invoices add column if not exists document_type text not null default 'invoice' check(document_type in ('invoice','quote'));
create table if not exists public.garnished_client_review_messages(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 author_user_id uuid not null,
 author_role text not null check(author_role in ('client','team')),
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index if not exists garnished_review_msg_invoice_idx on public.garnished_client_review_messages(invoice_id,created_at);
alter table public.garnished_client_review_messages enable row level security;
create policy garnished_review_client_read on public.garnished_client_review_messages for select to authenticated
using(exists(select 1 from public.garnished_client_access ca where ca.user_id=auth.uid() and ca.business_id=business_id and ca.customer_id=customer_id));
create policy garnished_review_team_read on public.garnished_client_review_messages for select to authenticated
using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'));
create policy garnished_review_client_write on public.garnished_client_review_messages for insert to authenticated
with check(author_user_id=auth.uid() and author_role='client' and exists(select 1 from public.garnished_client_access ca where ca.user_id=auth.uid() and ca.business_id=business_id and ca.customer_id=customer_id) and exists(select 1 from public.invoices i where i.id=invoice_id and i.business_id=business_id and i.customer_id=customer_id and i.status in ('sent','partial','paid','overdue')));
create policy garnished_review_team_write on public.garnished_client_review_messages for insert to authenticated
with check(author_user_id=auth.uid() and author_role='team' and exists(select 1 from public.invoices i where i.id=invoice_id and i.business_id=business_id and i.customer_id=customer_id) and (exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager')));
create table if not exists public.garnished_client_approvals(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 approved_by uuid not null,
 approved_email text not null,
 terms_snapshot text not null,
 invoice_snapshot jsonb not null,
 approved_at timestamptz not null default now(),
 unique(invoice_id)
);
alter table public.garnished_client_approvals enable row level security;
create policy garnished_approval_client_read on public.garnished_client_approvals for select to authenticated
using(exists(select 1 from public.garnished_client_access ca where ca.user_id=auth.uid() and ca.business_id=business_id and ca.customer_id=customer_id));
create policy garnished_approval_team_read on public.garnished_client_approvals for select to authenticated
using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'));
-- See 20261122_garnished_approve_invoice.sql for the SECURITY DEFINER
-- authenticated-user approval function and immutable agreement snapshot.
