"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"

import { createClient } from "@/utils/supabase/client"
import { PAPER_LIST_SELECT, TAG_SELECT } from "@/lib/db/selects"
import { REFLY_DATA_UPDATED_EVENT, shouldHandleReflyDataUpdate } from "@/lib/refly-events"
import type { Paper, Tag } from "@/types"
import { PaperTable, PaperTableColumnsButton } from "@/components/papers/paper-table"
import { PaperDetailSheet } from "@/components/papers/paper-detail-sheet"
import { AddPaperDialog } from "@/components/papers/add-paper-dialog"
import { ExportDialog } from "@/components/import-export/export-dialog"
import { BulkImportDialog } from "@/components/import-export/bulk-import-dialog"
import { MoveToFolderDialog } from "@/components/papers/move-to-folder-dialog"
import { BatchProcessDialog } from "@/components/papers/batch-process-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Search,
  Download,
  Upload,
  LayoutGrid,
  LayoutList,
  X,
  Tag as TagIcon,
} from "lucide-react"
import { PaperCard } from "@/components/papers/paper-card"
import { PaperBatchActions } from "@/components/papers/paper-batch-actions"

export default function LibraryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tagId = searchParams.get("tag")
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [batchProcessOpen, setBatchProcessOpen] = useState(false)
  const [batchProcessMode, setBatchProcessMode] = useState<"pdf" | "enrich">("pdf")
  const [selectedPapers, setSelectedPapers] = useState<string[]>([])
  const [activeTag, setActiveTag] = useState<Tag | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const lastSelectedRef = useRef<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const isDraggingRef = useRef(false)

  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    isDraggingRef.current = true
    setMarquee({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY })
  }

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !marquee) return
    setMarquee({ ...marquee, endX: e.clientX, endY: e.clientY })
  }

  const handleGridMouseUp = () => {
    if (!isDraggingRef.current || !marquee) return
    isDraggingRef.current = false

    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) {
      setMarquee(null)
      return
    }

    const x1 = Math.min(marquee.startX, marquee.endX) - rect.left
    const y1 = Math.min(marquee.startY, marquee.endY) - rect.top
    const x2 = Math.max(marquee.startX, marquee.endX) - rect.left
    const y2 = Math.max(marquee.startY, marquee.endY) - rect.top

    const cards = gridRef.current?.querySelectorAll('[data-paper-card]')
    if (cards) {
      const selected: string[] = []
      cards.forEach((card) => {
        const el = card as HTMLElement
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2 - rect.left
        const cy = r.top + r.height / 2 - rect.top
        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
          const id = el.dataset.paperCard
          if (id) selected.push(id)
        }
      })
      if (selected.length > 0) {
        setSelectedPapers(selected)
      }
    }

    setMarquee(null)
  }

  const loadPapers = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    if (tagId) {
      const { data: tagData } = await supabase
        .from("tags")
        .select(TAG_SELECT)
        .eq("id", tagId)
        .single()
      setActiveTag(tagData ?? null)

      const { data: paperTagData } = await supabase
        .from("paper_tags")
        .select("paper_id")
        .eq("tag_id", tagId)
      const paperIds = paperTagData?.map((pt: { paper_id: string }) => pt.paper_id) ?? []

      if (paperIds.length === 0) {
        setPapers([])
        setLoading(false)
        return
      }

      let query = supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .is("team_id", null)
        .in("id", paperIds)
        .order("created_at", { ascending: false })

      if (typeFilter !== "all") {
        query = query.eq("paper_type", typeFilter)
      }

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,abstract.ilike.%${search}%,doi.ilike.%${search}%`,
        )
      }

      const { data } = await query
      setPapers(data ?? [])
    } else {
      setActiveTag(null)

      let query = supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .is("team_id", null)
        .order("created_at", { ascending: false })

      if (typeFilter !== "all") {
        query = query.eq("paper_type", typeFilter)
      }

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,abstract.ilike.%${search}%,doi.ilike.%${search}%`,
        )
      }

      const { data } = await query
      setPapers(data ?? [])
    }

    setLoading(false)
  }, [search, typeFilter, tagId])

  const refreshPapers = useCallback(async () => {
    const supabase = createClient()

    if (tagId) {
      const { data: tagData } = await supabase
        .from("tags")
        .select(TAG_SELECT)
        .eq("id", tagId)
        .single()
      setActiveTag(tagData ?? null)

      const { data: paperTagData } = await supabase
        .from("paper_tags")
        .select("paper_id")
        .eq("tag_id", tagId)
      const paperIds = paperTagData?.map((pt: { paper_id: string }) => pt.paper_id) ?? []

      if (paperIds.length === 0) {
        setPapers([])
        return
      }

      let query = supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .is("team_id", null)
        .in("id", paperIds)
        .order("created_at", { ascending: false })

      if (typeFilter !== "all") {
        query = query.eq("paper_type", typeFilter)
      }

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,abstract.ilike.%${search}%,doi.ilike.%${search}%`,
        )
      }

      const { data } = await query
      setPapers(data ?? [])
    } else {
      setActiveTag(null)

      let query = supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .is("team_id", null)
        .order("created_at", { ascending: false })

      if (typeFilter !== "all") {
        query = query.eq("paper_type", typeFilter)
      }

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,abstract.ilike.%${search}%,doi.ilike.%${search}%`,
        )
      }

      const { data } = await query
      setPapers(data ?? [])
    }
  }, [search, typeFilter, tagId])

  const handlePaperDeleted = useCallback((deletedIds: string[]) => {
    const deletedSet = new Set(deletedIds)
    setPapers((prev) => prev.filter((p) => !deletedSet.has(p.id)))
    setSelectedPapers((prev) => prev.filter((id) => !deletedSet.has(id)))
  }, [])

  const handlePaperUpdated = useCallback((paperId: string, updates: Partial<Paper>) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === paperId ? { ...p, ...updates } : p))
    )
  }, [])

  useEffect(() => {
    loadPapers()
  }, [loadPapers])

  useEffect(() => {
    const handleDataUpdated = (event: Event) => {
      if (!shouldHandleReflyDataUpdate(event, ["paper", "tag"])) return
      refreshPapers()
    }

    window.addEventListener(REFLY_DATA_UPDATED_EVENT, handleDataUpdated)
    return () => window.removeEventListener(REFLY_DATA_UPDATED_EVENT, handleDataUpdated)
  }, [refreshPapers])

  const handlePaperAdded = () => {
    loadPapers()
    setAddDialogOpen(false)
  }

  const handleCardSelect = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedRef.current) {
      const lastIndex = papers.findIndex((p) => p.id === lastSelectedRef.current)
      const currentIndex = papers.findIndex((p) => p.id === id)
      const start = Math.min(lastIndex, currentIndex)
      const end = Math.max(lastIndex, currentIndex)
      const rangeIds = papers.slice(start, end + 1).map((p) => p.id)
      setSelectedPapers(rangeIds)
    } else if (e.metaKey || e.ctrlKey) {
      if (selectedPapers.includes(id)) {
        lastSelectedRef.current = null
        setSelectedPapers(selectedPapers.filter((s) => s !== id))
      } else {
        lastSelectedRef.current = id
        setSelectedPapers([...selectedPapers, id])
      }
    } else {
      lastSelectedRef.current = id
      setSelectedPapers([id])
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            {papers.length} paper{papers.length !== 1 ? "s" : ""} in your
            library
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
            className="glass-hover"
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportDialogOpen(true)}
            disabled={papers.length === 0}
            className="glass-hover"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Paper
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter papers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 glass-1"
            />
          </div>
          
          <div className="flex-1" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 !h-6 !px-2 !py-0 !text-xs/relaxed border-border bg-transparent hover:bg-input/50 hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground dark:bg-input/30">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent align="end" position="popper" className="p-1">
              <SelectItem value="all" className="!min-h-7 !py-1.5 !px-2 !text-xs">All types</SelectItem>
              <SelectItem value="article" className="!min-h-7 !py-1.5 !px-2 !text-xs">Article</SelectItem>
              <SelectItem value="book" className="!min-h-7 !py-1.5 !px-2 !text-xs">Book</SelectItem>
              <SelectItem value="conference" className="!min-h-7 !py-1.5 !px-2 !text-xs">Conference</SelectItem>
              <SelectItem value="thesis" className="!min-h-7 !py-1.5 !px-2 !text-xs">Thesis</SelectItem>
              <SelectItem value="report" className="!min-h-7 !py-1.5 !px-2 !text-xs">Report</SelectItem>
              <SelectItem value="preprint" className="!min-h-7 !py-1.5 !px-2 !text-xs">Preprint</SelectItem>
              <SelectItem value="webpage" className="!min-h-7 !py-1.5 !px-2 !text-xs">Webpage</SelectItem>
              <SelectItem value="other" className="!min-h-7 !py-1.5 !px-2 !text-xs">Other</SelectItem>
            </SelectContent>
          </Select>
          {viewMode === "table" && <PaperTableColumnsButton />}
          <div className="flex items-center rounded-xl border border-border/40 glass-1 overflow-hidden">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={() => setViewMode("table")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {activeTag && (
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtered by tag:</span>
          <span
            className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-0.5 text-sm"
            style={{ borderColor: activeTag.color ? `${activeTag.color}60` : undefined, backgroundColor: activeTag.color ? `${activeTag.color}15` : undefined }}
          >
            {activeTag.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => router.push("/library")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <PaperBatchActions
        selectedPapers={selectedPapers}
        teamId="personal"
        onClear={() => { lastSelectedRef.current = null; setSelectedPapers([]) }}
        onRefresh={refreshPapers}
        onPaperDeleted={handlePaperDeleted}
        onMove={() => setMoveDialogOpen(true)}
        onExport={() => setExportDialogOpen(true)}
        onBatchProcess={(mode) => {
          setBatchProcessMode(mode)
          setBatchProcessOpen(true)
        }}
      />

      {/* Content */}
      {loading ? (
        viewMode === "table" ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-4 mb-4">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-24" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        )
      ) : papers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-20 text-center glass-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold">No papers yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first paper to get started
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Paper
          </Button>
        </div>
      ) : viewMode === "table" ? (
        <PaperTable
          papers={papers}
          selectedPapers={selectedPapers}
          onSelectionChange={setSelectedPapers}
          onRefresh={refreshPapers}
          onPaperDeleted={handlePaperDeleted}
          onPaperUpdated={handlePaperUpdated}
          onPaperClick={(paperId) => {
            setSelectedPaperId(paperId)
            setSheetOpen(true)
          }}
        />
      ) : (
        <div
          ref={gridRef}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 select-none"
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
        >
          {papers.map((paper) => (
            <div key={paper.id} data-paper-card={paper.id}>
              <PaperCard
                paper={paper}
                onRefresh={refreshPapers}
                onPaperUpdated={handlePaperUpdated}
                selected={selectedPapers.includes(paper.id)}
                onSelect={handleCardSelect}
              />
            </div>
          ))}
          {marquee && (
            <div
              className="fixed pointer-events-none border-2 border-primary/50 bg-primary/10 z-50"
              style={{
                left: Math.min(marquee.startX, marquee.endX),
                top: Math.min(marquee.startY, marquee.endY),
                width: Math.abs(marquee.endX - marquee.startX),
                height: Math.abs(marquee.endY - marquee.startY),
              }}
            />
          )}
        </div>
      )}

      <AddPaperDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handlePaperAdded}
      />

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        papers={selectedPapers.length > 0
          ? papers.filter((p) => selectedPapers.includes(p.id))
          : papers
        }
      />

      <BulkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => {
          setImportDialogOpen(false)
          loadPapers()
        }}
      />

      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        paperIds={selectedPapers}
        onSuccess={() => {
          setSelectedPapers([])
          loadPapers()
        }}
      />

      <BatchProcessDialog
        open={batchProcessOpen}
        onOpenChange={setBatchProcessOpen}
        papers={papers.filter((p) => selectedPapers.includes(p.id))}
        mode={batchProcessMode}
        onSuccess={loadPapers}
      />

      <PaperDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        paperId={selectedPaperId}
        onRefresh={refreshPapers}
        onPaperDeleted={handlePaperDeleted}
        onPaperUpdated={handlePaperUpdated}
        onNavigate={(paperId) => router.push(`/paper/${paperId}`)}
      />
    </div>
  )
}
