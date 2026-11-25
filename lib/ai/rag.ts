import type { SupabaseClient } from "@supabase/supabase-js"
import type { SearchResult } from "@/types"
import { aiSearchProvider } from "@/lib/ai/search"
import {
  indexPaperPdfChunks,
  searchPaperChunks,
  type PaperChunkSearchResult,
} from "@/lib/ai/paper-chunks"

interface NoteRow {
  paper_id: string
  title: string | null
  content: string
  updated_at: string
}

export interface RagSource {
  sourceId: string
  paperId: string
  chunkId?: string
  chunkIndex?: number
  pageNumber?: number | null
  sourceType: "chunk" | "paper"
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  hasPdf: boolean
  score: number
  abstractSnippet: string | null
}

export interface BuildRagContextOptions {
  query: string
  userId: string
  teamId: string | null
  selectedFolderIds: string[]
  selectedPaperIds: string[]
  supabase: SupabaseClient
  limit?: number
}

export interface RagContextResult {
  promptContext: string
  sources: RagSource[]
  searchResults: SearchResult[]
  chunkResults: PaperChunkSearchResult[]
  scopeSummary: string
  metadata: {
    retrievedSourceCount: number
    promptChars: number
  }
}

const MAX_CONTEXT_RESULTS = 5
const MAX_ABSTRACT_CHARS = 600
const MAX_CHUNK_CHARS = 1200
const MAX_NOTE_CHARS = 240
const MAX_NOTES_PAPER_COUNT = 4
const MAX_LAZY_INDEX_PDFS = 2

interface PaperFileCandidate {
  paper_id: string
  file_path: string
}

interface PaperScopeRow {
  id: string
  user_id: string
  team_id: string | null
}

function normalizeIds(values: string[]) {
  return Array.from(
    new Set(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}...`
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function formatAuthors(authors: string[]) {
  if (authors.length === 0) return "Unknown"
  if (authors.length <= 4) return authors.join(", ")
  return `${authors.slice(0, 4).join(", ")}, et al.`
}

function formatScopeSummary(
  teamId: string | null,
  folderIds: string[],
  paperIds: string[]
) {
  const workspace = teamId ? "team workspace" : "personal workspace"
  if (folderIds.length === 0 && paperIds.length === 0) {
    return `Searching everything in your ${workspace}.`
  }

  return `Searching ${folderIds.length} selected folder(s) and ${paperIds.length} selected paper(s) in your ${workspace}.`
}

function buildPromptContext(
  results: SearchResult[],
  noteMap: Map<string, string[]>
) {
  if (results.length === 0) {
    return "No relevant sources were found for this question in the selected workspace context."
  }

  const blocks = results.map((result, index) => {
    const sourceId = `S${index + 1}`
    const paper = result.paper
    const notes = noteMap.get(paper.id) || []
    const abstract = cleanText(paper.abstract || "")

    const parts = [
      `[${sourceId}] ${paper.title}`,
      `Authors: ${formatAuthors(paper.authors || [])}`,
      `Year: ${paper.year ?? "Unknown"}`,
      paper.doi ? `DOI: ${paper.doi}` : "",
      paper.url ? `URL: ${paper.url}` : "",
      abstract ? `Abstract: ${truncate(abstract, MAX_ABSTRACT_CHARS)}` : "",
      notes.length > 0
        ? `Notes:\n${notes
            .map(
              (note, noteIndex) =>
                `- (${noteIndex + 1}) ${truncate(cleanText(note), MAX_NOTE_CHARS)}`
            )
            .join("\n")}`
        : "",
    ].filter(Boolean)

    return parts.join("\n")
  })

  return blocks.join("\n\n")
}

function buildChunkPromptContext(
  results: PaperChunkSearchResult[],
  noteMap: Map<string, string[]>
) {
  if (results.length === 0) {
    return "No relevant full-text passages were found for this question in the selected workspace context."
  }

  const blocks = results.map((result, index) => {
    const sourceId = `S${index + 1}`
    const notes = noteMap.get(result.paperId) || []
    const evidence = truncate(cleanText(result.content), MAX_CHUNK_CHARS)

    const parts = [
      `[${sourceId}] ${result.paper.title}`,
      `Authors: ${formatAuthors(result.paper.authors || [])}`,
      `Year: ${result.paper.year ?? "Unknown"}`,
      result.paper.doi ? `DOI: ${result.paper.doi}` : "",
      result.paper.url ? `URL: ${result.paper.url}` : "",
      result.pageNumber ? `Page: ${result.pageNumber}` : "",
      `Evidence: ${evidence}`,
      notes.length > 0
        ? `Notes:\n${notes
            .map(
              (note, noteIndex) =>
                `- (${noteIndex + 1}) ${truncate(cleanText(note), MAX_NOTE_CHARS)}`
            )
            .join("\n")}`
        : "",
    ].filter(Boolean)

    return parts.join("\n")
  })

  return blocks.join("\n\n")
}

function diversifyChunks(results: PaperChunkSearchResult[], limit: number) {
  const selected: PaperChunkSearchResult[] = []
  const perPaperCount = new Map<string, number>()
  const maxPerPaper = 3

  for (const result of results) {
    const count = perPaperCount.get(result.paperId) || 0
    if (count >= maxPerPaper) continue

    selected.push(result)
    perPaperCount.set(result.paperId, count + 1)

    if (selected.length >= limit) break
  }

  if (selected.length >= limit) return selected

  for (const result of results) {
    if (selected.some((item) => item.chunkId === result.chunkId)) continue
    selected.push(result)
    if (selected.length >= limit) break
  }

  return selected
}

async function loadCandidatePaperIds({
  supabase,
  teamId,
  selectedFolderIds,
  selectedPaperIds,
}: {
  supabase: SupabaseClient
  teamId: string | null
  selectedFolderIds: string[]
  selectedPaperIds: string[]
}) {
  if (selectedPaperIds.length > 0) return selectedPaperIds

  if (selectedFolderIds.length > 0) {
    const { data } = await supabase
      .from("paper_folders")
      .select("paper_id")
      .in("folder_id", selectedFolderIds)
      .limit(20)

    return Array.from(
      new Set(
        (data || [])
          .map((row) => row.paper_id)
          .filter((paperId): paperId is string => typeof paperId === "string")
      )
    )
  }

  const { data: files } = await supabase
    .from("paper_files")
    .select("paper_id")
    .eq("mime_type", "application/pdf")
    .order("created_at", { ascending: false })
    .limit(20)

  const filePaperIds = Array.from(
    new Set(
      (files || [])
        .map((row) => row.paper_id)
        .filter((paperId): paperId is string => typeof paperId === "string")
    )
  )

  if (filePaperIds.length === 0) return []

  const { data: papers } = await supabase
    .from("papers")
    .select("id, user_id, team_id")
    .in("id", filePaperIds)

  return ((papers || []) as PaperScopeRow[])
    .filter((paper) => (teamId ? paper.team_id === teamId : paper.team_id === null))
    .map((paper) => paper.id)
}

async function lazilyIndexMissingPdfChunks({
  supabase,
  userId,
  teamId,
  selectedFolderIds,
  selectedPaperIds,
}: {
  supabase: SupabaseClient
  userId: string
  teamId: string | null
  selectedFolderIds: string[]
  selectedPaperIds: string[]
}) {
  const candidatePaperIds = await loadCandidatePaperIds({
    supabase,
    teamId,
    selectedFolderIds,
    selectedPaperIds,
  })

  if (candidatePaperIds.length === 0) return

  const { data: files } = await supabase
    .from("paper_files")
    .select("paper_id, file_path")
    .in("paper_id", candidatePaperIds)
    .eq("mime_type", "application/pdf")
    .limit(20)

  const candidates = ((files || []) as PaperFileCandidate[]).filter(
    (file) => file.paper_id && file.file_path
  )
  if (candidates.length === 0) return

  const { data: existingChunks } = await supabase
    .from("paper_chunks")
    .select("paper_id")
    .in(
      "paper_id",
      candidates.map((file) => file.paper_id)
    )
    .limit(1000)

  const indexedPaperIds = new Set(
    (existingChunks || [])
      .map((chunk) => chunk.paper_id)
      .filter((paperId): paperId is string => typeof paperId === "string")
  )

  const missing = candidates
    .filter((file) => !indexedPaperIds.has(file.paper_id))
    .slice(0, MAX_LAZY_INDEX_PDFS)

  for (const file of missing) {
    try {
      await indexPaperPdfChunks({
        paperId: file.paper_id,
        client: supabase,
        filePath: file.file_path,
        usageContext: {
          userId,
          teamId,
          feature: "paper_chunk_indexing",
        },
      })
    } catch (error) {
      console.error("Failed to lazily index PDF chunks:", error)
    }
  }
}

export async function buildRagContext({
  query,
  userId,
  teamId,
  selectedFolderIds,
  selectedPaperIds,
  supabase,
  limit,
}: BuildRagContextOptions): Promise<RagContextResult> {
  const normalizedFolders = normalizeIds(selectedFolderIds)
  const normalizedPapers = normalizeIds(selectedPaperIds)
  const retrievalLimit = Math.max(1, Math.min(limit || MAX_CONTEXT_RESULTS, 12))

  await lazilyIndexMissingPdfChunks({
    supabase,
    userId,
    teamId,
    selectedFolderIds: normalizedFolders,
    selectedPaperIds: normalizedPapers,
  })

  const chunkResults = diversifyChunks(
    await searchPaperChunks(
      query,
      {
        query,
        scope: teamId ? "team" : "personal",
        user_id: userId,
        team_id: teamId || undefined,
        folder_ids: normalizedFolders,
        paper_ids: normalizedPapers,
        limit: Math.min(retrievalLimit * 4, 40),
      },
      supabase,
      {
        userId,
        teamId,
        feature: "chat_retrieval",
      }
    ),
    retrievalLimit
  )

  if (chunkResults.length > 0) {
    const paperIds = Array.from(new Set(chunkResults.map((result) => result.paperId)))
    const notePaperIds = paperIds.slice(0, MAX_NOTES_PAPER_COUNT)
    const noteMap = new Map<string, string[]>()

    if (notePaperIds.length > 0) {
      const { data: notes } = await supabase
        .from("notes")
        .select("paper_id, title, content, updated_at")
        .in("paper_id", notePaperIds)
        .order("updated_at", { ascending: false })

      for (const note of (notes || []) as NoteRow[]) {
        const value = [note.title, note.content].filter(Boolean).join("\n")
        if (!value.trim()) continue

        const existing = noteMap.get(note.paper_id) || []
        if (existing.length < 2) {
          existing.push(value)
        }
        noteMap.set(note.paper_id, existing)
      }
    }

    const sources: RagSource[] = chunkResults.map((result, index) => ({
      sourceId: `S${index + 1}`,
      paperId: result.paperId,
      chunkId: result.chunkId,
      chunkIndex: result.chunkIndex,
      pageNumber: result.pageNumber,
      sourceType: "chunk",
      title: result.paper.title,
      authors: result.paper.authors || [],
      year: result.paper.year,
      doi: result.paper.doi,
      url: result.paper.url,
      hasPdf: true,
      score: result.score,
      abstractSnippet: truncate(cleanText(result.content), 240),
    }))

    const promptContext = buildChunkPromptContext(chunkResults, noteMap)

    return {
      promptContext,
      sources,
      searchResults: [],
      chunkResults,
      scopeSummary: formatScopeSummary(
        teamId,
        normalizedFolders,
        normalizedPapers
      ),
      metadata: {
        retrievedSourceCount: chunkResults.length,
        promptChars: promptContext.length,
      },
    }
  }

  const searchResults = await aiSearchProvider.search(
    query,
    {
      query,
      scope: teamId ? "team" : "personal",
      user_id: userId,
      team_id: teamId || undefined,
      folder_ids: normalizedFolders,
      paper_ids: normalizedPapers,
      limit: retrievalLimit,
    },
    supabase,
    {
      userId,
      teamId,
      feature: "chat_retrieval",
    }
  )

  const paperIds = searchResults.map((result) => result.paper.id)
  const notePaperIds = paperIds.slice(0, MAX_NOTES_PAPER_COUNT)
  const noteMap = new Map<string, string[]>()

  if (notePaperIds.length > 0) {
    const { data: notes } = await supabase
      .from("notes")
      .select("paper_id, title, content, updated_at")
      .in("paper_id", notePaperIds)
      .order("updated_at", { ascending: false })

    for (const note of (notes || []) as NoteRow[]) {
      const value = [note.title, note.content].filter(Boolean).join("\n")
      if (!value.trim()) continue

      const existing = noteMap.get(note.paper_id) || []
      if (existing.length < 2) {
        existing.push(value)
      }
      noteMap.set(note.paper_id, existing)
    }
  }

  const papersWithPdf = new Map<string, boolean>()
  if (paperIds.length > 0) {
    const { data: paperFiles } = await supabase
      .from("paper_files")
      .select("paper_id")
      .in("paper_id", paperIds)
      .eq("mime_type", "application/pdf")

    for (const file of paperFiles || []) {
      papersWithPdf.set(file.paper_id, true)
    }
  }

  const sources: RagSource[] = searchResults.map((result, index) => ({
    sourceId: `S${index + 1}`,
    paperId: result.paper.id,
    sourceType: "paper",
    title: result.paper.title,
    authors: result.paper.authors || [],
    year: result.paper.year,
    doi: result.paper.doi,
    url: result.paper.url,
    hasPdf: papersWithPdf.get(result.paper.id) ?? false,
    score: result.score,
    abstractSnippet: result.paper.abstract
      ? truncate(cleanText(result.paper.abstract), 240)
      : null,
  }))

  const promptContext = buildPromptContext(searchResults, noteMap)

  return {
    promptContext,
    sources,
    searchResults,
    chunkResults: [],
    scopeSummary: formatScopeSummary(
      teamId,
      normalizedFolders,
      normalizedPapers
    ),
    metadata: {
      retrievedSourceCount: searchResults.length,
      promptChars: promptContext.length,
    },
  }
}
