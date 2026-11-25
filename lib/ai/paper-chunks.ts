import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createEmbedding } from "@/lib/ai/embeddings"
import { chunkPlainText, type PaperChunkInput } from "@/lib/ai/chunking"
import { extractPdfText } from "@/lib/papers/extract-pdf-text"
import type { AIUsageContext, SearchOptions } from "@/types"

type ChunkDbClient = Pick<SupabaseClient, "from" | "rpc" | "storage">
type SearchScope = NonNullable<SearchOptions["scope"]>

interface PaperForChunkIndexing {
  id: string
  user_id: string
  team_id: string | null
}

interface MatchedChunkRow {
  chunk_id: string
  paper_id: string
  user_id: string
  team_id: string | null
  chunk_index: number
  page_number: number | null
  section_title: string | null
  content: string
  token_count: number | null
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  similarity: number
}

export interface PaperChunkSearchResult {
  chunkId: string
  paperId: string
  userId: string
  teamId: string | null
  chunkIndex: number
  pageNumber: number | null
  sectionTitle: string | null
  content: string
  tokenCount: number | null
  paper: {
    id: string
    title: string
    authors: string[]
    year: number | null
    doi: string | null
    url: string | null
  }
  score: number
}

let adminSupabaseClient: ChunkDbClient | null = null

function getAdminSupabaseClient(): ChunkDbClient {
  if (adminSupabaseClient) return adminSupabaseClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin credentials are missing. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    )
  }

  adminSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminSupabaseClient
}

function resolveClient(client?: ChunkDbClient) {
  return client ?? getAdminSupabaseClient()
}

function uniqueIds(values?: string[] | null) {
  if (!values || values.length === 0) return []
  return Array.from(new Set(values.filter(Boolean)))
}

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 20
  return Math.max(1, Math.min(50, Math.floor(limit as number)))
}

function clampOffset(offset?: number) {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.floor(offset as number))
}

function normalizeSearchOptions(options: SearchOptions) {
  const scope = options.scope || "all"
  const userId = options.user_id?.trim()
  const teamId = options.team_id?.trim()

  if (scope !== "all" && scope !== "personal" && scope !== "team") {
    throw new Error("Paper chunk search scope must be all, personal, or team")
  }

  if (!userId) {
    throw new Error("Paper chunk search requires a user_id to enforce tenant scope")
  }

  if (scope === "team" && !teamId) {
    throw new Error("Paper chunk search requires a team_id for team scope")
  }

  return {
    ...options,
    scope: scope as SearchScope,
    user_id: userId,
    team_id: teamId,
  }
}

function rowToChunkResult(row: MatchedChunkRow): PaperChunkSearchResult {
  return {
    chunkId: row.chunk_id,
    paperId: row.paper_id,
    userId: row.user_id,
    teamId: row.team_id,
    chunkIndex: row.chunk_index,
    pageNumber: row.page_number,
    sectionTitle: row.section_title,
    content: row.content,
    tokenCount: row.token_count,
    paper: {
      id: row.paper_id,
      title: row.title,
      authors: row.authors || [],
      year: row.year,
      doi: row.doi,
      url: row.url,
    },
    score: Number.isFinite(row.similarity) ? row.similarity : 0,
  }
}

async function loadPaper(db: ChunkDbClient, paperId: string) {
  const { data, error } = await db
    .from("papers")
    .select("id, user_id, team_id")
    .eq("id", paperId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load paper for chunk indexing: ${error.message}`)
  }

  return data as PaperForChunkIndexing | null
}

async function loadLatestPdfPath(db: ChunkDbClient, paperId: string) {
  const { data, error } = await db
    .from("paper_files")
    .select("file_path")
    .eq("paper_id", paperId)
    .eq("mime_type", "application/pdf")
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to load paper PDF: ${error.message}`)
  }

  return data?.[0]?.file_path as string | undefined
}

async function downloadPdf(db: ChunkDbClient, filePath: string) {
  const { data, error } = await db.storage.from("papers").download(filePath)
  if (error) {
    if (/object not found/i.test(error.message)) {
      return null
    }

    throw new Error(`Failed to download paper PDF: ${error.message}`)
  }

  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function replacePaperChunks({
  db,
  paper,
  chunks,
  usageContext,
}: {
  db: ChunkDbClient
  paper: PaperForChunkIndexing
  chunks: PaperChunkInput[]
  usageContext?: AIUsageContext
}) {
  const rows: Array<Record<string, unknown>> = []

  for (const chunk of chunks) {
    const embedding = await createEmbedding(
      chunk.content,
      usageContext
        ? {
            supabase: db,
            context: usageContext,
            metadata: {
              paperId: paper.id,
              chunkIndex: chunk.chunkIndex,
            },
          }
        : undefined
    )

    rows.push({
      paper_id: paper.id,
      user_id: paper.user_id,
      team_id: paper.team_id,
      chunk_index: chunk.chunkIndex,
      page_number: chunk.pageNumber,
      section_title: chunk.sectionTitle || null,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding,
    })
  }

  const { error: deleteError } = await db
    .from("paper_chunks")
    .delete()
    .eq("paper_id", paper.id)

  if (deleteError) {
    throw new Error(`Failed to clear existing paper chunks: ${deleteError.message}`)
  }

  if (rows.length === 0) return

  const { error: insertError } = await db.from("paper_chunks").insert(rows)
  if (insertError) {
    throw new Error(`Failed to insert paper chunks: ${insertError.message}`)
  }
}

export async function indexPaperPdfChunks({
  paperId,
  client,
  pdfBuffer,
  filePath,
  usageContext,
}: {
  paperId: string
  client?: ChunkDbClient
  pdfBuffer?: Buffer
  filePath?: string
  usageContext?: AIUsageContext
}) {
  const db = resolveClient(client)
  const paper = await loadPaper(db, paperId)
  if (!paper) {
    throw new Error("Paper not found for chunk indexing")
  }

  const resolvedPath = filePath || (await loadLatestPdfPath(db, paperId))
  const buffer = pdfBuffer || (resolvedPath ? await downloadPdf(db, resolvedPath) : null)
  if (!buffer) {
    return { indexed: 0, reason: "missing_pdf" }
  }

  const extraction = extractPdfText(buffer)
  if (!extraction.hasContent) {
    await replacePaperChunks({ db, paper, chunks: [], usageContext })
    return { indexed: 0, reason: "no_text" }
  }

  const chunks = chunkPlainText(extraction.text)
  if (chunks.length === 0) {
    await replacePaperChunks({ db, paper, chunks: [], usageContext })
    return { indexed: 0, reason: "no_chunks" }
  }

  await replacePaperChunks({ db, paper, chunks, usageContext })
  return { indexed: chunks.length }
}

export async function removePaperChunks(paperId: string, client?: ChunkDbClient) {
  const db = resolveClient(client)
  const { error } = await db.from("paper_chunks").delete().eq("paper_id", paperId)
  if (error) {
    throw new Error(`Failed to remove paper chunks: ${error.message}`)
  }
}

export async function searchPaperChunks(
  query: string,
  options: SearchOptions,
  client?: ChunkDbClient,
  usageContext?: AIUsageContext
) {
  const queryText = query.trim()
  if (!queryText) return []

  const scopedOptions = normalizeSearchOptions(options)
  const db = resolveClient(client)
  const embedding = await createEmbedding(
    queryText,
    usageContext
      ? {
          supabase: db,
          context: usageContext,
          metadata: {
            query: queryText,
            scope: scopedOptions.scope,
            retrieval: "paper_chunks",
          },
        }
      : undefined
  )
  const folderIds = uniqueIds(
    scopedOptions.folder_ids ||
      (scopedOptions.folder_id ? [scopedOptions.folder_id] : [])
  )
  const paperIds = uniqueIds(scopedOptions.paper_ids)

  const { data, error } = await db.rpc("match_paper_chunks", {
    query_embedding: embedding,
    match_user_id: scopedOptions.user_id,
    match_team_id: scopedOptions.team_id || null,
    match_scope: scopedOptions.scope,
    match_folder_ids: folderIds.length > 0 ? folderIds : null,
    match_paper_ids: paperIds.length > 0 ? paperIds : null,
    match_limit: clampLimit(scopedOptions.limit),
    match_offset: clampOffset(scopedOptions.offset),
  })

  if (error) {
    throw new Error(`Paper chunk search failed: ${error.message}`)
  }

  return ((data || []) as MatchedChunkRow[]).map(rowToChunkResult)
}
