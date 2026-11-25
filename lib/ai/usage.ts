import type { SupabaseClient } from "@supabase/supabase-js"
import type { BillingPlan } from "@/lib/storage/quota"
import type {
  AIUsageContext,
  AIUsageEvent,
  AIUsageFeature,
  AIUsageFeatureSummary,
  AIUsageOperation,
  AIUsageSummary,
} from "@/types"
import { getAIUsageLimitUsd } from "@/lib/plans"
import { isSelfHostedMode } from "@/lib/config/self-hosted"

type UsageDbClient = Pick<SupabaseClient, "from">

interface CompletionPricing {
  inputPerMillion: number
  outputPerMillion: number
}

interface EmbeddingPricing {
  inputPerMillion: number
}

interface RecordAIUsageEventInput {
  supabase: UsageDbClient
  context: AIUsageContext
  provider: string
  model: string
  operation: AIUsageOperation
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  metadata?: Record<string, unknown>
}

const COMPLETION_PRICING: Record<string, CompletionPricing> = {
  "openai/gpt-5.4": { inputPerMillion: 5, outputPerMillion: 15 },
  "google/gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "google/gemini-2.5-pro": { inputPerMillion: 2.5, outputPerMillion: 15 },
  "anthropic/claude-3.7-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
  "anthropic/claude-sonnet-4.6": { inputPerMillion: 3, outputPerMillion: 15 },
  "openrouter/elephant-alpha": { inputPerMillion: 0, outputPerMillion: 0 },
}

const EMBEDDING_PRICING: Record<string, EmbeddingPricing> = {
  "text-embedding-3-small": { inputPerMillion: 0.02 },
  "text-embedding-3-large": { inputPerMillion: 0.13 },
}

export const AI_USAGE_FEATURE_LABELS: Record<AIUsageFeature, string> = {
  chat_response: "Chat responses",
  chat_retrieval: "Chat retrieval",
  ai_citation: "AI citations",
  paper_auto_tag: "Auto-tagging",
  paper_auto_summary: "Paper summaries",
  paper_indexing: "Paper indexing",
  paper_chunk_indexing: "Paper chunk indexing",
  ai_search: "AI search",
}

function shiftMonth(date: Date, amount: number) {
  const shifted = new Date(date)
  shifted.setMonth(shifted.getMonth() + amount)
  return shifted
}

function startOfCurrentMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function startOfNextMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

function roundUsd(value: number) {
  return Math.round(value * 1000000) / 1000000
}

export function getAIUsageWindow(plan: BillingPlan, planRenewalAt?: string | null) {
  const now = new Date()

  if (plan !== "free" && planRenewalAt) {
    const renewalAt = new Date(planRenewalAt)
    if (!Number.isNaN(renewalAt.getTime()) && renewalAt > now) {
      return {
        windowStart: shiftMonth(renewalAt, -1).toISOString(),
        windowEnd: renewalAt.toISOString(),
      }
    }
  }

  return {
    windowStart: startOfCurrentMonth(now).toISOString(),
    windowEnd: startOfNextMonth(now).toISOString(),
  }
}

export async function getAIUsageSpendUsd({
  supabase,
  userId,
  windowStart,
}: {
  supabase: UsageDbClient
  userId: string
  windowStart: string
}) {
  const { data, error } = await supabase
    .from("ai_usage_events")
    .select("estimated_cost_usd")
    .eq("user_id", userId)
    .gte("created_at", windowStart)

  if (error) {
    throw new Error(`Failed to load AI usage spend: ${error.message}`)
  }

  return roundUsd(
    (data || []).reduce((sum, row) => {
      const value = Number((row as { estimated_cost_usd?: unknown }).estimated_cost_usd || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  )
}

export async function getAIUsageLimitState({
  supabase,
  userId,
  plan,
  planRenewalAt,
}: {
  supabase: UsageDbClient
  userId: string
  plan: BillingPlan
  planRenewalAt?: string | null
}) {
  const { windowStart, windowEnd } = getAIUsageWindow(plan, planRenewalAt)
  const selfHosted = isSelfHostedMode()
  const monthlyLimitUsd = selfHosted ? 0 : getAIUsageLimitUsd(plan)
  const currentUsageUsd = await getAIUsageSpendUsd({
    supabase,
    userId,
    windowStart,
  })
  const remainingUsd = selfHosted
    ? 0
    : roundUsd(Math.max(0, monthlyLimitUsd - currentUsageUsd))

  return {
    windowStart,
    windowEnd,
    plan,
    monthlyLimitUsd,
    currentUsageUsd,
    remainingUsd,
    isExceeded: selfHosted ? false : currentUsageUsd >= monthlyLimitUsd,
  }
}

export async function assertWithinAIUsageLimit({
  supabase,
  userId,
  plan,
  planRenewalAt,
}: {
  supabase: UsageDbClient
  userId: string
  plan: BillingPlan
  planRenewalAt?: string | null
}) {
  const state = await getAIUsageLimitState({
    supabase,
    userId,
    plan,
    planRenewalAt,
  })

  if (state.isExceeded) {
    throw new Error(
      `You have reached your ${state.plan} plan AI usage limit of $${state.monthlyLimitUsd.toFixed(2)} for this billing month.`
    )
  }

  return state
}

export function estimateAIUsageCostUsd({
  model,
  operation,
  promptTokens,
  completionTokens,
}: {
  model: string
  operation: AIUsageOperation
  promptTokens: number
  completionTokens: number
}) {
  if (operation === "embedding") {
    const pricing = EMBEDDING_PRICING[model]
    if (!pricing) return 0
    return roundUsd((promptTokens / 1_000_000) * pricing.inputPerMillion)
  }

  const pricing = COMPLETION_PRICING[model]
  if (!pricing) return 0

  return roundUsd(
    (promptTokens / 1_000_000) * pricing.inputPerMillion +
      (completionTokens / 1_000_000) * pricing.outputPerMillion
  )
}

export async function recordAIUsageEvent({
  supabase,
  context,
  provider,
  model,
  operation,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens,
  metadata = {},
}: RecordAIUsageEventInput) {
  const normalizedPromptTokens = Math.max(0, Math.floor(promptTokens))
  const normalizedCompletionTokens = Math.max(0, Math.floor(completionTokens))
  const normalizedTotalTokens = Math.max(
    0,
    Math.floor(totalTokens ?? normalizedPromptTokens + normalizedCompletionTokens)
  )
  const estimatedCostUsd = estimateAIUsageCostUsd({
    model,
    operation,
    promptTokens: normalizedPromptTokens,
    completionTokens: normalizedCompletionTokens,
  })

  const { error } = await supabase.from("ai_usage_events").insert({
    user_id: context.userId,
    team_id: context.teamId || null,
    feature: context.feature,
    provider,
    model,
    operation,
    prompt_tokens: normalizedPromptTokens,
    completion_tokens: normalizedCompletionTokens,
    total_tokens: normalizedTotalTokens,
    estimated_cost_usd: estimatedCostUsd,
    metadata,
  })

  if (error) {
    throw new Error(`Failed to record AI usage event: ${error.message}`)
  }
}

export function summarizeAIUsage(
  events: AIUsageEvent[],
  {
    windowStart,
    windowEnd,
    plan,
    monthlyLimitUsd,
    currentUsageUsd,
    remainingUsd,
    isExceeded,
  }: {
    windowStart: string
    windowEnd: string
    plan: BillingPlan
    monthlyLimitUsd: number
    currentUsageUsd: number
    remainingUsd: number
    isExceeded: boolean
  }
): AIUsageSummary {
  const totals = {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  }

  const byFeature = new Map<AIUsageFeature, AIUsageFeatureSummary>()

  for (const event of events) {
    totals.requestCount += 1
    totals.promptTokens += event.prompt_tokens || 0
    totals.completionTokens += event.completion_tokens || 0
    totals.totalTokens += event.total_tokens || 0
    totals.estimatedCostUsd += Number(event.estimated_cost_usd || 0)

    const existing = byFeature.get(event.feature) || {
      feature: event.feature,
      requestCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      topModels: [],
    }

    existing.requestCount += 1
    existing.promptTokens += event.prompt_tokens || 0
    existing.completionTokens += event.completion_tokens || 0
    existing.totalTokens += event.total_tokens || 0
    existing.estimatedCostUsd += Number(event.estimated_cost_usd || 0)
    if (!existing.topModels.includes(event.model)) {
      existing.topModels = [...existing.topModels, event.model].slice(0, 3)
    }
    byFeature.set(event.feature, existing)
  }

  return {
    windowStart,
    windowEnd,
    limit: {
      plan,
      monthlyLimitUsd,
      currentUsageUsd,
      remainingUsd,
      isExceeded,
    },
    totals: {
      ...totals,
      estimatedCostUsd: roundUsd(totals.estimatedCostUsd),
    },
    byFeature: Array.from(byFeature.values())
      .map((item) => ({
        ...item,
        estimatedCostUsd: roundUsd(item.estimatedCostUsd),
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    recentEvents: events.slice(0, 12),
  }
}
