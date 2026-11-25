import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { getStripeClient, getStripePriceId } from "@/lib/stripe/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  return "http://localhost:3000"
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
    const requestedPlan = body?.plan
    if (requestedPlan !== "plus" && requestedPlan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id, stripe_subscription_id, billing_status")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const stripe = getStripeClient()
    let customerId = profile.stripe_customer_id as string | null

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: profile.email,
          metadata: {
            supabase_user_id: user.id,
          },
        },
        { idempotencyKey: `customer:${user.id}` },
      )
      customerId = customer.id

      const admin = getSupabaseAdminClient()
      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id)
    }

    const baseUrl = getBaseUrl()

    if (
      profile.stripe_subscription_id &&
      (profile.billing_status === "active" ||
        profile.billing_status === "trialing" ||
        profile.billing_status === "past_due")
    ) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration: process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID,
        return_url: `${baseUrl}/settings`,
      })

      return NextResponse.json({ url: portalSession.url })
    }

    const priceId = getStripePriceId(requestedPlan)
    const checkoutIdempotencyWindow = Math.floor(Date.now() / 60_000)

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing?billing=cancelled`,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            target_plan: requestedPlan,
          },
        },
        metadata: {
          supabase_user_id: user.id,
          target_plan: requestedPlan,
        },
      },
      { idempotencyKey: `checkout:${user.id}:${requestedPlan}:${checkoutIdempotencyWindow}` },
    )

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    return handleApiError(error, "billing/checkout-session")
  }
}
