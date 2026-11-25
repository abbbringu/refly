import Stripe from "stripe"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { resolveEntitlementFromSubscription } from "@/lib/billing/entitlements"
import { isPlanDowngrade, isPlanUpgrade } from "@/lib/billing/plans"
import { getBillingSnapshotForUser } from "@/lib/billing/snapshot"
import { getStripeClient, getStripePriceId } from "@/lib/stripe/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import type { BillingPlan } from "@/lib/storage/quota"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

type ProfileRow = {
  id: string
  plan: BillingPlan
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  billing_grace_until: string | null
}

type BillingSnapshotClient = {
  from: (table: "profiles") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => PromiseLike<{
          data: unknown
          error: { message: string } | null
        }>
      }
    }
  }
}

function getSubscriptionItem(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  if (!item?.id) {
    throw new Error("Subscription has no editable item")
  }
  return item
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription, item: Stripe.SubscriptionItem) {
  const periodEnd =
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    (item as unknown as { current_period_end?: number }).current_period_end
  if (!periodEnd) {
    throw new Error("Subscription current period end is missing")
  }
  return periodEnd
}

async function syncProfileFromSubscription(
  profile: ProfileRow,
  subscription: Stripe.Subscription,
) {
  const admin = getSupabaseAdminClient()
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id
  const entitlement = resolveEntitlementFromSubscription(
    subscription,
    profile.billing_grace_until,
  )

  const { error } = await admin
    .from("profiles")
    .update({
      plan: entitlement.plan,
      stripe_customer_id: customerId ?? profile.stripe_customer_id,
      stripe_subscription_id: subscription.id,
      billing_status: entitlement.billingStatus,
      plan_renewal_at: entitlement.planRenewalAt,
      cancel_at_period_end: entitlement.cancelAtPeriodEnd,
      billing_grace_until: entitlement.billingGraceUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id)

  if (error) {
    console.error("syncProfileFromSubscription failed:", error)
    throw new Error("Failed to sync profile from subscription")
  }
}

async function scheduleDowngrade(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  targetPlan: "plus" | "pro",
) {
  const item = getSubscriptionItem(subscription)
  const currentPeriodEnd = getCurrentPeriodEnd(subscription, item)
  const targetPriceId = getStripePriceId(targetPlan)
  const schedule = subscription.schedule
    ? await stripe.subscriptionSchedules.retrieve(
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id,
      )
    : await stripe.subscriptionSchedules.create({ from_subscription: subscription.id })

  const currentPhaseStart = (schedule as unknown as { current_phase?: { start_date?: number } })
    .current_phase?.start_date
  const currentPhase: Stripe.SubscriptionScheduleUpdateParams.Phase = {
    items: [
      {
        price: typeof item.price === "string" ? item.price : item.price.id,
        quantity: item.quantity ?? 1,
      },
    ],
    end_date: currentPeriodEnd,
    proration_behavior: "none",
  }
  if (currentPhaseStart) {
    currentPhase.start_date = currentPhaseStart
  }

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    metadata: {
      ...schedule.metadata,
      pending_plan: targetPlan,
    },
    phases: [currentPhase, { items: [{ price: targetPriceId, quantity: item.quantity ?? 1 }] }],
  })

  await stripe.subscriptions.update(subscription.id, {
    metadata: {
      ...subscription.metadata,
      pending_plan: targetPlan,
      pending_plan_effective_at: new Date(currentPeriodEnd * 1000).toISOString(),
    },
  })

  return currentPeriodEnd
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
    const targetPlan = body?.plan
    if (targetPlan !== "plus" && targetPlan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, plan, stripe_customer_id, stripe_subscription_id, billing_grace_until")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const profileRow = profile as ProfileRow
    if (!profileRow.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 },
      )
    }

    const snapshot = await getBillingSnapshotForUser(
      supabase as unknown as BillingSnapshotClient,
      user.id
    )
    const currentPlan = snapshot.plan
    if (currentPlan === targetPlan) {
      return NextResponse.json(
        { error: "You are already on this plan" },
        { status: 400 },
      )
    }

    const stripe = getStripeClient()
    const subscription = await stripe.subscriptions.retrieve(profileRow.stripe_subscription_id)
    const item = getSubscriptionItem(subscription)

    if (isPlanUpgrade(currentPlan, targetPlan)) {
      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        items: [{ id: item.id, price: getStripePriceId(targetPlan) }],
        metadata: {
          ...subscription.metadata,
          pending_plan: "",
          pending_plan_effective_at: "",
          target_plan: targetPlan,
        },
        proration_behavior: "create_prorations",
      })

      await syncProfileFromSubscription(profileRow, updatedSubscription)

      return NextResponse.json({
        plan: targetPlan,
        effectiveAt: new Date().toISOString(),
        changeType: "upgrade",
      })
    }

    if (isPlanDowngrade(currentPlan, targetPlan)) {
      const effectiveAtSeconds = await scheduleDowngrade(stripe, subscription, targetPlan)
      return NextResponse.json({
        plan: targetPlan,
        effectiveAt: new Date(effectiveAtSeconds * 1000).toISOString(),
        changeType: "downgrade",
      })
    }

    return NextResponse.json({ error: "Unsupported plan change" }, { status: 400 })
  } catch (error: unknown) {
    return handleApiError(error, "billing/change-plan")
  }
}
