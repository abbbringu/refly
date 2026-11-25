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
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import {
  fetchDOI,
  fetchArxiv,
  fetchPubMed,
  fetchISBN,
  preferPublishedVersionForArxiv,
  type FetchedMetadata,
} from "@/lib/papers/fetch-metadata"
import { handleApiError } from "@/lib/api/errors"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withTeamScope(query: any, teamId?: string) {
  if (teamId) {
    return query.eq("team_id", teamId)
  }
  return query.is("team_id", null)
}

function getStringMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key]
  return typeof value === "string" ? value : null
}

async function findExistingPaper({
  supabase,
  userId,
  teamId,
  doi,
  arxivId,
  url,
}: {
  supabase: ReturnType<typeof createClient>
  userId: string
  teamId?: string
  doi?: string | null
  arxivId?: string | null
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

  if (arxivId?.trim()) {
    const query = withTeamScope(
      supabase
        .from("papers")
        .select(PAPER_SELECT)
        .eq("user_id", userId)
        .eq("metadata->>arxiv_id", arxivId.trim()),
      teamId
    )
    const { data } = await query
      .order("created_at", { ascending: true })
      .limit(1)
    if (data?.[0]) return data[0]
  }

  if (url?.trim()) {
    const query = withTeamScope(
      supabase
        .from("papers")
        .select(PAPER_SELECT)
        .eq("user_id", userId)
        .eq("url", url.trim()),
      teamId
    )
    const { data } = await query
      .order("created_at", { ascending: true })
      .limit(1)
    if (data?.[0]) return data[0]
  }

  return null
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
    const { type, id, teamId, folderId, allowDuplicate } = body

  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 })
  }

  try {
    let paperData: FetchedMetadata | null = null

    switch (type) {
      case "doi":
        paperData = await fetchDOI(id)
        break
      case "arxiv":
        paperData = await preferPublishedVersionForArxiv(await fetchArxiv(id))
        break
      case "pubmed":
        paperData = await fetchPubMed(id)
        break
      case "isbn":
        paperData = await fetchISBN(id)
        break
      default:
        return NextResponse.json(
          { error: "Invalid type. Use doi, arxiv, pubmed, or isbn." },
          { status: 400 }
        )
    }

    if (!paperData) {
      return NextResponse.json(
        { error: "Could not fetch paper metadata" },
        { status: 404 }
      )
    }

    const { pdf_url: pdfUrl, ...paperRecord } = paperData

    const preExistingPaper = await findExistingPaper({
      supabase,
      userId: user.id,
      teamId,
      doi: paperRecord.doi,
      arxivId: getStringMetadataValue(paperRecord.metadata, "arxiv_id"),
      url: paperRecord.url,
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

    // Insert into database
    const { data: insertedPaper, error } = await supabase
      .from("papers")
      .insert({
        user_id: user.id,
        team_id: teamId || null,
        ...paperRecord,
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
        doi: paperRecord.doi,
        arxivId: getStringMetadataValue(paperRecord.metadata, "arxiv_id"),
        url: paperRecord.url,
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
      console.error("Failed to import paper:", error)
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

    let pdfStored = false
    let pdfStoreReason: string | undefined
    if (data && typeof pdfUrl === "string" && pdfUrl.trim()) {
      const result = await persistRemotePdfForPaper({
        supabase,
        userId: user.id,
        paperId: data.id,
        pdfUrl,
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
    return handleApiError(err, "papers/import")
  }
}
