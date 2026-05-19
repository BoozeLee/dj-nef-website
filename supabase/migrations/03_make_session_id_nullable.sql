-- Make session_id nullable so chat_messages can be inserted with session_token only
-- (the API persists messages using session_token from localStorage, not a session FK)

alter table chat_messages alter column session_id drop not null;
