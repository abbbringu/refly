"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  MessageSquare,
  FileText,
  Sparkles,
  FolderInput,
  Trash2,
  FolderMinus,
  Download,
  FileX,
} from "lucide-react"
import { toast } from "sonner"
import { deletePapersById, deletePdfsById } from "@/lib/papers/delete-papers-client"
import { removePapersFromFolder } from "@/lib/papers/remove-from-folder-client"
import { useConfirm } from "@/components/confirm-provider"

interface PaperBatchActionsProps {
  selectedPapers: string[]

  teamId?: string
  folderId?: string
  onClear: () => void
  onRefresh: () => void
  onPaperDeleted: (paperIds: string[]) => void
  onMove: () => void
  onExport: () => void
  onBatchProcess: (mode: "pdf" | "enrich") => void
}

export function PaperBatchActions({
  selectedPapers,
  teamId,
  folderId,
  onClear,
  onRefresh,
  onPaperDeleted,
  onMove,
  onExport,
  onBatchProcess,
}: PaperBatchActionsProps) {
  const router = useRouter()
  const confirm = useConfirm()

  const handleDelete = async () => {
    if (folderId) {
      if (!(await confirm({ title: `Remove ${selectedPapers.length} paper(s) from this folder?`, variant: "destructive", actionLabel: "Remove" }))) return
      onPaperDeleted(selectedPapers)
      onClear()
      const result = await removePapersFromFolder(selectedPapers, folderId)
      if (result.errors.length > 0) {
        toast.error(result.errors[0] || "Failed to remove from folder")
        onRefresh()
        return
      }
      toast.success(`Removed ${result.removedCount} paper(s) from folder`)
    } else {
      if (!(await confirm({ title: `Delete ${selectedPapers.length} paper(s)?`, description: "This cannot be undone.", variant: "destructive", actionLabel: "Delete" }))) return
      onPaperDeleted(selectedPapers)
      onClear()
      const toastId = toast.loading(`Deleting ${selectedPapers.length} paper(s)...`)

      try {
        const result = await deletePapersById(selectedPapers)

        if (result.deletedCount === 0) {
          toast.error(result.errors[0] || "Failed to delete paper(s)", { id: toastId })
          onRefresh()
          return
        }

        if (result.failedIds.length > 0) {
          toast.warning(
            `Deleted ${result.deletedCount} paper(s), ${result.failedIds.length} failed`,
            { id: toastId }
          )
        } else {
          toast.success(`Deleted ${result.deletedCount} paper(s)`, { id: toastId })
        }
      } catch (error) {
        toast.error("Failed to delete paper(s)", { id: toastId })
        console.error(error)
        onRefresh()
      }
    }
  }

  const handleRemovePdfs = async () => {
    if (!(await confirm({ title: `Remove PDFs from ${selectedPapers.length} paper(s)?`, variant: "destructive", actionLabel: "Remove" }))) return
    const result = await deletePdfsById(selectedPapers)

    if (result.deletedCount === 0 && result.errors.length > 0) {
      toast.error(result.errors[0] || "Failed to remove PDFs")
      return
    }

    if (result.failedIds.length > 0) {
      toast.warning(
        `Removed PDFs from ${result.deletedCount} paper(s), ${result.failedIds.length} failed`
      )
    } else {
      toast.success(`Removed PDFs from ${result.deletedCount} paper(s)`)
    }

    onClear()
    onRefresh()
  }

  const handleChat = () => {
    const params = new URLSearchParams()
    params.set("team", teamId ?? "personal")
    params.set("papers", selectedPapers.join(","))
    router.push(`/chat?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5 transition-all duration-200">
      <span className="text-sm text-muted-foreground">
        {selectedPapers.length > 0
          ? `${selectedPapers.length} selected`
          : "Select papers to take action"}
      </span>
      <div className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={() => onBatchProcess("pdf")}
      >
        <FileText className="mr-1.5 h-4 w-4" />
        Fetch PDFs
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={handleRemovePdfs}
        className="text-destructive hover:text-destructive"
      >
        <FileX className="mr-1.5 h-4 w-4" />
        Remove PDFs
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={() => onBatchProcess("enrich")}
      >
        <Sparkles className="mr-1.5 h-4 w-4" />
        Auto-enrich
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={onMove}
      >
        <FolderInput className="mr-1.5 h-4 w-4" />
        Move to Folder
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={handleChat}
      >
        <MessageSquare className="mr-1.5 h-4 w-4" />
        Chat with Selected
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={onExport}
      >
        <Download className="mr-1.5 h-4 w-4" />
        Export Selected
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedPapers.length === 0}
        className="text-destructive hover:text-destructive"
        onClick={handleDelete}
      >
        {folderId ? (
          <>
            <FolderMinus className="mr-1.5 h-4 w-4" />
            Remove from Folder
          </>
        ) : (
          <>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={selectedPapers.length === 0}
        onClick={onClear}
      >
        Clear
      </Button>
    </div>
  )
}
