-- Crowdsourced trail-condition reports. Auto-expiring (72h) so what's shown is
-- always recent; expiry is enforced by the read query (expires_at > now()), with
-- a purge function for hygiene. Service-role only, like the rest of the schema.
create table public.trek_reports (
  id uuid primary key default gen_random_uuid(),
  trek_slug text not null,
  reporter_name text,
  trail_status text not null check (trail_status in ('clear', 'muddy', 'snow', 'blocked', 'washed-out')),
  water_status text not null default 'unknown' check (water_status in ('flowing', 'low', 'dry', 'unknown')),
  rating integer not null check (rating between 1 and 5),
  note text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index trek_reports_active_idx on public.trek_reports(trek_slug, expires_at);

alter table public.trek_reports enable row level security;

create or replace function public.purge_expired_trek_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.trek_reports where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
