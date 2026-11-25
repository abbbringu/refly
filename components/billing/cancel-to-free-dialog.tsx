"use client"

import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BILLING_PLAN_DETAILS } from "@/lib/billing/plans"
import type { BillingPlan } from "@/lib/storage/quota"

type CancelToFreeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: Exclude<BillingPlan, "free">
  renewalDate?: string | null
  onChanged?: () => void | Promise<void>
}

export function CancelToFreeDialog({
  open,
  onOpenChange,
  currentPlan,
  renewalDate,
  onChanged,
}: CancelToFreeDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const current = BILLING_PLAN_DETAILS[currentPlan]
  const effectiveDate = renewalDate ? new Date(renewalDate).toLocaleDateString() : "your renewal date"

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to cancel subscription")
      }

      const date = payload?.effectiveAt
        ? new Date(payload.effectiveAt).toLocaleDateString()
        : effectiveDate
      toast.success("Cancellation scheduled", {
        description: `You keep ${current.name} until ${date}, then move to Free.`,
      })
      onOpenChange(false)
      await onChanged?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to cancel subscription"
      toast.error("Cancellation failed", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Cancel to Free
          </DialogTitle>
          <DialogDescription>
            Your {current.name} plan stays active until {effectiveDate}. After that, your workspace moves to Free.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-200">
          <p className="font-medium">After cancellation, Free limits apply:</p>
          <ul className="mt-2 space-y-1 list-disc pl-5">
            <li>{BILLING_PLAN_DETAILS.free.storageLabel} storage</li>
            <li>{BILLING_PLAN_DETAILS.free.aiBudgetLabel}</li>
            <li>No paid AI features</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep {current.name}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm Cancel to Free
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
