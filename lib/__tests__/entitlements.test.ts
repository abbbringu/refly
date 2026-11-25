import { beforeEach, describe, expect, it, vi } from "vitest"
import { getEffectiveBillingPlan, resolveEntitlementFromSubscription } from "@/lib/billing/entitlements"

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: "price_plus" },
          current_period_end: 1_800_000_000,
        },
      ],
    },
    ...overrides,
  } as never
}

describe("billing entitlements", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  it("only treats active, trialing, and active grace profiles as paid", () => {
    expect(getEffectiveBillingPlan({ plan: "plus", billing_status: "active" })).toBe("plus")
    expect(getEffectiveBillingPlan({ plan: "pro", billing_status: "trialing" })).toBe("pro")
    expect(
      getEffectiveBillingPlan({
        plan: "plus",
        billing_status: "past_due",
        billing_grace_until: "2026-01-02T00:00:00Z",
      }),
    ).toBe("plus")
    expect(
      getEffectiveBillingPlan({
        plan: "plus",
        billing_status: "past_due",
        billing_grace_until: "2025-12-31T00:00:00Z",
      }),
    ).toBe("free")
    expect(getEffectiveBillingPlan({ plan: "pro", billing_status: "canceled" })).toBe("free")
  })

  it("resolves active Stripe subscriptions from configured price IDs", () => {
    expect(resolveEntitlementFromSubscription(subscription())).toMatchObject({
      plan: "plus",
      billingStatus: "active",
      cancelAtPeriodEnd: false,
      billingGraceUntil: null,
      planRenewalAt: "2027-01-15T08:00:00.000Z",
    })
  })

  it("creates grace for newly past-due subscriptions and expires old grace", () => {
    expect(resolveEntitlementFromSubscription(subscription({ status: "past_due" }))).toMatchObject({
      plan: "plus",
      billingStatus: "past_due",
    })

    expect(
      resolveEntitlementFromSubscription(
        subscription({ status: "past_due" }),
        "2025-12-31T00:00:00.000Z",
      ),
    ).toMatchObject({ plan: "free", billingStatus: "past_due" })
  })
})
