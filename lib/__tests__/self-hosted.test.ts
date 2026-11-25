import { afterEach, describe, expect, it, vi } from "vitest"
import { isSelfHostedMode } from "@/lib/config/self-hosted"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { checkStorageQuota } from "@/lib/storage/quota"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { createSupabaseServerFetch } from "@/utils/supabase/internal-fetch"

describe("self-hosted mode", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it("unlocks pro entitlements without a Stripe subscription when NEXT_PUBLIC_SELF_HOSTED=true", () => {
    process.env.NEXT_PUBLIC_SELF_HOSTED = "true"
    expect(isSelfHostedMode()).toBe(true)
    expect(getEffectiveBillingPlan({ plan: "free", billing_status: null })).toBe("pro")
  })

  it("disables storage quota caps in self-hosted mode", async () => {
    process.env.NEXT_PUBLIC_SELF_HOSTED = "true"
    const mockRpc = vi.fn()
    const result = await checkStorageQuota({ rpc: mockRpc }, 20 * 1024 * 1024)
    expect(result.allowed).toBe(true)
    expect(result.limit_bytes).toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("does not enforce monthly AI spend caps in self-hosted mode", async () => {
    process.env.NEXT_PUBLIC_SELF_HOSTED = "true"
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(async () => ({
              data: [{ estimated_cost_usd: 999 }],
              error: null,
            })),
          })),
        })),
      })),
    }

    const state = await assertWithinAIUsageLimit({
      supabase: supabase as never,
      userId: "local-user",
      plan: "pro",
    })
    expect(state.isExceeded).toBe(false)
    expect(state.monthlyLimitUsd).toBe(0)
  })

  it("rewrites NEXT_PUBLIC_SUPABASE_URL to SUPABASE_INTERNAL_URL for server fetches", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:8000"
    process.env.SUPABASE_INTERNAL_URL = "http://gateway:8000"

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }))

    const serverFetch = createSupabaseServerFetch()
    expect(serverFetch).toBeDefined()

    await serverFetch!("http://localhost:8000/rest/v1/papers?select=id")
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://gateway:8000/rest/v1/papers?select=id",
      undefined
    )
  })
})
