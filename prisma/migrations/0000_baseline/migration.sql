-- Baseline aligned to existing production schema for non-destructive migration history.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS "public";
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE SCHEMA IF NOT EXISTS "storage";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  owner_id text,
  version text,
  metadata jsonb,
  user_metadata jsonb,
  path_tokens text[],
  created_at timestamptz,
  updated_at timestamptz,
  last_accessed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_bucket_id_name
  ON storage.objects (bucket_id, name);

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_split_to_array(name, '/')
$$;

CREATE TYPE "public"."team_role" AS ENUM ('owner', 'admin', 'editor', 'viewer');

CREATE TABLE "public"."billing_events" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "stripe_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processed',
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."chat_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "team_id" UUID,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "selected_folder_ids" UUID[] DEFAULT ARRAY[]::UUID[],
  "selected_paper_ids" UUID[] DEFAULT ARRAY[]::UUID[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sources" JSONB NOT NULL DEFAULT '[]',
  "model" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "token_usage" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."folders" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "team_id" UUID,
  "parent_id" UUID,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."notes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "paper_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."paper_files" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "paper_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_size" BIGINT NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paper_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."paper_folders" (
  "paper_id" UUID NOT NULL,
  "folder_id" UUID NOT NULL,
  "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paper_folders_pkey" PRIMARY KEY ("paper_id", "folder_id")
);

CREATE TABLE "public"."paper_tags" (
  "paper_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "paper_tags_pkey" PRIMARY KEY ("paper_id", "tag_id")
);

CREATE TABLE "public"."papers" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "team_id" UUID,
  "title" TEXT NOT NULL,
  "authors" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "year" INTEGER,
  "abstract" TEXT,
  "paper_type" TEXT NOT NULL DEFAULT 'article',
  "doi" TEXT,
  "url" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "embedding" vector,
  CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."profiles" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "full_name" TEXT,
  "avatar_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "stripe_customer_id" TEXT,
  "stripe_subscription_id" TEXT,
  "billing_status" TEXT,
  "plan_renewal_at" TIMESTAMPTZ(6),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "billing_grace_until" TIMESTAMPTZ(6),
  CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."tags" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."team_invites" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "team_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "public"."team_role" NOT NULL DEFAULT 'viewer',
  "invited_by" UUID,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + '7 days'::interval),
  CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."team_members" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "team_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "public"."team_role" NOT NULL DEFAULT 'viewer',
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."teams" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_events_stripe_event_id_key" ON "public"."billing_events"("stripe_event_id" ASC);
CREATE INDEX "chat_conversations_user_last_message_idx" ON "public"."chat_conversations"("user_id" ASC, "last_message_at" DESC);
CREATE INDEX "chat_messages_conversation_created_idx" ON "public"."chat_messages"("conversation_id" ASC, "created_at" ASC);
CREATE INDEX "papers_user_idx" ON "public"."papers"("user_id" ASC);
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "public"."tags"("user_id" ASC, "name" ASC);
CREATE UNIQUE INDEX "team_invites_team_id_email_key" ON "public"."team_invites"("team_id" ASC, "email" ASC);
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "public"."team_members"("team_id" ASC, "user_id" ASC);

ALTER TABLE "public"."chat_conversations" ADD CONSTRAINT "chat_conversations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."notes" ADD CONSTRAINT "notes_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."paper_files" ADD CONSTRAINT "paper_files_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."paper_folders" ADD CONSTRAINT "paper_folders_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."paper_folders" ADD CONSTRAINT "paper_folders_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."paper_tags" ADD CONSTRAINT "paper_tags_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."paper_tags" ADD CONSTRAINT "paper_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."papers" ADD CONSTRAINT "papers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."papers" ADD CONSTRAINT "papers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."team_invites" ADD CONSTRAINT "team_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."team_invites" ADD CONSTRAINT "team_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
