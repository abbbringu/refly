import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { getStripeClient } from "@/lib/stripe/server"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  return "http://localhost:3000"
}

export async function POST(request = new Request("http://localhost/api/billing/portal-session")) {
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
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 })
    }

    const stripe = getStripeClient()
    const baseUrl = getBaseUrl()
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      configuration: process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID,
      return_url: `${baseUrl}/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    return handleApiError(error, "billing/portal-session")
  }
}
