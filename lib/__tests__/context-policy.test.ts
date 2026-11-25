import { describe, expect, it } from "vitest"
import { getContextPolicy } from "@/lib/ai/context-policy"

describe("AI context policy", () => {
  it("caps context by billing plan", () => {
    expect(getContextPolicy("free")).toMatchObject({
      maxInputTokens: 5000,
      maxHistoryMessages: 8,
      maxSources: 4,
    })
    expect(getContextPolicy("plus")).toMatchObject({
      maxInputTokens: 9000,
      maxHistoryMessages: 12,
      maxSources: 6,
    })
    expect(getContextPolicy("pro")).toMatchObject({
      maxInputTokens: 14000,
      maxHistoryMessages: 16,
      maxSources: 8,
    })
  })
})
