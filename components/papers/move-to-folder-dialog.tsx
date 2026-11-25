"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/utils/supabase/client"
import { FOLDER_SELECT } from "@/lib/db/selects"
import type { Folder } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Folder as FolderIcon,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

interface MoveToFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paperIds: string[]
  onSuccess: () => void
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  paperIds,
  onSuccess,
}: MoveToFolderDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(
    new Set(),
  )
  const [existingFolders, setExistingFolders] = useState<Set<string>>(
    new Set(),
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!open || paperIds.length === 0) return
    setLoading(true)
    const supabase = createClient()

    // Load all personal folders
    const { data: foldersData } = await supabase
      .from("folders")
      .select(FOLDER_SELECT)
      .is("team_id", null)
      .order("position")

    setFolders(foldersData ?? [])

    // Load existing paper-folder associations (for single paper)
    if (paperIds.length === 1) {
      const { data: pfData } = await supabase
        .from("paper_folders")
        .select("folder_id")
        .eq("paper_id", paperIds[0])

      const existing = new Set<string>(
        (pfData ?? [])
          .map((pf: { folder_id: unknown }) => pf.folder_id)
          .filter((id: unknown): id is string => typeof id === "string")
      )
      setExistingFolders(existing)
      setSelectedFolders(new Set(existing))
    } else {
      setExistingFolders(new Set())
      setSelectedFolders(new Set())
    }

    setLoading(false)
  }, [open, paperIds])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleFolder = (folderId: string) => {
    const next = new Set(selectedFolders)
    if (next.has(folderId)) {
      next.delete(folderId)
    } else {
      next.add(folderId)
    }
    setSelectedFolders(next)
  }

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    for (const paperId of paperIds) {
      // Remove old associations
      const toRemove = [...existingFolders].filter(
        (id) => !selectedFolders.has(id),
      )
      if (toRemove.length > 0) {
        for (const folderId of toRemove) {
          await supabase
            .from("paper_folders")
            .delete()
            .eq("paper_id", paperId)
            .eq("folder_id", folderId)
        }
      }

      // Add new associations
      const toAdd = [...selectedFolders].filter(
        (id) => !existingFolders.has(id),
      )
      if (toAdd.length > 0) {
        await supabase.from("paper_folders").insert(
          toAdd.map((folderId) => ({
            paper_id: paperId,
            folder_id: folderId,
          })),
        )
      }
    }

    toast.success(
      `Moved ${paperIds.length} paper${paperIds.length > 1 ? "s" : ""} to ${selectedFolders.size} folder${selectedFolders.size !== 1 ? "s" : ""}`,
    )
    setSaving(false)
    onSuccess()
    onOpenChange(false)
  }

  const rootFolders = folders.filter((f) => !f.parent_id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>
            Select folders for{" "}
            {paperIds.length === 1
              ? "this paper"
              : `${paperIds.length} papers`}
            . Papers can be in multiple folders.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : folders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No folders yet. Create a folder from the sidebar first.
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="space-y-1 pr-4">
              {rootFolders.map((folder) => (
                <FolderCheckItem
                  key={folder.id}
                  folder={folder}
                  allFolders={folders}
                  selectedFolders={selectedFolders}
                  onToggle={toggleFolder}
                  depth={0}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FolderCheckItem({
  folder,
  allFolders,
  selectedFolders,
  onToggle,
  depth,
}: {
  folder: Folder
  allFolders: Folder[]
  selectedFolders: Set<string>
  onToggle: (id: string) => void
  depth: number
}) {
  const children = allFolders.filter((f) => f.parent_id === folder.id)

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <Checkbox
          checked={selectedFolders.has(folder.id)}
          onCheckedChange={() => onToggle(folder.id)}
          id={`folder-${folder.id}`}
        />
        <FolderIcon className="h-4 w-4 text-muted-foreground" />
        <label
          htmlFor={`folder-${folder.id}`}
          className="flex-1 cursor-pointer text-sm"
        >
          {folder.name}
        </label>
      </div>
      {children.map((child) => (
        <FolderCheckItem
          key={child.id}
          folder={child}
          allFolders={allFolders}
          selectedFolders={selectedFolders}
          onToggle={onToggle}
          depth={depth + 1}
        />
      ))}
    </>
  )
}
