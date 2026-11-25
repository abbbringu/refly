import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, queryResult, responseJson } from "./test-utils"

const mocks = vi.hoisted(() => ({
  supabase: null as unknown,
  admin: null as unknown,
  stripe: null as unknown,
}))

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => mocks.admin),
}))

vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: vi.fn(() => mocks.stripe),
  getStripePriceId: vi.fn((plan: "plus" | "pro") => `price_${plan}`),
}))

function authSupabase(profile: Record<string, unknown> | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user_1" } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === "profiles") return queryResult({ data: profile, error: profile ? null : { message: "not found" } })
      return queryResult({ data: null, error: null })
    }),
  }
}

describe("billing API routes", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.admin = {
      from: vi.fn(() => queryResult({ data: null, error: null })),
    }
    mocks.stripe = {
      customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
      checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.test" })) } },
      billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://portal.stripe.test" })) } },
      subscriptions: { retrieve: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
    }
  })

  it("creates a checkout session for an authenticated user without a subscription", async () => {
    mocks.supabase = authSupabase({
      id: "user_1",
      email: "test@example.com",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      billing_status: null,
    })
    const { POST } = await import("@/app/api/billing/checkout-session/route")

    const response = await POST(jsonRequest({ plan: "plus" }))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ url: "https://checkout.stripe.test" })
    expect((mocks.stripe as any).customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" }),
      expect.objectContaining({ idempotencyKey: "customer:user_1" }),
    )
    expect((mocks.stripe as any).checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_plus", quantity: 1 }] }),
      expect.any(Object),
    )
  })

  it("redirects subscribed users to the billing portal instead of checkout", async () => {
    mocks.supabase = authSupabase({
      id: "user_1",
      email: "test@example.com",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      billing_status: "active",
    })
    const { POST } = await import("@/app/api/billing/checkout-session/route")

    const response = await POST(jsonRequest({ plan: "pro" }))

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ url: "https://portal.stripe.test" })
    expect((mocks.stripe as any).checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("creates a billing portal session for an existing Stripe customer", async () => {
    mocks.supabase = authSupabase({ stripe_customer_id: "cus_1" })
    const { POST } = await import("@/app/api/billing/portal-session/route")

    const response = await POST()

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ url: "https://portal.stripe.test" })
    expect((mocks.stripe as any).billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1" }),
    )
  })

  it("processes Stripe webhook subscription events and records idempotency", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
    const event = {
      id: "evt_1",
      type: "customer.subscription.updated",
      created: 1_800_000_000,
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          cancel_at_period_end: false,
          metadata: {},
          items: { data: [{ price: { id: "price_plus" }, current_period_end: 1_900_000_000 }] },
        },
      },
    }
    ;(mocks.stripe as any).webhooks.constructEvent.mockReturnValue(event)
    const updates: unknown[] = []
    mocks.admin = {
      from: vi.fn((table: string) => {
        if (table === "billing_events") {
          return {
            ...queryResult({ data: null, error: null }),
            insert: vi.fn(async () => ({ data: null, error: null })),
            update: vi.fn((payload: unknown) => {
              updates.push(payload)
              return queryResult({ data: null, error: null })
            }),
          }
        }
        return {
          ...queryResult({ data: { id: "user_1", billing_grace_until: null }, error: null }),
          update: vi.fn((payload: unknown) => {
            updates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }),
    }
    const { POST } = await import("@/app/api/stripe/webhook/route")

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_1" },
        body: JSON.stringify(event),
      }),
    )

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ received: true })
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plan: "plus", stripe_subscription_id: "sub_1", billing_status: "active" }),
        expect.objectContaining({ status: "processed" }),
      ]),
    )
  })
})
