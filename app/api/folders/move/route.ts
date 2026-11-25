import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { PAPER_SELECT } from "@/lib/db/selects"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

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

function extractArxivId(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const value = metadata.arxiv_id
  return typeof value === "string" && value.trim() ? value.trim() : null
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

/**
 * Batch-find existing papers in the target scope matching source papers.
 * Returns a map of source paper ID -> existing target paper.
 */
async function batchFindExistingPapers(
  adminSupabase: ReturnType<typeof getSupabaseAdminClient>,
  sourcePapers: PaperRow[],
  targetTeamId: string | null,
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
          let q = adminSupabase.from("papers").select(PAPER_SELECT).in("doi", dois)
          q = targetTeamId ? q.eq("team_id", targetTeamId) : q.is("team_id", null)
          const { data } = await q
          return (data ?? []) as PaperRow[]
        })()
      : Promise.resolve([] as PaperRow[]),

    arxivIds.length > 0
      ? (async () => {
          let q = adminSupabase
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
          let q = adminSupabase
            .from("papers")
            .select(PAPER_SELECT)
            .in("url", [...allUrls])
          q = targetTeamId ? q.eq("team_id", targetTeamId) : q.is("team_id", null)
          const { data } = await q
          return (data ?? []) as PaperRow[]
        })()
      : Promise.resolve([] as PaperRow[]),
  ])

  const foundPapers: PaperRow[] = [
    ...(doiMatches.status === "fulfilled" ? doiMatches.value : []),
    ...(arxivMatches.status === "fulfilled" ? arxivMatches.value : []),
    ...(urlMatches.status === "fulfilled" ? urlMatches.value : []),
  ]

  const seen = new Set<string>()
  for (const paper of foundPapers) {
    if (seen.has(paper.id)) continue
    seen.add(paper.id)
  }

  for (const sourcePaper of sourcePapers) {
    for (const found of foundPapers) {
      if (
        !result.has(sourcePaper.id) &&
        !seen.has(found.id) === false &&
        matchPaper(sourcePaper, found)
      ) {
        result.set(sourcePaper.id, found)
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

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const adminSupabase = getSupabaseAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimit = checkApiRateLimit(request, user.id, "default")
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit)
  }

  let body: {
    folderId?: string
    targetTeamId?: string | null
    targetParentId?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { folderId, targetTeamId = null, targetParentId = null } = body

  if (!folderId) {
    return NextResponse.json({ error: "Missing folderId" }, { status: 400 })
  }

  // Verify user owns the folder
  const { data: folder, error: folderError } = await supabase
    .from("folders")
    .select("id, user_id, team_id")
    .eq("id", folderId)
    .single()

  if (folderError || !folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 })
  }

  if (folder.user_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  // If moving to a team, verify the user belongs to that team
  if (targetTeamId) {
    const { data: targetTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("id", targetTeamId)
      .single()

    if (!targetTeam) {
      return NextResponse.json(
        { error: "Target team not found" },
        { status: 404 },
      )
    }

    const { data: membership } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", targetTeamId)
      .eq("user_id", user.id)
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of target team" },
        { status: 403 },
      )
    }
  }

  const sourceTeamId = folder.team_id ?? null

  // Call the DB function to move the subtree (recursive CTE in a single query)
  const { data: affectedFolderIds, error: moveError } = await adminSupabase.rpc(
    "move_folder_subtree",
    {
      p_folder_id: folderId,
      p_target_team_id: targetTeamId,
      p_target_parent_id: targetParentId,
      p_user_id: user.id,
    },
  )

  if (moveError) {
    console.error("Folder move failed:", moveError)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 },
    )
  }

  const folderIds: string[] = Array.isArray(affectedFolderIds)
    ? affectedFolderIds
    : []

  // If scopes differ, remap papers in the subtree
  let copiedCount = 0
  let reusedCount = 0
  let unchangedCount = 0

  if (sourceTeamId !== targetTeamId && folderIds.length > 0) {
    // Fetch all paper-folder links for the subtree
    const { data: links } = await adminSupabase
      .from("paper_folders")
      .select("paper_id, folder_id")
      .in("folder_id", folderIds)

    const folderLinks = (links ?? []) as { paper_id: string; folder_id: string }[]

    if (folderLinks.length > 0) {
      const sourcePaperIds = [...new Set(folderLinks.map((r) => r.paper_id))]

      // Fetch all source papers in one query
      const { data: sourceRows } = await adminSupabase
        .from("papers")
        .select(PAPER_SELECT)
        .in("id", sourcePaperIds)

      const sourcePapers = (sourceRows ?? []) as PaperRow[]
      const sourceById = new Map(sourcePapers.map((p) => [p.id, p]))

      // Batch-find existing papers in target scope
      const existingMap = await batchFindExistingPapers(
        adminSupabase,
        sourcePapers,
        targetTeamId,
      )

      const mapping: Record<string, string> = {}
      const papersToCopy: PaperRow[] = []

      for (const sourcePaperId of sourcePaperIds) {
        const sourcePaper = sourceById.get(sourcePaperId)
        if (!sourcePaper) continue

        if (sourcePaper.team_id === targetTeamId) {
          mapping[sourcePaperId] = sourcePaper.id
          unchangedCount++
          continue
        }

        const existing = existingMap.get(sourcePaperId)
        if (existing) {
          mapping[sourcePaperId] = existing.id
          reusedCount++
          continue
        }

        papersToCopy.push(sourcePaper)
      }

      // Batch-insert new papers for uncached ones
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

        const { data: createdPapers, error: insertError } = await adminSupabase
          .from("papers")
          .insert(inserts)
          .select("id, doi, metadata, url")

        if (insertError) {
          console.error("Paper copy failed:", insertError)
          return NextResponse.json(
            { error: "An unexpected error occurred. Please try again later." },
            { status: 500 },
          )
        }

        // Map new paper IDs back to sources by matching DOI/arXiv/URL
        const created = (createdPapers ?? []) as {
          id: string
          doi: string | null
          metadata: Record<string, unknown> | null
          url: string | null
        }[]

        for (let i = 0; i < papersToCopy.length && i < created.length; i++) {
          mapping[papersToCopy[i].id] = created[i].id
          copiedCount++
        }

        // Batch copy paper_files
        const sourceIdsToCopy = papersToCopy.map((p) => p.id)
        const { data: sourceFiles } = await adminSupabase
          .from("paper_files")
          .select("paper_id, file_name, file_path, file_size, mime_type")
          .in("paper_id", sourceIdsToCopy)

        if (sourceFiles && sourceFiles.length > 0) {
          const fileInserts = (sourceFiles as PaperFileRow[])
            .filter((f): f is PaperFileRow & { paper_id: string } => typeof f.paper_id === "string")
            .map((f) => ({
              paper_id: mapping[f.paper_id],
              file_name: f.file_name,
              file_path: f.file_path,
              file_size: f.file_size,
              mime_type: f.mime_type,
            }))
            .filter((f) => f.paper_id)

          if (fileInserts.length > 0) {
            await adminSupabase.from("paper_files").insert(fileInserts)
          }
        }
      }

      // Delete old paper_folders links
      await adminSupabase
        .from("paper_folders")
        .delete()
        .in("folder_id", folderIds)

      // Insert new paper_folders links with remapped IDs
      const remappedRows = folderLinks
        .map((row) => ({
          paper_id: mapping[row.paper_id],
          folder_id: row.folder_id,
        }))
        .filter((row) => row.paper_id)

      if (remappedRows.length > 0) {
        const deduped = [
          ...new Map(
            remappedRows.map((r) => [`${r.paper_id}:${r.folder_id}`, r]),
          ).values(),
        ]

        await adminSupabase
          .from("paper_folders")
          .upsert(deduped, {
            onConflict: "paper_id,folder_id",
            ignoreDuplicates: true,
          })
      }
    }
  }

  return NextResponse.json({
    data: {
      folderIds,
      copiedCount,
      reusedCount,
      unchangedCount,
    },
  })
}
