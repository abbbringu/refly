"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"

interface PlanCtaButtonProps {
  plan: "free" | "plus" | "pro"
  cta: string
  featured?: boolean
  href?: string
  isCurrentPlan?: boolean
}

export function PlanCtaButton({ plan, cta, featured = false, href, isCurrentPlan = false }: PlanCtaButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const destination = href ?? (plan === "free" ? "/signup" : null)

  const featuredContent = (
    <>
      <Sparkles className="h-4 w-4 animate-pulse text-primary" />
      <span>{cta}</span>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </>
  )

  if (isCurrentPlan) {
    return (
      <Button className="w-full" variant="outline" disabled>
        Current plan
      </Button>
    )
  }

  if (destination) {
    if (featured) {
      return (
        <Link
          href={destination}
          className="group relative flex w-full overflow-hidden rounded-xl border border-border/50 bg-muted/50 p-[1px] transition-all duration-300 hover:border-primary/30 hover:bg-muted hover:shadow-md hover:shadow-primary/5 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="relative flex w-full items-center justify-center gap-2 rounded-[11px] bg-muted/80 px-4 py-2.5 text-sm font-semibold text-foreground transition-all duration-300 group-hover:bg-muted">
            {featuredContent}
          </div>
        </Link>
      )
    }

    return (
      <Button className="w-full" variant={featured ? "default" : "outline"} asChild>
        <Link href={destination}>{cta}</Link>
      </Button>
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

  if (featured) {
    return (
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="group relative w-full overflow-hidden rounded-xl border border-border/50 bg-muted/50 p-[1px] transition-all duration-300 hover:border-primary/30 hover:bg-muted hover:shadow-md hover:shadow-primary/5 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="relative flex items-center justify-center gap-2 rounded-[11px] bg-muted/80 px-4 py-2.5 text-sm font-semibold text-foreground transition-all duration-300 group-hover:bg-muted">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            featuredContent
          )}
        </div>
      </button>
    )
  }

  return (
    <Button
      className="w-full"
      variant="outline"
      onClick={handleCheckout}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : cta}
    </Button>
  )
}
