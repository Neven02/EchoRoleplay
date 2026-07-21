create table if not exists public.shop_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shop_state enable row level security;

drop policy if exists "service role can manage shop state" on public.shop_state;

create policy "service role can manage shop state"
on public.shop_state
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on table public.shop_state to service_role;
