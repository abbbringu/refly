"use client"

import Link from "next/link"
import { ExternalLink, FileText } from "lucide-react"
import type { RagSource } from "@/lib/ai/rag"

interface ChatSourcesProps {
  sources: RagSource[]
}

function formatScore(score: number) {
  const bounded = Math.max(0, Math.min(1, score))
  return `${Math.round(bounded * 100)}%`
}

export function ChatSources({ sources }: ChatSourcesProps) {
  if (sources.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-background/70 p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Sources
      </p>
      <div className="space-y-2">
        {sources.map((source) => (
          <Link
            key={`${source.sourceId}-${source.chunkId || source.paperId}`}
            href={`/paper/${source.paperId}`}
            className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2.5 py-2 transition-colors hover:bg-muted/40"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-medium text-foreground">
                [{source.sourceId}] {source.title}
              </p>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {source.authors.slice(0, 2).join(", ")}
                {source.authors.length > 2 ? ", et al." : ""}
                {source.year ? ` (${source.year})` : ""}
                {source.score > 0
                  ? ` · ${formatScore(source.score)} match`
                  : ""}
                {source.pageNumber ? ` · p. ${source.pageNumber}` : ""}
              </p>
            </div>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  )
}
