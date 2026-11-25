import type { BillingPlan } from "@/lib/storage/quota"

export type RateLimitCategory =
  | "ai_chat"
  | "ai_search"
  | "ai_operation"
  | "import"
  | "upload"
  | "indexing"
  | "billing"
  | "default"
  | "unauthenticated_api"

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

export const RATE_LIMITS: Record<RateLimitCategory, RateLimitConfig> = {
  ai_chat: { windowMs: 60_000, maxRequests: 30 },
  ai_search: { windowMs: 60_000, maxRequests: 30 },
  ai_operation: { windowMs: 60_000, maxRequests: 20 },
  import: { windowMs: 60_000, maxRequests: 10 },
  upload: { windowMs: 60_000, maxRequests: 10 },
  indexing: { windowMs: 60_000, maxRequests: 10 },
  billing: { windowMs: 60_000, maxRequests: 20 },
  default: { windowMs: 60_000, maxRequests: 60 },
  unauthenticated_api: { windowMs: 60_000, maxRequests: 30 },
}

export const TIERED_IMPORT_LIMITS: Record<BillingPlan, RateLimitConfig> = {
  free: { windowMs: 60_000, maxRequests: 10 },
  plus: { windowMs: 60_000, maxRequests: 20 },
  pro: { windowMs: 60_000, maxRequests: 20 },
}
