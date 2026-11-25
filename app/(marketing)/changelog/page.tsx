import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, Bot, Brain, FlaskConical, Globe, Share2, Sparkles, Zap } from "lucide-react"


import { ReflyLogo } from "@/components/layout/refly-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "See what is new in Refly — feature releases, improvements, and fixes shipped to your research workspace.",
}

const categories = {
  new: { label: "New", className: "bg-primary text-primary-foreground" },
  improvement: { label: "Improvement", className: "bg-secondary text-secondary-foreground border border-border" },
  fix: { label: "Fix", className: "bg-muted text-muted-foreground border border-border" },
} as const

type Category = keyof typeof categories

interface ChangelogEntry {
  date: string
  title: string
  category: Category
  description: string
  icon: typeof Bot
}

const entries: ChangelogEntry[] = [
  {
    date: "April 2026",
    title: "Smart research assistant",
    category: "new",
    description:
      "An AI companion that learns your research habits and proactively suggests relevant papers, connections, and insights based on your work.",
    icon: Brain,
  },
  {
    date: "April 2026",
    title: "Advanced AI writing",
    category: "new",
    description:
      "Generate literature reviews, research proposals, and full manuscript drafts with AI that understands your sources and writing style.",
    icon: Sparkles,
  },
  {
    date: "March 2026",
    title: "AI research copilot",
    category: "improvement",
    description:
      "Semantic retrieval and citation-aware answers are now part of the everyday writing flow, making it easier to ground your work in evidence.",
    icon: Bot,
  },
  {
    date: "March 2026",
    title: "First workspace engine",
    category: "new",
    description:
      "Shipped searchable notes and source linking to help researchers keep ideas tied to evidence. The foundation of the Refly workspace.",
    icon: FlaskConical,
  },
  {
    date: "March 2026",
    title: "Bulk import and reference parsing",
    category: "improvement",
    description:
      "Import references from BibTeX, RIS, CSL JSON, and EndNote XML files. Preview parsed entries before committing them to your library.",
    icon: Globe,
  },
  {
    date: "February 2026",
    title: "Folder organization and team spaces",
    category: "new",
    description:
      "Structure papers into folders and shared team spaces that remain searchable as projects scale.",
    icon: Zap,
  },
  {
    date: "January 2026",
    title: "Initial launch",
    category: "new",
    description:
      "Refly launched with core library, notes, and PDF upload capabilities. The first step toward an AI-powered research workspace.",
    icon: FlaskConical,
  },
]

const upcoming = [
  {
    icon: Share2,
    title: "Public sharing and publishing",
    description:
      "Share research notes, summaries, and insights publicly. Create discoverable collections for the wider research community.",
  },
  {
    icon: Globe,
    title: "Browser extension",
    description:
      "Save papers and web articles directly from your browser with one click. Highlight text and add notes while browsing.",
  },
]

export default function ChangelogPage() {
  return (
    <main className="relative min-h-svh overflow-x-hidden bg-background pb-12">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[360px]" />
      <section className="relative mx-auto w-full max-w-5xl px-5 pt-16 md:pt-20">
        <Badge
          variant="outline"
          className="rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide"
        >
          Changelog
        </Badge>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.06]">
          What is new in Refly.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Every feature, improvement, and fix shipped to your research workspace.
          Follow along as Refly evolves.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild className="px-5">
            <Link href="/signup">
              Start using Refly
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/faq">See all features</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto mt-10 w-full max-w-5xl px-5">
        <div className="space-y-0">
          {entries.map((entry, index) => (
            <div
              key={entry.title}
              className="relative flex gap-4 pb-6 md:gap-5"
            >
              {index !== entries.length - 1 && (
                <div className="absolute bottom-0 left-[15px] top-7 w-px bg-border/60 md:left-[17px]" />
              )}
              <div className="relative z-10 flex shrink-0">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary md:h-9 md:w-9">
                  <entry.icon className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {entry.date}
                  </span>
                  <Badge
                    className={`rounded-full px-2 py-0 text-[10px] ${categories[entry.category].className}`}
                  >
                    {categories[entry.category].label}
                  </Badge>
                </div>
                <h3 className="mt-1 text-base font-semibold tracking-tight">
                  {entry.title}
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-normal text-muted-foreground">
                  {entry.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-4 w-full max-w-5xl px-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Coming next
          </h2>
          <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
            Roadmap
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-normal text-muted-foreground">
          These features are on the way. Stay tuned for updates.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {upcoming.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-dashed border-border bg-muted/20 p-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold tracking-tight">
                  {item.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-normal text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-10 w-full max-w-5xl px-5">
        <div className="rounded-xl border border-border/60 bg-card/80 p-6 text-center">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Never miss an update
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-normal text-muted-foreground">
            Bookmark this page to stay informed about new features and
            improvements. Major releases will also be announced via email and
            in-app notifications.
          </p>
          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild className="px-5">
              <Link href="/signup">
                Get started free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-muted/25">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ReflyLogo className="h-4 w-4" />
            <span>Refly Research</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/changelog" className="hover:text-foreground hover:underline">
              Changelog
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
            <p>&copy; {new Date().getFullYear()} Refly. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
