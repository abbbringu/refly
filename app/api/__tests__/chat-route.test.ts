import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, queryResult, responseJson } from "./test-utils"

const mocks = vi.hoisted(() => ({
  supabase: null as unknown,
  buildRagContext: vi.fn(),
  openRouterCreate: vi.fn(),
}))

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

vi.mock("@/lib/rate-limit", () => ({
  checkApiRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceededResponse: vi.fn(() => Response.json({ error: "rate limited" }, { status: 429 })),
}))

vi.mock("@/lib/ai/rag", () => ({
  buildRagContext: mocks.buildRagContext,
}))

vi.mock("@/lib/ai/openai", () => ({
  resolveChatModel: vi.fn(() => "google/gemini-2.5-flash"),
  getOpenRouterClient: vi.fn(() => ({ chat: { completions: { create: mocks.openRouterCreate } } })),
}))

vi.mock("@/lib/ai/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/usage")>()
  return {
    ...actual,
    assertWithinAIUsageLimit: vi.fn(async () => undefined),
    recordAIUsageEvent: vi.fn(async () => undefined),
  }
})

function supabaseWithProfile(profile: Record<string, unknown>) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user_1" } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === "profiles") return queryResult({ data: profile, error: null })
      if (table === "team_members") return queryResult({ data: { id: "member_1" }, error: null })
      if (table === "chat_conversations") {
        return {
          ...queryResult({ data: null, error: null }),
          insert: vi.fn(() => ({ select: () => ({ single: vi.fn(async () => ({ data: { id: "conv_1" }, error: null })) }) })),
          update: vi.fn(() => queryResult({ data: null, error: null })),
        }
      }
      if (table === "chat_messages") {
        return { ...queryResult({ data: null, error: null }), insert: vi.fn(async () => ({ data: null, error: null })) }
      }
      return queryResult({ data: null, error: null })
    }),
  }
}

describe("chat API route", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.buildRagContext.mockReset()
    mocks.buildRagContext.mockResolvedValue({
      promptContext: "[S1] Source context",
      sources: [{ id: "paper_1", title: "Paper", snippet: "Source context" }],
      scopeSummary: "Personal library",
      metadata: { retrievedSourceCount: 1 },
    })
    mocks.openRouterCreate.mockReset()
    mocks.openRouterCreate.mockImplementation(async function* () {
      yield { choices: [{ delta: { content: "Answer " } }] }
      yield { choices: [{ delta: { content: "with source [S1]." } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }
    })
  })

  it("requires a user message", async () => {
    const { POST } = await import("@/app/api/chat/route")

    const response = await POST(jsonRequest({ messages: [] }) as never)

    expect(response.status).toBe(400)
    await expect(responseJson(response)).resolves.toMatchObject({ error: "A user message is required" })
  })

  it("blocks RAG chat for free plans", async () => {
    mocks.supabase = supabaseWithProfile({ plan: "free", billing_status: null })
    const { POST } = await import("@/app/api/chat/route")

    const response = await POST(jsonRequest({ messages: [{ role: "user", content: "What does this say?" }] }) as never)

    expect(response.status).toBe(403)
    await expect(responseJson(response)).resolves.toMatchObject({
      error: expect.stringContaining("Upgrade your plan to use RAG chat"),
    })
  })

  it("streams a paid-plan chat answer with sources and a conversation id", async () => {
    mocks.supabase = supabaseWithProfile({ plan: "plus", billing_status: "active", plan_renewal_at: null })
    const { POST } = await import("@/app/api/chat/route")

    const response = await POST(jsonRequest({ messages: [{ role: "user", content: "What does this say?" }] }) as never)

    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Refly-Conversation-Id")).toBe("conv_1")
    expect(decodeURIComponent(response.headers.get("X-Refly-Rag-Sources") || "")).toContain("paper_1")
    expect(body).toContain("Answer")
    expect(body).toContain("with source [S1].")
    expect(mocks.buildRagContext).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1", limit: 6 }))
  })
})
