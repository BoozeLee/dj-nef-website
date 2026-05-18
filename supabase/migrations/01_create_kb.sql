-- Enable pgvector extension
create extension if not exists vector;

-- Knowledge base chunks table
create table if not exists kb_chunks (
  id bigserial primary key,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768) not null
);

-- HNSW index for fast similarity search
create index if not exists kb_chunks_embedding_idx
on kb_chunks using hnsw (embedding vector_cosine_ops);

-- Function to match similar chunks
create or replace function match_kb_chunks(
  query_embedding vector(768),
  match_count int default 5
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    kb_chunks.id,
    kb_chunks.content,
    kb_chunks.metadata,
    1 - (kb_chunks.embedding <=> query_embedding) as similarity
  from kb_chunks
  order by kb_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Chat sessions table
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  created_at timestamptz not null default now()
);

-- Chat messages table
create table if not exists chat_messages (
  id bigserial primary key,
  session_id uuid references chat_sessions(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

-- Policies for chat_sessions
create policy "users can view own sessions"
on chat_sessions for select
using (auth.uid() = user_id);

create policy "users can insert own sessions"
on chat_sessions for insert
with check (auth.uid() = user_id);

-- Policies for chat_messages
create policy "users can view own messages"
on chat_messages for select
using (auth.uid() = user_id);

create policy "users can insert own messages"
on chat_messages for insert
with check (auth.uid() = user_id);