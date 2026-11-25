"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { PlanChangeDialog } from "@/components/billing/plan-change-dialog"
import { isPaidPlan } from "@/lib/billing/plans"
import { useBilling } from "@/hooks/use-billing"

interface PlanCtaButtonProps {
  plan: "free" | "plus" | "pro"
  cta: string
  featured?: boolean
  href?: string
  isCurrentPlan?: boolean
}

export function PlanCtaButton({ plan, cta, featured = false, href, isCurrentPlan = false }: PlanCtaButtonProps) {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()
  const billing = useBilling()

  const destination = href ?? (plan === "free" ? "/signup" : null)

  const featuredContent = (
    <>
      <Sparkles className="h-4 w-4 animate-pulse text-primary" />
      <span>{cta}</span>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </>
  )

  const buttonBase = "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300"

  if (isCurrentPlan) {
    return (
      <button className={`${buttonBase} cursor-not-allowed border border-border/50 bg-muted/50 text-muted-foreground`} disabled>
        Current plan
      </button>
    )
  }

  if (destination) {
    if (featured) {
      return (
        <Link
          href={destination}
          className={`group relative overflow-hidden border border-border/50 bg-muted/50 text-foreground hover:border-primary/30 hover:bg-muted hover:shadow-md hover:shadow-primary/5 hover:scale-[1.02] active:scale-[0.98] ${buttonBase}`}
        >
          {featuredContent}
        </Link>
      )
    }

    return (
      <Link
        href={destination}
        className={`${buttonBase} border border-border/50 bg-muted/50 text-foreground hover:border-primary/30 hover:bg-muted hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
      >
        {cta}
      </Link>
    )
  }

  const handleCheckout = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/signup")
        return
      }

      if (isPaidPlan(billing.plan) && isPaidPlan(plan) && billing.plan !== plan) {
        setConfirmOpen(true)
        return
      }

      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to start checkout")
      }

      if (!payload?.url || typeof payload.url !== "string") {
        throw new Error("Stripe checkout URL is missing")
      }

      window.location.href = payload.url
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start checkout"
      toast.error("Checkout failed", { description: message })
    } finally {
      setLoading(false)
    }
  }

  const button = featured ? (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className={`group relative overflow-hidden border border-border/50 bg-muted/50 text-foreground hover:border-primary/30 hover:bg-muted hover:shadow-md hover:shadow-primary/5 hover:scale-[1.02] active:scale-[0.98] ${buttonBase}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        featuredContent
      )}
    </button>
  ) : (
    <button
      className={`${buttonBase} border border-border/50 bg-muted/50 text-foreground hover:border-primary/30 hover:bg-muted hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
      onClick={handleCheckout}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : cta}
    </button>
  )

  if (plan !== "free") {
    return (
      <>
        {button}
        <PlanChangeDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          currentPlan={billing.plan}
          targetPlan={plan}
          renewalDate={billing.renewalDate}
          storageUsage={billing.storageUsage}
          onChanged={billing.refetch}
        />
      </>
    )
  }

  return button
}
