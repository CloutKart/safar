-- Per-member unavailable dates, so the group can find a window everyone can make.
-- One row per (group, participant); the picker upserts the whole date array.
create table public.group_availability (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  unavailable_dates date[] not null default '{}'::date[],
  updated_at timestamptz not null default now(),
  unique (group_id, participant_id)
);

create index group_availability_group_idx on public.group_availability(group_id);

alter table public.group_availability enable row level security;
-- Like the rest of the schema: server routes use the service role, so RLS
-- intentionally exposes no anon/authenticated policies.
