import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { getAIUsageLimitState, summarizeAIUsage } from "@/lib/ai/usage"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import type { AIUsageEvent } from "@/types"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

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
    const limitState = await getAIUsageLimitState({
      supabase,
      userId: user.id,
      plan,
      planRenewalAt: profile?.plan_renewal_at || null,
    })

    const { data, error } = await supabase
      .from("ai_usage_events")
      .select("id, user_id, team_id, feature, provider, model, operation, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, metadata, created_at")
      .eq("user_id", user.id)
      .gte("created_at", limitState.windowStart)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch AI usage events:", error)
      return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
    }

    const events = ((data || []) as AIUsageEvent[]).map((event) => ({
      ...event,
      estimated_cost_usd: Number(event.estimated_cost_usd || 0),
      prompt_tokens: Number(event.prompt_tokens || 0),
      completion_tokens: Number(event.completion_tokens || 0),
      total_tokens: Number(event.total_tokens || 0),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? event.metadata
          : {},
    }))

    return NextResponse.json({
      data: summarizeAIUsage(events, limitState),
    })
  } catch (error: unknown) {
    return handleApiError(error, "settings/ai-usage")
  }
}
