import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getStripeClient } from "@/lib/stripe/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
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
    const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId)
    if (currentSubscription.schedule) {
      const scheduleId = typeof currentSubscription.schedule === "string"
        ? currentSubscription.schedule
        : currentSubscription.schedule.id
      await stripe.subscriptionSchedules.release(scheduleId)
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      metadata: {
        ...currentSubscription.metadata,
        pending_plan: "",
        pending_plan_effective_at: "",
      },
    })

    const itemPeriodEnd = (subscription.items.data[0] as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end
    const periodEnd =
      (subscription as unknown as { current_period_end?: number }).current_period_end ??
      itemPeriodEnd ??
      null
    const effectiveAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null
    const admin = getSupabaseAdminClient()
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        cancel_at_period_end: true,
        plan_renewal_at: effectiveAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (updateError) {
      console.error("Profile update failed:", updateError)
      throw new Error("Failed to update profile")
    }

    return NextResponse.json({ cancelled: true, effectiveAt })
  } catch (error: unknown) {
    return handleApiError(error, "billing/cancel")
  }
}
