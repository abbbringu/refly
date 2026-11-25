import { NextResponse, type NextRequest } from "next/server"
import {
  RATE_LIMITS,
  TIERED_IMPORT_LIMITS,
  type RateLimitCategory,
  type RateLimitConfig,
} from "@/lib/rate-limit-config"
import type { BillingPlan } from "@/lib/storage/quota"

interface RateLimitBucket {
  count: number
  resetAt: number
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
  headers: Headers
}

const CLEANUP_INTERVAL_MS = 60_000

const store = ((globalThis as typeof globalThis & {
  __reflyRateLimitStore?: Map<string, RateLimitBucket>
}).__reflyRateLimitStore ??= new Map<string, RateLimitBucket>())

let lastCleanupAt = 0

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now

  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key)
    }
  }
}

export function getClientIp(request: Request | NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim()
    if (firstIp) return firstIp
  }

  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()

  return "unknown"
}

function createRateLimitHeaders({
  limit,
  remaining,
  resetAt,
  retryAfter,
}: {
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
}) {
  const headers = new Headers()
  headers.set("X-RateLimit-Limit", String(limit))
  headers.set("X-RateLimit-Remaining", String(remaining))
  headers.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)))
  if (retryAfter > 0) {
    headers.set("Retry-After", String(retryAfter))
  }
  return headers
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  cleanupExpiredBuckets(now)

  const existing = store.get(key)
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + config.windowMs }

  bucket.count += 1
  store.set(key, bucket)

  const allowed = bucket.count <= config.maxRequests
  const remaining = Math.max(0, config.maxRequests - bucket.count)
  const retryAfter = allowed
    ? 0
    : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))

  return {
    allowed,
    limit: config.maxRequests,
    remaining,
    resetAt: bucket.resetAt,
    retryAfter,
    headers: createRateLimitHeaders({
      limit: config.maxRequests,
      remaining,
      resetAt: bucket.resetAt,
      retryAfter,
    }),
  }
}

export function checkApiRateLimit(
  request: Request | NextRequest,
  userId: string | null,
  category: RateLimitCategory,
  plan?: BillingPlan
) {
  const identity = userId ? `user:${userId}` : `ip:${getClientIp(request)}`
  const config =
    category === "import" && plan
      ? TIERED_IMPORT_LIMITS[plan]
      : RATE_LIMITS[category] ?? RATE_LIMITS.default
  return checkRateLimit(`${category}:${identity}`, config)
}

export function rateLimitExceededResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Rate limit exceeded. Please try again later." },
    { status: 429, headers: result.headers }
  )
}

export function applyRateLimitHeaders<T extends Response>(
  response: T,
  result: RateLimitResult
) {
  result.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "retry-after") {
      response.headers.set(key, value)
    }
  })
  return response
}
