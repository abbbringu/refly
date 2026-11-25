"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/utils/supabase/client"
import { FOLDER_SELECT, PAPER_LIST_SELECT } from "@/lib/db/selects"
import { REFLY_DATA_UPDATED_EVENT, shouldHandleReflyDataUpdate } from "@/lib/refly-events"
import type { Paper, Folder } from "@/types"
import { PaperTable, PaperTableColumnsButton } from "@/components/papers/paper-table"
import { PaperDetailSheet } from "@/components/papers/paper-detail-sheet"
import { PaperCard } from "@/components/papers/paper-card"
import { AddPaperDialog } from "@/components/papers/add-paper-dialog"
import { BatchProcessDialog } from "@/components/papers/batch-process-dialog"
import { MoveToFolderDialog } from "@/components/papers/move-to-folder-dialog"
import { ExportDialog } from "@/components/import-export/export-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Plus,
  Search,
  LayoutGrid,
  LayoutList,
  FolderOpen,
  Users,
  MessageSquare,
  FileText,
  Sparkles,
  FolderInput,
  Trash2,
  Download,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PaperBatchActions } from "@/components/papers/paper-batch-actions"
import { getMapIcon } from "@/lib/entity-appearance"

export default function TeamFolderPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.teamId as string
  const folderId = params.folderId as string

  const [folder, setFolder] = useState<Folder | null>(null)
  const [subfolders, setSubfolders] = useState<Folder[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedPapers, setSelectedPapers] = useState<string[]>([])
  const lastSelectedRef = useRef<string | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [batchProcessOpen, setBatchProcessOpen] = useState(false)
  const [batchProcessMode, setBatchProcessMode] = useState<"pdf" | "enrich">("pdf")
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [folderRes, paperIdsRes, subRes] = await Promise.all([
      supabase.from("folders").select(FOLDER_SELECT).eq("id", folderId).single(),
      supabase.from("paper_folders").select("paper_id").eq("folder_id", folderId),
      supabase.from("folders").select(FOLDER_SELECT).eq("parent_id", folderId).order("name"),
    ])

    if (folderRes.data) setFolder(folderRes.data)
    if (subRes.data) setSubfolders(subRes.data)

    if (paperIdsRes.data && paperIdsRes.data.length > 0) {
      const ids = paperIdsRes.data.map((pf: any) => pf.paper_id)
      const { data: papersData } = await supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .in("id", ids)
        .order("created_at", { ascending: false })
      setPapers(papersData ?? [])
    } else {
      setPapers([])
    }

    setLoading(false)
  }, [folderId])

  const refreshData = useCallback(async () => {
    const supabase = createClient()

    const [folderRes, paperIdsRes, subRes] = await Promise.all([
      supabase.from("folders").select(FOLDER_SELECT).eq("id", folderId).single(),
      supabase.from("paper_folders").select("paper_id").eq("folder_id", folderId),
      supabase.from("folders").select(FOLDER_SELECT).eq("parent_id", folderId).order("name"),
    ])

    if (folderRes.data) setFolder(folderRes.data)
    if (subRes.data) setSubfolders(subRes.data)

    if (paperIdsRes.data && paperIdsRes.data.length > 0) {
      const ids = paperIdsRes.data.map((pf: any) => pf.paper_id)
      const { data: papersData } = await supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .in("id", ids)
        .order("created_at", { ascending: false })
      setPapers(papersData ?? [])
    } else {
      setPapers([])
    }
  }, [folderId])

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
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleDataUpdated = (event: Event) => {
      if (!shouldHandleReflyDataUpdate(event, ["paper", "folder"])) return
      refreshData()
    }

    window.addEventListener(REFLY_DATA_UPDATED_EVENT, handleDataUpdated)
    return () => window.removeEventListener(REFLY_DATA_UPDATED_EVENT, handleDataUpdated)
  }, [refreshData])

  const filteredPapers = papers.filter((p) => {
    const matchesType = typeFilter === "all" || p.paper_type === typeFilter
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.authors?.some((a) => a.toLowerCase().includes(search.toLowerCase()))
    return matchesType && matchesSearch
  })

  const handleCardSelect = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedRef.current) {
      const lastIndex = filteredPapers.findIndex((p) => p.id === lastSelectedRef.current)
      const currentIndex = filteredPapers.findIndex((p) => p.id === id)
      const start = Math.min(lastIndex, currentIndex)
      const end = Math.max(lastIndex, currentIndex)
      const rangeIds = filteredPapers.slice(start, end + 1).map((p) => p.id)
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

  const ActiveMapIcon = getMapIcon(folder?.icon)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ActiveMapIcon
            className="h-5 w-5"
            style={{ color: folder?.color ?? undefined }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {folder?.name || "Folder"}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                Team
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {filteredPapers.length} paper
              {filteredPapers.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Paper
        </Button>
      </div>

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

      <PaperBatchActions
        selectedPapers={selectedPapers}
        teamId={teamId}
        folderId={folderId}
        onClear={() => { lastSelectedRef.current = null; setSelectedPapers([]) }}
        onRefresh={refreshData}
        onPaperDeleted={handlePaperDeleted}
        onMove={() => setMoveDialogOpen(true)}
        onExport={() => setExportDialogOpen(true)}
        onBatchProcess={(mode) => {
          setBatchProcessMode(mode)
          setBatchProcessOpen(true)
        }}
      />

      {!loading && subfolders.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5 mb-2">
          {subfolders.map((f) => {
            const MapIcon = getMapIcon(f.icon)
            return (
            <Link
              key={f.id}
              href={`/teams/${teamId}/folder/${f.id}`}
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <MapIcon
                className="h-4 w-4 shrink-0"
                style={{ color: f.color ?? undefined }}
              />
              <span className="truncate font-medium">{f.name}</span>
            </Link>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filteredPapers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-semibold">No papers in this folder</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add papers or move existing ones here.
          </p>
        </div>
      ) : viewMode === "table" ? (
<PaperTable
           papers={filteredPapers}
           selectedPapers={selectedPapers}
           onSelectionChange={setSelectedPapers}
           onRefresh={refreshData}
           onPaperDeleted={handlePaperDeleted}
           onPaperUpdated={handlePaperUpdated}
           onPaperClick={(paperId) => {
             setSelectedPaperId(paperId)
             setSheetOpen(true)
           }}
           folderId={folderId}
         />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPapers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onRefresh={refreshData}
              onPaperUpdated={handlePaperUpdated}
              selected={selectedPapers.includes(paper.id)}
              onSelect={handleCardSelect}
            />
          ))}
        </div>
      )}

      <AddPaperDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={() => {
          setAddDialogOpen(false)
          loadData()
        }}
        teamId={teamId}
        folderId={folderId}
      />

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        papers={selectedPapers.length > 0
          ? filteredPapers.filter((p) => selectedPapers.includes(p.id))
          : filteredPapers
        }
      />

      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        paperIds={selectedPapers}
        onSuccess={() => {
          setSelectedPapers([])
          loadData()
        }}
      />

      <BatchProcessDialog
        open={batchProcessOpen}
        onOpenChange={setBatchProcessOpen}
        papers={papers.filter((p) => selectedPapers.includes(p.id))}
        mode={batchProcessMode}
        onSuccess={loadData}
      />

      <PaperDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        paperId={selectedPaperId}
        onRefresh={refreshData}
        onPaperDeleted={handlePaperDeleted}
        onPaperUpdated={handlePaperUpdated}
        onNavigate={(paperId) => router.push(`/paper/${paperId}`)}
      />
    </div>
  )
}
