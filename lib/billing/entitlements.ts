import type Stripe from "stripe"
import type { BillingPlan } from "@/lib/storage/quota"
import { isSelfHostedMode } from "@/lib/config/self-hosted"

const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000

export interface ResolvedEntitlement {
  plan: BillingPlan
  billingStatus: string | null
  planRenewalAt: string | null
  cancelAtPeriodEnd: boolean
  billingGraceUntil: string | null
}

export interface BillingProfileEntitlementSource {
  plan?: string | null
  billing_status?: string | null
  billing_grace_until?: string | null
}

function coerceBillingPlan(plan: string | null | undefined): BillingPlan {
  return plan === "plus" || plan === "pro" ? plan : "free"
}

export function getEffectiveBillingPlan(
  profile: BillingProfileEntitlementSource | null | undefined,
): BillingPlan {
  if (isSelfHostedMode()) {
    return "pro"
  }

  const plan = coerceBillingPlan(profile?.plan)
  if (plan === "free") return "free"

  const status = profile?.billing_status ?? null
  if (status === "active" || status === "trialing") {
    return plan
  }

  if (status === "past_due" && profile?.billing_grace_until) {
    const graceUntilMs = new Date(profile.billing_grace_until).getTime()
    if (Number.isFinite(graceUntilMs) && graceUntilMs > Date.now()) {
      return plan
    }
  }

  return "free"
}

function resolvePlanFromPriceId(
  priceId: string | null,
  plusPriceId: string | null,
  proPriceId: string | null,
): BillingPlan {
  if (!priceId) return "free"
  if (proPriceId && priceId === proPriceId) return "pro"
  if (plusPriceId && priceId === plusPriceId) return "plus"
  return "free"
}

function toIso(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

export function resolveEntitlementFromSubscription(
  subscription: Stripe.Subscription,
  currentGraceUntil: string | null = null,
): ResolvedEntitlement {
  const plusPriceId = process.env.STRIPE_PRICE_PLUS_MONTHLY ?? null
  const proPriceId = process.env.STRIPE_PRICE_PRO_MONTHLY ?? null

  const firstItem = subscription.items.data[0]
  const priceId = firstItem?.price?.id ?? null
  const desiredPlan = resolvePlanFromPriceId(priceId, plusPriceId, proPriceId)
  const status = subscription.status
  const renewalAt = toIso(firstItem?.current_period_end ?? null)

  if (status === "active" || status === "trialing") {
    return {
      plan: desiredPlan,
      billingStatus: status,
      planRenewalAt: renewalAt,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      billingGraceUntil: null,
    }
  }

  if (status === "past_due") {
    const existingGraceMs = currentGraceUntil ? new Date(currentGraceUntil).getTime() : Number.NaN

    if (Number.isFinite(existingGraceMs)) {
      const hasActiveGrace = existingGraceMs > Date.now()
      return {
        plan: hasActiveGrace ? desiredPlan : "free",
        billingStatus: status,
        planRenewalAt: renewalAt,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        billingGraceUntil: currentGraceUntil,
      }
    }

    return {
      plan: desiredPlan,
      billingStatus: status,
      planRenewalAt: renewalAt,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      billingGraceUntil: new Date(Date.now() + PAST_DUE_GRACE_MS).toISOString(),
    }
  }

  return {
    plan: "free",
    billingStatus: status,
    planRenewalAt: renewalAt,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    billingGraceUntil: null,
  }
}
