CREATE TABLE IF NOT EXISTS "public"."ai_usage_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "team_id" UUID,
  "feature" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_usd" NUMERIC(12,8) NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ai_usage_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ai_usage_events_operation_check" CHECK ("operation" IN ('chat_completion', 'embedding'))
);

CREATE INDEX IF NOT EXISTS "ai_usage_events_user_created_idx"
  ON "public"."ai_usage_events"("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_events_user_feature_idx"
  ON "public"."ai_usage_events"("user_id", "feature", "created_at" DESC);
