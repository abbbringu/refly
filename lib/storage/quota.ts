import { isSelfHostedMode } from "@/lib/config/self-hosted"

export type BillingPlan = "free" | "plus" | "pro"

export interface StorageUsage {
  plan: BillingPlan
  file_bytes: number
  note_bytes: number
  metadata_bytes: number
  chat_bytes: number
  total_bytes: number
  limit_bytes: number | null
  remaining_bytes: number | null
  is_over_limit: boolean
}

export interface StorageQuotaCheck {
  allowed: boolean
  plan: BillingPlan
  current_bytes: number
  additional_bytes: number
  projected_total_bytes: number
  limit_bytes: number | null
  remaining_bytes: number | null
  over_by_bytes: number
}

interface SupabaseRpcClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

const DEFAULT_USAGE: StorageUsage = {
  plan: "free",
  file_bytes: 0,
  note_bytes: 0,
  metadata_bytes: 0,
  chat_bytes: 0,
  total_bytes: 0,
  limit_bytes: null,
  remaining_bytes: null,
  is_over_limit: false,
}

function coercePlan(plan: unknown): BillingPlan {
  if (plan === "plus" || plan === "pro") {
    return plan
  }
  return "free"
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function coerceNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = coerceNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeUsage(payload: unknown): StorageUsage {
  const source =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {}

  return {
    plan: coercePlan(source.plan),
    file_bytes: coerceNumber(source.file_bytes),
    note_bytes: coerceNumber(source.note_bytes),
    metadata_bytes: coerceNumber(source.metadata_bytes),
    chat_bytes: coerceNumber(source.chat_bytes),
    total_bytes: coerceNumber(source.total_bytes),
    limit_bytes: coerceNullableNumber(source.limit_bytes),
    remaining_bytes: coerceNullableNumber(source.remaining_bytes),
    is_over_limit: Boolean(source.is_over_limit),
  }
}

function normalizeQuotaCheck(payload: unknown): StorageQuotaCheck {
  const source =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {}

  return {
    allowed: Boolean(source.allowed),
    plan: coercePlan(source.plan),
    current_bytes: coerceNumber(source.current_bytes),
    additional_bytes: coerceNumber(source.additional_bytes),
    projected_total_bytes: coerceNumber(source.projected_total_bytes),
    limit_bytes: coerceNullableNumber(source.limit_bytes),
    remaining_bytes: coerceNullableNumber(source.remaining_bytes),
    over_by_bytes: coerceNumber(source.over_by_bytes),
  }
}

export async function getStorageUsage(supabase: SupabaseRpcClient): Promise<StorageUsage> {
  const { data, error } = await supabase.rpc("get_storage_usage")
  if (error) {
    throw new Error(error.message)
  }
  const usage = data ? normalizeUsage(data) : DEFAULT_USAGE
  if (isSelfHostedMode()) {
    return {
      ...usage,
      plan: "pro",
      limit_bytes: null,
      remaining_bytes: null,
      is_over_limit: false,
    }
  }
  return usage
}

export async function checkStorageQuota(
  supabase: SupabaseRpcClient,
  additionalBytes: number,
  options?: {
    teamId?: string | null
  },
): Promise<StorageQuotaCheck> {
  const normalizedBytes = Math.max(0, Math.floor(additionalBytes))
  if (isSelfHostedMode()) {
    return {
      allowed: true,
      plan: "pro",
      current_bytes: 0,
      additional_bytes: normalizedBytes,
      projected_total_bytes: normalizedBytes,
      limit_bytes: null,
      remaining_bytes: null,
      over_by_bytes: 0,
    }
  }

  const rpcArgs: Record<string, unknown> = {
    p_additional_bytes: normalizedBytes,
  }

  if (options?.teamId) {
    rpcArgs.p_team_id = options.teamId
  }

  const { data, error } = await supabase.rpc("check_storage_quota", rpcArgs)

  if (error) {
    throw new Error(error.message)
  }

  return normalizeQuotaCheck(data)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / 1024 ** exponent
  const value = exponent === 0 ? size.toFixed(0) : size.toFixed(2)
  return `${value} ${units[exponent]}`
}

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}
