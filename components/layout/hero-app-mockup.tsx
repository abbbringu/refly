import {
  Check,
  Clock,
  Download,
  Folder,
  LayoutGrid,
  LayoutList,
  Library,
  Plus,
  Search,
  Sparkles,
  Star,
  Upload,
  Wand2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ReflyLogo } from "@/components/layout/refly-logo"

const paperRows = [
  {
    title: "Attention Is All You Need",
    authors: "Vaswani et al.",
    year: "2017",
    type: "article",
    hasPdf: true,
    isFavorite: true,
  },
  {
    title: "Chain-of-Thought Prompting Elicits Reasoning in LLMs",
    authors: "Wei et al.",
    year: "2022",
    type: "article",
    hasPdf: true,
    isFavorite: false,
  },
  {
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP",
    authors: "Lewis et al.",
    year: "2020",
    type: "article",
    hasPdf: true,
    isFavorite: false,
  },
  {
    title: "Scaling Laws for Neural Language Models",
    authors: "Kaplan et al.",
    year: "2020",
    type: "preprint",
    hasPdf: true,
    isFavorite: true,
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

const typeColors: Record<string, string> = {
  article: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  book: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  conference: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  thesis: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  report: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  preprint: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  webpage: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
}

export function HeroAppMockup() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-border/60 bg-muted/40 px-4">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="ml-4 h-4 w-48 rounded bg-muted-foreground/10" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 border-r border-border/60 bg-muted/30 p-3">
          <div className="mb-3 flex items-center gap-2 px-1 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/10 bg-primary/15 text-primary">
              <ReflyLogo className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Refly</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              Add Paper
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Upload className="h-3.5 w-3.5" />
              Import
            </div>
          </div>

          <div className="my-3 h-px bg-border/60" />

          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-md bg-primary/12 px-2 py-1.5 text-xs font-medium text-foreground">
              <Library className="h-3.5 w-3.5 text-primary" />
              All Papers
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              AI Chat
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Recently Added
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5" />
              Favorites
            </div>
          </div>

          <div className="my-3 h-px bg-border/60" />

          <p className="px-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
            Folders
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Folder className="h-3.5 w-3.5" />
              LLM Reading List
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Folder className="h-3.5 w-3.5" />
              Product Research
            </div>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <Folder className="h-3.5 w-3.5" />
              Team Sprint Notes
            </div>
          </div>
        </aside>

        <div className="flex-1 overflow-hidden bg-background/80">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold tracking-tight">Library</p>
              <p className="text-[11px] text-muted-foreground">248 papers in your workspace</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                <Wand2 className="h-3 w-3" />
                AI Auto-Sort
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] text-muted-foreground">
                <Download className="h-3 w-3" />
                Export
              </div>
              <div className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">
                <Plus className="h-3 w-3" />
                Add Paper
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 bg-background px-2 text-[11px] text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                Filter papers...
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1.5 text-[10px] font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                AI Chat
              </div>
              <div className="flex items-center overflow-hidden rounded-md border border-border/60 bg-background text-muted-foreground">
                <div className="bg-muted px-1.5 py-1.5">
                  <LayoutList className="h-3.5 w-3.5" />
                </div>
                <div className="px-1.5 py-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>

            {/* Paper list table */}
            <div className="rounded-lg border border-border/60 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[28px_1fr_80px_50px_70px] items-center gap-2 border-b border-border/60 bg-muted/30 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
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
                {paperRows.map((paper, i) => (
                  <div
                    key={paper.title}
                    className={cn(
                      "grid grid-cols-[28px_1fr_80px_50px_70px] items-center gap-2 px-2 py-2 transition-colors",
                      i === 0 ? "bg-primary/5" : "hover:bg-muted/30"
                    )}
                  >
                    <div className="text-center">
                      <div
                        className={cn(
                          "mx-auto flex h-3 w-3 items-center justify-center rounded-sm border",
                          i === 0
                            ? "border-primary bg-primary"
                            : "border-border/60"
                        )}
                      >
                        {i === 0 && (
                          <Check className="h-2 w-2 text-primary-foreground" />
                        )}
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
                    <div className="text-[10px] text-muted-foreground">
                      {paper.year}
                    </div>
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
          </div>
        </div>
      </div>
    </div>
  )
}
