import type { BillingPlan } from "@/lib/storage/quota"

export const BILLING_PLAN_ORDER: Record<BillingPlan, number> = {
  free: 0,
  plus: 1,
  pro: 2,
}

export const BILLING_PLAN_DETAILS: Record<
  BillingPlan,
  {
    name: string
    priceLabel: string
    storageLabel: string
    documentLabel: string
    aiBudgetLabel: string
    storageBytes: number
    aiBudgetUsd: number
  }
> = {
  free: {
    name: "Free",
    priceLabel: "€0",
    storageLabel: "350 MB",
    documentLabel: "~85 documents",
    aiBudgetLabel: "€0/mo AI budget",
    storageBytes: 350 * 1024 * 1024,
    aiBudgetUsd: 0,
  },
  plus: {
    name: "Plus",
    priceLabel: "€5",
    storageLabel: "5 GB",
    documentLabel: "~1,200 documents",
    aiBudgetLabel: "€2/mo AI budget",
    storageBytes: 5 * 1024 * 1024 * 1024,
    aiBudgetUsd: 2,
  },
  pro: {
    name: "Pro",
    priceLabel: "€15",
    storageLabel: "15 GB",
    documentLabel: "~3,700 documents",
    aiBudgetLabel: "€7/mo AI budget",
    storageBytes: 15 * 1024 * 1024 * 1024,
    aiBudgetUsd: 7,
  },
}

export function isPaidPlan(plan: BillingPlan) {
  return plan === "plus" || plan === "pro"
}

export function isPlanUpgrade(currentPlan: BillingPlan, targetPlan: BillingPlan) {
  return BILLING_PLAN_ORDER[targetPlan] > BILLING_PLAN_ORDER[currentPlan]
}

export function isPlanDowngrade(currentPlan: BillingPlan, targetPlan: BillingPlan) {
  return BILLING_PLAN_ORDER[targetPlan] < BILLING_PLAN_ORDER[currentPlan]
}
