import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { hasAIAccess } from "@/lib/plans"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { suggestPaperTags } from "@/lib/ai/auto-tag"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

interface AutoTagRequestBody {
  paperId?: unknown
}

function extractTagName(value: unknown) {
  if (!value) return null

  if (Array.isArray(value)) {
    for (const item of value) {
      if (
        item &&
        typeof item === "object" &&
        "name" in item &&
        typeof item.name === "string"
      ) {
        return item.name
      }
    }
    return null
  }

  if (typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(request, user.id, "ai_operation")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const body = (await request.json()) as AutoTagRequestBody
    const paperId =
      typeof body?.paperId === "string" ? body.paperId.trim() : ""

    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 })
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
    if (!hasAIAccess(plan, "ai_auto_tag")) {
      return NextResponse.json(
        {
          error:
            "AI auto-tag is available on Plus and Pro plans. Upgrade your plan to continue.",
        },
        { status: 403 }
      )
    }

    try {
      await assertWithinAIUsageLimit({
        supabase,
        userId: user.id,
        plan,
        planRenewalAt: profile?.plan_renewal_at || null,
      })
    } catch (limitError) {
      const message =
        limitError instanceof Error ? limitError.message : "AI usage limit reached"
      return NextResponse.json({ error: message }, { status: 403 })
    }

    const { data: paper, error: paperError } = await supabase
      .from("papers")
      .select("id, team_id, title, authors, year, paper_type, doi, url, abstract, metadata")
      .eq("id", paperId)
      .single()

    if (paperError || !paper) {
      return NextResponse.json(
        { error: "Paper not found" },
        { status: 404 }
      )
    }

    const { data: currentPaperTags, error: currentPaperTagsError } = await supabase
      .from("paper_tags")
      .select("tags(name)")
      .eq("paper_id", paperId)

    if (currentPaperTagsError) {
      console.error("Failed to fetch current paper tags:", currentPaperTagsError)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    const existingPaperTagNames = (currentPaperTags || [])
      .map((row) => {
        if (!row || typeof row !== "object") return null
        const rowWithTags = row as { tags?: unknown }
        return extractTagName(rowWithTags.tags)
      })
      .filter((name): name is string => typeof name === "string")

    const { data: allUserTags, error: allUserTagsError } = await supabase
      .from("tags")
      .select("id, name")
      .eq("user_id", user.id)

    if (allUserTagsError) {
      console.error("Failed to fetch user tags:", allUserTagsError)
      return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
    }

    const allUserTagNames = (allUserTags || []).map((tag) => tag.name)

    const result = await suggestPaperTags(
      paper,
      existingPaperTagNames,
      allUserTagNames,
      {
        supabase,
        context: {
          userId: user.id,
          teamId: paper.team_id,
          feature: "paper_auto_tag",
        },
        metadata: {
          paperId: paper.id,
        },
      }
    )

    const existingTagIdsByLower = new Map<string, string>()
    for (const tag of allUserTags || []) {
      existingTagIdsByLower.set(tag.name.toLowerCase(), tag.id)
    }

    const onPaperLower = new Set(existingPaperTagNames.map((n) => n.toLowerCase()))

    const suggestedTags = result.allSuggestedTags.map((name) => ({
      name,
      isNew: !existingTagIdsByLower.has(name.toLowerCase()),
      onPaper: onPaperLower.has(name.toLowerCase()),
    }))

    return NextResponse.json({
      data: {
        suggestedTags,
      },
    })
  } catch (error: unknown) {
    return handleApiError(error, "papers/auto-tag")
  }
}
