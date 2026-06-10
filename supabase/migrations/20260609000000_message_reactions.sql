-- Emoji reactions for the web trip room. Reactions are a web-only chat feature
-- and never flow through the conversation engine. They are keyed by the public
-- message id (messages.wa_message_id), the same id the chat UI renders.
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  message_wa_id text not null references public.messages(wa_message_id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_wa_id, participant_id, emoji)
);

create index message_reactions_group_message_idx
  on public.message_reactions(group_id, message_wa_id);

alter table public.message_reactions enable row level security;
-- As with every other table, all access is via the service role in server
-- routes; no anon/authenticated policies are exposed.
