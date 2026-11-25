-- Migration: chat_conversations and chat_messages tables
-- Created: 2026-04-16

BEGIN;

-- ─── CHAT CONVERSATIONS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "team_id" UUID REFERENCES "teams"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "selected_folder_ids" UUID[] NOT NULL DEFAULT '{}',
  "selected_paper_ids" UUID[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "chat_conversations_user_last_message_idx"
  ON "chat_conversations" ("user_id", "last_message_at" DESC);

-- ─── CHAT MESSAGES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "sources" JSONB NOT NULL DEFAULT '[]',
  "model" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "chat_messages_conversation_created_idx"
  ON "chat_messages" ("conversation_id", "created_at");

-- ─── Updated At Trigger for chat_conversations ────────────────

CREATE OR REPLACE FUNCTION "update_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "update_chat_conversations_updated_at" ON "chat_conversations";

CREATE TRIGGER "update_chat_conversations_updated_at"
  BEFORE UPDATE ON "chat_conversations"
  FOR EACH ROW EXECUTE PROCEDURE "update_updated_at"();

COMMIT;
