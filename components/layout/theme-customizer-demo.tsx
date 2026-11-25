"use client"

import React, { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Check,
  ChevronRight,
  FileText,
  FolderTree,
  MessageSquare,
  Moon,
  Search,
  Sparkles,
  Star,
  Sun,
  Type,
  Users,
} from "lucide-react"
import { ACCENT_THEMES, type AccentTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const THEME_LABELS: Record<AccentTheme, string> = {
  blue: "Blue",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
  cyan: "Cyan",
  violet: "Violet",
  lime: "Lime",
  coral: "Coral",
}

const THEME_COLORS: Record<AccentTheme, string> = {
  blue: "oklch(0.52 0.105 223.128)",
  emerald: "oklch(0.56 0.14 157)",
  amber: "oklch(0.68 0.16 75)",
  rose: "oklch(0.62 0.2 20)",
  cyan: "oklch(0.66 0.14 210)",
  violet: "oklch(0.58 0.17 290)",
  lime: "oklch(0.76 0.19 130)",
  coral: "oklch(0.66 0.2 38)",
}

const lightBase: Record<string, string> = {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.148 0.004 228.8)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.148 0.004 228.8)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.148 0.004 228.8)",
  "--secondary": "oklch(0.967 0.001 286.375)",
  "--secondary-foreground": "oklch(0.21 0.006 285.885)",
  "--muted": "oklch(0.963 0.002 197.1)",
  "--muted-foreground": "oklch(0.56 0.021 213.5)",
  "--accent": "oklch(0.963 0.002 197.1)",
  "--accent-foreground": "oklch(0.218 0.008 223.9)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--border": "oklch(0.925 0.005 214.3)",
  "--input": "oklch(0.925 0.005 214.3)",
  "--sidebar": "oklch(0.987 0.002 197.1)",
  "--sidebar-foreground": "oklch(0.148 0.004 228.8)",
  "--sidebar-accent": "oklch(0.963 0.002 197.1)",
  "--sidebar-accent-foreground": "oklch(0.218 0.008 223.9)",
  "--sidebar-border": "oklch(0.925 0.005 214.3)",
  "--sidebar-ring": "oklch(0.723 0.014 214.4)",
}

const darkBase: Record<string, string> = {
  "--background": "oklch(0.148 0.004 228.8)",
  "--foreground": "oklch(0.987 0.002 197.1)",
  "--card": "oklch(0.218 0.008 223.9)",
  "--card-foreground": "oklch(0.987 0.002 197.1)",
  "--popover": "oklch(0.218 0.008 223.9)",
  "--popover-foreground": "oklch(0.987 0.002 197.1)",
  "--secondary": "oklch(0.274 0.006 286.033)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.275 0.011 216.9)",
  "--muted-foreground": "oklch(0.723 0.014 214.4)",
  "--accent": "oklch(0.275 0.011 216.9)",
  "--accent-foreground": "oklch(0.987 0.002 197.1)",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
  "--sidebar": "oklch(0.218 0.008 223.9)",
  "--sidebar-foreground": "oklch(0.987 0.002 197.1)",
  "--sidebar-accent": "oklch(0.275 0.011 216.9)",
  "--sidebar-accent-foreground": "oklch(0.987 0.002 197.1)",
  "--sidebar-border": "oklch(1 0 0 / 10%)",
  "--sidebar-ring": "oklch(0.56 0.021 213.5)",
}

const accentVars: Record<AccentTheme, Record<string, string>> = {
  blue: {
    "--primary": "oklch(0.52 0.105 223.128)",
    "--primary-foreground": "oklch(0.984 0.019 200.873)",
    "--sidebar-primary": "oklch(0.609 0.126 221.723)",
    "--sidebar-primary-foreground": "oklch(0.984 0.019 200.873)",
    "--ring": "oklch(0.723 0.014 214.4)",
    "--backdrop-glow-1": "oklch(0.52 0.105 223.128 / 0.08)",
    "--backdrop-glow-2": "oklch(0.52 0.105 223.128 / 0.06)",
    "--backdrop-glow-dark-1": "oklch(0.45 0.085 224.283 / 0.12)",
    "--backdrop-glow-dark-2": "oklch(0.45 0.085 224.283 / 0.08)",
  },
  emerald: {
    "--primary": "oklch(0.56 0.14 157)",
    "--primary-foreground": "oklch(0.98 0.01 160)",
    "--sidebar-primary": "oklch(0.56 0.14 157)",
    "--sidebar-primary-foreground": "oklch(0.98 0.01 160)",
    "--ring": "oklch(0.68 0.1 157)",
    "--backdrop-glow-1": "oklch(0.56 0.14 157 / 0.08)",
    "--backdrop-glow-2": "oklch(0.56 0.14 157 / 0.06)",
    "--backdrop-glow-dark-1": "oklch(0.52 0.13 157 / 0.13)",
    "--backdrop-glow-dark-2": "oklch(0.52 0.13 157 / 0.09)",
  },
  amber: {
    "--primary": "oklch(0.68 0.16 75)",
    "--primary-foreground": "oklch(0.29 0.04 65)",
    "--sidebar-primary": "oklch(0.68 0.16 75)",
    "--sidebar-primary-foreground": "oklch(0.29 0.04 65)",
    "--ring": "oklch(0.72 0.12 75)",
    "--backdrop-glow-1": "oklch(0.68 0.16 75 / 0.09)",
    "--backdrop-glow-2": "oklch(0.68 0.16 75 / 0.07)",
    "--backdrop-glow-dark-1": "oklch(0.6 0.12 75 / 0.15)",
    "--backdrop-glow-dark-2": "oklch(0.6 0.12 75 / 0.1)",
  },
  rose: {
    "--primary": "oklch(0.62 0.2 20)",
    "--primary-foreground": "oklch(0.98 0.01 10)",
    "--sidebar-primary": "oklch(0.62 0.2 20)",
    "--sidebar-primary-foreground": "oklch(0.98 0.01 10)",
    "--ring": "oklch(0.7 0.12 20)",
    "--backdrop-glow-1": "oklch(0.62 0.2 20 / 0.08)",
    "--backdrop-glow-2": "oklch(0.62 0.2 20 / 0.06)",
    "--backdrop-glow-dark-1": "oklch(0.58 0.18 20 / 0.14)",
    "--backdrop-glow-dark-2": "oklch(0.58 0.18 20 / 0.1)",
  },
  cyan: {
    "--primary": "oklch(0.66 0.14 210)",
    "--primary-foreground": "oklch(0.19 0.03 220)",
    "--sidebar-primary": "oklch(0.66 0.14 210)",
    "--sidebar-primary-foreground": "oklch(0.19 0.03 220)",
    "--ring": "oklch(0.72 0.1 210)",
    "--backdrop-glow-1": "oklch(0.66 0.14 210 / 0.09)",
    "--backdrop-glow-2": "oklch(0.66 0.14 210 / 0.07)",
    "--backdrop-glow-dark-1": "oklch(0.6 0.13 210 / 0.15)",
    "--backdrop-glow-dark-2": "oklch(0.6 0.13 210 / 0.1)",
  },
  violet: {
    "--primary": "oklch(0.58 0.17 290)",
    "--primary-foreground": "oklch(0.98 0.01 300)",
    "--sidebar-primary": "oklch(0.58 0.17 290)",
    "--sidebar-primary-foreground": "oklch(0.98 0.01 300)",
    "--ring": "oklch(0.67 0.12 290)",
    "--backdrop-glow-1": "oklch(0.58 0.17 290 / 0.09)",
    "--backdrop-glow-2": "oklch(0.58 0.17 290 / 0.07)",
    "--backdrop-glow-dark-1": "oklch(0.53 0.16 290 / 0.14)",
    "--backdrop-glow-dark-2": "oklch(0.53 0.16 290 / 0.1)",
  },
  lime: {
    "--primary": "oklch(0.76 0.19 130)",
    "--primary-foreground": "oklch(0.26 0.03 135)",
    "--sidebar-primary": "oklch(0.76 0.19 130)",
    "--sidebar-primary-foreground": "oklch(0.26 0.03 135)",
    "--ring": "oklch(0.8 0.12 130)",
    "--backdrop-glow-1": "oklch(0.76 0.19 130 / 0.09)",
    "--backdrop-glow-2": "oklch(0.76 0.19 130 / 0.07)",
    "--backdrop-glow-dark-1": "oklch(0.66 0.16 130 / 0.16)",
    "--backdrop-glow-dark-2": "oklch(0.66 0.16 130 / 0.11)",
  },
  coral: {
    "--primary": "oklch(0.66 0.2 38)",
    "--primary-foreground": "oklch(0.98 0.01 35)",
    "--sidebar-primary": "oklch(0.66 0.2 38)",
    "--sidebar-primary-foreground": "oklch(0.98 0.01 35)",
    "--ring": "oklch(0.73 0.12 38)",
    "--backdrop-glow-1": "oklch(0.66 0.2 38 / 0.09)",
    "--backdrop-glow-2": "oklch(0.66 0.2 38 / 0.07)",
    "--backdrop-glow-dark-1": "oklch(0.6 0.18 38 / 0.15)",
    "--backdrop-glow-dark-2": "oklch(0.6 0.18 38 / 0.11)",
  },
}

const typeColors: Record<string, string> = {
  article:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  book: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  conference:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  thesis:
    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  report: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  preprint:
    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  webpage:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
}

function MiniSidebarItem({
  icon: Icon,
  label,
  active,
  hasSubmenu,
}: {
  icon: React.ElementType
  label: string
  active?: boolean
  hasSubmenu?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {hasSubmenu && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
    </div>
  )
}

function MiniChatBubble({ from, text }: { from: "ai" | "user"; text: string }) {
  return (
    <div className={cn("flex gap-2", from === "user" && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          from === "ai" ? "bg-primary/10" : "bg-muted"
        )}
      >
        {from === "ai" ? (
          <Sparkles className="h-3 w-3 text-primary" />
        ) : (
          <Users className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed",
          from === "ai"
            ? "bg-muted text-foreground"
            : "bg-primary text-primary-foreground"
        )}
      >
        {text}
      </div>
    </div>
  )
}

interface PreviewPaper {
  title: string
  authors: string
  year: string
  type: string
  hasPdf: boolean
  isFavorite: boolean
}

const previewPapers: PreviewPaper[] = [
  {
    title: "Attention Is All You Need",
    authors: "Vaswani et al.",
    year: "2017",
    type: "article",
    hasPdf: true,
    isFavorite: true,
  },
  {
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    authors: "Devlin et al.",
    year: "2018",
    type: "article",
    hasPdf: true,
    isFavorite: false,
  },
  {
    title: "A Brief History of Time",
    authors: "Stephen Hawking",
    year: "1988",
    type: "book",
    hasPdf: false,
    isFavorite: false,
  },
  {
    title: "AlphaFold 2: Improved Protein Structure Prediction",
    authors: "Jumper et al.",
    year: "2020",
    type: "article",
    hasPdf: true,
    isFavorite: true,
  },
]

function MiniPaperTable() {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[28px_1fr_80px_70px_60px] items-center gap-2 border-b border-border/60 bg-muted/30 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        <div className="text-center">
          <div className="mx-auto h-3 w-3 rounded-sm border border-border/60" />
        </div>
        <div>Title</div>
        <div>Authors</div>
        <div>Year</div>
        <div>Type</div>
      </div>
      {/* Table rows */}
      <div className="divide-y divide-border/40">
        {previewPapers.map((paper, i) => (
          <div
            key={i}
            className={cn(
              "group grid grid-cols-[28px_1fr_80px_70px_60px] items-center gap-2 px-2 py-2 transition-colors cursor-pointer",
              i === 0 ? "bg-primary/5" : "hover:bg-muted/30"
            )}
          >
            <div className="text-center">
              <div className="mx-auto flex h-3 w-3 items-center justify-center rounded-sm border border-primary bg-primary">
                {i === 0 && <Check className="h-2 w-2 text-primary-foreground" />}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {paper.isFavorite && (
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                )}
                <span className="truncate text-[11px] font-medium">
                  {paper.title}
                </span>
              </div>
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {paper.authors}
            </div>
            <div className="text-[10px] text-muted-foreground">{paper.year}</div>
            <div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1 py-0 font-normal capitalize",
                  typeColors[paper.type] ?? typeColors.other
                )}
              >
                {paper.type}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ThemeCustomizerDemo() {
  const [previewAccent, setPreviewAccent] = useState<AccentTheme>("blue")
  const [previewDark, setPreviewDark] = useState(false)

  const previewStyle = React.useMemo<React.CSSProperties>(() => {
    const base = previewDark ? { ...darkBase } : { ...lightBase }
    const accent = accentVars[previewAccent]
    return { ...base, ...accent }
  }, [previewAccent, previewDark])

  return (
    <section className="border-y border-border/60 bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <Badge
            variant="secondary"
            className="mb-4 rounded-full px-3 py-1 text-[11px] uppercase"
          >
            UI Customization
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Make it yours. Live theme preview.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Choose from 8 curated accent themes and toggle light or dark mode.
            See your workspace transform in real time.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          {/* Controls */}
          <div className="space-y-8">
            {/* Accent theme picker */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Accent Color</span>
                <span className="text-xs text-muted-foreground">— {THEME_LABELS[previewAccent]}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {ACCENT_THEMES.map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setPreviewAccent(theme)}
                    className={cn(
                      "group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200",
                      "ring-2 ring-offset-2 ring-offset-background",
                      previewAccent === theme
                        ? "ring-primary scale-110"
                        : "ring-transparent hover:scale-105 hover:ring-border"
                    )}
                    style={{
                      backgroundColor: THEME_COLORS[theme],
                    }}
                    aria-label={`Select ${THEME_LABELS[theme]} theme`}
                  >
                    {previewAccent === theme && (
                      <Check className="h-4 w-4 text-white drop-shadow-sm" />
                    )}
                    <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 rounded bg-popover px-2 py-0.5 text-[10px] font-medium text-popover-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100">
                      {THEME_LABELS[theme]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode toggle */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {previewDark ? (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">Appearance</span>
                <span className="text-xs text-muted-foreground">— {previewDark ? "Dark" : "Light"}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={!previewDark ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewDark(false)}
                  className="gap-2"
                >
                  <Sun className="h-3.5 w-3.5" />
                  Light
                </Button>
                <Button
                  variant={previewDark ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewDark(true)}
                  className="gap-2"
                >
                  <Moon className="h-3.5 w-3.5" />
                  Dark
                </Button>
              </div>
            </div>

            {/* Mini feature list */}
            <div className="space-y-3 pt-2">
              {[
                "8 curated accent colors",
                "Seamless light & dark modes",
                "Persisted across sessions",
                "Accessible contrast ratios",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Live Preview — Mini Refly Workspace */}
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border border-border/60 shadow-lg transition-colors duration-300 text-foreground"
            )}
            style={previewStyle}
          >
            {/* Top accent line */}
            <div className="absolute inset-x-0 top-0 h-1 bg-primary/40" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <span className="text-xs font-semibold">Refly Workspace</span>
              </div>
              <Badge variant="outline" className="text-[9px]">
                {THEME_LABELS[previewAccent]} · {previewDark ? "Dark" : "Light"}
              </Badge>
            </div>

            {/* Workspace body */}
            <div className="flex" style={{ minHeight: 360 }}>
              {/* Mini sidebar */}
              <div
                className="hidden w-40 shrink-0 border-r border-border/60 p-2 sm:block"
                style={{ background: "var(--sidebar)" }}
              >
                <div className="space-y-0.5">
                  <MiniSidebarItem icon={Search} label="Search" />
                  <MiniSidebarItem icon={FolderTree} label="Library" active />
                  <MiniSidebarItem icon={FileText} label="Papers" hasSubmenu />
                  <MiniSidebarItem icon={MessageSquare} label="Chat" />
                  <MiniSidebarItem icon={Users} label="Teams" hasSubmenu />
                </div>
                <div className="mt-3 border-t border-border/40 pt-2">
                  <p className="px-2 pb-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    Folders
                  </p>
                  <div className="space-y-0.5">
                    <MiniSidebarItem icon={FolderTree} label="Deep Learning" />
                    <MiniSidebarItem icon={FolderTree} label="Neuroscience" />
                    <MiniSidebarItem icon={FolderTree} label="Reviews" />
                  </div>
                </div>
              </div>

              {/* Main area */}
              <div className="flex-1 space-y-3 p-3" style={{ background: "var(--background)" }}>
                {/* Toolbar */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5">
                    <Search className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Find papers, notes, tags…</span>
                  </div>
                  <Button size="sm" className="h-7 text-[10px] gap-1">
                    <Sparkles className="h-3 w-3" />
                    Ask AI
                  </Button>
                </div>

                {/* Papers table */}
                <MiniPaperTable />

                {/* AI Chat snippet */}
                <div className="rounded-lg border border-border/60 bg-card/70 p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-border/40">
                    <MessageSquare className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-semibold">AI Research Companion</span>
                  </div>
                  <MiniChatBubble
                    from="user"
                    text="Summarize the key findings from the BERT paper."
                  />
                  <MiniChatBubble
                    from="ai"
                    text="BERT introduces bidirectional training for language representations, achieving state-of-the-art results on 11 NLP tasks."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
