import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, Check, X } from "lucide-react"

import { ReflyLogo } from "@/components/layout/refly-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { PricingCards } from "@/components/billing/pricing-cards"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free, grow with Plus, or power up with Pro. Choose the Refly plan that fits your research needs.",
  alternates: { canonical: "https://refly.ai/pricing" },
  openGraph: {
    title: "Pricing — Refly",
    description:
      "Start free, grow with Plus, or power up with Pro. Choose the Refly plan that fits your research needs.",
    url: "https://refly.ai/pricing",
    images: [{ url: "https://refly.ai/og.png", width: 1200, height: 630, alt: "Refly Pricing" }],
  },
}

const comparison = [
  {
    feature: "Storage",
    info: "Total file storage capacity across PDFs, notes, and uploaded sources.",
    free: "350 MB",
    plus: "5 GB",
    pro: "15 GB",
  },
  {
    feature: "AI usage",
    info: "Monthly AI credit included per user — Plus gets $2, Pro gets $7 (≈3.5× Plus).",
    free: "None",
    plus: "Standard ($2/mo)",
    pro: "High (~3.5× Plus, $7/mo)",
  },
  {
    feature: "Document capacity",
    info: "Approximate total documents you can keep indexed in your workspace.",
    free: "~50",
    plus: "~1,200",
    pro: "~3,700",
  },
  {
    feature: "AI features",
    info: "Core AI capabilities for search, synthesis, and writing assistance.",
    free: false,
    plus: "All features",
    pro: "All features",
  },
  {
    feature: "AI search",
    info: "Natural-language retrieval over all indexed documents and notes.",
    free: false,
    plus: true,
    pro: true,
  },
  {
    feature: "AI summaries",
    info: "One-click summaries for dense papers with key findings and takeaways.",
    free: false,
    plus: true,
    pro: true,
  },
  {
    feature: "Citation-aware AI answers",
    info: "AI responses include source references so teams can verify claims quickly.",
    free: false,
    plus: true,
    pro: true,
  },
  {
    feature: "AI draft generation",
    info: "Generate first drafts for reports, briefs, and literature reviews.",
    free: false,
    plus: true,
    pro: true,
  },
  {
    feature: "Team workspace",
    info: "Collaborative projects with shared folders, notes, and access controls.",
    free: false,
    plus: true,
    pro: true,
  },
  {
    feature: "Invite free members",
    info: "Bring collaborators into team projects even if they are on the free tier.",
    free: false,
    plus: true,
    pro: true,
  },
  {
    feature: "Security controls",
    info: "Admin and policy controls to protect data and manage access.",
    free: "Standard",
    plus: "Enhanced",
    pro: "Enhanced",
  },
  {
    feature: "Support",
    info: "How quickly your team gets help and strategic onboarding support.",
    free: "Community",
    plus: "Priority",
    pro: "Priority",
  },
]

function valueCell(value: string | boolean) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
    ) : (
      <X className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
    )
  }

  return value
}

export default function PricingPage() {
  return (
    <main className="relative min-h-svh overflow-x-hidden bg-background pb-18">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[440px]" />
      <section className="relative mx-auto w-full max-w-6xl px-6 pt-24 md:pt-32">
        <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-wide text-primary">
          Pricing
        </Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl md:leading-[1.05]">
          Start free. Grow with Plus. Power up with Pro.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Refly helps teams go from scattered documents to confident decisions faster. Choose the plan that matches your document volume, AI needs, and collaboration goals.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" asChild>
            <Link href="/signup">
              Start for free
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="mailto:hello@refly.ai">Talk to sales</a>
          </Button>
        </div>
      </section>

      <PricingCards />

      <section className="mx-auto mt-14 w-full max-w-6xl px-6">
        <Card className="overflow-hidden border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Compare plans</CardTitle>
            <CardDescription>
              Clear pricing with the features teams ask for most.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <TooltipProvider>
              <Table className="min-w-[760px] text-sm md:text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-10 w-[34%] px-2 text-sm font-semibold">Feature</TableHead>
                    <TableHead className="h-10 px-2 text-center text-sm font-semibold">Free</TableHead>
                    <TableHead className="h-10 px-2 text-center text-sm font-semibold">Plus</TableHead>
                    <TableHead className="h-10 px-2 text-center text-sm font-semibold">Pro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.map((item) => (
                    <TableRow key={item.feature}>
                      <TableCell className="px-2 py-2 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <span>{item.feature}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted/40 text-[10px] font-semibold leading-none text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
                                aria-label={`More information about ${item.feature}`}
                              >
                                i
                              </button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={8}>{item.info}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center text-sm text-muted-foreground">
                        {valueCell(item.free)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center text-sm text-muted-foreground">
                        {valueCell(item.plus)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center text-sm text-muted-foreground">
                        {valueCell(item.pro)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          </CardContent>
        </Card>
      </section>

      <footer className="mx-auto mt-16 flex w-full max-w-6xl flex-col items-start justify-between gap-4 border-t border-border/60 px-6 pt-8 text-sm text-muted-foreground md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <ReflyLogo className="h-4 w-4" />
          <span>Refly Research</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/changelog" className="hover:text-foreground hover:underline">
            Changelog
          </Link>
          <Link href="/security" className="hover:text-foreground hover:underline">
            Security
          </Link>
          <Link href="/legal" className="hover:text-foreground hover:underline">
            Legal
          </Link>
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          <Link href="/cookies" className="hover:text-foreground hover:underline">
            Cookies
          </Link>
          <p>&copy; {new Date().getFullYear()} Refly.</p>
        </div>
      </footer>
    </main>
  )
}
