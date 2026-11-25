CREATE INDEX IF NOT EXISTS "papers_personal_scope_idx"
ON "public"."papers" ("user_id")
WHERE "team_id" IS NULL AND "embedding" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "papers_team_scope_idx"
ON "public"."papers" ("team_id")
WHERE "team_id" IS NOT NULL AND "embedding" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "papers_embedding_hnsw_idx"
ON "public"."papers"
USING hnsw (("embedding"::halfvec(3072)) halfvec_cosine_ops)
WHERE "embedding" IS NOT NULL;

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
      and match_user_id is not null
      and match_scope in ('all', 'personal', 'team')
      and (
        (
          match_scope = 'all'
          and (
            (p.team_id is null and p.user_id = match_user_id)
            or p.team_id in (select public.user_team_ids(match_user_id))
          )
        )
        or (
          match_scope = 'personal'
          and p.team_id is null
          and p.user_id = match_user_id
        )
        or (
          match_scope = 'team'
          and match_team_id is not null
          and p.team_id = match_team_id
          and p.team_id in (select public.user_team_ids(match_user_id))
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
    1 - (s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from scoped s
  order by s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit least(greatest(coalesce(match_limit, 8), 1), 25)
  offset greatest(coalesce(match_offset, 0), 0);
$$;
