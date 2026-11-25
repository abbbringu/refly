import Link from "next/link"
import type { Metadata } from "next"
import {
  ArrowRight,
  Bot,
  Braces,
  Brain,
  FileUp,
  FileText,
  FolderTree,
  Globe,
  Heart,
  Quote,
  Search,
  Share2,
  Sigma,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react"


import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "FAQ & Product Guide",
  description:
    "Learn how Refly works — paper import, AI search, citations, notes with math, team collaboration, and what's coming next.",
  alternates: { canonical: "https://refly.ai/faq" },
  openGraph: {
    title: "FAQ & Product Guide — Refly",
    description:
      "Learn how Refly works — paper import, AI search, citations, notes with math, team collaboration, and what's coming next.",
    url: "https://refly.ai/faq",

  },
}

const keyFeatures = [
  {
    icon: Search,
    title: "AI search across your workspace",
    description:
      "Ask in natural language and retrieve grounded answers from notes, PDFs, and indexed references.",
  },
  {
    icon: Bot,
    title: "Auto summaries and AI drafting",
    description:
      "Generate summaries for dense papers and create first drafts for reports or literature reviews.",
  },
  {
    icon: Quote,
    title: "Citation-aware outputs",
    description:
      "Keep answers and writing tied to source material so your team can verify claims quickly.",
  },
  {
    icon: FolderTree,
    title: "Library and folder organization",
    description:
      "Structure papers into folders and shared team spaces that remain searchable as projects scale.",
  },
  {
    icon: FileText,
    title: "Research notes with markdown",
    description:
      "Write notes with rich markdown support, including checklists, tables, and code blocks.",
  },
  {
    icon: Users,
    title: "Team collaboration",
    description:
      "Invite members, share context, and work from a single evidence base in team workspaces.",
  },
  {
    icon: Heart,
    title: "Be the hero of the group",
    description:
      "One paid subscription extends storage benefits to all free members in your team workspaces (AI features not included).",
  },
]

const paperIngestionMethods = [
  {
    icon: FileUp,
    title: "Upload PDF",
    details:
      "Add a paper and upload a PDF file directly from the Add Paper dialog.",
    supports: "PDF files (.pdf)",
  },
  {
    icon: Braces,
    title: "Bulk import references",
    details:
      "Paste or upload structured bibliography data, preview parsed entries, then import in one batch.",
    supports: "BibTeX (.bib), RIS (.ris), CSL JSON (.json), EndNote XML (.xml), plain text",
  },
  {
    icon: Search,
    title: "Import by identifier",
    details:
      "Fetch metadata by scholarly identifiers and save records directly to your library.",
    supports: "DOI, arXiv ID, PubMed ID, ISBN",
  },
  {
    icon: Globe,
    title: "Import from URL",
    details:
      "Paste a webpage URL and Refly extracts metadata from standard tags where available.",
    supports: "Publisher pages, preprint pages, and websites with citation or Open Graph metadata",
  },
]

const websiteSupport = [
  "arxiv.org",
  "doi.org links",
  "pubmed.ncbi.nlm.nih.gov",
  "Journal and conference pages with citation_* tags",
  "Web pages with Open Graph or Dublin Core metadata",
]

const noteCapabilities = [
  "Headings, lists, links, blockquotes, tables, and task lists",
  "Code blocks and inline code",
  "Inline math with $...$",
  "Block math with $$...$$",
  "KaTeX rendering in note preview",
]

const comingFeatures = [
  {
    icon: Brain,
    title: "Smart research assistant",
    description:
      "An AI companion that learns your research habits and proactively suggests relevant papers, connections, and insights based on your work.",
    status: "In development",
  },
  {
    icon: Share2,
    title: "Public sharing & publishing",
    description:
      "Share your research notes, summaries, and insights with the world. Create public collections and get discovered by other researchers.",
    status: "Planned",
  },
  {
    icon: Zap,
    title: "Browser extension",
    description:
      "Save papers and web articles directly from your browser with one click. Highlight text and add notes while browsing.",
    status: "Planned",
  },
  {
    icon: Smartphone,
    title: "Mobile app",
    description:
      "Access your research library on the go. Read papers, take quick notes, and stay productive from anywhere.",
    status: "Planned",
  },
  {
    icon: Sparkles,
    title: "Advanced AI writing",
    description:
      "Generate literature reviews, research proposals, and full manuscript drafts with AI that understands your sources and writing style.",
    status: "In development",
  },
  {
    icon: Globe,
    title: "API & integrations",
    description:
      "Connect Refly with your favorite tools. Sync with reference managers, export to Word/LaTeX, and build custom workflows.",
    status: "Planned",
  },
]

export default function FaqPage() {
  return (
    <main className="relative min-h-svh overflow-x-hidden bg-background pb-20">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <section className="relative mx-auto w-full max-w-6xl px-6 pt-24 md:pt-32">
        <Badge
          variant="outline"
          className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide"
        >
          FAQ + Product Guide
        </Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl md:leading-[1.06]">
          Everything you need to use Refly effectively.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
          This page explains features, paper import options, supported formats,
          website compatibility, and note capabilities including mathematical
          expressions.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild>
            <Link href="/signup">
              Get started
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pricing">See plans</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto mt-12 w-full max-w-6xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Core features
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {keyFeatures.map((feature) => (
            <Card key={feature.title} className="border-border/80 bg-card/80 shadow-sm">
              <CardHeader className="space-y-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <feature.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-base">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 w-full max-w-6xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          How to load papers
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Use the Add Paper flow in your library. You can import one paper at a
          time or run bulk imports for large collections.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {paperIngestionMethods.map((method) => (
            <Card key={method.title} className="border-border/80 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <method.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {method.title}
                </CardTitle>
                <CardDescription>{method.details}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-foreground">
                  <span className="font-medium">Supports:</span> {method.supports}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 grid w-full max-w-6xl gap-5 px-6 lg:grid-cols-2">
        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Supported website sources</CardTitle>
            <CardDescription>
              URL import works best when pages expose citation metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {websiteSupport.map((site) => (
                <li key={site} className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
                  {site}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sigma className="h-5 w-5 text-primary" aria-hidden="true" />
              Mathematical expressions in notes
            </CardTitle>
            <CardDescription>
              Refly notes support markdown math syntax.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {noteCapabilities.map((capability) => (
                <li key={capability} className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
                  {capability}
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-md border border-border bg-muted/35 p-3 text-sm text-foreground">
              <p>
                <span className="font-medium">Examples:</span> inline <code>{"$E = mc^2$"}</code>
                and block <code>{"$$\\int_0^1 x^2 \\mathrm{d}x$$"}</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto mt-14 w-full max-w-6xl px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Coming soon
          </h2>
          <Badge variant="secondary" className="rounded-full">
            Roadmap
          </Badge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Here is what you can expect to see in the future. I am actively working
          on these features to make Refly even more powerful for your research.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {comingFeatures.map((feature) => (
            <Card key={feature.title} className="border-border/80 bg-card/80 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <feature.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <Badge
                    variant={feature.status === "In development" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {feature.status}
                  </Badge>
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
