"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState, useMemo, useEffect, useRef } from "react"
import type { Paper } from "@/types"
import { createClient } from "@/utils/supabase/client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MoreHorizontal,
  Trash2,
  Star,
  StarOff,
  ExternalLink,
  Copy,
  FileText,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Settings2,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { deletePapersById } from "@/lib/papers/delete-papers-client"
import { removePapersFromFolder } from "@/lib/papers/remove-from-folder-client"
import { useConfirm } from "@/components/confirm-provider"

interface PaperTableProps {
  papers: Paper[]
  selectedPapers: string[]
  onSelectionChange: (ids: string[]) => void
  onRefresh: () => void
  onPaperDeleted: (paperIds: string[]) => void
  onPaperUpdated: (paperId: string, updates: Partial<Paper>) => void
  onPaperClick?: (paperId: string) => void
  folderId?: string
}

export type TableColumnKey =
  | "title"
  | "authors"
  | "year"
  | "publisher"
  | "paper_type"
  | "created_at"
  | "size"
  | "has_pdf"

const PAPER_TABLE_COLUMNS_STORAGE_KEY = "refly-paper-table-columns"
const PAPER_TABLE_COLUMNS_UPDATED_EVENT = "refly-paper-table-columns-updated"

const DEFAULT_VISIBLE_COLUMNS: TableColumnKey[] = [
  "title",
  "authors",
  "year",
  "publisher",
  "paper_type",
  "created_at",
  "size",
  "has_pdf",
]

const COLUMN_OPTIONS: Array<{ key: TableColumnKey; label: string }> = [
  { key: "title", label: "Title" },
  { key: "authors", label: "Authors" },
  { key: "year", label: "Year" },
  { key: "publisher", label: "Publisher" },
  { key: "paper_type", label: "Type" },
  { key: "created_at", label: "Added" },
  { key: "size", label: "Size" },
  { key: "has_pdf", label: "PDF" },
]

function getPaperPublisher(paper: Paper): string {
  const publisher = paper.metadata?.publisher
  return typeof publisher === "string" ? publisher : ""
}

function getInitialVisibleColumns(): TableColumnKey[] {
  if (typeof window === "undefined") {
    return DEFAULT_VISIBLE_COLUMNS
  }

  const savedColumns = window.localStorage.getItem(PAPER_TABLE_COLUMNS_STORAGE_KEY)
  if (!savedColumns) {
    return DEFAULT_VISIBLE_COLUMNS
  }

  try {
    const parsed = JSON.parse(savedColumns)
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS

    const next = parsed.filter(
      (value): value is TableColumnKey =>
        typeof value === "string" &&
        COLUMN_OPTIONS.some((column) => column.key === value),
    )

    return next.length > 0 ? next : DEFAULT_VISIBLE_COLUMNS
  } catch {
    return DEFAULT_VISIBLE_COLUMNS
  }
}

function persistVisibleColumns(columns: TableColumnKey[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PAPER_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(columns))
  window.dispatchEvent(
    new CustomEvent<TableColumnKey[]>(PAPER_TABLE_COLUMNS_UPDATED_EVENT, {
      detail: columns,
    }),
  )
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const rounded = value >= 10 || unitIndex === 0
    ? Math.round(value)
    : Math.round(value * 10) / 10

  return `${rounded} ${units[unitIndex]}`
}

export function PaperTableColumnsButton({
  className,
}: {
  className?: string
}) {
  const [visibleColumns, setVisibleColumns] = useState<TableColumnKey[]>(getInitialVisibleColumns)
  const didMountRef = useRef(false)

  useEffect(() => {
    const handleColumnsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<TableColumnKey[]>
      if (!Array.isArray(customEvent.detail)) return
      setVisibleColumns(customEvent.detail)
    }

    window.addEventListener(PAPER_TABLE_COLUMNS_UPDATED_EVENT, handleColumnsUpdated)

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PAPER_TABLE_COLUMNS_STORAGE_KEY) return
      setVisibleColumns(getInitialVisibleColumns())
    }

    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(PAPER_TABLE_COLUMNS_UPDATED_EVENT, handleColumnsUpdated)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    persistVisibleColumns(visibleColumns)
  }, [visibleColumns])

  const toggleColumn = (column: TableColumnKey) => {
    setVisibleColumns((current) => {
      const next = current.includes(column)
        ? current.length === 1
          ? current
          : current.filter((value) => value !== column)
        : [...current, column]

      return next
    })
  }

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {COLUMN_OPTIONS.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.key}
              checked={visibleColumns.includes(column.key)}
              onCheckedChange={() => toggleColumn(column.key)}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const typeColors: Record<string, string> = {
  article:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  book: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  conference:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  thesis:
    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  report: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  preprint:
    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  webpage:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
}

export function PaperTable({
  papers,
  selectedPapers,
  onSelectionChange,
  onRefresh,
  onPaperDeleted,
  onPaperUpdated,
  onPaperClick,
  folderId,
}: PaperTableProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const dragPreviewRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const [pdfFilePaths, setPdfFilePaths] = useState<Record<string, string>>({})
  const [paperSizes, setPaperSizes] = useState<Record<string, number>>({})
  const [visibleColumns, setVisibleColumns] = useState<TableColumnKey[]>(getInitialVisibleColumns)
  const allSelected =
    papers.length > 0 && selectedPapers.length === papers.length

  useEffect(() => {
    const handleColumnsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<TableColumnKey[]>
      if (!Array.isArray(customEvent.detail)) return
      setVisibleColumns(customEvent.detail)
    }

    window.addEventListener(PAPER_TABLE_COLUMNS_UPDATED_EVENT, handleColumnsUpdated)

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PAPER_TABLE_COLUMNS_STORAGE_KEY) return
      setVisibleColumns(getInitialVisibleColumns())
    }

    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(PAPER_TABLE_COLUMNS_UPDATED_EVENT, handleColumnsUpdated)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  useEffect(() => {
    const loadPaperStorage = async () => {
      if (papers.length === 0) {
        setPdfFilePaths({})
        setPaperSizes({})
        return
      }

      const supabase = createClient()
      const paperIds = papers.map((paper) => paper.id)

      const [{ data: files, error: filesError }, { data: notes, error: notesError }] = await Promise.all([
        supabase
          .from("paper_files")
          .select("paper_id, file_path, file_size, mime_type, created_at")
          .in("paper_id", paperIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("notes")
          .select("paper_id, content")
          .in("paper_id", paperIds),
      ])

      if (filesError) {
        setPdfFilePaths({})
        setPaperSizes({})
        return
      }

      const nextPdfMap: Record<string, string> = {}
      const sizeMap: Record<string, number> = {}

      for (const file of files ?? []) {
        if (!nextPdfMap[file.paper_id] && file.mime_type === "application/pdf") {
          nextPdfMap[file.paper_id] = file.file_path
        }
        sizeMap[file.paper_id] = (sizeMap[file.paper_id] ?? 0) + Number(file.file_size || 0)
      }

      if (!notesError) {
        const textEncoder = new TextEncoder()
        for (const note of notes ?? []) {
          const noteBytes = textEncoder.encode(note.content ?? "").length
          sizeMap[note.paper_id] = (sizeMap[note.paper_id] ?? 0) + noteBytes
        }
      }

      setPdfFilePaths(nextPdfMap)
      setPaperSizes(sizeMap)
    }

    loadPaperStorage()
  }, [papers])

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(papers.map((p) => p.id))
      lastSelectedRef.current = null
    }
  }

  const [sortConfig, setSortConfig] = useState<{
    key: "title" | "authors" | "year" | "publisher" | "paper_type" | "created_at" | "size" | "has_pdf"
    direction: "asc" | "desc"
  } | null>(null)

  const handleSort = (key: "title" | "authors" | "year" | "publisher" | "paper_type" | "created_at" | "size" | "has_pdf") => {
    setSortConfig((current) => {
      if (current?.key === key) {
        if (current.direction === "asc") return { key, direction: "desc" }
        return null
      }
      return { key, direction: "asc" }
    })
  }

  const sortedPapers = useMemo(() => {
    if (!sortConfig) return papers
    return [...papers].sort((a, b) => {
      const { key, direction } = sortConfig

      if (key === "has_pdf") {
        const aHas = pdfFilePaths[a.id] ? 1 : 0
        const bHas = pdfFilePaths[b.id] ? 1 : 0
        return direction === "asc" ? aHas - bHas : bHas - aHas
      }

      if (key === "size") {
        const aSize = paperSizes[a.id] ?? 0
        const bSize = paperSizes[b.id] ?? 0
        return direction === "asc" ? aSize - bSize : bSize - aSize
      }

      if (key === "publisher") {
        const aPublisher = getPaperPublisher(a)
        const bPublisher = getPaperPublisher(b)
        if (aPublisher < bPublisher) return direction === "asc" ? -1 : 1
        if (aPublisher > bPublisher) return direction === "asc" ? 1 : -1
        return 0
      }

      let valA = a[key] as string | number | null
      let valB = b[key] as string | number | null
      
      if (key === "authors") {
        valA = a.authors?.[0] || ""
        valB = b.authors?.[0] || ""
      }

      const comparableA = valA ?? ""
      const comparableB = valB ?? ""

      if (comparableA < comparableB) return direction === "asc" ? -1 : 1
      if (comparableA > comparableB) return direction === "asc" ? 1 : -1
      return 0
    })
  }, [papers, sortConfig, pdfFilePaths, paperSizes])

  const renderSortIcon = (columnKey: string) => {
    if (sortConfig?.key !== columnKey) return null
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="ml-1 inline-block h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 inline-block h-4 w-4" />
    )
  }

  const lastSelectedRef = useRef<string | null>(null)

  useEffect(() => {
    if (selectedPapers.length === 0) {
      lastSelectedRef.current = null
    }
  }, [selectedPapers.length])

  useEffect(() => {
    if (selectedPapers.length === 0) return

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      if (containerRef.current?.contains(target)) return

      if (
        target.closest(
          "button, a, input, select, textarea, [role='button'], [role='menuitem'], [role='checkbox'], [data-radix-popper-content-wrapper], [data-radix-dialog-content]",
        )
      ) {
        return
      }

      lastSelectedRef.current = null
      onSelectionChange([])
    }

    document.addEventListener("click", handleDocumentClick)
    return () => document.removeEventListener("click", handleDocumentClick)
  }, [onSelectionChange, selectedPapers.length])

  const handleSelect = (id: string, event: React.MouseEvent | React.KeyboardEvent) => {
    if (event.shiftKey && lastSelectedRef.current) {
      const lastIndex = sortedPapers.findIndex((p) => p.id === lastSelectedRef.current)
      const currentIndex = sortedPapers.findIndex((p) => p.id === id)
      const start = Math.min(lastIndex, currentIndex)
      const end = Math.max(lastIndex, currentIndex)
      const rangeIds = sortedPapers.slice(start, end + 1).map((p) => p.id)
      onSelectionChange(rangeIds)
    } else if ((event as React.MouseEvent).metaKey || (event as React.MouseEvent).ctrlKey) {
      if (selectedPapers.includes(id)) {
        lastSelectedRef.current = null
        onSelectionChange(selectedPapers.filter((s) => s !== id))
      } else {
        lastSelectedRef.current = id
        onSelectionChange([...selectedPapers, id])
      }
    } else {
      if (selectedPapers.includes(id)) {
        lastSelectedRef.current = null
        onSelectionChange(selectedPapers.filter((s) => s !== id))
      } else {
        lastSelectedRef.current = id
        onSelectionChange([...selectedPapers, id])
      }
    }
  }

  const handleToggleFavorite = async (paper: Paper) => {
    const newValue = !paper.is_favorite
    onPaperUpdated(paper.id, { is_favorite: newValue })

    const supabase = createClient()
    const { error } = await supabase
      .from("papers")
      .update({ is_favorite: newValue })
      .eq("id", paper.id)

    if (error) {
      toast.error("Failed to update")
      onRefresh()
      return
    }
  }

  const handleDelete = async (paper: Paper) => {
    if (folderId) {
      if (!(await confirm({ title: `Remove "${paper.title}" from this folder?`, variant: "destructive", actionLabel: "Remove" }))) return
      onPaperDeleted([paper.id])
      try {
        const result = await removePapersFromFolder([paper.id], folderId)
        if (result.errors.length > 0) {
          toast.error(result.errors[0] || "Failed to remove from folder")
          onRefresh()
          return
        }
        toast.success("Removed from folder")
      } catch (error) {
        toast.error("Failed to remove from folder")
        console.error(error)
        onRefresh()
      }
    } else {
      if (!(await confirm({ title: `Delete "${paper.title}"?`, description: "This cannot be undone.", variant: "destructive", actionLabel: "Delete" }))) return
      onPaperDeleted([paper.id])
      try {
        const result = await deletePapersById([paper.id])

        if (result.deletedCount !== 1) {
          toast.error(result.errors[0] || "Failed to delete")
          onRefresh()
          return
        }

        toast.success("Paper deleted")
      } catch (error) {
        toast.error("Failed to delete")
        console.error(error)
        onRefresh()
      }
    }
  }

  const handleQuickViewPdf = async (paper: Paper) => {
    const filePath = pdfFilePaths[paper.id]
    if (!filePath) {
      toast.info("No PDF saved for this paper")
      return
    }

    const supabase = createClient()
    const { data: signedData, error: signedUrlError } = await supabase.storage
      .from("papers")
      .createSignedUrl(filePath, 3600)

    if (signedUrlError || !signedData?.signedUrl) {
      toast.error("Could not open PDF")
      return
    }

    window.open(signedData.signedUrl, "_blank")
  }

  // ─── Drag handlers ──────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, paperId: string) => {
    const ids = selectedPapers.includes(paperId)
      ? selectedPapers
      : [paperId]

    e.dataTransfer.setData("application/x-paper-ids", JSON.stringify(ids))
    e.dataTransfer.effectAllowed = "copyMove"

    const ghost = document.createElement("div")
    ghost.textContent = ids.length > 1 ? `${ids.length} papers` : "1 paper"
    ghost.style.cssText =
      "position:fixed;top:-999px;padding:6px 12px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-radius:6px;font-size:13px;font-weight:500;pointer-events:none;white-space:nowrap;z-index:9999"
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)

    setDraggingId(paperId)
    setDragPosition({ x: e.clientX, y: e.clientY })

    if (dragPreviewRef.current) {
      dragPreviewRef.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY - 12}px)`
      dragPreviewRef.current.style.display = ids.length > 1 ? "block" : "none"
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    setDragPosition({ x: e.clientX, y: e.clientY })
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!dragPreviewRef.current) return
      const el = dragPreviewRef.current
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const offsetX = 16
      const offsetY = -12
      let x = e.clientX + offsetX
      let y = e.clientY + offsetY
      if (x + rect.width > vw - 8) x = e.clientX - rect.width - 8
      if (y + rect.height > vh - 8) y = vh - rect.height - 8
      if (y < 8) y = 8
      el.style.transform = `translate(${x}px, ${y}px)`
    })
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragPosition(null)
    cancelAnimationFrame(rafRef.current)
    if (dragPreviewRef.current) {
      dragPreviewRef.current.style.display = "none"
    }
  }

  const draggingIds = draggingId
    ? selectedPapers.includes(draggingId)
      ? selectedPapers
      : [draggingId]
    : []

  const isColumnVisible = (column: TableColumnKey) =>
    visibleColumns.includes(column)

  return (
    <>
    <div ref={containerRef} className="rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead className="w-8" />
            {isColumnVisible("title") && (
              <TableHead className="min-w-[200px] max-w-[400px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("title")}>
                Title {renderSortIcon("title")}
              </TableHead>
            )}
            {isColumnVisible("authors") && (
              <TableHead className="min-w-[150px] max-w-[250px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("authors")}>
                Authors {renderSortIcon("authors")}
              </TableHead>
            )}
            {isColumnVisible("year") && (
              <TableHead className="w-[80px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("year")}>
                Year {renderSortIcon("year")}
              </TableHead>
            )}
            {isColumnVisible("publisher") && (
              <TableHead className="min-w-[160px] max-w-[220px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("publisher")}>
                Publisher {renderSortIcon("publisher")}
              </TableHead>
            )}
            {isColumnVisible("paper_type") && (
              <TableHead className="w-[100px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("paper_type")}>
                Type {renderSortIcon("paper_type")}
              </TableHead>
            )}
            {isColumnVisible("created_at") && (
              <TableHead className="w-[120px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("created_at")}>
                Added {renderSortIcon("created_at")}
              </TableHead>
            )}
            {isColumnVisible("size") && (
              <TableHead className="w-[110px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("size")}>
                Size {renderSortIcon("size")}
              </TableHead>
            )}
            {isColumnVisible("has_pdf") && (
              <TableHead className="w-[100px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort("has_pdf")}>
                PDF {renderSortIcon("has_pdf")}
              </TableHead>
            )}
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPapers.map((paper) => {
            const isDragging = draggingId === paper.id
            const isDragSelected =
              draggingId !== null && selectedPapers.includes(paper.id)
            const isSelected = selectedPapers.includes(paper.id)

            return (
              <TableRow
                key={paper.id}
                data-state={isSelected ? "selected" : undefined}
                className={`group cursor-pointer ${
                  isDragging || isDragSelected
                    ? "opacity-50 bg-muted/30"
                    : ""
                }`}
                draggable
                onDragStart={(e) => handleDragStart(e, paper.id)}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    e.preventDefault()
                    handleSelect(paper.id, e)
                  } else if (onPaperClick) {
                    onPaperClick(paper.id)
                  } else {
                    router.push(`/paper/${paper.id}`)
                  }
                }}
              >
                <TableCell
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelect(paper.id, e)
                  }}
                >
                  <Checkbox
                    checked={selectedPapers.includes(paper.id)}
                    aria-label={`Select ${paper.title}`}
                  />
                </TableCell>
                <TableCell
                  className="px-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground active:cursor-grabbing" />
                </TableCell>
                {isColumnVisible("title") && (
                  <TableCell className="max-w-[400px]">
                    <div className="flex items-center gap-2">
                      {paper.is_favorite && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                      <span className="line-clamp-1 font-medium truncate">
                        {paper.title}
                      </span>
                    </div>
                  </TableCell>
                )}
                {isColumnVisible("authors") && (
                  <TableCell className="max-w-[250px]">
                    <span className="line-clamp-1 text-sm text-muted-foreground truncate block">
                      {paper.authors?.slice(0, 2).join(", ")}
                      {paper.authors?.length > 2 ? " et al." : ""}
                    </span>
                  </TableCell>
                )}
                {isColumnVisible("year") && (
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {paper.year ?? "—"}
                    </span>
                  </TableCell>
                )}
                {isColumnVisible("publisher") && (
                  <TableCell className="max-w-[220px]">
                    <span className="line-clamp-1 text-sm text-muted-foreground truncate block">
                      {getPaperPublisher(paper) || "—"}
                    </span>
                  </TableCell>
                )}
                {isColumnVisible("paper_type") && (
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${typeColors[paper.paper_type] ?? typeColors.other}`}
                    >
                      {paper.paper_type}
                    </Badge>
                  </TableCell>
                )}
                {isColumnVisible("created_at") && (
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(paper.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </TableCell>
                )}
                {isColumnVisible("size") && (
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(paperSizes[paper.id] ?? 0)}
                    </span>
                  </TableCell>
                )}
                {isColumnVisible("has_pdf") && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {pdfFilePaths[paper.id] ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => handleQuickViewPdf(paper)}
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Open
                      </Button>
                    ) : (
                      <Link
                        href={`/paper/${paper.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Add PDF
                      </Link>
                    )}
                  </TableCell>
                )}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleToggleFavorite(paper)}
                      >
                        {paper.is_favorite ? (
                          <>
                            <StarOff className="mr-2 h-4 w-4" />
                            Remove from favorites
                          </>
                        ) : (
                          <>
                            <Star className="mr-2 h-4 w-4" />
                            Add to favorites
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleQuickViewPdf(paper)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Quick view PDF
                      </DropdownMenuItem>
                      {paper.doi && (
                        <DropdownMenuItem asChild>
                          <a
                            href={`https://doi.org/${paper.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open DOI
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(paper.title)
                          toast.success("Title copied")
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy title
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(paper)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {folderId ? "Remove from folder" : "Delete"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
    <div
      ref={dragPreviewRef}
      className="pointer-events-none fixed top-0 left-0 z-[9999]"
      style={{
        transform: dragPosition
          ? `translate(${dragPosition.x + 16}px, ${dragPosition.y - 12}px)`
          : "translate(-9999px, -9999px)",
        display: "none",
        willChange: "transform",
      }}
    >
      <div className="relative h-12 w-10" style={{ animation: "stack-wobble 1.2s ease-in-out infinite" }}>
        {draggingIds.map((_, i) => {
          const maxStack = Math.min(draggingIds.length, 3)
          if (i >= maxStack) return null
          const offset = (maxStack - 1 - i) * 3
          const rotation = (i - (maxStack - 1) / 2) * 6
          return (
            <div
              key={i}
              className="absolute rounded-sm border-2 border-border bg-background shadow-sm"
              style={{
                width: "32px",
                height: "40px",
                bottom: `${offset}px`,
                left: `${offset}px`,
                transform: `rotate(${rotation}deg)`,
                animation: `stack-bounce 0.4s ease-out ${i * 0.05}s both`,
              }}
            >
              <div className="mx-2 mt-3 space-y-1.5">
                <div className="h-0.5 w-full rounded-full bg-muted" />
                <div className="h-0.5 w-3/4 rounded-full bg-muted" />
                <div className="h-0.5 w-full rounded-full bg-muted" />
              </div>
            </div>
          )
        })}
        {draggingIds.length > 3 && (
          <div
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md"
            style={{ animation: "badge-pop 0.3s ease-out both" }}
          >
            +{draggingIds.length - 3}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
