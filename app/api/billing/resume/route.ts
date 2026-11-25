import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getStripeClient } from "@/lib/stripe/server"
import { createClient } from "@/utils/supabase/server"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(request, user.id, "billing")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("id", user.id)
      .single()

    const subscriptionId = (profile as { stripe_subscription_id?: string | null } | null)
      ?.stripe_subscription_id
    if (profileError || !subscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 })
    }

    const stripe = getStripeClient()
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      metadata: {
        ...subscription.metadata,
        pending_plan: "",
        pending_plan_effective_at: "",
      },
    })

    return NextResponse.json({ resumed: true })
  } catch (error: unknown) {
    return handleApiError(error, "billing/resume")
  }
}
