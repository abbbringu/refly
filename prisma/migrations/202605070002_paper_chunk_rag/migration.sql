CREATE TABLE IF NOT EXISTS "public"."paper_chunks" (
  "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  "paper_id" uuid REFERENCES "public"."papers"("id") ON DELETE CASCADE NOT NULL,
  "user_id" uuid REFERENCES "public"."profiles"("id") ON DELETE CASCADE NOT NULL,
  "team_id" uuid REFERENCES "public"."teams"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "page_number" integer,
  "section_title" text,
  "content" text NOT NULL,
  "token_count" integer,
  "embedding" vector(3072),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE ("paper_id", "chunk_index")
);

ALTER TABLE "public"."paper_chunks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own paper chunks"
  ON "public"."paper_chunks" FOR SELECT
  USING (
    "user_id" = auth.uid()
    OR "team_id" IN (SELECT public.user_team_ids(auth.uid()))
  );

CREATE POLICY "Users can create own paper chunks"
  ON "public"."paper_chunks" FOR INSERT
  WITH CHECK (
    "user_id" = auth.uid()
    AND (
      "team_id" IS NULL
      OR "team_id" IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

CREATE POLICY "Users can update own paper chunks"
  ON "public"."paper_chunks" FOR UPDATE
  USING (
    "user_id" = auth.uid()
    OR "team_id" IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

CREATE POLICY "Users can delete own paper chunks"
  ON "public"."paper_chunks" FOR DELETE
  USING (
    "user_id" = auth.uid()
    OR "team_id" IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

CREATE INDEX IF NOT EXISTS "paper_chunks_paper_idx" ON "public"."paper_chunks" ("paper_id");
CREATE INDEX IF NOT EXISTS "paper_chunks_user_idx" ON "public"."paper_chunks" ("user_id") WHERE "team_id" IS NULL AND "embedding" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "paper_chunks_team_idx" ON "public"."paper_chunks" ("team_id") WHERE "team_id" IS NOT NULL AND "embedding" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "paper_chunks_embedding_hnsw_idx"
ON "public"."paper_chunks"
USING hnsw (("embedding"::halfvec(3072)) halfvec_cosine_ops)
WHERE "embedding" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."match_paper_chunks"(
  "query_embedding" vector(3072),
  "match_user_id" uuid DEFAULT auth.uid(),
  "match_team_id" uuid DEFAULT NULL,
  "match_scope" text DEFAULT 'all',
  "match_folder_ids" uuid[] DEFAULT NULL,
  "match_paper_ids" uuid[] DEFAULT NULL,
  "match_limit" integer DEFAULT 20,
  "match_offset" integer DEFAULT 0
)
RETURNS TABLE (
  "chunk_id" uuid,
  "paper_id" uuid,
  "user_id" uuid,
  "team_id" uuid,
  "chunk_index" integer,
  "page_number" integer,
  "section_title" text,
  "content" text,
  "token_count" integer,
  "title" text,
  "authors" text[],
  "year" integer,
  "doi" text,
  "url" text,
  "similarity" double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  with scoped as (
    select pc.*, p.title, p.authors, p.year, p.doi, p.url
    from public.paper_chunks pc
    join public.papers p on p.id = pc.paper_id
    where pc.embedding is not null
      and match_user_id is not null
      and match_scope in ('all', 'personal', 'team')
      and (
        (
          match_scope = 'all'
          and (
            (pc.team_id is null and pc.user_id = match_user_id)
            or pc.team_id in (select public.user_team_ids(match_user_id))
          )
        )
        or (
          match_scope = 'personal'
          and pc.team_id is null
          and pc.user_id = match_user_id
        )
        or (
          match_scope = 'team'
          and match_team_id is not null
          and pc.team_id = match_team_id
          and pc.team_id in (select public.user_team_ids(match_user_id))
        )
      )
      and (
        (coalesce(array_length(match_folder_ids, 1), 0) = 0 and coalesce(array_length(match_paper_ids, 1), 0) = 0)
        or pc.paper_id = any(coalesce(match_paper_ids, array[]::uuid[]))
        or pc.paper_id in (
          select pf.paper_id
          from public.paper_folders pf
          where pf.folder_id = any(coalesce(match_folder_ids, array[]::uuid[]))
        )
      )
  )
  select
    s.id as chunk_id,
    s.paper_id,
    s.user_id,
    s.team_id,
    s.chunk_index,
    s.page_number,
    s.section_title,
    s.content,
    s.token_count,
    s.title,
    s.authors,
    s.year,
    s.doi,
    s.url,
    1 - (s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from scoped s
  order by s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit least(greatest(coalesce(match_limit, 20), 1), 50)
  offset greatest(coalesce(match_offset, 0), 0);
$$;
