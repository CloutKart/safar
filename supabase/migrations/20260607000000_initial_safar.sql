create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.group_status as enum (
  'forming',
  'listening',
  'summary_review',
  'researching',
  'voting',
  'completed',
  'archived'
);

create table public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  wa_group_id text not null unique,
  subject text not null,
  description text,
  invite_link text,
  status public.group_status not null default 'forming',
  active_summary_id uuid,
  voting_closes_at timestamptz,
  voting_round integer not null default 1,
  runoff_options integer[] not null default '{}'::integer[],
  reminder_count integer not null default 0 check (reminder_count between 0 and 2),
  last_coordinator_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  wa_id text not null,
  display_name text,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  nickname_requested_at timestamptz,
  unique (group_id, wa_id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  wa_message_id text not null unique,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  message_type text not null,
  text_content text,
  media_id text,
  language text,
  raw_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.trip_facts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  evidence_message_id uuid references public.messages(id) on delete set null,
  kind text not null,
  value jsonb not null,
  confidence numeric not null check (confidence between 0 and 1),
  is_hard boolean not null default false,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.preference_evidence (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  evidence_message_id uuid references public.messages(id) on delete set null,
  tag text not null,
  weight numeric not null check (weight between -1 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  direct_first_person boolean not null,
  created_at timestamptz not null default now()
);

create table public.reusable_preferences (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  tag text not null,
  weight numeric not null check (weight between -1 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  evidence_count integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (wa_id, tag)
);

create table public.summary_versions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  version integer not null,
  content jsonb not null,
  status text not null default 'review' check (status in ('review', 'approved', 'superseded')),
  created_at timestamptz not null default now(),
  unique (group_id, version)
);

alter table public.whatsapp_groups
  add constraint whatsapp_groups_active_summary_fk
  foreign key (active_summary_id) references public.summary_versions(id) on delete set null;

create table public.summary_approvals (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.summary_versions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  approved boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (summary_id, participant_id)
);

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  state text not null,
  catalog jsonb not null,
  embedding vector,
  updated_at timestamptz not null default now()
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  destination_slug text,
  title text not null,
  url text not null,
  publisher text not null,
  source_type text not null,
  excerpt text,
  retrieved_at timestamptz not null default now()
);

create table public.generated_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  summary_id uuid not null references public.summary_versions(id) on delete cascade,
  option_number integer not null check (option_number between 1 and 3),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (group_id, summary_id, option_number)
);

create table public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.generated_plans(id) on delete cascade,
  provider text not null,
  category text not null,
  amount_inr numeric,
  is_live boolean not null default false,
  deep_link text,
  raw_payload jsonb not null default '{}'::jsonb,
  quoted_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  plan_id uuid not null references public.generated_plans(id) on delete cascade,
  round integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, participant_id, round)
);

create index messages_group_occurred_idx on public.messages(group_id, occurred_at);
create index trip_facts_active_idx on public.trip_facts(group_id, kind) where superseded_at is null;
create index preferences_group_idx on public.preference_evidence(group_id, participant_id);
create index webhook_pending_idx on public.webhook_events(status, available_at);

alter table public.whatsapp_groups enable row level security;
alter table public.participants enable row level security;
alter table public.webhook_events enable row level security;
alter table public.messages enable row level security;
alter table public.trip_facts enable row level security;
alter table public.preference_evidence enable row level security;
alter table public.reusable_preferences enable row level security;
alter table public.summary_versions enable row level security;
alter table public.summary_approvals enable row level security;
alter table public.destinations enable row level security;
alter table public.research_sources enable row level security;
alter table public.generated_plans enable row level security;
alter table public.price_quotes enable row level security;
alter table public.votes enable row level security;

-- The MVP has no public client-side data access. Server routes use the service role.
-- RLS therefore intentionally exposes no anon/authenticated policies.

create or replace function public.purge_expired_trip_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.messages m
  using public.whatsapp_groups g
  where m.group_id = g.id
    and g.completed_at is not null
    and g.completed_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
