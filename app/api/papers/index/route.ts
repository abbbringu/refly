import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { aiSearchProvider } from "@/lib/ai/search"
import { hasAIAccess } from "@/lib/plans"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { PAPER_SELECT } from "@/lib/db/selects"
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

  const { paperId } = await request.json()
  if (!paperId || typeof paperId !== "string") {
    return NextResponse.json(
      { error: "paperId is required" },
      { status: 400 }
    )
  }

  const { data: paper, error: fetchError } = await supabase
    .from("papers")
    .select(PAPER_SELECT)
    .eq("id", paperId)
    .maybeSingle()

  if (fetchError || !paper) {
    return NextResponse.json(
      { error: "Paper not found" },
      { status: 404 }
    )
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, billing_status, billing_grace_until, plan_renewal_at")
    .eq("id", user.id)
    .maybeSingle()

  const plan = getEffectiveBillingPlan(profile)

  try {
    if (hasAIAccess(plan, "ai_search")) {
      await assertWithinAIUsageLimit({
        supabase,
        userId: user.id,
        plan,
        planRenewalAt: profile?.plan_renewal_at || null,
      })

      await aiSearchProvider.indexPaper(paper, supabase, {
        userId: user.id,
        teamId: paper.team_id,
        feature: "paper_indexing",
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return handleApiError(err, "papers/index")
  }
}
