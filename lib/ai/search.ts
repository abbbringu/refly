import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AISearchProvider,
  AIUsageContext,
  Paper,
  SearchOptions,
  SearchResult,
} from "@/types"
import { buildPaperEmbeddingInput, createEmbedding } from "@/lib/ai/embeddings"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

type SearchDbClient = Pick<SupabaseClient, "from" | "rpc">
type SearchScope = NonNullable<SearchOptions["scope"]>
type ScopedSearchOptions = SearchOptions & {
  scope: SearchScope
  user_id: string
}

interface MatchedPaperRow {
  id: string
  user_id: string
  team_id: string | null
  title: string
  authors: string[]
  year: number | null
  abstract: string | null
  paper_type: Paper["paper_type"]
  doi: string | null
  url: string | null
  metadata: Paper["metadata"]
  is_favorite: boolean
  created_at: string
  updated_at: string
  similarity: number
}

function resolveClient(client?: SearchDbClient): SearchDbClient {
  return client ?? (getSupabaseAdminClient() as SearchDbClient)
}

function uniqueIds(values?: string[] | null) {
  if (!values || values.length === 0) return []
  return Array.from(new Set(values.filter(Boolean)))
}

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 8
  return Math.max(1, Math.min(25, Math.floor(limit as number)))
}

function clampOffset(offset?: number) {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.floor(offset as number))
}

function normalizeSearchOptions(options?: SearchOptions): ScopedSearchOptions {
  const scope = options?.scope || "all"
  const userId = options?.user_id?.trim()
  const teamId = options?.team_id?.trim()

  if (scope !== "all" && scope !== "personal" && scope !== "team") {
    throw new Error("AI search scope must be all, personal, or team")
  }

  if (!userId) {
    throw new Error("AI search requires a user_id to enforce tenant scope")
  }

  if (scope === "team" && !teamId) {
    throw new Error("AI search requires a team_id for team scope")
  }

  return {
    ...options,
    query: options?.query ?? "",
    scope,
    user_id: userId,
    team_id: teamId,
  }
}

function buildHighlights(
  query: string,
  paper: Paper
): SearchResult["highlights"] | undefined {
  const abstract = paper.abstract || ""
  const title = paper.title || ""
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) return undefined

  if (title.toLowerCase().includes(normalizedQuery)) {
    return [{ field: "title", snippet: title }]
  }

  if (!abstract) return undefined

  const abstractLower = abstract.toLowerCase()
  const hitIndex = abstractLower.indexOf(normalizedQuery)
  if (hitIndex < 0) return undefined

  const start = Math.max(0, hitIndex - 120)
  const end = Math.min(abstract.length, hitIndex + normalizedQuery.length + 120)
  const snippet = abstract.slice(start, end).replace(/\s+/g, " ").trim()

  return [{ field: "abstract", snippet }]
}

function rowToPaper(row: MatchedPaperRow): Paper {
  return {
    id: row.id,
    user_id: row.user_id,
    team_id: row.team_id,
    title: row.title,
    authors: row.authors || [],
    year: row.year,
    abstract: row.abstract,
    paper_type: row.paper_type,
    doi: row.doi,
    url: row.url,
    metadata: row.metadata || {},
    is_favorite: row.is_favorite,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

class OpenAISearchProvider implements AISearchProvider {
  async indexPaper(
    paper: Paper,
    client?: SearchDbClient,
    usageContext?: AIUsageContext
  ): Promise<void> {
    const db = resolveClient(client)
    const embeddingInput = buildPaperEmbeddingInput(paper)

    if (!embeddingInput) {
      await db.from("papers").update({ embedding: null }).eq("id", paper.id)
      return
    }

    const embedding = await createEmbedding(
      embeddingInput,
      usageContext
        ? {
            supabase: db,
            context: usageContext,
            metadata: { paperId: paper.id },
          }
        : undefined
    )
    const query = db.from("papers").update({ embedding }).eq("id", paper.id)

    if (paper.user_id) {
      query.eq("user_id", paper.user_id)
    }

    const { error } = await query
    if (error) {
      throw new Error(`Failed to index paper embedding: ${error.message}`)
    }
  }

  async removePaper(paperId: string, client?: SearchDbClient): Promise<void> {
    const db = resolveClient(client)
    const { error } = await db
      .from("papers")
      .update({ embedding: null })
      .eq("id", paperId)

    if (error) {
      throw new Error(`Failed to remove paper embedding: ${error.message}`)
    }
  }

  async search(
    query: string,
    options?: SearchOptions,
    client?: SearchDbClient,
    usageContext?: AIUsageContext
  ): Promise<SearchResult[]> {
    const queryText = query.trim()
    if (!queryText) return []
    const scopedOptions = normalizeSearchOptions(options)

    const embedding = await createEmbedding(
      queryText,
      usageContext
        ? {
            supabase: resolveClient(client),
            context: usageContext,
            metadata: {
              query: queryText,
              scope: scopedOptions.scope,
            },
          }
        : undefined
    )
    return this.searchByEmbedding(embedding, queryText, scopedOptions, client)
  }

  async similarPapers(
    paperId: string,
    limit = 5,
    client?: SearchDbClient,
    usageContext?: AIUsageContext
  ): Promise<Paper[]> {
    const db = resolveClient(client)
    const normalizedLimit = Math.max(1, Math.min(20, Math.floor(limit)))

    const { data: paper, error } = await db
      .from("papers")
      .select("id, user_id, team_id, embedding")
      .eq("id", paperId)
      .maybeSingle()

    if (error) {
      throw new Error(
        `Failed to load source paper for similarity search: ${error.message}`
      )
    }

    const sourceEmbedding = paper?.embedding as number[] | null | undefined
    if (!paper || !sourceEmbedding || sourceEmbedding.length === 0) {
      return []
    }

    const scope: SearchOptions["scope"] = paper.team_id ? "team" : "personal"
    const options: SearchOptions = {
      query: "",
      scope,
      team_id: paper.team_id || undefined,
      user_id: paper.user_id,
      limit: normalizedLimit + 1,
    }

    const results = await this.searchByEmbedding(
      sourceEmbedding,
      "",
      normalizeSearchOptions(options),
      db
    )
    return results
      .filter((result) => result.paper.id !== paperId)
      .slice(0, normalizedLimit)
      .map((result) => result.paper)
  }

  private async searchByEmbedding(
    embedding: number[],
    query: string,
    options: ScopedSearchOptions,
    client?: SearchDbClient
  ): Promise<SearchResult[]> {
    const db = resolveClient(client)
    const folderIds = uniqueIds(
      options.folder_ids || (options.folder_id ? [options.folder_id] : [])
    )
    const paperIds = uniqueIds(options.paper_ids)

    const { data, error } = await db.rpc("match_papers", {
      query_embedding: embedding,
      match_user_id: options.user_id,
      match_team_id: options.team_id || null,
      match_scope: options.scope,
      match_folder_ids: folderIds.length > 0 ? folderIds : null,
      match_paper_ids: paperIds.length > 0 ? paperIds : null,
      match_limit: clampLimit(options.limit),
      match_offset: clampOffset(options.offset),
    })

    if (error) {
      throw new Error(`AI search query failed: ${error.message}`)
    }

    const rows = (data || []) as MatchedPaperRow[]
    return rows.map((row) => {
      const paper = rowToPaper(row)
      return {
        paper,
        score: Number.isFinite(row.similarity) ? row.similarity : 0,
        highlights: buildHighlights(query, paper),
      }
    })
  }
}

export const aiSearchProvider = new OpenAISearchProvider()
