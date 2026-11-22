-- Already applied to Garnished Catering Supabase project on 2026-11-22.
-- Defaults are OFF. Do not alter client access permissions.
alter table public.businesses
  add column if not exists reminder_digest_enabled boolean not null default false,
  add column if not exists reminder_digest_email text,
  add column if not exists reminder_digest_hour smallint not null default 8
    check (reminder_digest_hour between 0 and 23);
alter table public.businesses
  add constraint garnished_reminder_email_syntax check
  (reminder_digest_email is null or
   (length(reminder_digest_email) <= 254 and reminder_digest_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
create table if not exists public.garnished_reminder_dispatches (
  business_id uuid not null references public.businesses(id) on delete cascade,
  local_date date not null,
  recipient_email text not null,
  status text not null default 'reserved' check (status in ('reserved','sent','failed')),
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (business_id,local_date)
);
alter table public.garnished_reminder_dispatches enable row level security;
create policy garnished_reminders_owner_read on public.garnished_reminder_dispatches for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
