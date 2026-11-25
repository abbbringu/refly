"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { PAPER_SEARCH_SELECT } from "@/lib/db/selects"
import type { Paper, SearchResult } from "@/types"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { FileText, Search, Sparkles, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

function mergeSearchResults(groups: Paper[][]) {
  const merged = new Map<string, Paper>()

  for (const group of groups) {
    for (const paper of group) {
      if (!merged.has(paper.id)) {
        merged.set(paper.id, paper)
      }
    }
  }

  return Array.from(merged.values()).slice(0, 10)
}

export function SearchCommandDialog() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Paper[]>([])
  const [loading, setLoading] = useState(false)
  
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResults, setAiResults] = useState<SearchResult[]>([])
  const searchRequestRef = useRef(0)

  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const searchPapers = useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim()

    if (!trimmedQuery) {
      searchRequestRef.current += 1
      setResults([])
      setLoading(false)
      return
    }

    if (trimmedQuery.length < 2) {
      searchRequestRef.current += 1
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const requestId = ++searchRequestRef.current
    const supabase = createClient()

    try {
      const likeQuery = `%${trimmedQuery.replace(/[\\%_]/g, "\\$&")}%`
      const normalizedQuery = trimmedQuery.toLowerCase()

      const [titleMatches, abstractMatches, doiMatches, authorCandidates] = await Promise.all([
        supabase
          .from("papers")
          .select(PAPER_SEARCH_SELECT)
          .ilike("title", likeQuery)
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("papers")
          .select(PAPER_SEARCH_SELECT)
          .ilike("abstract", likeQuery)
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("papers")
          .select(PAPER_SEARCH_SELECT)
          .ilike("doi", likeQuery)
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("papers")
          .select(PAPER_SEARCH_SELECT)
          .order("updated_at", { ascending: false })
          .limit(200),
      ])

      const error = titleMatches.error || abstractMatches.error || doiMatches.error || authorCandidates.error
      if (error) throw error

      const authorMatches = ((authorCandidates.data ?? []) as Paper[]).filter((paper) =>
        paper.authors?.some((author) => author.toLowerCase().includes(normalizedQuery)),
      )

      if (requestId === searchRequestRef.current) {
        setResults(
          mergeSearchResults([
            (titleMatches.data ?? []) as Paper[],
            authorMatches,
            (doiMatches.data ?? []) as Paper[],
            (abstractMatches.data ?? []) as Paper[],
          ]),
        )
      }
    } catch (error) {
      console.error("Paper search failed:", error)
      if (requestId === searchRequestRef.current) {
        setResults([])
        toast.error("Search failed", {
          description: error instanceof Error ? error.message : "Could not search your library",
        })
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchPapers(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, searchPapers])

  useEffect(() => {
    setAiResults([])
  }, [query])

  const performAiSearch = async () => {
    if (!query.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      const { data, error } = await res.json()

      if (!res.ok) {
        throw new Error(error || "Could not search with AI")
      }

      if (data) {
        setAiResults(data)
      }
    } catch (e) {
      console.error(e)
      toast.error("AI search failed", {
        description: e instanceof Error ? e.message : "Could not search with AI",
      })
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search papers by title, author, DOI…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Searching…
            </div>
          ) : query ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center text-muted-foreground">
              <p>No exact matches found.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={performAiSearch}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Ask AI to find similar papers
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <Search className="h-8 w-8 opacity-50" />
              <p>Start typing to search your library</p>
            </div>
          )}
        </CommandEmpty>
        
        {results.length > 0 && (
          <CommandGroup heading="Papers">
            {results.map((paper) => (
               <CommandItem
                key={paper.id}
                value={paper.id + paper.title}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/paper/${paper.id}`)
                }}
                className="flex items-start gap-3 py-3"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-1">
                  <p className="line-clamp-1 text-sm font-medium">
                    {paper.title}
                  </p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {paper.authors?.join(", ")}
                    {paper.year ? ` (${paper.year})` : ""}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {paper.paper_type}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {aiResults.length > 0 && <CommandSeparator />}
        {aiResults.length > 0 && (
          <CommandGroup heading="AI Matches">
            {aiResults.map((result) => (
              <CommandItem
                key={result.paper.id}
                value={result.paper.id + result.paper.title}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/paper/${result.paper.id}`)
                }}
                className="flex items-start gap-3 py-3"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1 space-y-1">
                  <p className="line-clamp-1 text-sm font-medium">
                    {result.paper.title}
                  </p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {result.score > 0 ? `${(result.score * 100).toFixed(0)}% match · ` : ""}
                    {result.paper.authors?.join(", ")}
                  </p>
                  {result.highlights && result.highlights.length > 0 && (
                    <p className="line-clamp-2 text-xs italic text-muted-foreground">
                      "...{result.highlights[0].snippet}..."
                    </p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!aiLoading && query && results.length > 0 && aiResults.length === 0 && <CommandSeparator />}
        {!aiLoading && query && results.length > 0 && aiResults.length === 0 && (
          <CommandGroup heading="AI Search">
            <CommandItem onSelect={performAiSearch} className="gap-2 cursor-pointer text-primary">
              <Sparkles className="h-4 w-4" />
              Deep search with AI
            </CommandItem>
          </CommandGroup>
        )}

        {aiLoading && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching with AI...
          </div>
        )}

      </CommandList>
    </CommandDialog>
  )
}
