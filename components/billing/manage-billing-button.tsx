"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ManageBillingButtonProps {
  label?: string
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link"
  className?: string
}

export function ManageBillingButton({
  label = "Manage billing",
  variant = "outline",
  className,
}: ManageBillingButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleOpenPortal = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/billing/portal-session", {
        method: "POST",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to open billing portal")
      }

      if (!payload?.url || typeof payload.url !== "string") {
        throw new Error("Stripe billing portal URL is missing")
      }

      window.location.href = payload.url
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to open billing portal"
      toast.error("Billing portal unavailable", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={variant} className={className} onClick={handleOpenPortal} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  )
}
