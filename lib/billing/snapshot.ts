import type Stripe from "stripe"
import { PROFILE_SELECT } from "@/lib/db/selects"
import { isSelfHostedMode } from "@/lib/config/self-hosted"
import { getStripeClient, getStripePriceId } from "@/lib/stripe/server"
import type { BillingPlan } from "@/lib/storage/quota"
import type { Profile } from "@/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProfileQueryClient = any

export type BillingSnapshot = {
  profile: Profile | null
  plan: BillingPlan
  billingStatus: string | null
  renewalDate: string | null
  cancelAtPeriodEnd: boolean
  pendingPlan: BillingPlan | null
  pendingPlanEffectiveAt: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  source: "stripe" | "profile" | "none"
}

function normalizePlan(value: unknown): BillingPlan {
  return value === "plus" || value === "pro" ? value : "free"
}

function toIso(seconds: number | null | undefined) {
  return seconds && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null
}

export function resolvePlanFromStripePrice(priceId: string | null | undefined): BillingPlan {
  if (!priceId) return "free"

  try {
    if (priceId === getStripePriceId("pro")) return "pro"
    if (priceId === getStripePriceId("plus")) return "plus"
  } catch {
    return "free"
  }

  return "free"
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0]
  return (
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    (firstItem as unknown as { current_period_end?: number }).current_period_end ??
    null
  )
}

function getSchedulePendingPlan(subscription: Stripe.Subscription): {
  pendingPlan: BillingPlan | null
  pendingPlanEffectiveAt: string | null
} {
  const schedule = subscription.schedule
  if (!schedule || typeof schedule === "string") {
    return { pendingPlan: null, pendingPlanEffectiveAt: null }
  }

  const currentPhaseEnd = (schedule as unknown as { current_phase?: { end_date?: number } })
    .current_phase?.end_date
  const phases = (schedule as unknown as {
    phases?: Array<{ start_date?: number; items?: Array<{ price?: string | { id?: string } }> }>
  }).phases ?? []
  const nextPhase = phases.find((phase) => {
    if (!currentPhaseEnd || !phase.start_date) return false
    return phase.start_date >= currentPhaseEnd
  }) ?? phases[1]
  const nextPrice = nextPhase?.items?.[0]?.price
  const nextPriceId = typeof nextPrice === "string" ? nextPrice : nextPrice?.id
  const pendingPlan = resolvePlanFromStripePrice(nextPriceId)

  if (pendingPlan === "free") {
    return { pendingPlan: null, pendingPlanEffectiveAt: null }
  }

  return {
    pendingPlan,
    pendingPlanEffectiveAt: toIso(nextPhase?.start_date ?? currentPhaseEnd ?? null),
  }
}

export async function getBillingSnapshotForUser(
  supabase: ProfileQueryClient,
  userId: string,
): Promise<BillingSnapshot> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .single()

  if (error || !data) {
    return {
      profile: null,
      plan: "free",
      billingStatus: null,
      renewalDate: null,
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      source: "none",
    }
  }

  const profile = data as Profile
  if (isSelfHostedMode()) {
    return {
      profile: { ...profile, plan: "pro" },
      plan: "pro",
      billingStatus: "self_hosted",
      renewalDate: null,
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      source: "profile",
    }
  }

  if (!profile.stripe_subscription_id) {
    return {
      profile,
      plan: normalizePlan(profile.plan),
      billingStatus: profile.billing_status ?? null,
      renewalDate: profile.plan_renewal_at ?? null,
      cancelAtPeriodEnd: Boolean(profile.cancel_at_period_end),
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      stripeCustomerId: profile.stripe_customer_id ?? null,
      stripeSubscriptionId: null,
      source: "profile",
    }
  }

  const stripe = getStripeClient()
  const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
    expand: ["schedule"],
  })
  const firstItem = subscription.items.data[0]
  const activePlan = resolvePlanFromStripePrice(firstItem?.price?.id)
  const periodEnd = getSubscriptionPeriodEnd(subscription)
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end)
  const schedulePending = getSchedulePendingPlan(subscription)
  const pendingPlan = cancelAtPeriodEnd ? "free" : schedulePending.pendingPlan
  const pendingPlanEffectiveAt = pendingPlan
    ? schedulePending.pendingPlanEffectiveAt ?? toIso(periodEnd)
    : null

  return {
    profile,
    plan: activePlan,
    billingStatus: subscription.status,
    renewalDate: toIso(periodEnd),
    cancelAtPeriodEnd,
    pendingPlan,
    pendingPlanEffectiveAt,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? profile.stripe_customer_id ?? null,
    stripeSubscriptionId: subscription.id,
    source: "stripe",
  }
}
