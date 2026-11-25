"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { createClient } from "@/utils/supabase/client"
import type { Profile } from "@/types"
import { getStorageUsage, type BillingPlan, type StorageUsage } from "@/lib/storage/quota"
import type { BillingSnapshot } from "@/lib/billing/snapshot"

type BillingContextValue = {
  profile: Profile | null
  plan: BillingPlan
  pendingPlan: BillingPlan | null
  pendingPlanEffectiveAt: string | null
  billingStatus: string | null
  renewalDate: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  source: BillingSnapshot["source"]
  storageUsage: StorageUsage | null
  loading: boolean
  refetch: () => Promise<void>
}

const BillingContext = createContext<BillingContextValue | null>(null)

function normalizePlan(plan: unknown): BillingPlan {
  return plan === "plus" || plan === "pro" ? plan : "free"
}

export function BillingProvider({
  children,
  initialProfile = null,
}: {
  children: ReactNode
  initialProfile?: Profile | null
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null)
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null)
  const [loading, setLoading] = useState(!initialProfile)

  const refetch = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setProfile(null)
      setSnapshot(null)
      setStorageUsage(null)
      setLoading(false)
      return
    }

    const [snapshotResult, usageResult] = await Promise.all([
      fetch("/api/billing/subscription-status")
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null),
      getStorageUsage(supabase).catch(() => null),
    ])

    const nextSnapshot = (snapshotResult as BillingSnapshot | null) ?? null
    setSnapshot(nextSnapshot)
    setProfile(nextSnapshot?.profile ?? null)
    setStorageUsage(usageResult)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!initialProfile) {
      refetch()
      return
    }

    const supabase = createClient()
    Promise.all([
      getStorageUsage(supabase).catch(() => null),
      fetch("/api/billing/subscription-status")
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null),
    ]).then(([usage, snapshotResult]) => {
      const nextSnapshot = (snapshotResult as BillingSnapshot | null) ?? null
      setSnapshot(nextSnapshot)
      setProfile(nextSnapshot?.profile ?? initialProfile)
      setStorageUsage(usage)
    })
  }, [initialProfile, refetch])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        refetch()
      }
    }

    window.addEventListener("focus", refetch)
    document.addEventListener("visibilitychange", refresh)

    return () => {
      window.removeEventListener("focus", refetch)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [refetch])

  const value = useMemo<BillingContextValue>(
    () => ({
      profile,
      plan: snapshot?.plan ?? normalizePlan(profile?.plan),
      pendingPlan: snapshot?.pendingPlan ?? null,
      pendingPlanEffectiveAt: snapshot?.pendingPlanEffectiveAt ?? null,
      billingStatus: snapshot?.billingStatus ?? profile?.billing_status ?? null,
      renewalDate: snapshot?.renewalDate ?? profile?.plan_renewal_at ?? null,
      cancelAtPeriodEnd: snapshot?.cancelAtPeriodEnd ?? Boolean(profile?.cancel_at_period_end),
      stripeCustomerId: snapshot?.stripeCustomerId ?? profile?.stripe_customer_id ?? null,
      stripeSubscriptionId: snapshot?.stripeSubscriptionId ?? profile?.stripe_subscription_id ?? null,
      source: snapshot?.source ?? (profile ? "profile" : "none"),
      storageUsage,
      loading,
      refetch,
    }),
    [loading, profile, refetch, snapshot, storageUsage]
  )

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

export function useBilling() {
  const context = useContext(BillingContext)
  if (!context) {
    throw new Error("useBilling must be used within BillingProvider")
  }
  return context
}
