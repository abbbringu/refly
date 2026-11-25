"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { createClient } from "@/utils/supabase/client"
import { NOTE_SELECT, PAPER_FILE_SELECT, PAPER_SELECT } from "@/lib/db/selects"
import { dispatchReflyDataUpdated } from "@/lib/refly-events"
import type { Paper, PaperFile, Note, Tag } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CitationPanel } from "@/components/citations/citation-panel"
import { AIDataNotice } from "@/components/ai/ai-data-notice"
import { NoteEditor } from "@/components/notes/note-editor"
import { TagInput, type SuggestedTag } from "@/components/papers/tag-input"
import {
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Star,
  Trash2,
  Quote,
  PenTool,
  Search,
  Upload,
  Wand2,
  Pencil,
  Save,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import {
  deletePapersById,
  deletePdfForPaper,
} from "@/lib/papers/delete-papers-client"
import { useConfirm } from "@/components/confirm-provider"

interface PaperDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paperId: string | null
  onRefresh: () => void
  onPaperDeleted: (paperIds: string[]) => void
  onPaperUpdated: (paperId: string, updates: Partial<Paper>) => void
  onNavigate: (paperId: string) => void
}

export function PaperDetailSheet({
  open,
  onOpenChange,
  paperId,
  onRefresh,
  onPaperDeleted,
  onPaperUpdated,
  onNavigate,
}: PaperDetailSheetProps) {
  const [paper, setPaper] = useState<Paper | null>(null)
  const [files, setFiles] = useState<PaperFile[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const confirm = useConfirm()
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
  const [sheetWidth, setSheetWidth] = useState(900)
  const [mounted, setMounted] = useState(false)
  const MIN_WIDTH = 600
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const pdfFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const max = window.innerWidth * 0.9
      setSheetWidth((prev) => Math.min(prev, max))
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !panelRef.current) return
      const delta = startXRef.current - e.clientX
      const max = window.innerWidth * 0.9
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(max, startWidthRef.current + delta)
      )
      panelRef.current.style.width = `${newWidth}px`
    }

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      if (panelRef.current) {
        panelRef.current.style.transition = ""
        setSheetWidth(parseFloat(panelRef.current.style.width))
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = sheetWidth
    if (panelRef.current) {
      panelRef.current.style.transition = "none"
    }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const loadPaper = useCallback(async () => {
    if (!paperId) return
    setLoading(true)
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
    if (paperId && open) {
      loadPaper()
    }
  }, [paperId, open, loadPaper])

  const handleSave = async () => {
    if (!paperId) return
    setSaving(true)
    const supabase = createClient()

    const updates = {
      title: editForm.title,
      authors: editForm.authors,
      year: editForm.year,
      abstract: editForm.abstract,
      paper_type: editForm.paper_type,
      doi: editForm.doi,
      url: editForm.url,
      metadata: editForm.metadata,
    }

    const { error } = await supabase
      .from("papers")
      .update(updates)
      .eq("id", paperId)

    if (error) {
      toast.error("Failed to save changes")
    } else {
      toast.success("Changes saved")
      setEditing(false)
      setPaper((prev) =>
        prev
          ? {
              ...prev,
              ...updates,
              title: updates.title ?? prev.title,
              authors: updates.authors ?? prev.authors,
              year: updates.year !== undefined ? updates.year : prev.year,
              abstract: updates.abstract !== undefined ? updates.abstract : prev.abstract,
              paper_type: updates.paper_type ?? prev.paper_type,
              doi: updates.doi !== undefined ? updates.doi : prev.doi,
              url: updates.url !== undefined ? updates.url : prev.url,
              metadata: updates.metadata ?? prev.metadata,
            }
          : prev
      )
      onPaperUpdated(paperId, updates)
      onRefresh()
    }
    setSaving(false)
  }

  const handleToggleFavorite = async () => {
    if (!paper) return
    const newValue = !paper.is_favorite
    setPaper((prev) => (prev ? { ...prev, is_favorite: newValue } : prev))
    onPaperUpdated(paper.id, { is_favorite: newValue })

    const supabase = createClient()
    const { error } = await supabase
      .from("papers")
      .update({ is_favorite: newValue })
      .eq("id", paper.id)

    if (error) {
      toast.error("Failed to update")
      onRefresh()
    }
  }

  const handleOpenPDF = async () => {
    const file =
      files.find((f) => f.mime_type === "application/pdf") ?? files[0]
    if (!file) {
      toast.info("No PDF attached yet")
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from("papers")
      .createSignedUrl(file.file_path, 3600)

    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank")
    } else {
      toast.error("Failed to load PDF")
    }
  }

  useEffect(() => {
    setPreviewUrl(null)
    setPreviewLoading(false)
  }, [files])

  useEffect(() => {
    if (activeTab !== "preview" || previewUrl || previewLoading) return

    const file =
      files.find((f) => f.mime_type === "application/pdf") ?? files[0]
    if (!file) return

    let cancelled = false

    const loadPreview = async () => {
      setPreviewLoading(true)

      if (!cancelled) {
        setPreviewUrl(
          `/api/papers/preview-pdf?paperId=${paperId}&t=${Date.now()}`
        )
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [activeTab, files, paperId, previewLoading, previewUrl])

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

    onPaperDeleted([paper.id])
    onOpenChange(false)

    try {
      const result = await deletePapersById([paper.id])
      if (result.deletedCount !== 1) {
        toast.error(result.errors[0] || "Failed to delete paper")
        onRefresh()
        return
      }

      toast.success("Paper deleted")
    } catch (error) {
      toast.error("Failed to delete paper")
      console.error(error)
      onRefresh()
    }
  }

  const handleResolvePdf = async () => {
    if (!paperId) return
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
    if (!file || !paperId) return

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

  const handleRemovePdf = async () => {
    if (!paperId) return
    if (
      !(await confirm({
        title: "Remove attached PDF?",
        description: "You can upload or find a new one later.",
        variant: "destructive",
        actionLabel: "Remove",
      }))
    )
      return

    try {
      await deletePdfForPaper(paperId)
      toast.success("PDF removed")
      await loadPaper()
    } catch (error) {
      toast.error("Failed to remove PDF")
      console.error(error)
    }
  }

  const handleAutoTag = async () => {
    if (!paperId) return
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
    if (!paperId) return
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
    if (names.length === 0 || !paperId) return
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
      onRefresh()
    } catch (error) {
      console.error(error)
      toast.error("Failed to apply tags")
    } finally {
      setApplyingSuggestions(false)
    }
  }

  if (!open || !mounted) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] animate-in bg-black/20 duration-300 fade-in-0"
        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 z-[10000] flex animate-in flex-col border-l bg-popover shadow-2xl duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] fade-in-0 slide-in-from-right-10"
        style={{ width: sheetWidth, top: 0, height: "100vh" }}
      >
        <div
          className="group absolute inset-y-0 -left-1 z-50 w-3 cursor-col-resize"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-primary/40 group-active:bg-primary/50" />
        </div>

        <div className="flex shrink-0 items-center gap-1 border-b bg-muted/20 p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onOpenChange(false)}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onNavigate(paperId!)}
            title="Open in full page"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1" />
          {paper && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleToggleFavorite}
              title="Toggle favorite"
            >
              <Star
                className={`h-4 w-4 ${paper.is_favorite ? "fill-amber-400 text-amber-400" : ""}`}
              />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : paper ? (
            <div className="mx-auto w-full max-w-[960px] space-y-5 p-5">
              {/* Title */}
              <div>
                {editing ? (
                  <input
                    value={editForm.title ?? ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                    className="w-full border-b border-border bg-transparent pb-1 text-lg font-bold outline-none focus:border-primary"
                  />
                ) : (
                  <h2 className="text-lg leading-tight font-semibold">
                    {paper.title}
                  </h2>
                )}

                {editing ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted-foreground">
                        Type
                      </label>
                      <select
                        value={editForm.paper_type ?? "article"}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            paper_type: e.target.value as Paper["paper_type"],
                          })
                        }
                        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
                      >
                        <option value="article">Article</option>
                        <option value="book">Book</option>
                        <option value="conference">Conference</option>
                        <option value="thesis">Thesis</option>
                        <option value="report">Report</option>
                        <option value="webpage">Webpage</option>
                        <option value="preprint">Preprint</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted-foreground">
                        Year
                      </label>
                      <input
                        type="number"
                        value={editForm.year ?? ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            year: e.target.value
                              ? parseInt(e.target.value)
                              : null,
                          })
                        }
                        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {paper.paper_type}
                    </Badge>
                    {paper.year && <span>· {paper.year}</span>}
                    {paper.doi && (
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        DOI
                        <ExternalLink className="h-2.5 w-2.5" />
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
                <div className="mt-2">
                  {editing ? (
                    <input
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
                      className="w-full border-b border-border bg-transparent pb-1 text-sm outline-none focus:border-primary"
                      placeholder="Authors (comma-separated)"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {paper.authors?.join(", ") || "No authors listed"}
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="w-full flex-1">
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
                    className="shrink-0 border-indigo-200 bg-indigo-50/50 text-indigo-600 hover:bg-indigo-100/50"
                  >
                    {autoTagging ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {autoTagging ? "Analyzing..." : "Auto-tag"}
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {files.length > 0 ? (
                  <>
                    <Button
                      size="sm"
                      onClick={handleOpenPDF}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={handleRemovePdf}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove PDF
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleResolvePdf}
                      disabled={resolvingPdf}
                    >
                      {resolvingPdf ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="mr-1.5 h-3.5 w-3.5" />
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
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
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
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Open Source
                        </a>
                      </Button>
                    )}
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
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  AI Summary & Notes
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
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={handleDelete}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </>
                )}
              </div>

              <AIDataNotice>
                PDF upload and AI tools may send extracted PDF text, paper
                metadata, abstracts, notes, and citation evidence to
                OpenAI/OpenRouter and routed model providers for indexing,
                summaries, tags, citations, and chat.
              </AIDataNotice>

              {files.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  No PDF attached. Use &quot;Find PDF&quot; to auto-discover, or
                  upload manually.
                </div>
              )}

              <Separator />

              {/* Tabs */}
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="flex h-10 w-full rounded-xl bg-muted/50 p-1">
                  <TabsTrigger
                    value="details"
                    className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Details
                  </TabsTrigger>
                  <TabsTrigger
                    value="preview"
                    className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger
                    value="citations"
                    className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Quote className="h-3.5 w-3.5" />
                    Citations
                  </TabsTrigger>
                  <TabsTrigger
                    value="notes"
                    className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <PenTool className="h-3.5 w-3.5" />
                    Notes ({notes.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-4">
                  {/* Abstract */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="mb-2 text-sm font-medium">Abstract</h3>
                    {editing ? (
                      <textarea
                        value={editForm.abstract ?? ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, abstract: e.target.value })
                        }
                        rows={6}
                        className="w-full resize-none rounded-md border border-border bg-transparent p-2 text-sm outline-none focus:border-primary"
                      />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                        {paper.abstract || "No abstract available."}
                      </p>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="mb-3 text-sm font-medium">Metadata</h3>
                    {editing ? (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            DOI
                          </label>
                          <input
                            value={editForm.doi ?? ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                doi: e.target.value || null,
                              })
                            }
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            URL
                          </label>
                          <input
                            value={editForm.url ?? ""}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                url: e.target.value || null,
                              })
                            }
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            Journal
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            Volume
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            Issue
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            Pages
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            Publisher
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            arXiv ID
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">
                            ISBN
                          </label>
                          <input
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
                            className="w-full rounded-md border border-border bg-transparent px-2 py-1 outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {paper.doi && (
                          <>
                            <dt className="text-muted-foreground">DOI</dt>
                            <dd className="font-mono">{paper.doi}</dd>
                          </>
                        )}
                        {paper.metadata?.journal && (
                          <>
                            <dt className="text-muted-foreground">Journal</dt>
                            <dd>{paper.metadata.journal as string}</dd>
                          </>
                        )}
                        {paper.metadata?.volume && (
                          <>
                            <dt className="text-muted-foreground">Volume</dt>
                            <dd>{paper.metadata.volume as string}</dd>
                          </>
                        )}
                        {paper.metadata?.issue && (
                          <>
                            <dt className="text-muted-foreground">Issue</dt>
                            <dd>{paper.metadata.issue as string}</dd>
                          </>
                        )}
                        {paper.metadata?.pages && (
                          <>
                            <dt className="text-muted-foreground">Pages</dt>
                            <dd>{paper.metadata.pages as string}</dd>
                          </>
                        )}
                        {paper.metadata?.publisher && (
                          <>
                            <dt className="text-muted-foreground">Publisher</dt>
                            <dd>{paper.metadata.publisher as string}</dd>
                          </>
                        )}
                        {paper.metadata?.arxiv_id && !paper.doi && (
                          <>
                            <dt className="text-muted-foreground">arXiv ID</dt>
                            <dd>
                              <a
                                href={`https://arxiv.org/abs/${paper.metadata.arxiv_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {paper.metadata.arxiv_id as string}
                              </a>
                            </dd>
                          </>
                        )}
                        {paper.metadata?.isbn && (
                          <>
                            <dt className="text-muted-foreground">ISBN</dt>
                            <dd>{paper.metadata.isbn as string}</dd>
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
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="mt-4">
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="mb-2 text-sm font-medium">PDF Preview</h3>
                    {previewUrl ? (
                      <div className="relative h-[60vh] min-h-[280px]">
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
                      <div className="flex h-[60vh] min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading PDF preview...
                      </div>
                    ) : (
                      <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                        No PDF attached yet. Add one from the actions above.
                      </div>
                    )}
                  </div>
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

              <input
                ref={pdfFileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleUploadPdf}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">Paper not found</p>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
