create table if not exists public.app_records (
  id text primary key,
  collection text not null check (collection in ('users', 'drivers', 'bookings', 'sosAlerts')),
  phone text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);

create unique index if not exists app_records_account_phone_unique
  on public.app_records (collection, phone)
  where phone is not null;

create index if not exists app_records_collection_created_at
  on public.app_records (collection, created_at);

alter table public.app_records enable row level security;

grant usage on schema public to service_role;
grant all on table public.app_records to service_role;
