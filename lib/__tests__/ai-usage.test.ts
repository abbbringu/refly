import { describe, expect, it, vi } from "vitest"
import {
  assertWithinAIUsageLimit,
  estimateAIUsageCostUsd,
  getAIUsageSpendUsd,
  summarizeAIUsage,
} from "@/lib/ai/usage"

describe("AI usage accounting", () => {
  it("estimates known model costs and ignores unknown models", () => {
    expect(
      estimateAIUsageCostUsd({
        model: "text-embedding-3-large",
        operation: "embedding",
        promptTokens: 1_000_000,
        completionTokens: 0,
      }),
    ).toBe(0.13)
    expect(
      estimateAIUsageCostUsd({
        model: "google/gemini-2.5-flash",
        operation: "chat_completion",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      }),
    ).toBe(2.8)
    expect(
      estimateAIUsageCostUsd({
        model: "unknown",
        operation: "chat_completion",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      }),
    ).toBe(0)
  })

  it("sums usage spend from Supabase rows", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn(async () => ({
          data: [{ estimated_cost_usd: "0.25" }, { estimated_cost_usd: 0.5 }, {}],
          error: null,
        })),
      })),
    }

    await expect(
      getAIUsageSpendUsd({ supabase: supabase as never, userId: "user_1", windowStart: "2026-01-01" }),
    ).resolves.toBe(0.75)
  })

  it("throws once a plan budget is exhausted", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn(async () => ({ data: [{ estimated_cost_usd: 2 }], error: null })),
      })),
    }

    await expect(
      assertWithinAIUsageLimit({ supabase: supabase as never, userId: "user_1", plan: "plus" }),
    ).rejects.toThrow("plus plan AI usage limit")
  })

  it("summarizes usage totals by feature", () => {
    const summary = summarizeAIUsage(
      [
        {
          id: "1",
          user_id: "user_1",
          team_id: null,
          feature: "ai_search",
          provider: "openai",
          model: "text-embedding-3-large",
          operation: "embedding",
          prompt_tokens: 100,
          completion_tokens: 0,
          total_tokens: 100,
          estimated_cost_usd: 0.01,
          metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "2",
          user_id: "user_1",
          team_id: null,
          feature: "chat_response",
          provider: "openrouter",
          model: "google/gemini-2.5-flash",
          operation: "chat_completion",
          prompt_tokens: 200,
          completion_tokens: 50,
          total_tokens: 250,
          estimated_cost_usd: 0.02,
          metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      {
        windowStart: "2026-01-01T00:00:00Z",
        windowEnd: "2026-02-01T00:00:00Z",
        plan: "plus",
        monthlyLimitUsd: 2,
        currentUsageUsd: 0.03,
        remainingUsd: 1.97,
        isExceeded: false,
      },
    )

    expect(summary.totals).toMatchObject({
      requestCount: 2,
      promptTokens: 300,
      completionTokens: 50,
      totalTokens: 350,
      estimatedCostUsd: 0.03,
    })
    expect(summary.byFeature.map((feature) => feature.feature).sort()).toEqual([
      "ai_search",
      "chat_response",
    ])
  })
})
