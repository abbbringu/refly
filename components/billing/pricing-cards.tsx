"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Check, Leaf, ShieldCheck, Sparkles, X } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import type { BillingPlan } from "@/lib/storage/quota"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlanCtaButton } from "@/components/billing/plan-cta-button"

const plans = [
  {
    name: "Free",
    price: "$0",
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
      "~50 PDFs, notes, or source files",
      "No AI features",
      "No team features",
      "Community support",
    ],
  },
  {
    name: "Plus",
    price: "EUR 5",
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
    price: "EUR 15",
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
  const [currentPlan, setCurrentPlan] = useState<BillingPlan | null>(null)

  useEffect(() => {
    const fetchPlan = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setCurrentPlan(null)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single()

      if (profile?.plan === "plus" || profile?.plan === "pro") {
        setCurrentPlan(profile.plan)
      } else {
        setCurrentPlan("free")
      }
    }

    fetchPlan()
  }, [])

  return (
    <section className="mx-auto mt-12 grid w-full max-w-6xl gap-6 px-6 lg:grid-cols-3">
      {plans.map((plan) => {
        const Icon = plan.icon
        const isCurrentPlan = currentPlan === plan.plan

        return (
          <Card
            key={plan.name}
            className={
              plan.featured
                ? "border-primary/55 bg-card shadow-xl ring-1 ring-primary/25"
                : "border-border/80 bg-card shadow-sm"
            }
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
                <p className="text-4xl font-semibold tracking-tight">{plan.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{plan.cadence}</p>
              </div>
              <CardDescription className="text-sm leading-relaxed">{plan.subcopy}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <p className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                {plan.storage}
              </p>
              <p className="rounded-md border border-border bg-muted/35 px-3 py-2 text-sm font-medium text-foreground">
                {plan.documents}
              </p>
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
              <PlanCtaButton
                plan={plan.plan}
                cta={plan.cta}
                featured={plan.featured}
                isCurrentPlan={isCurrentPlan}
              />
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
