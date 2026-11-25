"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ArrowUpRight,
  Lock,
} from "lucide-react"
import { toast } from "sonner"

type SupportLabel =
  | "Strong support"
  | "Partial support"
  | "Background"
  | "Weak/uncertain"

interface CitationFinderResult {
  paperId: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  abstract: string | null
  score: number
  citation: string
  supportLabel: SupportLabel
  contextExplanation: string
  evidenceQuotes: Array<{
    text: string
    pageNumber: number | null
    sectionTitle: string | null
    score: number
  }>
}

interface CitationFinderProps {
  excludePaperId?: string
}

export function CitationFinder({ excludePaperId }: CitationFinderProps) {
  const router = useRouter()
  const [statement, setStatement] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CitationFinderResult[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async () => {
    if (!statement.trim()) {
      toast.info("Please enter a statement or claim")
      return
    }

    setLoading(true)
    setHasSearched(true)
    setResults([])
    try {
      const res = await fetch("/api/citations/find-citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement: statement.trim(), excludePaperId }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 403) {
          toast.error("Upgrade required", {
            description: "This feature requires a Plus or Pro plan",
          })
          return
        }
        toast.error(data?.error || "Failed to find citations")
        return
      }

      const found = data.data?.citations || []
      setResults(found)
      if (found.length === 0) {
        toast.info("No matching papers found in your library")
      }
    } catch {
      toast.error("Network error while searching for citations")
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (index: number, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    toast.success("Citation copied")
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleOpenPaper = (id: string) => {
    router.push(`/paper/${id}`)
  }

  const supportBadgeClass = (label: SupportLabel) => {
    if (label === "Strong support")
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    if (label === "Partial support")
      return "border-blue-200 bg-blue-50 text-blue-700"
    if (label === "Background")
      return "border-amber-200 bg-amber-50 text-amber-700"
    return "border-muted bg-muted text-muted-foreground"
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Find Supporting Citations
          </CardTitle>
          <CardDescription>
            Write a statement or claim, and we&apos;ll find papers in your
            library that can support it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="e.g., Climate change has accelerated biodiversity loss in tropical regions over the past two decades"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={3}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSearch()
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Press{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ⌘
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{" "}
              to search
            </p>
            <Button
              onClick={handleSearch}
              disabled={loading || !statement.trim()}
              size="sm"
              className="border border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-800"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Find Citations
                </>
              )}
            </Button>
          </div>
          <details className="text-[11px] text-muted-foreground/70">
            <summary className="inline cursor-pointer list-none underline-offset-2 hover:text-muted-foreground hover:underline">
              AI data use
            </summary>
            <p className="mt-1 leading-relaxed">
              Citation search embeds your statement with OpenAI and sends
              candidate paper metadata, abstracts, and PDF evidence excerpts
              through OpenRouter for support analysis. See the{" "}
              <a href="/privacy" className="underline-offset-2 hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </details>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Searching indexed paper text and analyzing evidence...
          </CardContent>
        </Card>
      )}

      {!loading && hasSearched && results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Found {results.length} candidate citation
              {results.length === 1 ? "" : "s"}
            </span>
          </div>
          {results.map((result, index) => (
            <Card key={result.paperId} className="group">
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => handleOpenPaper(result.paperId)}
                      className="text-left text-sm font-semibold transition-colors hover:text-primary"
                    >
                      {result.title}
                    </button>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {(result.authors || []).join(", ")}
                      {result.year ? ` (${result.year})` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${supportBadgeClass(result.supportLabel)}`}
                    >
                      {result.supportLabel}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(result.score * 100)}% match
                    </Badge>
                    <button
                      onClick={() => handleOpenPaper(result.paperId)}
                      className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                      title="Open paper"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {result.contextExplanation && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {result.contextExplanation}
                  </div>
                )}

                {result.evidenceQuotes?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Supporting Evidence
                    </p>
                    {result.evidenceQuotes
                      .slice(0, 2)
                      .map((quote, quoteIndex) => (
                        <blockquote
                          key={`${result.paperId}-${quoteIndex}`}
                          className="border-l-2 border-primary/30 bg-muted/30 py-2 pr-2 pl-3 text-xs leading-relaxed text-muted-foreground"
                        >
                          <p>{quote.text}</p>
                          {(quote.pageNumber || quote.sectionTitle) && (
                            <footer className="mt-1 text-[11px] text-muted-foreground/80">
                              {quote.sectionTitle
                                ? `${quote.sectionTitle}`
                                : "Evidence"}
                              {quote.pageNumber
                                ? `, p. ${quote.pageNumber}`
                                : ""}
                            </footer>
                          )}
                        </blockquote>
                      ))}
                  </div>
                )}

                <div className="relative rounded-lg border border-border/60 bg-muted/30 p-3">
                  <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {result.citation}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => handleCopy(index, result.citation)}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                {result.doi && (
                  <a
                    href={`https://doi.org/${result.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View on DOI
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
            <p>No papers found that support this statement.</p>
            <p className="mt-1 text-xs">
              Try rephrasing or adding more context.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function CitationFinderLocked() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-muted/50 p-4">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-1 text-base font-semibold">AI Citation Finder</h3>
        <p className="mb-4 max-w-sm text-sm text-muted-foreground">
          Write a statement and instantly find supporting papers from your
          library with formatted citations.
        </p>
        <Button
          variant="default"
          size="sm"
          className="bg-primary text-primary-foreground"
          onClick={() => {
            window.location.href = "/settings"
          }}
        >
          Upgrade to Plus or Pro
        </Button>
      </CardContent>
    </Card>
  )
}
