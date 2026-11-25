import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
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
  const paperId = typeof body?.paperId === "string" ? body.paperId.trim() : ""
  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId" }, { status: 400 })
  }

  const { data: paper, error: paperError } = await supabase
    .from("papers")
    .select("id, user_id, team_id")
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, billing_status, billing_grace_until, plan_renewal_at")
    .eq("id", user.id)
    .single()

  if (profileError) {
    console.error("Profile lookup failed:", profileError)
    return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
  }

  const plan = getEffectiveBillingPlan(profile)
  if (!hasAIAccess(plan, "ai_search")) {
    return NextResponse.json({ indexed: 0, skipped: "ai_search_unavailable" })
  }

  try {
    await assertWithinAIUsageLimit({
      supabase,
      userId: user.id,
      plan,
      planRenewalAt: profile?.plan_renewal_at || null,
    })

    const result = await indexPaperPdfChunks({
      paperId,
      client: supabase,
      usageContext: {
        userId: user.id,
        teamId: paper.team_id,
        feature: "paper_chunk_indexing",
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error, "papers/index-pdf")
  }
}
