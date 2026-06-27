-- Trek Intelligence Engine: first-class trek records + semantic recall.
-- Mirrors public.destinations (jsonb payload + pgvector embedding). The `data`
-- column holds a Trek (see src/lib/trek/schema.ts), re-parsed through TrekSchema
-- on read for forward-compat. Embedding is optional: rows without one still serve
-- via the app's deterministic DNA + filter fallback.

-- Dimension matches the configured embeddings model (Gemini text-embedding-004 =
-- 768). Change here + re-seed if you switch models.
create table public.treks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  state text not null,
  data jsonb not null,
  embedding vector(768),
  updated_at timestamptz not null default now()
);

-- HNSW cosine index works on an empty/under-filled table (no training step),
-- unlike ivfflat — fine for a small, slowly-growing trek corpus.
create index treks_embedding_idx on public.treks
  using hnsw (embedding vector_cosine_ops);

alter table public.treks enable row level security;
-- Like the rest of the schema: server routes use the service role; no anon access.

-- Cosine-similarity recall over treks that have an embedding. Returns the jsonb
-- payload so the caller can hydrate full Trek records in one round-trip.
create or replace function public.match_treks(
  query_embedding vector(768),
  match_count integer default 12
)
returns table (slug text, name text, state text, data jsonb, similarity double precision)
language sql
stable
as $$
  select
    t.slug,
    t.name,
    t.state,
    t.data,
    1 - (t.embedding <=> query_embedding) as similarity
  from public.treks t
  where t.embedding is not null
  order by t.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
