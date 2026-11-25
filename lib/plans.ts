import type { BillingPlan } from "./storage/quota"

export type AIFeature =
  | "ai_search"
  | "ai_auto_tag"
  | "ai_basic_summaries"
  | "ai_citation_answers"
  | "ai_draft_generation"

const AI_ENTITLEMENTS: Record<BillingPlan, AIFeature[]> = {
  free: [],
  plus: [
    "ai_search",
    "ai_auto_tag",
    "ai_basic_summaries",
    "ai_citation_answers",
    "ai_draft_generation",
  ],
  pro: [
    "ai_search",
    "ai_auto_tag",
    "ai_basic_summaries",
    "ai_citation_answers",
    "ai_draft_generation",
  ],
}

export function hasAIAccess(plan: BillingPlan, feature: AIFeature): boolean {
  return AI_ENTITLEMENTS[plan]?.includes(feature) ?? false
}

export function getAIEntitlements(plan: BillingPlan): AIFeature[] {
  return AI_ENTITLEMENTS[plan] ?? []
}

export const STORAGE_LIMITS: Record<BillingPlan, number | null> = {
  free: 350 * 1024 * 1024,
  plus: 5 * 1024 * 1024 * 1024,
  pro: 15 * 1024 * 1024 * 1024,
}

export const AI_USAGE_LIMITS_USD: Record<BillingPlan, number> = {
  free: 0,
  plus: 2,
  pro: 7,
}

export function getAIUsageLimitUsd(plan: BillingPlan): number {
  return AI_USAGE_LIMITS_USD[plan] ?? 0
}
