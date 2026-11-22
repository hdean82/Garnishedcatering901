-- Applied to Garnished Catering Supabase on 2026-11-22.
-- Menu catalog records are reusable; invoice lines remain editable snapshots.
create table if not exists public.garnished_menu_items (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 180),
 category text not null default 'Other' check(length(trim(category)) between 1 and 80),
 unit_label text not null default 'each' check(length(trim(unit_label)) between 1 and 40),
 unit_price numeric(12,2) not null default 0 check(unit_price >= 0 and unit_price <= 10000000),
 description text check(description is null or length(description) <= 600),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists garnished_menu_items_business_idx on public.garnished_menu_items(business_id,category,name);
alter table public.garnished_menu_items enable row level security;
create policy garnished_menu_read on public.garnished_menu_items for select to authenticated
using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'));
create policy garnished_menu_insert on public.garnished_menu_items for insert to authenticated
with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'));
create policy garnished_menu_update on public.garnished_menu_items for update to authenticated
using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'))
with check(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'));
create policy garnished_menu_delete on public.garnished_menu_items for delete to authenticated
using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or exists(select 1 from public.business_members m where m.business_id=business_id and m.user_id=auth.uid() and m.role='manager'));
