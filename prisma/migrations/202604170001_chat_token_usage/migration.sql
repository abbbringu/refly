alter table "chat_messages"
add column if not exists "token_usage" jsonb not null default '{}'::jsonb;
