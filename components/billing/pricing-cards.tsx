"use client"

import { useEffect, useState } from "react"
import { Check, Leaf, ShieldCheck, Sparkles } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlanCtaButton } from "@/components/billing/plan-cta-button"
import { cn } from "@/lib/utils"
import { useBilling } from "@/hooks/use-billing"
import type { BillingPlan } from "@/lib/storage/quota"

type StripePlanDisplay = Partial<Record<BillingPlan, { price: string; cadence: string }>>

const plans = [
  {
    name: "Free",
    price: "€0",
    cadence: "forever",
    subcopy: "Perfect for getting started and proving value in minutes.",
    storage: "350 MB storage",
    documents: "~85 documents",
    aiCredit: "No AI capabilities",
    cta: "Start for free",
    plan: "free" as const,
    featured: false,
    icon: Sparkles,
    features: [
      "Personal workspace for one researcher",
      "~85 documents, notes, or source files",
      "No AI features",
      "No team features",
      "Community support",
    ],
  },
  {
    name: "Plus",
    price: "€5",
    cadence: "per user / month",
    subcopy: "Your AI research assistant — search, summarize, and draft with confidence.",
    storage: "5 GB storage",
    documents: "~1,200 documents",
    aiCredit: "AI research assistant",
    cta: "Get Plus",
    plan: "plus" as const,
    featured: true,
    icon: Leaf,
    features: [
      "AI search, summaries, and citations included",
      "Team workspace",
      "Invite free members",
      "Priority support",
    ],
    aiTools: [
      "AI search across your indexed library",
      "Auto summaries for PDFs and notes",
      "Citation-aware answers with source links",
      "Draft generation for briefs and literature reviews",
    ],
  },
  {
    name: "Pro",
    price: "€15",
    cadence: "per user / month",
    subcopy: "For power users who run on AI — with over 3× the capacity of Plus.",
    storage: "15 GB storage",
    documents: "~3,700 documents",
    aiCredit: "~3.5× more AI power",
    cta: "Get Pro",
    plan: "pro" as const,
    featured: true,
    icon: ShieldCheck,
    features: [
      "All AI features, ~3.5× the usage",
      "Team workspace",
      "Invite free members",
      "Priority support",
    ],
    aiTools: [
      "Everything in Plus, plus:",
      "Auto summaries for PDFs and notes",
      "Citation-aware answers with source links",
      "Draft generation for briefs and literature reviews",
    ],
  },
]

export function PricingCards() {
  const { plan: currentPlan, profile } = useBilling()
  const [stripePlans, setStripePlans] = useState<StripePlanDisplay>({})

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setStripePlans(payload?.plans ?? {}))
      .catch(() => setStripePlans({}))
  }, [])

  return (
    <section className="mx-auto mt-12 grid w-full max-w-6xl gap-6 px-6 lg:grid-cols-3">
      {plans.map((plan) => {
          const Icon = plan.icon
          const isCurrentPlan = profile ? currentPlan === plan.plan : false
          const display = stripePlans[plan.plan]
          const cta = profile && plan.plan === "pro" && currentPlan === "plus"
            ? "Upgrade to Pro"
            : profile && plan.plan === "plus" && currentPlan === "pro"
              ? "Downgrade to Plus"
              : plan.cta

        return (
          <Card
            key={plan.name}
            className={cn(
              "flex flex-col",
              plan.featured
                ? "border-primary/55 bg-card shadow-xl ring-1 ring-primary/25"
                : "border-border/80 bg-card shadow-sm"
            )}
          >
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                </div>
                {plan.featured && !isCurrentPlan ? (
                  <Badge className="bg-primary text-primary-foreground hover:bg-primary">Most popular</Badge>
                ) : null}
              </div>
              <div>
                <p className="text-4xl font-semibold tracking-tight">{display?.price ?? plan.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{display?.cadence ?? plan.cadence}</p>
              </div>
              <CardDescription className="text-sm leading-relaxed">{plan.subcopy}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col space-y-5">
              <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                <span>{plan.storage}</span>
                <span className="text-muted-foreground">{plan.documents}</span>
              </div>
              <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
                {plan.aiCredit}
              </p>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.aiTools ? (
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Included AI tools
                  </p>
                  <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                    {plan.aiTools.map((tool) => (
                      <li key={tool} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{tool}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-auto">
              <PlanCtaButton
                plan={plan.plan}
                cta={cta}
                featured={plan.featured}
                isCurrentPlan={isCurrentPlan}
              />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
