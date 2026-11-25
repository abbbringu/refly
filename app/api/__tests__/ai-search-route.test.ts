import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, queryResult, responseJson } from "./test-utils"

const mocks = vi.hoisted(() => ({
  supabase: null as unknown,
  search: vi.fn(),
  usageLimit: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

vi.mock("@/lib/ai/search", () => ({
  aiSearchProvider: { search: mocks.search },
}))

vi.mock("@/lib/ai/usage", () => ({
  assertWithinAIUsageLimit: mocks.usageLimit,
}))

function supabaseWithProfile(profile: Record<string, unknown>) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user_1" } } })) },
    from: vi.fn((table: string) => {
      if (table === "profiles") return queryResult({ data: profile, error: null })
      if (table === "team_members") return queryResult({ data: { id: "member_1" }, error: null })
      return queryResult({ data: null, error: null })
    }),
  }
}

describe("AI search API route", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.search.mockReset()
    mocks.search.mockResolvedValue([{ id: "paper_1", title: "Indexed paper" }])
    mocks.usageLimit.mockReset()
    mocks.usageLimit.mockResolvedValue(undefined)
  })

  it("blocks AI search for free plans", async () => {
    mocks.supabase = supabaseWithProfile({ plan: "free", billing_status: null })
    const { POST } = await import("@/app/api/ai/search/route")

    const response = await POST(jsonRequest({ query: "semantic retrieval" }) as never)

    expect(response.status).toBe(403)
    await expect(responseJson(response)).resolves.toMatchObject({
      error: expect.stringContaining("AI search is available on Plus and Pro plans"),
    })
  })

  it("enforces team membership before searching team scope", async () => {
    mocks.supabase = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user_1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "profiles") return queryResult({ data: { plan: "plus", billing_status: "active" }, error: null })
        if (table === "team_members") return queryResult({ data: null, error: null })
        return queryResult({ data: null, error: null })
      }),
    }
    const { POST } = await import("@/app/api/ai/search/route")

    const response = await POST(
      jsonRequest({ query: "team paper", options: { scope: "team", team_id: "team_1" } }) as never,
    )

    expect(response.status).toBe(403)
    await expect(responseJson(response)).resolves.toMatchObject({ error: "Forbidden team context" })
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it("runs AI search for paid plans and records usage budget checks", async () => {
    mocks.supabase = supabaseWithProfile({ plan: "plus", billing_status: "active", plan_renewal_at: null })
    const { POST } = await import("@/app/api/ai/search/route")

    const response = await POST(jsonRequest({ query: "semantic retrieval", options: { limit: 3 } }) as never)

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ data: [{ id: "paper_1", title: "Indexed paper" }] })
    expect(mocks.usageLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1", plan: "plus" }))
    expect(mocks.search).toHaveBeenCalledWith(
      "semantic retrieval",
      expect.objectContaining({ user_id: "user_1", limit: 3, scope: "all" }),
      mocks.supabase,
      expect.objectContaining({ feature: "ai_search" }),
    )
  })
})
