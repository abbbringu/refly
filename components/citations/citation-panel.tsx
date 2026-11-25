"use client"

import { useState, useEffect } from "react"
import type { Paper, CitationFormat, CitationResult } from "@/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"

interface CitationPanelProps {
  paper: Paper
}

const CITATION_FORMATS: { value: CitationFormat; label: string }[] = [
  { value: "apa", label: "APA" },
  { value: "mla", label: "MLA" },
  { value: "chicago", label: "Chicago" },
  { value: "harvard", label: "Harvard" },
  { value: "ieee", label: "IEEE" },
  { value: "vancouver", label: "Vancouver" },
  { value: "bibtex", label: "BibTeX" },
]

export function CitationPanel({ paper }: CitationPanelProps) {
  const [citations, setCitations] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)

  useEffect(() => {
    const generateCitations = async () => {
      try {
        const res = await fetch("/api/citations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper }),
        })
        const data = await res.json()
        if (data.citations) {
          setCitations(data.citations)
        }
      } catch {
        // Generate basic citations client-side as fallback
        setCitations(generateBasicCitations(paper))
      }
      setLoading(false)
    }

    generateCitations()
  }, [paper])

  const handleCopy = (format: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedFormat(format)
    toast.success(`${format.toUpperCase()} citation copied`)
    setTimeout(() => setCopiedFormat(null), 2000)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Citations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Generating citations…
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Citations</CardTitle>
        <CardDescription>
          Click any format to copy the citation to your clipboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="apa">
          <TabsList className="flex-wrap">
            {CITATION_FORMATS.map((fmt) => (
              <TabsTrigger key={fmt.value} value={fmt.value} className="text-xs">
                {fmt.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {CITATION_FORMATS.map((fmt) => (
            <TabsContent key={fmt.value} value={fmt.value} className="mt-4">
              <div className="group relative rounded-lg border border-border/60 bg-muted/30 p-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {citations[fmt.value] ?? "Citation not available"}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    handleCopy(fmt.value, citations[fmt.value] ?? "")
                  }
                >
                  {copiedFormat === fmt.value ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

// Fallback client-side citation generation
function generateBasicCitations(
  paper: Paper,
): Record<string, string> {
  const authors = paper.authors || []
  const year = paper.year
  const title = paper.title
  const journal = (paper.metadata?.journal as string) || ""
  const doi = paper.doi
  const volume = (paper.metadata?.volume as string) || ""
  const issue = (paper.metadata?.issue as string) || ""
  const pages = (paper.metadata?.pages as string) || ""

  const authorLastFirst = authors.map((a) => {
    const parts = a.trim().split(" ")
    if (parts.length > 1) {
      return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`
    }
    return a
  })

  const authorFirstLast = (a: string) => a

  // APA
  const apaAuthors =
    authorLastFirst.length > 0
      ? authorLastFirst
          .map((a, i) => {
            const parts = a.split(", ")
            const initials = parts[1]
              ? parts[1]
                  .split(" ")
                  .map((n) => n[0] + ".")
                  .join(" ")
              : ""
            return `${parts[0]}, ${initials}`
          })
          .join(", ")
      : ""
  const apa = `${apaAuthors}${year ? ` (${year})` : ""}. ${title}.${journal ? ` *${journal}*` : ""}${volume ? `, *${volume}*` : ""}${issue ? `(${issue})` : ""}${pages ? `, ${pages}` : ""}.${doi ? ` https://doi.org/${doi}` : ""}`

  // MLA
  const mlaAuthors = authors.length > 0 ? authorLastFirst[0] : ""
  const mla = `${mlaAuthors}. "${title}."${journal ? ` *${journal}*` : ""}${volume ? `, vol. ${volume}` : ""}${issue ? `, no. ${issue}` : ""}${year ? `, ${year}` : ""}${pages ? `, pp. ${pages}` : ""}.${doi ? ` doi:${doi}` : ""}`

  // Chicago
  const chicago = `${authorLastFirst.join(", ")}. ${year ? `${year}. ` : ""}"${title}."${journal ? ` *${journal}*` : ""}${volume ? ` ${volume}` : ""}${issue ? `, no. ${issue}` : ""}${pages ? `: ${pages}` : ""}.${doi ? ` https://doi.org/${doi}` : ""}`

  // Harvard
  const harvard = `${authorLastFirst.map((a) => a.split(",")[0]).join(", ")}${year ? ` (${year})` : ""} '${title}',${journal ? ` *${journal}*` : ""}${volume ? `, ${volume}` : ""}${issue ? `(${issue})` : ""}${pages ? `, pp.${pages}` : ""}.`

  // IEEE
  const ieeeAuthors = authors.map((a) => {
    const parts = a.trim().split(" ")
    if (parts.length > 1) {
      return `${parts.slice(0, -1).map((n) => n[0] + ".").join(" ")} ${parts[parts.length - 1]}`
    }
    return a
  })
  const ieee = `${ieeeAuthors.join(", ")}, "${title},"${journal ? ` *${journal}*` : ""}${volume ? `, vol. ${volume}` : ""}${issue ? `, no. ${issue}` : ""}${pages ? `, pp. ${pages}` : ""}${year ? `, ${year}` : ""}.${doi ? ` doi: ${doi}` : ""}`

  // Vancouver
  const vancouver = `${authorLastFirst.map((a) => { const parts = a.split(", "); return parts[0] + (parts[1] ? " " + parts[1].split(" ").map((n: string) => n[0]).join("") : ""); }).join(", ")}. ${title}.${journal ? ` ${journal}` : ""}. ${year || ""}${volume ? ";${volume}" : ""}${issue ? `(${issue})` : ""}${pages ? `:${pages}` : ""}.${doi ? ` doi:${doi}` : ""}`

  // BibTeX
  const bibtexKey =
    (authors[0]?.split(" ").pop()?.toLowerCase() || "unknown") +
    (year || "") +
    (title.split(" ")[0]?.toLowerCase() || "")
  const bibtex = `@article{${bibtexKey},
  title = {${title}},
  author = {${authors.join(" and ")}},${year ? `\n  year = {${year}},` : ""}${journal ? `\n  journal = {${journal}},` : ""}${volume ? `\n  volume = {${volume}},` : ""}${issue ? `\n  number = {${issue}},` : ""}${pages ? `\n  pages = {${pages}},` : ""}${doi ? `\n  doi = {${doi}},` : ""}
}`

  return { apa, mla, chicago, harvard, ieee, vancouver, bibtex }
}
