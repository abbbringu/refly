import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { persistRemotePdfForPaper } from "@/lib/papers/persist-remote-pdf"
import { discoverPdfCandidates } from "@/lib/papers/discover-pdf-url"
import { extractArxivId } from "@/lib/papers/extract-arxiv-id"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { indexPaperPdfChunks } from "@/lib/ai/paper-chunks"
import { hasAIAccess } from "@/lib/plans"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimit = checkApiRateLimit(request, user.id, "indexing")
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit)
  }

  const body = await request.json()
  const { paperId } = body

  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId" }, { status: 400 })
  }

  try {
    const { data: paper, error: paperError } = await supabase
      .from("papers")
      .select("id, user_id, team_id, doi, url, metadata")
      .eq("id", paperId)
      .single()

    if (paperError || !paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 })
    }

    if (paper.user_id !== user.id) {
      const { data: editableTeamIdsData } = await supabase.rpc(
        "user_team_ids_with_roles",
        {
          p_user_id: user.id,
          p_roles: ["owner", "admin", "editor"],
        }
      )

      const editableTeamIds = new Set(
        Array.isArray(editableTeamIdsData)
          ? editableTeamIdsData.filter(
              (teamId: unknown): teamId is string => typeof teamId === "string"
            )
          : []
      )

      const canEdit =
        typeof paper.team_id === "string" && editableTeamIds.has(paper.team_id)

      if (!canEdit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, billing_status, billing_grace_until, plan_renewal_at")
      .eq("id", user.id)
      .maybeSingle()
    const plan = getEffectiveBillingPlan(profile)

    const { data: existingFiles } = await supabase
      .from("paper_files")
      .select("id")
      .eq("paper_id", paperId)
      .eq("mime_type", "application/pdf")
      .limit(1)

    if (existingFiles && existingFiles.length > 0) {
      return NextResponse.json({
        stored: true,
        source: "already_exists",
      })
    }

    const paperMetadata = paper.metadata
      ? (paper.metadata as { arxiv_id?: string; source_url?: string })
      : undefined

    const detectedArxivId = extractArxivId({
      doi: paper.doi,
      url: paper.url,
      metadata: (paper.metadata as Record<string, unknown>) || {},
    })

    const candidates = await discoverPdfCandidates({
      doi: paper.doi,
      url: paper.url,
      metadata: {
        ...paperMetadata,
        arxiv_id: detectedArxivId || paperMetadata?.arxiv_id,
      },
    })

    let lastReason = "no_pdf_found"

    for (const candidate of candidates) {
      const result = await persistRemotePdfForPaper({
        supabase,
        userId: user.id,
        paperId: paper.id,
        pdfUrl: candidate.url,
        teamId: paper.team_id,
      })

      if (result.stored) {
        let chunksIndexed = 0
        if (result.filePath && hasAIAccess(plan, "ai_search")) {
          try {
            await assertWithinAIUsageLimit({
              supabase,
              userId: user.id,
              plan,
              planRenewalAt: profile?.plan_renewal_at || null,
            })
            const chunkResult = await indexPaperPdfChunks({
              paperId: paper.id,
              client: supabase,
              filePath: result.filePath,
              usageContext: {
                userId: user.id,
                teamId: paper.team_id,
                feature: "paper_chunk_indexing",
              },
            })
            chunksIndexed = chunkResult.indexed
          } catch (chunkError) {
            console.error("Failed to index PDF chunks:", chunkError)
          }
        }

        return NextResponse.json({
          stored: true,
          source: candidate.source,
          chunksIndexed,
        })
      }

      lastReason = result.reason || "persist_failed"
    }

    return NextResponse.json({
      stored: false,
      reason: lastReason,
      candidates_tried: candidates.length,
    })
  } catch (err: unknown) {
    return handleApiError(err, "papers/resolve-pdf")
  }
}
