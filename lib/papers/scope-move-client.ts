import type { SupabaseClient } from "@supabase/supabase-js"
import { PAPER_SELECT } from "@/lib/db/selects"

type TeamScopeId = string | null

interface PaperRow {
  id: string
  user_id: string
  team_id: string | null
  title: string
  authors: string[] | null
  year: number | null
  abstract: string | null
  paper_type: string
  doi: string | null
  url: string | null
  metadata: Record<string, unknown> | null
  is_favorite: boolean
}

interface PaperFileRow {
  paper_id?: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
}

interface PaperFolderRow {
  paper_id: string
  folder_id: string
}

function normalizeComparableUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    parsed.hash = ""
    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "")
    }
    return parsed.toString()
  } catch {
    return rawUrl.trim()
  }
}

function extractArxivId(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const value = metadata.arxiv_id
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Batch-find existing papers in the target scope that match the source papers.
 * Uses parallel queries for DOIs, arXiv IDs, and URLs instead of sequential per-paper calls.
 */
async function batchFindExistingPapers(
  supabase: SupabaseClient,
  sourcePapers: PaperRow[],
  targetTeamId: TeamScopeId,
): Promise<Map<string, PaperRow>> {
  const result = new Map<string, PaperRow>()

  const dois = sourcePapers.map((p) => p.doi?.trim()).filter(Boolean) as string[]
  const arxivIds = sourcePapers
    .map((p) => extractArxivId(p.metadata))
    .filter(Boolean) as string[]
  const urls = sourcePapers.map((p) => p.url?.trim()).filter(Boolean) as string[]

  const [doiMatches, arxivMatches, urlMatches] = await Promise.allSettled([
    dois.length > 0
      ? (async () => {
          let q = supabase.from("papers").select(PAPER_SELECT).in("doi", dois)
          q = targetTeamId ? q.eq("team_id", targetTeamId) : q.is("team_id", null)
          const { data } = await q
          return (data ?? []) as PaperRow[]
        })()
      : Promise.resolve([] as PaperRow[]),

    arxivIds.length > 0
      ? (async () => {
          let q = supabase
            .from("papers")
            .select(PAPER_SELECT)
            .filter("metadata->>arxiv_id", "in", `(${arxivIds.join(",")})`)
          q = targetTeamId ? q.eq("team_id", targetTeamId) : q.is("team_id", null)
          const { data } = await q
          return (data ?? []) as PaperRow[]
        })()
      : Promise.resolve([] as PaperRow[]),

    urls.length > 0
      ? (async () => {
          const allUrls = new Set<string>()
          for (const u of urls) {
            allUrls.add(u)
            const normalized = normalizeComparableUrl(u)
            if (normalized !== u) allUrls.add(normalized)
          }
          let q = supabase.from("papers").select(PAPER_SELECT).in("url", [...allUrls])
          q = targetTeamId ? q.eq("team_id", targetTeamId) : q.is("team_id", null)
          const { data } = await q
          return (data ?? []) as PaperRow[]
        })()
      : Promise.resolve([] as PaperRow[]),
  ])

  const allCandidates: PaperRow[] = [
    ...(doiMatches.status === "fulfilled" ? doiMatches.value : []),
    ...(arxivMatches.status === "fulfilled" ? arxivMatches.value : []),
    ...(urlMatches.status === "fulfilled" ? urlMatches.value : []),
  ]

  for (const sourcePaper of sourcePapers) {
    for (const candidate of allCandidates) {
      if (matchPaper(sourcePaper, candidate)) {
        result.set(sourcePaper.id, candidate)
        break
      }
    }
  }

  return result
}

function matchPaper(source: PaperRow, candidate: PaperRow): boolean {
  const sourceDoi = source.doi?.trim()
  const candidateDoi = candidate.doi?.trim()
  if (sourceDoi && candidateDoi && sourceDoi === candidateDoi) return true

  const sourceArxiv = extractArxivId(source.metadata)
  const candidateArxiv = extractArxivId(candidate.metadata)
  if (sourceArxiv && candidateArxiv && sourceArxiv === candidateArxiv) return true

  const sourceUrl = source.url?.trim()
  const candidateUrl = candidate.url?.trim()
  if (sourceUrl && candidateUrl) {
    if (sourceUrl === candidateUrl) return true
    if (normalizeComparableUrl(sourceUrl) === normalizeComparableUrl(candidateUrl))
      return true
  }

  return false
}

/**
 * Ensures each paper ID has a corresponding paper record in the target scope.
 * Uses batched lookups for efficiency instead of sequential per-paper queries.
 */
export async function ensurePapersInScope(params: {
  supabase: SupabaseClient
  paperIds: string[]
  targetTeamId: TeamScopeId
}): Promise<{
  mappedPaperIds: string[]
  mapping: Record<string, string>
  copiedCount: number
  reusedCount: number
  unchangedCount: number
}> {
  const { supabase, paperIds, targetTeamId } = params
  const uniquePaperIds = [...new Set(paperIds)]

  if (uniquePaperIds.length === 0) {
    return {
      mappedPaperIds: [],
      mapping: {},
      copiedCount: 0,
      reusedCount: 0,
      unchangedCount: 0,
    }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw userError ?? new Error("Unauthorized")
  }

  const { data: sourceRows, error: sourceError } = await supabase
    .from("papers")
    .select(PAPER_SELECT)
    .in("id", uniquePaperIds)

  if (sourceError) {
    throw sourceError
  }

  const sourcePapers = (sourceRows ?? []) as PaperRow[]
  const sourceById = new Map(sourcePapers.map((paper) => [paper.id, paper]))

  let copiedCount = 0
  let reusedCount = 0
  let unchangedCount = 0
  const mapping: Record<string, string> = {}

  // Separate papers: unchanged (already in target scope), and those that need lookup/copy
  const papersNeedingLookup: PaperRow[] = []

  for (const paperId of uniquePaperIds) {
    const sourcePaper = sourceById.get(paperId)
    if (!sourcePaper) continue

    if (sourcePaper.team_id === targetTeamId) {
      mapping[paperId] = sourcePaper.id
      unchangedCount++
    } else {
      papersNeedingLookup.push(sourcePaper)
    }
  }

  if (papersNeedingLookup.length > 0) {
    // Batch-find existing papers in the target scope
    const existingMap = await batchFindExistingPapers(
      supabase,
      papersNeedingLookup,
      targetTeamId,
    )

    const papersToCopy: PaperRow[] = []
    for (const sourcePaper of papersNeedingLookup) {
      const existing = existingMap.get(sourcePaper.id)
      if (existing) {
        mapping[sourcePaper.id] = existing.id
        reusedCount++
      } else {
        papersToCopy.push(sourcePaper)
      }
    }

    // Batch-insert new papers
    if (papersToCopy.length > 0) {
      const inserts = papersToCopy.map((src) => ({
        user_id: user.id,
        team_id: targetTeamId,
        title: src.title,
        authors: src.authors ?? [],
        year: src.year,
        abstract: src.abstract,
        paper_type: src.paper_type,
        doi: src.doi,
        url: src.url,
        metadata: src.metadata ?? {},
        is_favorite: src.is_favorite,
      }))

      const { data: createdPapers, error: insertError } = await supabase
        .from("papers")
        .insert(inserts)
        .select("id")

      if (insertError) throw insertError

      const created = (createdPapers ?? []) as { id: string }[]

      // Collect source file data for batch copy
      const sourceIdsToCopy = papersToCopy.map((p) => p.id)
      const { data: sourceFiles } = await supabase
        .from("paper_files")
        .select("paper_id, file_name, file_path, file_size, mime_type")
        .in("paper_id", sourceIdsToCopy)

      for (let i = 0; i < papersToCopy.length && i < created.length; i++) {
        mapping[papersToCopy[i].id] = created[i].id
        copiedCount++
      }

      // Batch-insert paper_files
      if (sourceFiles && sourceFiles.length > 0) {
        const fileInserts = (sourceFiles as (PaperFileRow & { paper_id: string })[]).map(
          (f) => ({
            paper_id: mapping[f.paper_id],
            file_name: f.file_name,
            file_path: f.file_path,
            file_size: f.file_size,
            mime_type: f.mime_type,
          }),
        ).filter((f) => f.paper_id)

        if (fileInserts.length > 0) {
          await supabase.from("paper_files").insert(fileInserts)
        }
      }
    }
  }

  const mappedPaperIds = paperIds
    .map((sourcePaperId) => mapping[sourcePaperId])
    .filter((paperId): paperId is string => Boolean(paperId))

  return {
    mappedPaperIds,
    mapping,
    copiedCount,
    reusedCount,
    unchangedCount,
  }
}

/**
 * Remaps all paper-folder links within a folder subtree to the target scope.
 * Accepts optional pre-collected folderIds to avoid redundant BFS traversal.
 */
export async function remapFolderTreePapersToScope(params: {
  supabase: SupabaseClient
  rootFolderId: string
  targetTeamId: TeamScopeId
  /** Pre-collected folder IDs for the entire subtree. If provided, skips BFS traversal. */
  folderIds?: string[]
}): Promise<{
  affectedFolders: number
  copiedCount: number
  reusedCount: number
  unchangedCount: number
}> {
  const { supabase, rootFolderId, targetTeamId, folderIds: preCollectedFolderIds } = params

  let folderIds: string[]

  if (preCollectedFolderIds && preCollectedFolderIds.length > 0) {
    folderIds = preCollectedFolderIds
  } else {
    // Fall back to BFS traversal (legacy path)
    folderIds = []
    const queue = [rootFolderId]

    while (queue.length > 0) {
      const currentFolderId = queue.shift()
      if (!currentFolderId) continue
      folderIds.push(currentFolderId)

      const { data: children, error: childError } = await supabase
        .from("folders")
        .select("id")
        .eq("parent_id", currentFolderId)

      if (childError) throw childError
      for (const child of children ?? []) {
        if (child.id) queue.push(child.id as string)
      }
    }
  }

  if (folderIds.length === 0) {
    return { affectedFolders: 0, copiedCount: 0, reusedCount: 0, unchangedCount: 0 }
  }

  const { data: links, error: linksError } = await supabase
    .from("paper_folders")
    .select("paper_id, folder_id")
    .in("folder_id", folderIds)

  if (linksError) throw linksError

  const folderLinks = (links ?? []) as PaperFolderRow[]
  if (folderLinks.length === 0) {
    return {
      affectedFolders: folderIds.length,
      copiedCount: 0,
      reusedCount: 0,
      unchangedCount: 0,
    }
  }

  const sourcePaperIds = [...new Set(folderLinks.map((row) => row.paper_id))]
  const mappingResult = await ensurePapersInScope({
    supabase,
    paperIds: sourcePaperIds,
    targetTeamId,
  })

  const remappedRows = folderLinks
    .map((row) => ({
      paper_id: mappingResult.mapping[row.paper_id],
      folder_id: row.folder_id,
    }))
    .filter((row): row is PaperFolderRow => Boolean(row.paper_id))

  const deduped = [
    ...new Map(
      remappedRows.map((row) => [`${row.paper_id}:${row.folder_id}`, row]),
    ).values(),
  ]

  const { error: deleteLinksError } = await supabase
    .from("paper_folders")
    .delete()
    .in("folder_id", folderIds)

  if (deleteLinksError) throw deleteLinksError

  if (deduped.length > 0) {
    const { error: insertLinksError } = await supabase
      .from("paper_folders")
      .upsert(deduped, {
        onConflict: "paper_id,folder_id",
        ignoreDuplicates: true,
      })

    if (insertLinksError) throw insertLinksError
  }

  return {
    affectedFolders: folderIds.length,
    copiedCount: mappingResult.copiedCount,
    reusedCount: mappingResult.reusedCount,
    unchangedCount: mappingResult.unchangedCount,
  }
}
