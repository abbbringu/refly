DROP INDEX IF EXISTS "public"."papers_embedding_hnsw_idx";

UPDATE "public"."papers"
SET "embedding" = NULL
WHERE "embedding" IS NOT NULL;

ALTER TABLE "public"."papers"
ALTER COLUMN "embedding" TYPE vector(3072);

DROP FUNCTION IF EXISTS "public"."match_papers"(vector, uuid, uuid, text, uuid[], uuid[], integer, integer);

CREATE OR REPLACE FUNCTION "public"."match_papers"(
  "query_embedding" vector(3072),
  "match_user_id" uuid DEFAULT auth.uid(),
  "match_team_id" uuid DEFAULT NULL,
  "match_scope" text DEFAULT 'all',
  "match_folder_ids" uuid[] DEFAULT NULL,
  "match_paper_ids" uuid[] DEFAULT NULL,
  "match_limit" integer DEFAULT 8,
  "match_offset" integer DEFAULT 0
)
RETURNS TABLE (
  "id" uuid,
  "user_id" uuid,
  "team_id" uuid,
  "title" text,
  "authors" text[],
  "year" integer,
  "abstract" text,
  "paper_type" text,
  "doi" text,
  "url" text,
  "metadata" jsonb,
  "is_favorite" boolean,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "similarity" double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  with scoped as (
    select p.*
    from public.papers p
    where p.embedding is not null
      and (
        match_scope = 'all'
        or (
          match_scope = 'personal'
          and p.team_id is null
          and p.user_id = coalesce(match_user_id, auth.uid())
        )
        or (
          match_scope = 'team'
          and match_team_id is not null
          and p.team_id = match_team_id
        )
      )
      and (
        (coalesce(array_length(match_folder_ids, 1), 0) = 0 and coalesce(array_length(match_paper_ids, 1), 0) = 0)
        or p.id = any(coalesce(match_paper_ids, array[]::uuid[]))
        or p.id in (
          select pf.paper_id
          from public.paper_folders pf
          where pf.folder_id = any(coalesce(match_folder_ids, array[]::uuid[]))
        )
      )
  )
  select
    s.id,
    s.user_id,
    s.team_id,
    s.title,
    s.authors,
    s.year,
    s.abstract,
    s.paper_type,
    s.doi,
    s.url,
    s.metadata,
    s.is_favorite,
    s.created_at,
    s.updated_at,
    1 - (s.embedding <=> query_embedding) as similarity
  from scoped s
  order by s.embedding <=> query_embedding
  limit greatest(coalesce(match_limit, 8), 1)
  offset greatest(coalesce(match_offset, 0), 0);
$$;
