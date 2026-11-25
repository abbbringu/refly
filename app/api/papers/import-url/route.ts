import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { PAPER_SELECT } from "@/lib/db/selects"
import { cookies } from "next/headers"
import { persistRemotePdfForPaper } from "@/lib/papers/persist-remote-pdf"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { aiSearchProvider } from "@/lib/ai/search"
import { indexPaperPdfChunks } from "@/lib/ai/paper-chunks"
import { hasAIAccess } from "@/lib/plans"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { extractMetaFromHtml } from "@/lib/papers/extract-meta-from-html"
import { safeFetch, SSRFError } from "@/lib/fetch/safe-fetch"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withTeamScope(query: any, teamId?: string) {
  if (teamId) {
    return query.eq("team_id", teamId)
  }
  return query.is("team_id", null)
}

async function findExistingPaper({
  supabase,
  userId,
  teamId,
  doi,
  url,
}: {
  supabase: ReturnType<typeof createClient>
  userId: string
  teamId?: string
  doi?: string | null
  url?: string | null
}) {
  if (doi?.trim()) {
    const query = withTeamScope(
      supabase
        .from("papers")
        .select(PAPER_SELECT)
        .eq("user_id", userId)
        .eq("doi", doi.trim()),
      teamId
    )
    const { data } = await query
      .order("created_at", { ascending: true })
      .limit(1)
    if (data?.[0]) return data[0]
  }

  if (url?.trim()) {
    const trimmedUrl = url.trim()
    const normalizedUrl = normalizeComparableUrl(trimmedUrl)
    const urlCandidates =
      normalizedUrl && normalizedUrl !== trimmedUrl
        ? [trimmedUrl, normalizedUrl]
        : [trimmedUrl]

    for (const candidateUrl of urlCandidates) {
      const query = withTeamScope(
        supabase
          .from("papers")
          .select(PAPER_SELECT)
          .eq("user_id", userId)
          .eq("url", candidateUrl),
        teamId
      )
      const { data } = await query
        .order("created_at", { ascending: true })
        .limit(1)
      if (data?.[0]) return data[0]
    }
  }

  return null
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

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, billing_status, billing_grace_until, plan_renewal_at")
      .eq("id", user.id)
      .maybeSingle()

    const plan = getEffectiveBillingPlan(profile)

    const rateLimit = checkApiRateLimit(request, user.id, "import", plan)
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

  const body = await request.json()
  const { url, teamId, folderId, allowDuplicate } = body

  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 })
  }

  const cleanUrl = String(url).trim()

  let html: string
  let fetchUrl: string
  try {
    const result = await safeFetch(cleanUrl, {
      timeout: 15_000,
      maxBytes: 5 * 1024 * 1024,
      headers: { "User-Agent": "Refly/1.0 (Reference Manager)" },
    })
    fetchUrl = result.response.url || cleanUrl
    html = new TextDecoder().decode(result.arrayBuffer)
  } catch (err) {
    if (err instanceof SSRFError) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      )
    }
    throw err
  }

  const meta = extractMetaFromHtml(html, fetchUrl)

  try {
    const inferredPdfUrl = cleanUrl.toLowerCase().includes(".pdf")
      ? cleanUrl
      : null

    const parsedYear = meta.year
      ? parseInt(meta.year.match(/\d{4}/)?.[0] || "0") || null
      : null

    let paperType = "webpage"
    if (meta.doi) paperType = "article"
    if (cleanUrl.includes("arxiv.org")) paperType = "preprint"

    const cleanDoi = meta.doi?.replace(/^doi:\s*/i, "") || null
    const preExistingPaper = await findExistingPaper({
      supabase,
      userId: user.id,
      teamId,
      doi: cleanDoi,
      url: cleanUrl,
    })

    if (preExistingPaper && !allowDuplicate) {
      return NextResponse.json(
        {
          duplicate: true,
          error: "This paper is already in your library.",
          data: preExistingPaper,
        },
        { status: 409 }
      )
    }

    const { data: insertedPaper, error } = await supabase
      .from("papers")
      .insert({
        user_id: user.id,
        team_id: teamId || null,
        title: (meta.title || "Untitled").trim(),
        authors: meta.authors,
        year: parsedYear,
        abstract: meta.abstract?.trim() || null,
        doi: cleanDoi,
        paper_type: paperType,
        url: cleanUrl,
        metadata: {
          journal: meta.journal || undefined,
          volume: meta.volume || undefined,
          issue: meta.issue || undefined,
          pages: meta.pages || undefined,
          publisher: meta.publisher || undefined,
          source_url: meta.pdfUrl || undefined,
        },
      })
      .select()
      .single()

    let data = insertedPaper
    let reusedExisting = false
    const isDuplicateError =
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"

    if (isDuplicateError) {
      const existingPaper = await findExistingPaper({
        supabase,
        userId: user.id,
        teamId,
        doi: cleanDoi,
        url: cleanUrl,
      })
      if (!existingPaper) {
        console.error("Duplicate paper insert failed:", error)
        return NextResponse.json(
          { error: "Duplicate paper detected" },
          { status: 409 }
        )
      }

      if (!allowDuplicate) {
        return NextResponse.json(
          {
            duplicate: true,
            error: "This paper is already in your library.",
            data: existingPaper,
          },
          { status: 409 }
        )
      }

      data = existingPaper
      reusedExisting = true
    }

    if (!data) {
      console.error("Failed to import paper from URL:", error)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    // Associate with folder if specified
    if (folderId && data) {
      await supabase.from("paper_folders").upsert(
        {
          paper_id: data.id,
          folder_id: folderId,
        },
        { onConflict: "paper_id,folder_id", ignoreDuplicates: true }
      )
    }

    if (data) {
      try {
        if (hasAIAccess(plan, "ai_search")) {
          await assertWithinAIUsageLimit({
            supabase,
            userId: user.id,
            plan,
            planRenewalAt: profile?.plan_renewal_at || null,
          })

          await aiSearchProvider.indexPaper(data, supabase, {
            userId: user.id,
            teamId: data.team_id,
            feature: "paper_indexing",
          })
        }
      } catch (embeddingError) {
        console.error("Failed to index paper embedding:", embeddingError)
      }
    }

    const candidatePdfUrl = meta.pdfUrl || inferredPdfUrl
    let pdfStored = false
    let pdfStoreReason: string | undefined
    if (data && candidatePdfUrl) {
      const result = await persistRemotePdfForPaper({
        supabase,
        userId: user.id,
        paperId: data.id,
        pdfUrl: candidatePdfUrl,
        teamId: data.team_id,
      })
      pdfStored = result.stored
      pdfStoreReason = result.reason

      if (result.stored && result.filePath && hasAIAccess(plan, "ai_search")) {
        try {
          await indexPaperPdfChunks({
            paperId: data.id,
            client: supabase,
            filePath: result.filePath,
            usageContext: {
              userId: user.id,
              teamId: data.team_id,
              feature: "paper_chunk_indexing",
            },
          })
        } catch (chunkError) {
          console.error("Failed to index PDF chunks:", chunkError)
        }
      }
    }

    return NextResponse.json({
      data,
      pdfStored,
      pdfStoreReason,
      reusedExisting,
    })
  } catch (err: unknown) {
    return handleApiError(err, "papers/import-url")
  }
}
