"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { PAPER_SELECT } from "@/lib/db/selects"
import { dispatchReflyDataUpdated } from "@/lib/refly-events"
import type { PaperType } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  Loader2,
  FileText,
  Link as LinkIcon,
  Search,
} from "lucide-react"

export type AddPaperTab = "manual" | "identifier" | "url"

export interface AddPaperDialogPrefill {
  key?: string
  tab?: AddPaperTab
  identifierType?: "doi" | "arxiv" | "pubmed" | "isbn"
  identifier?: string
  url?: string
  autoSubmit?: boolean
}

interface AddPaperDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  teamId?: string
  folderId?: string
  prefill?: AddPaperDialogPrefill | null
}

interface ImportApiResult {
  data?: {
    id: string
    title?: string
  }
  error?: string
  duplicate?: boolean
  reusedExisting?: boolean
  pdfStored?: boolean
  pdfStoreReason?: string
}

function pdfStoreWarning(reason?: string): string {
  if (!reason) {
    return "The paper was imported, but the PDF could not be stored."
  }

  if (reason === "storage_quota_exceeded") {
    return "The paper was imported, but PDF storage is over your plan limit."
  }

  if (reason === "too_large") {
    return "The paper was imported, but the PDF is larger than the upload limit."
  }

  return "The paper was imported, but PDF storage failed."
}

function notifyPaperDataUpdated() {
  if (typeof window !== "undefined") {
    dispatchReflyDataUpdated({ type: "paper" })
  }
}

function FormFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-1 mt-5 border-t border-border/60 bg-popover/95 px-1 pt-4 backdrop-blur">
      {children}
    </div>
  )
}

function SectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 p-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function isDuplicateError(error: unknown): error is { code: string; message?: string } {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505")
}

async function linkPaperToFolder({
  supabase,
  paperId,
  folderId,
}: {
  supabase: ReturnType<typeof createClient>
  paperId: string
  folderId?: string
}) {
  if (!folderId) return

  await supabase
    .from("paper_folders")
    .upsert(
      {
        paper_id: paperId,
        folder_id: folderId,
      },
      { onConflict: "paper_id,folder_id", ignoreDuplicates: true },
    )
}

async function findExistingPaperInScope({
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
      .select(PAPER_SELECT)
      .eq("user_id", userId)
      .eq("doi", doi.trim())

    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

    const { data } = await query.order("created_at", { ascending: true }).limit(1)
    if (data?.[0]) return data[0]
  }

  if (url?.trim()) {
    let query = supabase
      .from("papers")
      .select(PAPER_SELECT)
      .eq("user_id", userId)
      .eq("url", url.trim())

    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

    const { data } = await query.order("created_at", { ascending: true }).limit(1)
    if (data?.[0]) return data[0]
  }

  if (title?.trim() && authors && authors.length > 0) {
    let query = supabase
      .from("papers")
      .select(PAPER_SELECT)
      .eq("user_id", userId)
      .eq("title", title.trim())
      .eq("authors", authors)

    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null)

    const { data } = await query.order("created_at", { ascending: true }).limit(1)
    if (data?.[0]) return data[0]
  }

  return null
}

export function AddPaperDialog({
  open,
  onOpenChange,
  onSuccess,
  teamId,
  folderId,
  prefill,
}: AddPaperDialogProps) {
  const dialogRenderKey = prefill?.key || "default"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(92svh,820px)] max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <DialogHeader>
          <div className="px-5 pt-5 pr-14 sm:px-6 sm:pt-6 sm:pr-14">
            <DialogTitle>Add Paper</DialogTitle>
            <DialogDescription>
              Choose the fastest way to capture metadata or add a paper by hand.
            </DialogDescription>
          </div>
        </DialogHeader>
        <Tabs key={dialogRenderKey} defaultValue={prefill?.tab || "manual"} className="min-h-0 gap-0 overflow-visible">
          <div className="border-b border-border/60 px-5 pb-4 sm:px-6">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 overflow-visible p-1">
              <TabsTrigger value="manual" className="gap-2 py-2">
                <FileText className="h-4 w-4" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="identifier" className="gap-2 py-2">
                <Search className="h-4 w-4" />
                By ID
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2 py-2">
                <LinkIcon className="h-4 w-4" />
                From URL
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
            <TabsContent value="manual" className="mt-0">
              <ManualEntryTab onSuccess={onSuccess} teamId={teamId} folderId={folderId} />
            </TabsContent>

            <TabsContent value="identifier" className="mt-0">
              <IdentifierImportTab
                key={`identifier-${dialogRenderKey}`}
                onSuccess={onSuccess}
                teamId={teamId}
                folderId={folderId}
                prefill={prefill}
              />
            </TabsContent>

            <TabsContent value="url" className="mt-0">
              <UrlImportTab
                key={`url-${dialogRenderKey}`}
                onSuccess={onSuccess}
                teamId={teamId}
                folderId={folderId}
                prefill={prefill}
              />
            </TabsContent>

          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function ManualEntryTab({
  onSuccess,
  teamId,
  folderId,
}: {
  onSuccess: () => void
  teamId?: string
  folderId?: string
}) {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [authors, setAuthors] = useState("")
  const [year, setYear] = useState("")
  const [doi, setDoi] = useState("")
  const [abstract, setAbstract] = useState("")
  const [paperType, setPaperType] = useState<PaperType>("article")
  const [journal, setJournal] = useState("")
  const [url, setUrl] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const parsedAuthors = authors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)

    const { data: insertedPaper, error } = await supabase.from("papers").insert({
      user_id: user.id,
      team_id: teamId || null,
      title,
      authors: parsedAuthors,
      year: year ? parseInt(year) : null,
      doi: doi || null,
      abstract: abstract || null,
      paper_type: paperType,
      url: url || null,
      metadata: {
        journal: journal || undefined,
      },
    }).select().single()

    let paper = insertedPaper

    if (isDuplicateError(error)) {
      paper = await findExistingPaperInScope({
        supabase,
        userId: user.id,
        teamId,
        doi: doi || null,
        url: url || null,
        title: title || null,
        authors: parsedAuthors.length > 0 ? parsedAuthors : null,
      })
    }

    if (!paper) {
      toast.error("Failed to add paper", { description: error?.message })
      setLoading(false)
      return
    }

    // Associate with folder if adding from folder context
    await linkPaperToFolder({ supabase, paperId: paper.id, folderId })

    const duplicateMessage = insertedPaper ? null : "Paper already existed and was re-used"
    toast.success("Paper added to library", {
      description: duplicateMessage || undefined,
    })
    notifyPaperDataUpdated()

    if (paper?.id) {
      fetch("/api/papers/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id }),
      }).catch(() => {})
    }

    setLoading(false)
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="pt-5">
      <div className="space-y-5">
      <SectionHeader
        title="Manual entry"
        description="Use this when you already have the citation details or want full control."
      />
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter paper title"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="authors">Authors</Label>
          <Input
            id="authors"
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Author 1, Author 2, …"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated names
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2024"
            type="number"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="paperType">Type</Label>
          <Select
            value={paperType}
            onValueChange={(v) => setPaperType(v as PaperType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="article">Article</SelectItem>
              <SelectItem value="book">Book</SelectItem>
              <SelectItem value="conference">Conference</SelectItem>
              <SelectItem value="thesis">Thesis</SelectItem>
              <SelectItem value="report">Report</SelectItem>
              <SelectItem value="preprint">Preprint</SelectItem>
              <SelectItem value="webpage">Webpage</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="journal">Journal / Venue</Label>
          <Input
            id="journal"
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder="e.g. Nature, NeurIPS"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="doi">DOI</Label>
          <Input
            id="doi"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="10.1234/xxxxx"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="url">URL</Label>
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="abstract">Abstract</Label>
        <Textarea
          id="abstract"
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          placeholder="Enter abstract…"
          rows={4}
          className="resize-none"
        />
      </div>

      </div>

      <FormFooter>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Adding…
          </>
        ) : (
          "Add Paper"
        )}
      </Button>
      </FormFooter>
    </form>
  )
}

function IdentifierImportTab({
  onSuccess,
  teamId,
  folderId,
  prefill,
}: {
  onSuccess: () => void
  teamId?: string
  folderId?: string
  prefill?: AddPaperDialogPrefill | null
}) {
  const identifierPrefillActive = prefill?.tab === "identifier"
  const [loading, setLoading] = useState(false)
  const [identifier, setIdentifier] = useState(
    identifierPrefillActive ? prefill?.identifier?.trim() || "" : "",
  )
  const [idType, setIdType] = useState<"doi" | "arxiv" | "pubmed" | "isbn">(
    identifierPrefillActive ? prefill?.identifierType || "doi" : "doi",
  )
  const [duplicateRequest, setDuplicateRequest] = useState<{
    type: "doi" | "arxiv" | "pubmed" | "isbn"
    identifier: string
    title?: string
  } | null>(null)
  const autoSubmitRef = useRef<string | null>(null)

  const importIdentifier = useCallback(async (
    nextType: "doi" | "arxiv" | "pubmed" | "isbn",
    nextIdentifier: string,
    allowDuplicate = false,
  ) => {
    const trimmedIdentifier = nextIdentifier.trim()
    if (!trimmedIdentifier) return

    setLoading(true)

    try {
      const res = await fetch("/api/papers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: nextType,
          id: trimmedIdentifier,
          teamId,
          folderId,
          allowDuplicate,
        }),
      })

      const result = (await res.json()) as ImportApiResult

      if (!res.ok) {
        if (res.status === 409 && result.duplicate) {
          setDuplicateRequest({
            type: nextType,
            identifier: trimmedIdentifier,
            title: result.data?.title,
          })
          setLoading(false)
          return
        }

        toast.error("Import failed", {
          description: result.error || "Could not fetch paper metadata",
        })
        setLoading(false)
        return
      }

      toast.success(result.reusedExisting ? "Paper already in library" : "Paper imported!", {
        description: result.data?.title,
      })
      if (result.pdfStored === false) {
        toast.warning("PDF not stored", {
          description: pdfStoreWarning(result.pdfStoreReason),
        })
      }
      notifyPaperDataUpdated()
      onSuccess()
    } catch {
      toast.error("Import failed", { description: "Network error" })
    }

    setLoading(false)
  }, [folderId, onSuccess, teamId])

  useEffect(() => {
    if (!identifierPrefillActive || !prefill?.autoSubmit) return
    const nextIdentifier = prefill.identifier?.trim() || ""
    if (!nextIdentifier) return
    const nextType = prefill.identifierType || "doi"

    const autoKey = prefill.key || `${nextType}:${nextIdentifier}`
    if (autoSubmitRef.current === autoKey) return
    autoSubmitRef.current = autoKey

    const timeoutId = window.setTimeout(() => {
      void importIdentifier(nextType, nextIdentifier)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [identifierPrefillActive, importIdentifier, prefill])

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    await importIdentifier(idType, identifier)
  }

  return (
    <>
      <form onSubmit={handleImport} className="pt-5">
      <div className="space-y-5">
      <SectionHeader
        title="Import by identifier"
        description="Paste a DOI, arXiv ID, PubMed ID, or ISBN and Refly will fetch the metadata."
      />
      <div className="space-y-2">
        <Label>Identifier type</Label>
        <div className="flex flex-wrap gap-2">
          {(["doi", "arxiv", "pubmed", "isbn"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant={idType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setIdType(type)}
              className="flex-1 uppercase sm:flex-none"
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="identifier">
          {idType === "doi"
            ? "DOI"
            : idType === "arxiv"
              ? "arXiv ID"
              : idType === "pubmed"
                ? "PubMed ID"
                : "ISBN"}
        </Label>
        <Input
          id="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={
            idType === "doi"
              ? "10.1038/nature12373"
              : idType === "arxiv"
                ? "2301.07041"
                : idType === "pubmed"
                  ? "23934111"
                  : "978-0-13-468599-1"
          }
          required
        />
      </div>

      </div>

      <FormFooter>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Fetching metadata…
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            Import Paper
          </>
        )}
      </Button>
      </FormFooter>
      </form>

      <AlertDialog open={Boolean(duplicateRequest)} onOpenChange={(open) => !open && setDuplicateRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate paper detected</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateRequest?.title || "This paper"} is already in your library. Add it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Do not add</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!duplicateRequest) return
                void importIdentifier(duplicateRequest.type, duplicateRequest.identifier, true)
                setDuplicateRequest(null)
              }}
            >
              Add anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function UrlImportTab({
  onSuccess,
  teamId,
  folderId,
  prefill,
}: {
  onSuccess: () => void
  teamId?: string
  folderId?: string
  prefill?: AddPaperDialogPrefill | null
}) {
  const urlPrefillActive = prefill?.tab === "url"
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState(urlPrefillActive ? prefill?.url?.trim() || "" : "")
  const [duplicateUrl, setDuplicateUrl] = useState<{ url: string; title?: string } | null>(null)
  const autoSubmitRef = useRef<string | null>(null)

  const importUrl = useCallback(async (nextUrl: string, allowDuplicate = false) => {
    const trimmedUrl = nextUrl.trim()
    if (!trimmedUrl) return

    setLoading(true)

    try {
      const res = await fetch("/api/papers/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl, teamId, folderId, allowDuplicate }),
      })

      const result = (await res.json()) as ImportApiResult

      if (!res.ok) {
        if (res.status === 409 && result.duplicate) {
          setDuplicateUrl({ url: trimmedUrl, title: result.data?.title })
          setLoading(false)
          return
        }

        toast.error("Import failed", {
          description: result.error || "Could not extract metadata from URL",
        })
        setLoading(false)
        return
      }

      toast.success(result.reusedExisting ? "Paper already in library" : "Paper imported from URL!", {
        description: result.data?.title,
      })
      if (result.pdfStored === false) {
        toast.warning("PDF not stored", {
          description: pdfStoreWarning(result.pdfStoreReason),
        })
      }
      notifyPaperDataUpdated()
      onSuccess()
    } catch {
      toast.error("Import failed", { description: "Network error" })
    }

    setLoading(false)
  }, [folderId, onSuccess, teamId])

  useEffect(() => {
    if (!urlPrefillActive || !prefill?.autoSubmit) return
    const nextUrl = prefill.url?.trim() || ""
    if (!nextUrl) return

    const autoKey = prefill.key || nextUrl
    if (autoSubmitRef.current === autoKey) return
    autoSubmitRef.current = autoKey

    const timeoutId = window.setTimeout(() => {
      void importUrl(nextUrl)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [importUrl, prefill, urlPrefillActive])

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    await importUrl(url)
  }

  return (
    <>
      <form onSubmit={handleImport} className="pt-5">
      <div className="space-y-5">
      <SectionHeader
        title="Import from URL"
        description="Use a paper page, DOI landing page, or arXiv page."
      />
      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://arxiv.org/abs/2301.07041"
          type="url"
          required
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll extract metadata from the page&apos;s meta tags (OpenGraph, Dublin
          Core, Highwire Press).
        </p>
      </div>

      </div>

      <FormFooter>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Extracting metadata…
          </>
        ) : (
          <>
            <LinkIcon className="mr-2 h-4 w-4" />
            Import from URL
          </>
        )}
      </Button>
      </FormFooter>
      </form>

      <AlertDialog open={Boolean(duplicateUrl)} onOpenChange={(open) => !open && setDuplicateUrl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate paper detected</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateUrl?.title || "This paper"} is already in your library. Add it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Do not add</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!duplicateUrl) return
                void importUrl(duplicateUrl.url, true)
                setDuplicateUrl(null)
              }}
            >
              Add anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
