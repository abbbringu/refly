import Stripe from "stripe"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { resolveEntitlementFromSubscription } from "@/lib/billing/entitlements"
import { getStripeClient } from "@/lib/stripe/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

type SupabaseMutationPayload = Record<string, unknown>

function getCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  return typeof customer === "string" ? customer : customer?.id ?? null
}

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

    const body = await request.json().catch(() => ({}))
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
    if (!sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Invalid checkout session" }, { status: 400 })
    }

    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    })

    const sessionUserId = session.metadata?.supabase_user_id
    if (sessionUserId !== user.id) {
      return NextResponse.json({ error: "Checkout session does not belong to this user" }, { status: 403 })
    }

    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription

    if (!subscription || typeof subscription === "string") {
      return NextResponse.json({ error: "Checkout session has no subscription" }, { status: 400 })
    }

    const customerId = getCustomerId(subscription.customer)
    if (!customerId) {
      return NextResponse.json({ error: "Subscription has no customer" }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("billing_grace_until")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Profile lookup failed:", profileError)
      throw new Error("Failed to load profile")
    }

    const existingGrace =
      (profile as { billing_grace_until?: string | null } | null)?.billing_grace_until ?? null
    const entitlement = resolveEntitlementFromSubscription(subscription, existingGrace)

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        plan: entitlement.plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        billing_status: entitlement.billingStatus,
        plan_renewal_at: entitlement.planRenewalAt,
        cancel_at_period_end: entitlement.cancelAtPeriodEnd,
        billing_grace_until: entitlement.billingGraceUntil,
        billing_last_event_created: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } satisfies SupabaseMutationPayload)
      .eq("id", user.id)

    if (updateError) {
      console.error("Profile update failed:", updateError)
      throw new Error("Failed to update profile")
    }

    return NextResponse.json({ ok: true, plan: entitlement.plan })
  } catch (error: unknown) {
    return handleApiError(error, "billing/sync-checkout-session")
  }
}
