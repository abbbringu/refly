"use client"

import { useState } from "react"
import {
  BookOpen,
  Clock,
  FileText,
  Folder,
  FolderTree,
  Library,
  Link2,
  Quote,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ReflyLogo } from "@/components/layout/refly-logo"

const showcaseItems = [
  {
    icon: Search,
    title: "Ask your library",
    description:
      "Search papers, notes, and highlights in one AI layer and get answers with source context.",
  },
  {
    icon: FileText,
    title: "Write with context",
    description:
      "Draft briefs while pulling verified references directly into your notes and outlines.",
  },
  {
    icon: Quote,
    title: "Cite as you go",
    description:
      "Generate clean citations and keep every paragraph connected to supporting evidence.",
  },
  {
    icon: FolderTree,
    title: "Organize simply",
    description:
      "Keep projects clear with folders, collections, and shared pages built for research teams.",
  },
]

function SidebarNav() {
  return (
    <aside className="w-44 shrink-0 border-r border-border/60 bg-muted/30 p-2.5">
      <div className="mb-2.5 flex items-center gap-1.5 px-1 py-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md border border-primary/10 bg-primary/15 text-primary">
          <ReflyLogo className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-semibold tracking-tight">Refly</span>
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground">
          <Library className="h-3 w-3" />
          Library
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-primary/12 px-1.5 py-1 text-[10px] font-medium text-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          AI Chat
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Recent
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground">
          <Star className="h-3 w-3" />
          Favorites
        </div>
      </div>
      <div className="my-2 h-px bg-border/60" />
      <p className="px-1.5 pb-0.5 text-[9px] font-medium tracking-wide text-muted-foreground/80 uppercase">
        Folders
      </p>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground">
          <Folder className="h-3 w-3" />
          LLM Research
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground">
          <Folder className="h-3 w-3" />
          Product Strategy
        </div>
      </div>
    </aside>
  )
}

function SearchMockup() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold tracking-tight">AI Search</p>
          <p className="text-[9px] text-muted-foreground">Cross-paper query with ranked evidence</p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
          <Sparkles className="h-2.5 w-2.5" />
          AI
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-hidden p-3">
        <div className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
          <Search className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-medium">How do transformers handle long-range dependencies?</span>
        </div>
        <div className="rounded-md border border-border/60 bg-background/80 p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <div className="h-4 w-4 rounded bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
            </div>
            <span className="text-[10px] font-semibold">AI Answer</span>
            <span className="ml-auto rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-medium text-emerald-600 dark:text-emerald-400">18 sources</span>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Transformers use <span className="font-medium text-foreground">self-attention mechanisms</span> to model relationships between all positions simultaneously, enabling direct long-range connections...
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase">Ranked sources</p>
          {[
            { title: "Attention Is All You Need", author: "Vaswani et al.", relevance: "0.94" },
            { title: "Longformer: The Long-Document Transformer", author: "Beltagy et al.", relevance: "0.89" },
            { title: "Reformer: Efficient Language Modeling", author: "Kitaev et al.", relevance: "0.82" },
          ].map((source) => (
            <div key={source.title} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/80 px-2 py-1.5">
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10">
                <FileText className="h-2.5 w-2.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium">{source.title}</p>
                <p className="text-[9px] text-muted-foreground">{source.author}</p>
              </div>
              <div className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-medium text-emerald-600 dark:text-emerald-400">
                {source.relevance}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WriteMockup() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold tracking-tight">Research Note</p>
          <p className="text-[9px] text-muted-foreground">Model monitoring brief with grounded claims</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">Draft</span>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">7 linked</span>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 space-y-2 overflow-hidden p-3">
          <div className="rounded-md border border-border/60 bg-background/80 p-2">
            <p className="text-[11px] font-semibold leading-snug">
              Model Monitoring in Production
            </p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Monitoring deployed models requires tracking <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[9px] font-medium text-primary">drift</span> across input distributions and output distributions over time.
            </p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Recent work <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[9px] font-medium text-primary">[2]</span> shows that combining statistical tests with learned thresholds yields robust detection early...
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">Auto-suggested</div>
            <p className="text-[9px] text-muted-foreground">3 related notes found</p>
          </div>
        </div>
        <div className="w-32 shrink-0 border-l border-border/60 bg-muted/30 p-2 space-y-1.5">
          <p className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase">References</p>
          {[
            { num: "[1]", title: "ML in Production" },
            { num: "[2]", title: "Drift Detection" },
            { num: "[3]", title: "AutoML Survey" },
          ].map((ref) => (
            <div key={ref.num} className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px]">
              <span className="font-medium text-primary">{ref.num}</span>
              <span className="truncate text-muted-foreground">{ref.title}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-1 rounded border border-dashed border-border/70 px-1 py-0.5 text-[9px] text-muted-foreground">
            <Link2 className="h-2.5 w-2.5" />
            Add reference
          </div>
        </div>
      </div>
    </div>
  )
}

function CiteMockup() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold tracking-tight">Citation Assistant</p>
          <p className="text-[9px] text-muted-foreground">Auto-citations from selected evidence</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">APA 7th</span>
          <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">100% coverage</span>
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-hidden p-3">
        <div className="rounded-md border border-border/60 bg-background/80 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold">Monitoring Brief</span>
            <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              All claims cited
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {"Statistical process control methods "}
            <span className="rounded bg-primary/10 px-0.5 text-[10px] font-medium text-primary">[1]</span>
            {" can be adapted for model monitoring, enabling early detection of distribution shift "}
            <span className="rounded bg-primary/10 px-0.5 text-[10px] font-medium text-primary">[2]</span>
            {" in deployed systems."}
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase">Citations</p>
          {[
            { num: "[1]", text: "Vaswani, A., et al. (2017). Attention is all you need. NeurIPS.", style: "APA" },
            { num: "[2]", text: "Beltagy, M., et al. (2020). Longformer: The long-document transformer. arXiv.", style: "APA" },
          ].map((cite) => (
            <div key={cite.num} className="rounded-md border border-border/60 bg-card/80 p-2">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="font-semibold text-primary text-[10px]">{cite.num}</span>
                <span className="rounded bg-primary/10 px-1 py-px text-[8px] font-medium text-primary">{cite.style}</span>
              </div>
              <p className="text-[9px] leading-relaxed text-muted-foreground">{cite.text}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {["APA", "MLA", "Chicago", "BibTeX"].map((s) => (
            <div
              key={s}
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[9px]",
                s === "APA"
                  ? "border-primary/25 bg-primary/10 font-medium text-primary"
                  : "border-border/60 bg-background text-muted-foreground"
              )}
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrganizeMockup() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold tracking-tight">Project Structure</p>
          <p className="text-[9px] text-muted-foreground">Simple hierarchy, deep research context</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" />
            3 spaces
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <Folder className="h-2.5 w-2.5" />
            4 collections
          </div>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-32 shrink-0 border-r border-border/60 bg-muted/30 p-2 space-y-0.5">
          <p className="px-1 pb-0.5 text-[8px] font-medium tracking-wide text-muted-foreground uppercase">Collections</p>
          <div className="flex items-center gap-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
            <Folder className="h-2.5 w-2.5" />
            LLM Research
          </div>
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground">
            <Folder className="h-2.5 w-2.5" />
            Product
          </div>
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground">
            <Folder className="h-2.5 w-2.5" />
            Sprint Notes
          </div>
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground">
            <Folder className="h-2.5 w-2.5" />
            Strategy
          </div>
          <div className="my-1.5 h-px bg-border/60" />
          <p className="px-1 pb-0.5 text-[8px] font-medium tracking-wide text-muted-foreground uppercase">Team spaces</p>
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" />
            ML Lab
          </div>
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" />
            Research Ops
          </div>
          <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" />
            Product Team
          </div>
        </div>
        <div className="flex-1 space-y-1.5 overflow-hidden p-3">
          <p className="text-[11px] font-semibold">LLM Research</p>
          <p className="text-[9px] text-muted-foreground">6 papers &middot; 3 notes &middot; 2 members</p>
          <div className="mt-1.5 space-y-1">
            {[
              { icon: FileText, title: "Attention Is All You Need", tag: "Paper" },
              { icon: FileText, title: "RAG for Knowledge Systems", tag: "Paper" },
              { icon: BookOpen, title: "Transformer Architecture Notes", tag: "Note" },
              { icon: FileText, title: "Chain-of-Thought Prompting", tag: "Paper" },
              { icon: BookOpen, title: "Model Monitoring Brief", tag: "Note" },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/80 px-2 py-1">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10">
                  <item.icon className="h-2.5 w-2.5 text-primary" />
                </div>
                <p className="flex-1 truncate text-[10px] font-medium">{item.title}</p>
                <span className={cn(
                  "rounded px-1 py-px text-[8px] font-medium",
                  item.tag === "Paper"
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}>
                  {item.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const mockups = [SearchMockup, WriteMockup, CiteMockup, OrganizeMockup]

export function WorkspaceShowcaseSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const ActiveMockup = mockups[activeIndex]

  return (
    <section className="border-y border-border/60 bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <Badge
            variant="outline"
            className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
          >
            Product Walkthrough
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A beautiful workspace on the left. Powerful features on the right.
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="min-h-[420px]">
            <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-background/90 shadow-xl">
              <div className="flex h-8 items-center gap-2 border-b border-border/60 bg-muted/40 px-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                <div className="ml-3 h-3 w-36 rounded bg-muted-foreground/10" />
              </div>
              <div className="flex flex-1 overflow-hidden">
                <SidebarNav />
                <ActiveMockup />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {showcaseItems.map((item, index) => (
              <button
                type="button"
                key={item.title}
                onClick={() => setActiveIndex(index)}
                className="w-full text-left"
              >
                <Card
                  className={cn(
                    "border border-border/60 bg-card/75 transition-all duration-200",
                    activeIndex === index &&
                      "border-primary/35 bg-background shadow-[0_8px_28px_-20px_oklch(0.52_0.105_223.128)]"
                  )}
                >
                  <CardHeader className="gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}