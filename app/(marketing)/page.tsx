import Link from "next/link"
import type { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  BookOpen,
  ArrowDownToLine,
  Bot,
  Check,
  ChevronRight,
  FileText,
  FolderTree,
  ShieldCheck,
  Quote,
  Sparkles,
  ArrowRight,
  Users,
  Zap,
} from "lucide-react"
import { ReflyLogo } from "@/components/layout/refly-logo"
import { HeroAppMockup } from "@/components/layout/hero-app-mockup"
import { ThemeCustomizerDemo } from "@/components/layout/theme-customizer-demo"
import { isSelfHostedMode } from "@/lib/config/self-hosted"

export const metadata: Metadata = {
  title: "Refly — AI-Powered Research Workspace",
  description:
    "Read, think, and write with clarity. Refly is the AI-powered research workspace for search, summaries, references, and notes.",
}

const valuePillars = [
  {
    icon: FolderTree,
    title: "One place for literature review",
    description:
      "Collect and manage relevant papers for your project in a single, organized workspace.",
  },
  {
    icon: Bot,
    title: "AI empowerment",
    description:
      "Leverage AI to summarize, connect ideas, and draft outputs while staying grounded in your sources.",
  },
  {
    icon: Users,
    title: "Collaborate",
    description:
      "Invite collaborators, share curated collections, and build shared memory for ongoing research programs.",
  },
  {
    icon: Sparkles,
    title: "Auto enrich",
    description:
      "Import by DOI or URL and let Refly fetch clean metadata and PDFs automatically.",
  },
]

const featureBlocks = [
  {
    icon: Sparkles,
    title: "Semantic AI chat",
    description:
      "Ask natural questions and get grounded answers from your papers, notes, and highlights with RAG over your library.",
    className: "md:col-span-2",
    detail: "Hybrid semantic search over notes, papers, and PDFs.",
    visual: "chat",
  },
  {
    icon: FolderTree,
    title: "Organize papers",
    description:
      "Keep research tidy with folders and collections that scale from one project to an entire lab.",
    className: "md:col-span-1",
    detail: "Projects, folders, collections.",
    visual: "folders",
  },
  {
    icon: ArrowDownToLine,
    title: "Auto fetch metadata",
    description:
      "Import by DOI or URL and let Refly fetch clean metadata and PDFs automatically.",
    className: "md:col-span-1",
    detail: "DOI, title, authors, journal, PDF.",
    visual: "metadata",
  },
  {
    icon: Users,
    title: "Work with your team",
    description:
      "Share research spaces, manage roles, and keep collaborators aligned around the same evidence.",
    className: "md:col-span-1",
    detail: "Roles, shared libraries, team memory.",
    visual: "team",
  },
  {
    icon: FileText,
    title: "Write notes",
    description:
      "Capture ideas in a calm writing space and connect each note directly to supporting references.",
    className: "md:col-span-1",
    detail: "Notes stay linked to papers and citations.",
    visual: "notes",
  },
  {
    icon: Quote,
    title: "AI citation support",
    description:
      "Check how well your library supports a statement, with evidence ranked by semantic similarity.",
    className: "md:col-span-2",
    detail: "Statement support scored against your sources.",
    visual: "citation",
  },
]

function FeatureBlockVisual({ visual }: { visual: string }) {
  if (visual === "chat") {
    return (
      <div className="feature-mini-pulse rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-muted-foreground shadow-sm">
        <div className="relative h-28 overflow-hidden rounded-md border border-border/60 bg-muted/30">
          <svg
            viewBox="0 0 260 120"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <line
              x1="118"
              y1="62"
              x2="64"
              y2="88"
              className="stroke-primary/30"
              strokeWidth="1.5"
            />
            <line
              x1="118"
              y1="62"
              x2="178"
              y2="38"
              className="stroke-primary/30"
              strokeWidth="1.5"
            />
            <line
              x1="118"
              y1="62"
              x2="194"
              y2="92"
              className="stroke-primary/20"
              strokeWidth="1.5"
            />
            {[
              [26, 30],
              [45, 78],
              [78, 22],
              [92, 102],
              [142, 26],
              [156, 82],
              [208, 18],
              [224, 68],
              [238, 104],
            ].map(([cx, cy]) => (
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r="3"
                className="fill-muted-foreground/30"
              />
            ))}
            <circle cx="118" cy="62" r="10" className="fill-primary" />
            <circle
              cx="118"
              cy="62"
              r="17"
              className="fill-primary/10 stroke-primary/30"
              strokeWidth="1.5"
            />
            <circle cx="64" cy="88" r="7" className="fill-primary/80" />
            <circle cx="178" cy="38" r="6" className="fill-primary/70" />
            <circle cx="194" cy="92" r="5" className="fill-primary/60" />
          </svg>
          <span className="absolute top-3 left-3 text-primary">query</span>
          <span className="absolute bottom-3 left-5 text-primary/80">
            paper_12
          </span>
          <span className="absolute top-7 right-7 text-primary/80">note_4</span>
          <span className="absolute right-10 bottom-4 text-primary/70">
            0.87
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          Nearby points become grounded answers.
        </p>
      </div>
    )
  }

  if (visual === "folders") {
    return (
      <div className="feature-mini-pulse space-y-1 rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-muted-foreground shadow-sm">
        {/* Parent folder */}
        <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <FolderTree className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground">Library</span>
        </div>
        {/* Nested subfolders */}
        <div className="ml-4 border-l border-border/50 pl-3">
          <div className="flex items-center gap-2 py-1">
            <FolderTree className="h-3 w-3 text-amber-600" />
            <span>Deep Learning</span>
          </div>
          <div className="flex items-center gap-2 py-1">
            <FolderTree className="h-3 w-3 text-emerald-600" />
            <span>Neuroscience</span>
          </div>
          <div className="ml-3 border-l border-border/40 pl-2">
            <div className="flex items-center gap-2 py-0.5">
              <FileText className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-muted-foreground/70">attention.pdf</span>
            </div>
          </div>
          <div className="flex items-center gap-2 py-1">
            <FolderTree className="h-3 w-3 text-violet-600" />
            <span>Reviews</span>
          </div>
        </div>
      </div>
    )
  }

  if (visual === "metadata") {
    return (
      <div className="feature-mini-pulse rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-muted-foreground shadow-sm">
        {/* Enrichment list */}
        <div className="space-y-1.5">
          {[
            { title: "Attention Is All You Need", status: "success" },
            { title: "Longformer", status: "success" },
            { title: "BERT", status: "processing" },
            { title: "Reformer", status: "pending" },
            { title: "T5", status: "pending" },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-2">
              {item.status === "success" && (
                <Check className="h-3 w-3 text-green-600" />
              )}
              {item.status === "processing" && (
                <span className="feature-meta-spinner h-3 w-3 rounded-full border-2 border-primary border-t-transparent" />
              )}
              {item.status === "pending" && (
                <span className="h-3 w-3 rounded-full border border-muted-foreground/30" />
              )}
              <span className="truncate text-[10px]">{item.title}</span>
            </div>
          ))}
        </div>
        {/* Progress */}
        <div className="mt-2 h-1.5 rounded-full bg-muted">
          <div className="h-1.5 w-2/5 rounded-full bg-primary" />
        </div>
      </div>
    )
  }

  if (visual === "citation") {
    return (
      <div className="feature-mini-pulse rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-muted-foreground shadow-sm">
        {/* Results */}
        <div className="space-y-2">
          {[
            {
              title: "Retrieval-Augmented Generation for NLP",
              authors: "Lewis et al.",
              year: 2020,
              support: "Strong support",
              score: 50,
            },
            {
              title: "Dense Passage Retrieval",
              authors: "Karpukhin et al.",
              year: 2020,
              support: "Partial support",
              score: 40,
            },
          ].map((paper) => (
            <div
              key={paper.title}
              className="rounded-md border border-border/50 bg-card/50 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-foreground">
                    {paper.title}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">
                    {paper.authors} ({paper.year})
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <span
                    className={`rounded border px-1 py-0 text-[8px] ${
                      paper.support === "Strong support"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : paper.support === "Partial support"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {paper.support}
                  </span>
                  <span className="rounded bg-secondary px-1 py-0 text-[8px] text-secondary-foreground">
                    {paper.score}% match
                  </span>
                </div>
              </div>
              {/* Evidence quote */}
              <div className="mt-1.5 border-l-2 border-primary/30 bg-muted/30 py-1 pr-2 pl-2">
                <p className="text-[9px] leading-relaxed text-muted-foreground">
                  "RAG combines parametric and non-parametric memory..."
                </p>
              </div>
              {/* Citation block */}
              <div className="relative mt-1.5 rounded border border-border/40 bg-muted/30 p-1.5">
                <p className="font-mono text-[8px] leading-relaxed text-muted-foreground">
                  Lewis, P. et al. (2020). Retrieval-Augmented Generation...
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/70">
          Found 2 candidate citations with evidence quotes
        </p>
      </div>
    )
  }

  if (visual === "team") {
    return (
      <div className="feature-mini-pulse rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-muted-foreground shadow-sm">
        <div className="mb-3 flex -space-x-2">
          {["A", "B", "C"].map((item) => (
            <span
              key={item}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-foreground"
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span>shared_space</span>
          <span className="text-primary">live</span>
        </div>
      </div>
    )
  }

  return (
    <div className="feature-mini-pulse rounded-lg border border-border/60 bg-background/80 p-3 font-mono text-xs text-muted-foreground shadow-sm">
      <p className="font-semibold text-foreground">Attention paper notes</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
        <li>Multi-head splits into 8 heads</li>
        <li>Positional encodings are learnable</li>
        <li>No recurrence needed</li>
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
        <FileText className="h-3 w-3 text-muted-foreground" />
        <span className="truncate text-[10px] text-muted-foreground">
          Vaswani et al. — Attention Is All You Need
        </span>
      </div>
    </div>
  )
}

const deepResearchSteps = [
  {
    step: "01",
    title: "Ingest and summarize",
    description:
      "Import papers, URLs, and notes. Refly summarizes content and extracts key signals instantly.",
  },
  {
    step: "02",
    title: "Search across context",
    description:
      "Run semantic search across your indexed workspace to surface evidence, not keyword noise.",
  },
  {
    step: "03",
    title: "Generate grounded outputs",
    description:
      "Produce briefs and reviews with citations attached, ready to share with confidence.",
  },
]

const collaborationCapabilities = [
  "Create team workspaces for labs, research pods, and cross-functional projects.",
  "Assign managed roles with owner, admin, editor, and viewer permissions.",
  "Collaborate on shared notes with linked references and source-level traceability.",
  "Build joint collections and folders so every team works from the same evidence base.",
  "Be the hero of your research group: your paid subscription extends storage benefits to all free members in your workspace (AI features excluded).",
]

const planHighlights = [
  {
    icon: BookOpen,
    title: "Start Free",
    description:
      "Organize notes, manage a smaller project, and keep a limited library of papers — all for free.",
  },
  {
    icon: Sparkles,
    title: "Grow with Plus",
    description:
      "Get much more storage, light AI tools, and room to run several projects simultaneously.",
  },
  {
    icon: Zap,
    title: "Power up with Pro",
    description:
      "Max storage and full AI capabilities. Built for team owners, heavy researchers, and power users.",
  },
]

const faqs = [
  {
    question: "What makes Refly a research companion?",
    answer:
      "Refly blends a simple, beautiful writing experience with research-first AI tools. Every note, paper, and citation stays searchable and source-grounded.",
  },
  {
    question: "Can I bring existing references and documents?",
    answer:
      "Yes. You can import metadata and papers from common academic formats, then Refly automatically links them to your notes and workspace collections.",
  },
  {
    question: "Are AI answers grounded in my sources?",
    answer:
      "Always. Responses are generated from indexed content in your workspace and include references so your team can verify every claim.",
  },
  {
    question: "Does it support team-based research?",
    answer:
      "Absolutely. Create shared spaces for labs, product teams, or strategy groups with role-based access and collaborative editing.",
  },
  {
    question: "Can I share my subscription with my team?",
    answer:
      "Yes! Be the hero of your research group. A single paid subscription extends storage benefits to all free members in your team workspaces. AI features remain tied to individual Pro plans.",
  },
]

const selfHostedHighlights = [
  {
    icon: BookOpen,
    title: "100% Open Source",
    description:
      "MIT-licensed hobby project. Inspect the code, customize workflows, and own your entire research library locally.",
  },
  {
    icon: Sparkles,
    title: "Bring Your Own AI",
    description:
      "Connect OpenRouter, OpenAI, or any OpenAI-compatible local model server like Ollama — or run completely without AI keys.",
  },
  {
    icon: Zap,
    title: "One-Command Docker Setup",
    description:
      "Postgres with pgvector, local auth, file storage, and the Next.js app boot together with docker compose up.",
  },
]

export default function LandingPage() {
  const selfHosted = isSelfHostedMode()
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden bg-background">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[620px]" />
      <main className="flex-1">
        <section className="relative w-full lg:overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 pt-24 pb-24 md:pt-28 md:pb-28 lg:grid lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div className="animate-in duration-700 slide-in-from-bottom-6">
              <Badge
                variant="outline"
                className="mb-6 h-7 rounded-full px-3 text-[11px] tracking-wide uppercase"
              >
                Research Companion + AI Tools
              </Badge>
              <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.08]">
                Your AI-powered research workspace.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Refly helps you read, think, and write with clarity. Use AI
                tools for search, summaries, references, and notes in one calm,
                research-first workspace.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild className="px-7">
                  <Link href="/signup">
                    Start free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Explore your library</Link>
                </Button>
              </div>
              <div className="mt-7 flex items-center gap-5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI tools built for research
                </div>
                <div className="hidden h-4 w-px bg-border sm:block" />
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Beautifully simple workflow
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-24 right-0 hidden lg:block lg:h-[calc(100%-6rem)] lg:w-[800px] lg:overflow-hidden lg:pt-12">
            <div className="h-full w-full overflow-hidden rounded-l-xl border border-border/70 bg-card/95 shadow-2xl">
              <HeroAppMockup />
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-muted/20">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="mb-8 max-w-2xl">
              <Badge
                variant="outline"
                className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
              >
                Core Features
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Everything your research library can do for you.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Refly brings chat, organization, citations, notes, and team
                workflows into one source-grounded workspace.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-lg">
              <div className="grid md:grid-cols-4">
                {featureBlocks.map((feature) => (
                  <Card
                    key={feature.title}
                    className={`feature-card relative min-h-56 rounded-none border-0 border-border/60 bg-transparent px-1 py-5 ring-0 transition-colors duration-200 hover:bg-card/90 md:border-r md:border-b ${feature.className}`}
                  >
                    <span className="feature-speck top-[12%] left-[12%]" />
                    <span className="feature-speck top-[4%] left-[38%]" />
                    <span className="feature-speck top-[26%] right-[18%]" />
                    <span className="feature-speck bottom-[18%] left-[22%]" />
                    <span className="feature-speck right-[12%] bottom-[8%]" />
                    <CardHeader className="relative gap-3 px-3">
                      <div className="feature-card-icon flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-primary/10 shadow-sm">
                        <feature.icon className="h-4 w-4 text-primary" />
                      </div>
                      <CardTitle className="text-lg font-semibold tracking-tight text-foreground">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="relative flex flex-1 flex-col justify-between gap-5 px-3">
                      <div>
                        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                          {feature.description}
                        </p>
                        <p className="mt-3 font-mono text-xs text-primary">
                          {feature.detail}
                        </p>
                      </div>
                      <FeatureBlockVisual visual={feature.visual} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-background/80">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <Badge
                  variant="secondary"
                  className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
                >
                  Why Refly
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Faster research with less busywork.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Refly automates repetitive steps so teams can focus on thinking,
                synthesis, and high-quality decisions.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {valuePillars.map((pillar) => (
                <Card
                  key={pillar.title}
                  className="micro-lift border border-border/60 bg-card/75 transition-transform duration-200 hover:-translate-y-1"
                >
                  <CardHeader className="gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                      <pillar.icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-base font-semibold">
                      {pillar.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {pillar.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <ThemeCustomizerDemo />

        <section className="border-b border-border/60 bg-muted/20">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <Badge
                variant="outline"
                className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
              >
                Deep Research Workflow
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                A simple flow for deep research.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Move from ingestion to insight in a clean, repeatable workflow
                powered by AI.
              </p>
            </div>

            <div className="space-y-4">
              {deepResearchSteps.map((step) => (
                <Card
                  key={step.step}
                  className="micro-lift border border-border/60 bg-background/85"
                >
                  <CardContent className="flex gap-4 py-4 md:py-5">
                    <div className="min-w-10 rounded-md bg-primary/10 px-2 py-1 text-center text-xs font-semibold text-primary">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold tracking-tight">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 bg-background/85">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-20 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <Badge
                variant="secondary"
                className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
              >
                Teams and Roles
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Built for shared research, managed simply.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Run individual deep work and team collaboration in one place.
                Refly keeps permissions clear while making shared notes and
                joint research effortless.
              </p>
              <div className="mt-7 space-y-3">
                {collaborationCapabilities.map((capability) => (
                  <div
                    key={capability}
                    className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <span>{capability}</span>
                  </div>
                ))}
              </div>
            </div>

            <Card className="micro-lift border border-border/60 bg-card/85 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Workspace Permissions Snapshot
                </CardTitle>
                <CardDescription>
                  Manage access across shared projects and notes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-md border border-border/60 bg-background/70 p-3">
                  <p className="font-medium">Owner</p>
                  <p className="text-muted-foreground">
                    Full control over billing, members, data, and workspace
                    policies.
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/70 p-3">
                  <p className="font-medium">Admin + Editor</p>
                  <p className="text-muted-foreground">
                    Invite members, organize folders, edit notes, and publish
                    shared briefs.
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/70 p-3">
                  <p className="font-medium">Viewer</p>
                  <p className="text-muted-foreground">
                    Read, search, and reference approved material without edit
                    permissions.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-b border-border/60 bg-background/85">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="mb-10 max-w-2xl">
              <Badge
                variant="outline"
                className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
              >
                {selfHosted ? "Open Source & Local-First" : "Pricing Philosophy"}
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {selfHosted
                  ? "Run locally with Docker. Keep your data yours."
                  : "Start free. Grow with Plus. Power up with Pro."}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {selfHosted
                  ? "All features are unlocked out of the box with no subscriptions, no storage walls, and optional bring-your-own AI keys."
                  : "Begin free with core workflows, then scale when you need more storage and stronger AI capabilities."}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {(selfHosted ? selfHostedHighlights : planHighlights).map((item) => (
                <Card
                  key={item.title}
                  className="micro-lift border border-border/60 bg-card/75"
                >
                  <CardHeader className="gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-base font-semibold">
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <Badge
                variant="outline"
                className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
              >
                FAQ
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Answers for modern research teams.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Designed for teams that want reliable AI help without
                sacrificing clarity, quality, or source trust.
              </p>
            </div>

            <div className="space-y-3">
              {faqs.map((item) => (
                <Collapsible
                  key={item.question}
                  className="micro-lift rounded-lg border border-border/70 bg-card/70 px-4 py-3"
                >
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 text-left text-sm font-medium">
                    {item.question}
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 pt-14 pb-20">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-6 md:flex-row md:items-center">
            <div>
              <p className="text-xl font-semibold tracking-tight">
                Start free with your new research companion.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upgrade only when you need more storage, deeper AI, and higher
                limits.
              </p>
            </div>
            <Button size="lg" asChild className="px-7">
              <Link href="/signup">
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border/60 bg-muted/20 py-10">
          <div className="mx-auto w-full max-w-6xl px-6">
            <p className="text-sm text-muted-foreground">
              Interested in early access? Email{" "}
              <a
                href="mailto:hello@refly.ai"
                className="font-medium text-primary hover:underline"
              >
                hello@refly.ai
              </a>{" "}
              for a free preview.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-muted/25">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <ReflyLogo className="h-4 w-4" />
            <span>Refly Research</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/changelog"
              className="hover:text-foreground hover:underline"
            >
              Changelog
            </Link>
            <Link
              href="/legal"
              className="hover:text-foreground hover:underline"
            >
              Legal
            </Link>
            <Link
              href="/privacy"
              className="hover:text-foreground hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground hover:underline"
            >
              Terms
            </Link>
            <Link
              href="/cookies"
              className="hover:text-foreground hover:underline"
            >
              Cookies
            </Link>
            <p>&copy; {new Date().getFullYear()} Refly. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
