import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { aiSearchProvider } from "@/lib/ai/search"
import { hasAIAccess } from "@/lib/plans"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import type { SearchOptions } from "@/types"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseScope(value: unknown): SearchOptions["scope"] {
  if (value === "personal" || value === "team" || value === "all") {
    return value
  }
  return undefined
}

function parseNumber(value: unknown, fallback: number) {
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return num
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

    const rateLimit = checkApiRateLimit(request, user.id, "ai_search")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
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
      return NextResponse.json(
        {
          error:
            "AI search is available on Plus and Pro plans. Upgrade your plan to continue.",
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

    const body = await request.json()
    const { query, options } = body

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    const rawOptions = typeof options === "object" && options ? options : {}
    const parsedScope = parseScope(
      (rawOptions as Record<string, unknown>).scope
    )
    const teamIdRaw = (rawOptions as Record<string, unknown>).team_id
    const teamId =
      typeof teamIdRaw === "string" && teamIdRaw.trim() ? teamIdRaw : undefined
    const folderIds = parseStringArray(
      (rawOptions as Record<string, unknown>).folder_ids
    )
    const paperIds = parseStringArray(
      (rawOptions as Record<string, unknown>).paper_ids
    )

    if (parsedScope === "team") {
      if (!teamId) {
        return NextResponse.json(
          { error: "team_id is required for team scope" },
          { status: 400 }
        )
      }

      const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (membershipError) {
        console.error("Membership lookup failed:", membershipError)
        return NextResponse.json(
          { error: "An unexpected error occurred. Please try again later." },
          { status: 500 }
        )
      }

      if (!membership) {
        return NextResponse.json(
          { error: "Forbidden team context" },
          { status: 403 }
        )
      }
    }

    const searchOptions: SearchOptions = {
      query,
      user_id: user.id,
      team_id: teamId,
      folder_ids: folderIds,
      paper_ids: paperIds,
      scope: parsedScope || (teamId ? "team" : "all"),
      limit: parseNumber((rawOptions as Record<string, unknown>).limit, 8),
      offset: parseNumber((rawOptions as Record<string, unknown>).offset, 0),
    }

    const results = await aiSearchProvider.search(
      query,
      searchOptions,
      supabase,
      {
        userId: user.id,
        teamId: teamId || null,
        feature: "ai_search",
      }
    )

    return NextResponse.json({ data: results })
  } catch (error: unknown) {
    return handleApiError(error, "ai/search")
  }
}
