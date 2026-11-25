import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getBillingSnapshotForUser } from "@/lib/billing/snapshot"
import { createClient } from "@/utils/supabase/server"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export async function GET(request: Request) {
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

    const snapshot = await getBillingSnapshotForUser(supabase, user.id)
    return NextResponse.json(snapshot)
  } catch (error: unknown) {
    return handleApiError(error, "billing/subscription-status")
  }
}
