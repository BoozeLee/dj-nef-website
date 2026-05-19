-- Replace auth.users FK with plain session_token so the chat works without Supabase Auth.
-- Session tokens are client-generated UUIDs stored in localStorage.

alter table chat_sessions drop column if exists user_id;
alter table chat_messages drop column if exists user_id;

alter table chat_sessions
  add column if not exists session_token text not null default gen_random_uuid()::text;

alter table chat_messages
  add column if not exists session_token text;

-- Drop auth-dependent RLS policies
drop policy if exists "users can view own sessions" on chat_sessions;
drop policy if exists "users can insert own sessions" on chat_sessions;
drop policy if exists "users can view own messages" on chat_messages;
drop policy if exists "users can insert own messages" on chat_messages;

alter table chat_sessions disable row level security;
alter table chat_messages disable row level security;

-- Index for fast session lookups
create index if not exists chat_sessions_token_idx on chat_sessions (session_token);
create index if not exists chat_messages_session_token_idx on chat_messages (session_token);
