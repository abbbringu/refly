import { describe, expect, it } from "vitest"
import { AI_USAGE_LIMITS_USD, STORAGE_LIMITS, getAIEntitlements, hasAIAccess } from "@/lib/plans"
import { isPaidPlan, isPlanDowngrade, isPlanUpgrade } from "@/lib/billing/plans"

describe("plan limits and entitlements", () => {
  it("keeps launch storage and AI limits stable", () => {
    expect(STORAGE_LIMITS.free).toBe(350 * 1024 * 1024)
    expect(STORAGE_LIMITS.plus).toBe(5 * 1024 * 1024 * 1024)
    expect(STORAGE_LIMITS.pro).toBe(15 * 1024 * 1024 * 1024)
    expect(AI_USAGE_LIMITS_USD).toEqual({ free: 0, plus: 2, pro: 7 })
  })

  it("blocks AI features on free and allows them on paid plans", () => {
    expect(getAIEntitlements("free")).toEqual([])
    expect(hasAIAccess("free", "ai_search")).toBe(false)
    expect(hasAIAccess("plus", "ai_search")).toBe(true)
    expect(hasAIAccess("pro", "ai_citation_answers")).toBe(true)
  })

  it("classifies paid, upgrade, and downgrade transitions", () => {
    expect(isPaidPlan("free")).toBe(false)
    expect(isPaidPlan("plus")).toBe(true)
    expect(isPlanUpgrade("free", "plus")).toBe(true)
    expect(isPlanUpgrade("plus", "pro")).toBe(true)
    expect(isPlanUpgrade("pro", "plus")).toBe(false)
    expect(isPlanDowngrade("pro", "plus")).toBe(true)
    expect(isPlanDowngrade("plus", "free")).toBe(true)
  })
})
