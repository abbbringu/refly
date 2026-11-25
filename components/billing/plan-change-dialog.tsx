"use client"

import { useState } from "react"
import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react"
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
import { Progress } from "@/components/ui/progress"
import { BILLING_PLAN_DETAILS, isPlanDowngrade, isPlanUpgrade } from "@/lib/billing/plans"
import { formatBytes, type BillingPlan, type StorageUsage } from "@/lib/storage/quota"

type PlanChangeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: BillingPlan
  targetPlan: Exclude<BillingPlan, "free">
  renewalDate?: string | null
  storageUsage?: StorageUsage | null
  onChanged?: () => void | Promise<void>
}

export function PlanChangeDialog({
  open,
  onOpenChange,
  currentPlan,
  targetPlan,
  renewalDate,
  storageUsage,
  onChanged,
}: PlanChangeDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const current = BILLING_PLAN_DETAILS[currentPlan]
  const target = BILLING_PLAN_DETAILS[targetPlan]
  const upgrading = isPlanUpgrade(currentPlan, targetPlan)
  const downgrading = isPlanDowngrade(currentPlan, targetPlan)
  const effectiveDate = renewalDate ? new Date(renewalDate).toLocaleDateString() : "your renewal date"
  const usedBytes = storageUsage?.total_bytes ?? 0
  const overTargetLimit = downgrading && usedBytes > target.storageBytes
  const usagePercent = Math.min((usedBytes / target.storageBytes) * 100, 100)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const response = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to change plan")
      }

      const changeDate = payload?.effectiveAt
        ? new Date(payload.effectiveAt).toLocaleDateString()
        : effectiveDate
      toast.success(upgrading ? "Plan upgraded" : "Downgrade scheduled", {
        description: upgrading
          ? `${target.name} access is active now.`
          : `${target.name} starts on ${changeDate}. You keep ${current.name} until then.`,
      })
      onOpenChange(false)
      await onChanged?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to change plan"
      toast.error("Plan change failed", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {upgrading ? (
              <Sparkles className="h-5 w-5 text-primary" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            {upgrading ? `Upgrade to ${target.name}` : `Downgrade to ${target.name}`}
          </DialogTitle>
          <DialogDescription>
            {upgrading
              ? "Your new limits apply immediately. Stripe may prorate the remaining days in your current billing cycle."
              : `This takes effect at the end of your current billing period on ${effectiveDate}. You keep ${current.name} access until then.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <PlanMetric label="Storage" current={current.storageLabel} target={target.storageLabel} />
          <PlanMetric label="AI budget" current={current.aiBudgetLabel} target={target.aiBudgetLabel} />
          <PlanMetric label="Capacity" current={current.documentLabel} target={target.documentLabel} />
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Billing impact</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {upgrading
              ? `New price: ${target.priceLabel}. The plan changes now and Stripe calculates any prorated charge.`
              : `New price: ${target.priceLabel}. No immediate credit is applied because the downgrade starts at period end.`}
          </p>
        </div>

        {overTargetLimit ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="space-y-2">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  You are above the {target.name} storage limit.
                </p>
                <p className="text-amber-800/85 dark:text-amber-200/85">
                  You are using {formatBytes(usedBytes)}. {target.name} includes {target.storageLabel}. After the downgrade takes effect, uploads and new storage-heavy actions may be read-only until you free up space.
                </p>
                <Progress value={usagePercent} className="h-2 bg-amber-950/10 [&>div]:bg-amber-600" />
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {upgrading ? "Confirm Upgrade" : "Confirm Downgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanMetric({ label, current, target }: { label: string; current: string; target: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-muted-foreground line-through">{current}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{target}</p>
    </div>
  )
}
