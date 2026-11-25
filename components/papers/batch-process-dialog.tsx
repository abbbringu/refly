"use client"

import { useState, useCallback } from "react"
import type { Paper } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
} from "lucide-react"

type ProcessMode = "pdf" | "enrich"

interface PaperResult {
  paperId: string
  title: string
  status: "pending" | "processing" | "success" | "skipped" | "error"
  detail?: string
}

interface BatchProcessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  papers: Paper[]
  mode: ProcessMode
  onSuccess: () => void
}

export function BatchProcessDialog({
  open,
  onOpenChange,
  papers,
  mode,
  onSuccess,
}: BatchProcessDialogProps) {
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<PaperResult[]>([])
  const [done, setDone] = useState(false)

  const totalCount = papers.length
  const completedCount = results.filter(
    (r) => r.status !== "pending" && r.status !== "processing"
  ).length

  const processPapers = useCallback(async () => {
    if (papers.length === 0) return

    setProcessing(true)
    setDone(false)

    const initialResults: PaperResult[] = papers.map((p) => ({
      paperId: p.id,
      title: p.title,
      status: "pending",
    }))

    setResults(initialResults)

    const processPaper = async (paper: Paper, index: number) => {
      setResults((prev) =>
        prev.map((r, idx) =>
          idx === index ? { ...r, status: "processing" } : r
        )
      )

      try {
        let data: Record<string, unknown>

        if (mode === "pdf") {
          const res = await fetch("/api/papers/resolve-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paperId: paper.id }),
          })
          data = await res.json()

          if (!res.ok) {
            setResults((prev) =>
              prev.map((r, idx) =>
                idx === index
                  ? {
                      ...r,
                      status: "error",
                      detail: (data.error as string) || "Failed",
                    }
                  : r
              )
            )
            return
          }

          if (data.stored) {
            setResults((prev) =>
              prev.map((r, idx) =>
                idx === index
                  ? {
                      ...r,
                      status: "success",
                      detail:
                        data.source === "already_exists"
                          ? "Already has PDF"
                          : `PDF fetched via ${data.source}`,
                    }
                  : r
              )
            )
          } else {
            setResults((prev) =>
              prev.map((r, idx) =>
                idx === index
                  ? {
                      ...r,
                      status: "skipped",
                      detail: "No PDF found",
                    }
                  : r
              )
            )
          }
        } else {
          const res = await fetch("/api/papers/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paperId: paper.id,
              fetchPdf: true,
            }),
          })
          data = await res.json()

          if (!res.ok) {
            setResults((prev) =>
              prev.map((r, idx) =>
                idx === index
                  ? {
                      ...r,
                      status: "error",
                      detail: (data.error as string) || "Failed",
                    }
                  : r
              )
            )
            return
          }

          const parts: string[] = []
          if (data.enriched) parts.push("Metadata enriched")
          if (data.pdfResolved) parts.push("PDF fetched")
          if (!data.enriched && !data.pdfResolved) {
            const hasDoi = paper.doi || (paper.metadata as Record<string, unknown>)?.arxiv_id || (paper.metadata as Record<string, unknown>)?.pubmed_id
            parts.push(hasDoi ? "No new data available" : "No identifier to look up")
          }

          const status =
            data.enriched || data.pdfResolved ? "success" : "skipped"

          setResults((prev) =>
            prev.map((r, idx) =>
              idx === index
                ? { ...r, status, detail: parts.join(" · ") }
                : r
            )
          )
        }
      } catch {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === index
              ? { ...r, status: "error", detail: "Network error" }
              : r
          )
        )
      }
    }

    // Run with low concurrency (2) to avoid hammering external APIs
    const concurrency = 2
    const staggerMs = 300
    const workers: Promise<void>[] = []
    let index = 0

    const worker = async () => {
      while (index < papers.length) {
        const currentIndex = index++
        await processPaper(papers[currentIndex], currentIndex)
      }
    }

    for (let i = 0; i < concurrency; i++) {
      workers.push(worker())
      if (i < concurrency - 1) {
        await new Promise((r) => setTimeout(r, staggerMs))
      }
    }

    await Promise.all(workers)

    setProcessing(false)
    setDone(true)
    onSuccess()
  }, [papers, mode, onSuccess])

  const handleClose = () => {
    if (processing) return
    setResults([])
    setDone(false)
    setProcessing(false)
    onOpenChange(false)
  }

  const successCount = results.filter((r) => r.status === "success").length
  const skippedCount = results.filter((r) => r.status === "skipped").length
  const errorCount = results.filter((r) => r.status === "error").length



  return (
    <Dialog open={open} onOpenChange={processing ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg !flex !flex-col !gap-4 max-h-[80vh] p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {mode === "pdf" ? "Fetch PDFs" : "Auto-enrich Papers"}
          </DialogTitle>
          <DialogDescription>
            {mode === "pdf"
              ? "Attempt to discover and download PDFs for selected papers."
              : "Fetch missing metadata and PDFs for selected papers using DOI, arXiv ID, PubMed ID, or title plus authors."}
          </DialogDescription>
        </DialogHeader>

        {!processing && !done && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {totalCount} paper{totalCount !== 1 ? "s" : ""} selected.{" "}
              {mode === "pdf"
                ? "Papers that already have a PDF will be skipped."
                : "Papers will be processed in parallel (up to 2 at a time) to avoid rate limits. Each paper with a DOI, arXiv ID, PubMed ID, or title plus authors will be enriched."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={processPapers}>
                {mode === "pdf" ? (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Fetch PDFs
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Enrichment
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {(processing || done) && (
          <>
            {processing && (
              <div className="space-y-2 shrink-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {totalCount - completedCount} remaining...
                  </span>
                  <span className="font-medium">
                    {completedCount}/{totalCount}
                  </span>
                </div>
                <Progress value={(completedCount / totalCount) * 100} />
              </div>
            )}

            {done && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 shrink-0">
                <div className="flex items-center gap-4 text-sm">
                  {successCount > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {successCount} succeeded
                    </span>
                  )}
                  {skippedCount > 0 && (
                    <span className="text-muted-foreground">
                      {skippedCount} skipped
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-destructive">
                      {errorCount} failed
                    </span>
                  )}
                </div>
              </div>
            )}

            <div
              className="min-h-[120px] overflow-y-auto rounded-md border border-border/40"
              style={{ flex: "1 1 0%" }}
            >
              <div className="divide-y divide-border/30">
                {results.map((result) => (
                  <div
                    key={result.paperId}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      result.status === "processing" && processing
                        ? "bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="shrink-0">
                      {result.status === "pending" && (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {result.status === "processing" && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {result.status === "success" && (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      )}
                      {result.status === "skipped" && (
                        <SkipForward className="h-4 w-4 text-muted-foreground" />
                      )}
                      {result.status === "error" && (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{result.title}</p>
                      {result.detail && (
                        <p className="truncate text-xs text-muted-foreground">
                          {result.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {done && (
              <div className="flex justify-end shrink-0">
                <Button onClick={handleClose}>Done</Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
