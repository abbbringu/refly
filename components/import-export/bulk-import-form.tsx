"use client"

import { useState, useCallback } from "react"
import { createClient } from "@/utils/supabase/client"
import { detectFormat, parseByFormat } from "@/lib/parsers"
import type { Paper } from "@/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
} from "lucide-react"

interface BulkImportFormProps {
  onSuccess: () => void
  onCancel?: () => void
  teamId?: string
}

async function findExistingPaperForImport({
  supabase,
  userId,
  teamId,
  doi,
  url,
  title,
  authors,
}: {
  supabase: ReturnType<typeof createClient>
  userId: string
  teamId?: string
  doi?: string | null
  url?: string | null
  title?: string | null
  authors?: string[] | null
}) {
  if (doi?.trim()) {
    let query = supabase
      .from("papers")
      .select("id, title")
      .eq("user_id", userId)
      .eq("doi", doi.trim())

    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

    const { data } = await query.limit(1)
    if (data?.[0]) return data[0]
  }

  if (url?.trim()) {
    let query = supabase
      .from("papers")
      .select("id, title")
      .eq("user_id", userId)
      .eq("url", url.trim())

    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

    const { data } = await query.limit(1)
    if (data?.[0]) return data[0]
  }

  if (title?.trim() && authors && authors.length > 0) {
    let query = supabase
      .from("papers")
      .select("id, title")
      .eq("user_id", userId)
      .eq("title", title.trim())
      .eq("authors", authors)

    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

    const { data } = await query.limit(1)
    if (data?.[0]) return data[0]
  }

  return null
}

export function BulkImportForm({
  onSuccess,
  onCancel,
  teamId,
}: BulkImportFormProps) {
  const [input, setInput] = useState("")
  const [format, setFormat] = useState<string>("auto")
  const [parsed, setParsed] = useState<Partial<Paper>[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    errors: number
  } | null>(null)

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        setInput(text)

        // Auto-detect format from file extension
        const ext = file.name.split(".").pop()?.toLowerCase()
        if (ext === "bib") setFormat("bibtex")
        else if (ext === "ris") setFormat("ris")
        else if (ext === "json") setFormat("csl-json")
        else if (ext === "xml") setFormat("endnote-xml")
      }
      reader.readAsText(file)
    },
    [],
  )

  const handleParse = () => {
    try {
      const detectedFormat =
        format === "auto" ? detectFormat(input) : format
      if (!detectedFormat) {
        toast.error("Could not detect format. Please select manually.")
        return
      }

      const papers = parseByFormat(input, detectedFormat)
      setParsed(papers)

      if (papers.length === 0) {
        toast.warning("No papers found in input")
      } else {
        toast.success(`Found ${papers.length} paper(s)`)
      }
    } catch (err: any) {
      toast.error("Parse error", {
        description: err.message,
      })
    }
  }

  const handleImport = async () => {
    if (!parsed || parsed.length === 0) return
    setImporting(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    let imported = 0
    let skipped = 0
    let errors = 0

    for (const paper of parsed) {
      const existingPaper = await findExistingPaperForImport({
        supabase,
        userId: user.id,
        teamId,
        doi: paper.doi,
        url: paper.url,
        title: paper.title,
        authors: paper.authors,
      })

      if (existingPaper) {
        skipped++
        continue
      }

      const { error } = await supabase.from("papers").insert({
        user_id: user.id,
        team_id: teamId || null,
        title: paper.title || "Untitled",
        authors: paper.authors || [],
        year: paper.year || null,
        abstract: paper.abstract || null,
        doi: paper.doi || null,
        paper_type: paper.paper_type || "article",
        url: paper.url || null,
        metadata: paper.metadata || {},
      })

      if (error) {
        errors++
      } else {
        imported++
      }
    }

    setResult({ imported, skipped, errors })
    setImporting(false)

    if (imported > 0) {
      toast.success(
        `${imported} imported${skipped > 0 ? `, ${skipped} skipped (already in library)` : ""}`
      )
      onSuccess()
    } else if (skipped > 0) {
      toast.info(`${skipped} paper(s) were already in your library`)
      onSuccess()
    }
    if (errors > 0) {
      toast.error(`${errors} paper(s) failed to import`)
    }
  }

  const handleReset = () => {
    setInput("")
    setFormat("auto")
    setParsed(null)
    setResult(null)
    if (onCancel) onCancel()
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <div className="text-center">
          <p className="text-lg font-semibold">Import complete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            imported
            {result.skipped > 0 ? `, ${result.skipped} skipped` : ""}
            {result.errors > 0 ? `, ${result.errors} failed` : ""}
          </p>
        </div>
        <Button onClick={handleReset}>Done</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="bibtex">BibTeX</SelectItem>
            <SelectItem value="ris">RIS</SelectItem>
            <SelectItem value="csl-json">CSL JSON</SelectItem>
            <SelectItem value="endnote-xml">EndNote XML</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
          <Upload className="h-4 w-4" />
          Upload file
          <input
            type="file"
            accept=".bib,.ris,.json,.xml,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      <div className="space-y-2">
        <Label>Paste your references or upload a file</Label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste BibTeX, RIS, CSL JSON, or EndNote XML here…"
          rows={10}
          className="font-mono text-xs"
        />
      </div>

      {parsed && (
        <div className="rounded-lg border border-border/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Preview ({parsed.length} papers)
            </span>
          </div>
          <div className="max-h-48 space-y-2 overflow-auto">
            {parsed.slice(0, 10).map((paper, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md bg-muted/30 p-2 text-xs"
              >
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] capitalize"
                >
                  {paper.paper_type}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-medium">
                    {paper.title}
                  </p>
                  <p className="line-clamp-1 text-muted-foreground">
                    {paper.authors?.join(", ")}
                    {paper.year ? ` (${paper.year})` : ""}
                  </p>
                </div>
              </div>
            ))}
            {parsed.length > 10 && (
              <p className="text-xs text-muted-foreground">
                …and {parsed.length - 10} more
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={handleReset}>
            Cancel
          </Button>
        )}
        {!parsed ? (
          <Button
            onClick={handleParse}
            disabled={!input.trim()}
          >
            Parse
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => setParsed(null)}
            >
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || parsed.length === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                `Import ${parsed.length} paper(s)`
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
