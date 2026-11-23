alter table public.events
 add column if not exists requested_event_date date,
 add column if not exists requested_service_time text,
 add column if not exists requested_service_style text,
 add column if not exists requested_budget_range text;
