"use client"

import { CitationFinder } from "@/components/citations/citation-finder"

export default function AICitationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Citations</h1>
        <p className="text-sm text-muted-foreground">
          Write a statement or claim, and find papers in your library that can support it.
        </p>
      </div>

      <CitationFinder />
    </div>
  )
}
