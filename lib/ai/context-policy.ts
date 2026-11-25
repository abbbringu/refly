export type UserPlan = "free" | "plus" | "pro"

export interface ContextPolicy {
  maxInputTokens: number
  maxHistoryMessages: number
  maxSources: number
  minRetrievalChars: number
  maxUserMessageChars: number
}

const BASE_POLICY: ContextPolicy = {
  maxInputTokens: 6000,
  maxHistoryMessages: 12,
  maxSources: 5,
  minRetrievalChars: 500,
  maxUserMessageChars: 6000,
}

const PLAN_POLICY: Record<UserPlan, ContextPolicy> = {
  free: {
    ...BASE_POLICY,
    maxInputTokens: 5000,
    maxHistoryMessages: 8,
    maxSources: 4,
  },
  plus: {
    ...BASE_POLICY,
    maxInputTokens: 9000,
    maxHistoryMessages: 12,
    maxSources: 6,
  },
  pro: {
    ...BASE_POLICY,
    maxInputTokens: 14000,
    maxHistoryMessages: 16,
    maxSources: 8,
  },
}

export function getContextPolicy(plan: UserPlan): ContextPolicy {
  return PLAN_POLICY[plan] || BASE_POLICY
}
