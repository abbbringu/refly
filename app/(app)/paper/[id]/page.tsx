"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { NOTE_SELECT, PAPER_FILE_SELECT, PAPER_SELECT } from "@/lib/db/selects"
import { dispatchReflyDataUpdated } from "@/lib/refly-events"
import type { Paper, PaperFile, Note, Tag } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Save,
  Star,
  Trash2,
  Wand2,
  Quote,
  PenTool,
  Search,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { deletePapersById } from "@/lib/papers/delete-papers-client"
import { useConfirm } from "@/components/confirm-provider"
import { formatDistanceToNow } from "date-fns"
import { NoteEditor } from "@/components/notes/note-editor"
import { CitationPanel } from "@/components/citations/citation-panel"
import { AIDataNotice } from "@/components/ai/ai-data-notice"
import { TagInput, type SuggestedTag } from "@/components/papers/tag-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function PaperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const paperId = params.id as string

  const [paper, setPaper] = useState<Paper | null>(null)
  const [files, setFiles] = useState<PaperFile[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const confirm = useConfirm()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoTagging, setAutoTagging] = useState(false)
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([])
  const [applyingSuggestions, setApplyingSuggestions] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Paper>>({})
  const [resolvingPdf, setResolvingPdf] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [autoSummarizing, setAutoSummarizing] = useState(false)
  const [activeTab, setActiveTab] = useState("details")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const pdfFileInputRef = useRef<HTMLInputElement>(null)

  const getPrimaryPdfFile = useCallback(() => {
    return (
      files.find((file) => file.mime_type === "application/pdf") ??
      files[0] ??
      null
    )
  }, [files])

  const createPdfSignedUrl = useCallback(async () => {
    const file = getPrimaryPdfFile()
    if (!file) {
      toast.info("No PDF attached yet")
      return null
    }

    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from("papers")
      .createSignedUrl(file.file_path, 3600)

    if (error || !data?.signedUrl) {
      toast.error("Failed to load PDF")
      return null
    }

    return data.signedUrl
  }, [getPrimaryPdfFile])

  const loadPaper = useCallback(async () => {
    const supabase = createClient()

    const [paperRes, filesRes, notesRes, tagsRes] = await Promise.all([
      supabase.from("papers").select(PAPER_SELECT).eq("id", paperId).single(),
      supabase
        .from("paper_files")
        .select(PAPER_FILE_SELECT)
        .eq("paper_id", paperId),
      supabase
        .from("notes")
        .select(NOTE_SELECT)
        .eq("paper_id", paperId)
        .order("created_at", { ascending: false }),
      supabase
        .from("paper_tags")
        .select("tag_id, tags(*)")
        .eq("paper_id", paperId),
    ])

    if (paperRes.data) {
      setPaper(paperRes.data)
      setEditForm(paperRes.data)
    }
    if (filesRes.data) setFiles(filesRes.data)
    if (notesRes.data) setNotes(notesRes.data)
    if (tagsRes.data) {
      setTags(tagsRes.data.map((pt: any) => pt.tags).filter(Boolean))
    }

    setLoading(false)
  }, [paperId])

  useEffect(() => {
    loadPaper()
  }, [loadPaper])

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("papers")
      .update({
        title: editForm.title,
        authors: editForm.authors,
        year: editForm.year,
        abstract: editForm.abstract,
        paper_type: editForm.paper_type,
        doi: editForm.doi,
        url: editForm.url,
        metadata: editForm.metadata,
      })
      .eq("id", paperId)

    if (error) {
      toast.error("Failed to save changes")
    } else {
      toast.success("Changes saved")
      setEditing(false)
      loadPaper()
    }
    setSaving(false)
  }

  const handleToggleFavorite = async () => {
    if (!paper) return
    const supabase = createClient()
    await supabase
      .from("papers")
      .update({ is_favorite: !paper.is_favorite })
      .eq("id", paper.id)
    loadPaper()
  }

  const handleOpenPDF = async () => {
    const signedUrl = await createPdfSignedUrl()
    if (signedUrl) {
      window.open(signedUrl, "_blank")
    }
  }

  useEffect(() => {
    setPreviewUrl(null)
    setPreviewLoading(false)
  }, [files])

  useEffect(() => {
    if (activeTab !== "preview" || previewUrl || previewLoading) return

    const file = getPrimaryPdfFile()
    if (!file) return

    setPreviewLoading(true)
    setPreviewUrl(`/api/papers/preview-pdf?paperId=${paperId}&t=${Date.now()}`)
  }, [activeTab, getPrimaryPdfFile, paperId, previewLoading, previewUrl])

  const handleDelete = async () => {
    if (!paper) return
    if (
      !(await confirm({
        title: `Delete "${paper.title}"?`,
        description: "This cannot be undone.",
        variant: "destructive",
        actionLabel: "Delete",
      }))
    )
      return

    try {
      const result = await deletePapersById([paper.id])
      if (result.deletedCount !== 1) {
        toast.error(result.errors[0] || "Failed to delete paper")
        return
      }

      toast.success("Paper deleted")
      router.push("/library")
    } catch (error) {
      toast.error("Failed to delete paper")
      console.error(error)
    }
  }

  const handleResolvePdf = async () => {
    setResolvingPdf(true)
    try {
      const res = await fetch("/api/papers/resolve-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId }),
      })
      const result = await res.json()

      if (!res.ok) {
        toast.error("Could not find PDF", { description: result.error })
        setResolvingPdf(false)
        return
      }

      if (result.stored) {
        toast.success("PDF found and stored!")
        await loadPaper()
      } else {
        toast.warning("No PDF found", {
          description:
            result.reason === "no_pdf_found"
              ? "We couldn't locate a PDF for this paper. Try uploading one manually."
              : `PDF discovery failed: ${result.reason}`,
        })
      }
    } catch {
      toast.error("Network error during PDF search")
    }
    setResolvingPdf(false)
  }

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.set("paperId", paperId)
      formData.set("file", file)

      const res = await fetch("/api/papers/upload-pdf", {
        method: "POST",
        body: formData,
      })
      const result = await res.json()

      if (!res.ok) {
        toast.error("Upload failed", { description: result.error })
        setUploadingPdf(false)
        return
      }

      toast.success("PDF uploaded!")
      await loadPaper()
    } catch {
      toast.error("Network error during upload")
    }
    setUploadingPdf(false)
    if (pdfFileInputRef.current) {
      pdfFileInputRef.current.value = ""
    }
  }

  const handleAutoTag = async () => {
    setAutoTagging(true)
    try {
      const res = await fetch("/api/papers/auto-tag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paperId }),
      })

      const payload = await res.json()

      if (!res.ok) {
        toast.error(payload?.error || "Failed to auto-tag paper")
        return
      }

      const suggestions: SuggestedTag[] = Array.isArray(
        payload?.data?.suggestedTags
      )
        ? payload.data.suggestedTags
        : []

      if (suggestions.length === 0) {
        toast.info("AI could not find confident tags for this paper")
        return
      }

      setSuggestedTags(suggestions)
    } catch (error) {
      console.error(error)
      toast.error("Failed to auto-tag paper")
    } finally {
      setAutoTagging(false)
    }
  }

  const handleAutoSummary = async () => {
    setAutoSummarizing(true)
    try {
      const localModel = window.localStorage.getItem("refly.paperSummaryModel")
      const res = await fetch("/api/papers/auto-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paperId,
          model: localModel || undefined,
        }),
      })

      const payload = await res.json()
      if (!res.ok) {
        toast.error(payload?.error || "Failed to generate summary")
        return
      }

      const mode = payload?.data?.mode
      toast.success(
        mode === "updated"
          ? "AI summary note updated"
          : "AI summary note created"
      )
      await loadPaper()
    } catch {
      toast.error("Failed to generate summary")
    } finally {
      setAutoSummarizing(false)
    }
  }

  const handleRemoveSuggestion = (name: string) => {
    setSuggestedTags((prev) =>
      prev.map((s) => (s.name === name ? { ...s, rejected: true } : s))
    )
  }

  const handleApplySuggestions = async (names: string[]) => {
    if (names.length === 0) return
    setApplyingSuggestions(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: allTags } = await supabase
        .from("tags")
        .select("id, name")
        .eq("user_id", user.id)

      const tagByNameLower = new Map<string, { id: string; name: string }>()
      for (const tag of allTags || []) {
        tagByNameLower.set(tag.name.toLowerCase(), tag)
      }

      const toCreate: string[] = []
      for (const name of names) {
        if (!tagByNameLower.has(name.toLowerCase())) {
          toCreate.push(name)
        }
      }

      if (toCreate.length > 0) {
        await supabase.from("tags").upsert(
          toCreate.map((name) => ({
            user_id: user.id,
            name,
            color: null,
          })),
          { onConflict: "user_id,name", ignoreDuplicates: true }
        )
      }

      const { data: refreshedTags } = await supabase
        .from("tags")
        .select("id, name")
        .eq("user_id", user.id)

      const refreshedByNameLower = new Map<
        string,
        { id: string; name: string }
      >()
      for (const tag of refreshedTags || []) {
        refreshedByNameLower.set(tag.name.toLowerCase(), tag)
      }

      const tagIdsToAssign: string[] = []
      for (const name of names) {
        const tag = refreshedByNameLower.get(name.toLowerCase())
        if (tag) tagIdsToAssign.push(tag.id)
      }

      if (tagIdsToAssign.length > 0) {
        const { data: existingPaperTags } = await supabase
          .from("paper_tags")
          .select("tag_id")
          .eq("paper_id", paperId)

        const alreadyAssigned = new Set(
          (existingPaperTags || []).map((row: any) => row.tag_id)
        )

        const toInsert = tagIdsToAssign
          .filter((id) => !alreadyAssigned.has(id))
          .map((tag_id) => ({ paper_id: paperId, tag_id }))

        if (toInsert.length > 0) {
          await supabase.from("paper_tags").insert(toInsert)
        }
      }

      const count = tagIdsToAssign.length
      toast.success(`Applied ${count} tag${count === 1 ? "" : "s"}`)
      setSuggestedTags([])
      await loadPaper()
      dispatchReflyDataUpdated({ type: "tag" })
    } catch (error) {
      console.error(error)
      toast.error("Failed to apply tags")
    } finally {
      setApplyingSuggestions(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!paper) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-semibold">Paper not found</h2>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/library")}
        >
          Back to Library
        </Button>
      </div>
    )
  }

  const metadata = paper.metadata || {}

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleFavorite}
          title="Toggle favorite"
        >
          <Star
            className={`h-4 w-4 ${paper.is_favorite ? "fill-amber-400 text-amber-400" : ""}`}
          />
        </Button>
        {editing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false)
                setEditForm(paper)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Save
            </Button>
          </>
        ) : (
          <>
            {files.length > 0 ? (
              <Button
                size="sm"
                onClick={handleOpenPDF}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open PDF
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleResolvePdf}
                  disabled={resolvingPdf}
                >
                  {resolvingPdf ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-4 w-4" />
                  )}
                  Find PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => pdfFileInputRef.current?.click()}
                  disabled={uploadingPdf}
                >
                  {uploadingPdf ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  Upload PDF
                </Button>
                {paper.url && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Open Source
                    </a>
                  </Button>
                )}
                <input
                  ref={pdfFileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleUploadPdf}
                />
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAutoSummary}
              disabled={autoSummarizing}
              className="border border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-800"
            >
              {autoSummarizing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-4 w-4" />
              )}
              AI Summary & Notes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </>
        )}
      </div>

      <AIDataNotice>
        PDF upload and AI tools may send extracted PDF text, paper metadata,
        abstracts, notes, and citation evidence to OpenAI/OpenRouter and routed
        model providers for indexing, summaries, tags, citations, and chat.
      </AIDataNotice>

      {files.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          No PDF attached. Use &quot;Find PDF&quot; to auto-discover, or upload
          one manually.
        </div>
      )}

      {/* Main content */}
      <div className="space-y-6">
        {/* Title & Meta */}
        <div>
          {editing ? (
            <Input
              value={editForm.title ?? ""}
              onChange={(e) =>
                setEditForm({ ...editForm, title: e.target.value })
              }
              className="text-2xl font-bold"
            />
          ) : (
            <h1 className="text-2xl leading-tight font-bold tracking-tight">
              {paper.title}
            </h1>
          )}

          {editing ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={editForm.paper_type ?? "article"}
                  onValueChange={(value) =>
                    setEditForm({
                      ...editForm,
                      paper_type: value as Paper["paper_type"],
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="conference">Conference</SelectItem>
                    <SelectItem value="thesis">Thesis</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="webpage">Webpage</SelectItem>
                    <SelectItem value="preprint">Preprint</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Input
                  type="number"
                  value={editForm.year ?? ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      year: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="capitalize">
                {paper.paper_type}
              </Badge>
              {paper.year && <span>· {paper.year}</span>}
              {metadata.journal && (
                <span>
                  · <em>{metadata.journal as string}</em>
                </span>
              )}
              {paper.doi && (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  DOI
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <span>
                · Added{" "}
                {formatDistanceToNow(new Date(paper.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          )}

          {/* Authors */}
          <div className="mt-3">
            {editing ? (
              <div className="space-y-1">
                <Label>Authors (comma-separated)</Label>
                <Input
                  value={editForm.authors?.join(", ") ?? ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      authors: e.target.value
                        .split(",")
                        .map((a) => a.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            ) : (
              <p className="text-sm">
                {paper.authors?.join(", ") || "No authors listed"}
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="w-full flex-1 sm:w-auto">
              <TagInput
                paperId={paper.id}
                tags={tags}
                onRefresh={loadPaper}
                suggestedTags={suggestedTags}
                onRemoveSuggestion={handleRemoveSuggestion}
                onApplySuggestions={handleApplySuggestions}
                applyingSuggestions={applyingSuggestions}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoTag}
              disabled={autoTagging || suggestedTags.length > 0}
              className="mt-1 shrink-0 border-indigo-200 bg-indigo-50/50 text-indigo-600 hover:bg-indigo-100/50 sm:mt-0"
            >
              {autoTagging ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-4 w-4" />
              )}
              {autoTagging ? "Analyzing..." : "Auto-tag"}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex h-14 w-full rounded-xl bg-muted/50 p-1">
            <TabsTrigger
              value="details"
              className="flex h-full flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-base"
            >
              <FileText className="h-4 w-4" />
              Details
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="flex h-full flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-base"
            >
              <Eye className="h-4 w-4" />
              Preview PDF
            </TabsTrigger>
            <TabsTrigger
              value="citations"
              className="flex h-full flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-base"
            >
              <Quote className="h-4 w-4" />
              Citations
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="flex h-full flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-base"
            >
              <PenTool className="h-4 w-4" />
              Notes ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            {/* Abstract */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Abstract</CardTitle>
              </CardHeader>
              <CardContent>
                {editing ? (
                  <Textarea
                    value={editForm.abstract ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, abstract: e.target.value })
                    }
                    rows={6}
                  />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    {paper.abstract || "No abstract available."}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                {editing ? (
                  <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        DOI
                      </Label>
                      <Input
                        value={editForm.doi ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            doi: e.target.value || null,
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        URL
                      </Label>
                      <Input
                        value={editForm.url ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            url: e.target.value || null,
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Journal
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.journal ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              journal: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Volume
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.volume ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              volume: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Issue
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.issue ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              issue: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Pages
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.pages ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              pages: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Publisher
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.publisher ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              publisher: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        arXiv ID
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.arxiv_id ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              arxiv_id: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        ISBN
                      </Label>
                      <Input
                        value={(editForm.metadata as any)?.isbn ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            metadata: {
                              ...(editForm.metadata || {}),
                              isbn: e.target.value || undefined,
                            },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {paper.doi && (
                      <>
                        <dt className="text-muted-foreground">DOI</dt>
                        <dd className="font-mono text-xs">{paper.doi}</dd>
                      </>
                    )}
                    {metadata.journal && (
                      <>
                        <dt className="text-muted-foreground">Journal</dt>
                        <dd>{metadata.journal as string}</dd>
                      </>
                    )}
                    {metadata.volume && (
                      <>
                        <dt className="text-muted-foreground">Volume</dt>
                        <dd>{metadata.volume as string}</dd>
                      </>
                    )}
                    {metadata.issue && (
                      <>
                        <dt className="text-muted-foreground">Issue</dt>
                        <dd>{metadata.issue as string}</dd>
                      </>
                    )}
                    {metadata.pages && (
                      <>
                        <dt className="text-muted-foreground">Pages</dt>
                        <dd>{metadata.pages as string}</dd>
                      </>
                    )}
                    {metadata.publisher && (
                      <>
                        <dt className="text-muted-foreground">Publisher</dt>
                        <dd>{metadata.publisher as string}</dd>
                      </>
                    )}
                    {metadata.arxiv_id && (
                      <>
                        <dt className="text-muted-foreground">arXiv ID</dt>
                        <dd>
                          <a
                            href={`https://arxiv.org/abs/${metadata.arxiv_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {metadata.arxiv_id as string}
                          </a>
                        </dd>
                      </>
                    )}
                    {metadata.isbn && (
                      <>
                        <dt className="text-muted-foreground">ISBN</dt>
                        <dd>{metadata.isbn as string}</dd>
                      </>
                    )}
                    {paper.url && (
                      <>
                        <dt className="text-muted-foreground">URL</dt>
                        <dd>
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Link ↗
                          </a>
                        </dd>
                      </>
                    )}
                  </dl>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">PDF Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {previewUrl ? (
                  <div className="relative h-[70vh] min-h-[320px]">
                    {previewLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md border bg-background/80 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading PDF preview...
                      </div>
                    )}
                    <iframe
                      src={previewUrl}
                      title={`${paper.title} PDF preview`}
                      className="h-full w-full rounded-md border"
                      onLoad={() => setPreviewLoading(false)}
                      onError={() => {
                        setPreviewLoading(false)
                        toast.error("Failed to load PDF preview")
                      }}
                    />
                  </div>
                ) : previewLoading ? (
                  <div className="flex h-[70vh] min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading PDF preview...
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    No PDF attached yet. Add one from the header actions.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="citations" className="mt-4">
            <CitationPanel paper={paper} />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <NoteEditor
              paperId={paper.id}
              notes={notes}
              onRefresh={loadPaper}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
