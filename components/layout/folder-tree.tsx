"use client"

import { useState } from "react"
import { useConfirm } from "@/components/confirm-provider"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import type { Folder } from "@/types"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  ChevronRight,
  FolderPlus,
  Trash2,
  MoreHorizontal,
  Copy,
  Settings2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuAction } from "@/components/ui/sidebar"
import { PromptDialog } from "@/components/ui/prompt-dialog"
import { FolderAppearanceDialog } from "@/components/layout/folder-appearance-dialog"
import { ensurePapersInScope } from "@/lib/papers/scope-move-client"
import { FOLDER_SELECT } from "@/lib/db/selects"
import { getMapIcon } from "@/lib/entity-appearance"

import { toast } from "sonner"

const MAX_FOLDER_DEPTH = 3

interface FolderTreeProps {
  folders: Folder[]
  onRefresh: () => void
  parentId?: string | null
  depth?: number
  teamId?: string | null
}

export function FolderTree({
  folders,
  onRefresh,
  parentId = null,
  depth = 0,
  teamId = null,
}: FolderTreeProps) {
  const pathname = usePathname()

  // Filter folders at current level
  const currentLevel = folders.filter((f) => f.parent_id === parentId)
  const getChildren = (folderId: string) =>
    folders.filter((f) => f.parent_id === folderId)

  // Build folder link based on context (personal vs team)
  const getFolderHref = (folderId: string) => {
    if (teamId) return `/teams/${teamId}/folder/${folderId}`
    return `/library/${folderId}`
  }

  if (currentLevel.length === 0 && depth === 0) {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        No folders yet
      </p>
    )
  }

  return (
    <>
      {currentLevel.map((folder) => {
        const children = getChildren(folder.id)
        const isActive = pathname === getFolderHref(folder.id)

        if (children.length > 0) {
          return (
            <FolderWithChildren
              key={folder.id}
              folder={folder}
              allFolders={folders}
              isActive={isActive}
              onRefresh={onRefresh}
              depth={depth}
              teamId={teamId}
              getFolderHref={getFolderHref}
            />
          )
        }

        return (
          <FolderItem
            key={folder.id}
            folder={folder}
            isActive={isActive}
            onRefresh={onRefresh}
            depth={depth}
            teamId={teamId}
            href={getFolderHref(folder.id)}
          />
        )
      })}
    </>
  )
}

// ─── Drop target helpers (shared by all folder items) ─────────────
function handleDragOver(e: React.DragEvent) {
  if (e.dataTransfer.types.includes("application/x-paper-ids") || e.dataTransfer.types.includes("application/x-folder-id")) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    const target = e.currentTarget as HTMLElement
    target.classList.add(
      "ring-2",
      "ring-primary/60",
      "bg-primary/10",
      "rounded-md",
    )
  }
}

function handleDragLeave(e: React.DragEvent) {
  const target = e.currentTarget as HTMLElement
  target.classList.remove(
    "ring-2",
    "ring-primary/60",
    "bg-primary/10",
    "rounded-md",
  )
}

async function handleDrop(
  e: React.DragEvent,
  targetFolder: Folder,
  onRefresh: () => void,
) {
  e.preventDefault()
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  target.classList.remove(
    "ring-2",
    "ring-primary/60",
    "bg-primary/10",
    "rounded-md",
  )

  const supabase = createClient()

  // Handle Folder Drop
  if (e.dataTransfer.types.includes("application/x-folder-id")) {
    const droppedFolderId = e.dataTransfer.getData("application/x-folder-id")
    if (!droppedFolderId || droppedFolderId === targetFolder.id) return

    try {
      const res = await fetch("/api/folders/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: droppedFolderId,
          targetTeamId: targetFolder.team_id ?? null,
          targetParentId: targetFolder.id,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to move folder" }))
        toast.error(err.error || "Failed to move folder")
        return
      }

      toast.success("Folder moved")
      onRefresh()
    } catch {
      toast.error("Failed to move folder")
    }

    return
  }

  // Handle Paper Drop
  const raw = e.dataTransfer.getData("application/x-paper-ids")
  if (!raw) return

  const paperIds: string[] = JSON.parse(raw)
  if (paperIds.length === 0) return

  const mappingResult = await ensurePapersInScope({
    supabase,
    paperIds,
    targetTeamId: targetFolder.team_id ?? null,
  })

  if (mappingResult.mappedPaperIds.length === 0) {
    toast.error("No papers could be added to this folder")
    return
  }

  // Insert paper_folders for each paper (upsert-style, ignore conflicts)
  const rows = mappingResult.mappedPaperIds.map((paperId) => ({
    paper_id: paperId,
    folder_id: targetFolder.id,
  }))

  const { error } = await supabase
    .from("paper_folders")
    .upsert(rows, { onConflict: "paper_id,folder_id", ignoreDuplicates: true })

  if (error) {
    toast.error("Failed to move paper(s) to folder")
    return
  }

  toast.success(
    `Added ${mappingResult.mappedPaperIds.length} paper${mappingResult.mappedPaperIds.length > 1 ? "s" : ""} to folder`,
  )
  onRefresh()
}

// ─── FolderItem (leaf, no children) ───────────────────────────────
function FolderItem({
  folder,
  isActive,
  onRefresh,
  depth,
  teamId,
  href,
}: {
  folder: Folder
  isActive: boolean
  onRefresh: () => void
  depth: number
  teamId?: string | null
  href: string
}) {
  const Icon = getMapIcon(folder.icon)

  // For depth > 0 render as sub-item (indented)
  if (depth > 0) {
    return (
      <SidebarMenuSubItem>
        <FolderActions folder={folder} onRefresh={onRefresh} depth={depth} teamId={teamId}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-folder-id", folder.id)
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder, onRefresh)}
              className="transition-all duration-150 pr-6"
            >
              <SidebarMenuSubButton asChild isActive={isActive}>
                <Link href={href}>
                  <Icon
                    className="h-3.5 w-3.5"
                    style={{ color: folder.color ?? undefined }}
                  />
                  <span>{folder.name}</span>
                </Link>
              </SidebarMenuSubButton>
          </div>
        </FolderActions>
      </SidebarMenuSubItem>
    )
  }

  return (
    <SidebarMenuItem>
      <FolderActions folder={folder} onRefresh={onRefresh} depth={depth} teamId={teamId}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-folder-id", folder.id)
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder, onRefresh)}
          className="transition-all duration-150 pr-6"
        >
          <SidebarMenuButton asChild isActive={isActive}>
            <Link href={href}>
              <Icon
                className="h-4 w-4"
                style={{ color: folder.color ?? undefined }}
              />
              <span>{folder.name}</span>
            </Link>
          </SidebarMenuButton>
        </div>
      </FolderActions>
    </SidebarMenuItem>
  )
}

// ─── FolderWithChildren (collapsible with nested children) ────────
function FolderWithChildren({
  folder,
  allFolders,
  isActive,
  onRefresh,
  depth,
  teamId,
  getFolderHref,
}: {
  folder: Folder
  allFolders: Folder[]
  isActive: boolean
  onRefresh: () => void
  depth: number
  teamId?: string | null
  getFolderHref: (id: string) => string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const children = allFolders.filter((f) => f.parent_id === folder.id)
  const Icon = getMapIcon(folder.icon)

  const getChildren = (folderId: string) =>
    allFolders.filter((f) => f.parent_id === folderId)

  // For nested levels (depth > 0), use sub-item layout
  if (depth > 0) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuSubItem>
          <FolderActions folder={folder} onRefresh={onRefresh} depth={depth} teamId={teamId}>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-folder-id", folder.id)
              }}
              onDragEnter={(e) => {
                if (e.dataTransfer.types.includes("application/x-paper-ids") || e.dataTransfer.types.includes("application/x-folder-id")) {
                  setOpen(true)
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder, onRefresh)}
              className="relative transition-all duration-150 pr-6"
            >
              <SidebarMenuSubButton asChild isActive={isActive}>
                <Link href={getFolderHref(folder.id)}>
                  <Icon
                    className="h-3.5 w-3.5"
                    style={{ color: folder.color ?? undefined }}
                  />
                  <span>{folder.name}</span>
                </Link>
              </SidebarMenuSubButton>
              <CollapsibleTrigger asChild>
                <button className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground mr-6">
                  <ChevronRight
                    className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
            </div>
          </FolderActions>
          <CollapsibleContent>
            <SidebarMenuSub>
              {children.map((child) => {
                const grandchildren = getChildren(child.id)
                const childActive =
                  pathname === getFolderHref(child.id)

                if (
                  grandchildren.length > 0 &&
                  depth + 1 < MAX_FOLDER_DEPTH
                ) {
                  return (
                    <FolderWithChildren
                      key={child.id}
                      folder={child}
                      allFolders={allFolders}
                      isActive={childActive}
                      onRefresh={onRefresh}
                      depth={depth + 1}
                      teamId={teamId}
                      getFolderHref={getFolderHref}
                    />
                  )
                }

                return (
                  <FolderItem
                    key={child.id}
                    folder={child}
                    isActive={childActive}
                    onRefresh={onRefresh}
                    depth={depth + 1}
                    teamId={teamId}
                    href={getFolderHref(child.id)}
                  />
                )
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuSubItem>
      </Collapsible>
    )
  }

  // Top-level folder with children
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <FolderActions folder={folder} onRefresh={onRefresh} depth={depth} teamId={teamId}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-folder-id", folder.id)
            }}
            onDragEnter={(e) => {
              if (e.dataTransfer.types.includes("application/x-paper-ids") || e.dataTransfer.types.includes("application/x-folder-id")) {
                setOpen(true)
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder, onRefresh)}
            className="relative transition-all duration-150 pr-6"
          >
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={getFolderHref(folder.id)}>
                <Icon
                  className="h-4 w-4"
                  style={{ color: folder.color ?? undefined }}
                />
                <span>{folder.name}</span>
              </Link>
            </SidebarMenuButton>
            <CollapsibleTrigger asChild>
              <button className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground mr-6">
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
          </div>
        </FolderActions>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          {children.map((child) => {
            const grandchildren = getChildren(child.id)
            const childActive = pathname === getFolderHref(child.id)

            if (
              grandchildren.length > 0 &&
              depth + 1 < MAX_FOLDER_DEPTH
            ) {
              return (
                <FolderWithChildren
                  key={child.id}
                  folder={child}
                  allFolders={allFolders}
                  isActive={childActive}
                  onRefresh={onRefresh}
                  depth={depth + 1}
                  teamId={teamId}
                  getFolderHref={getFolderHref}
                />
              )
            }

            return (
              <FolderItem
                key={child.id}
                folder={child}
                isActive={childActive}
                onRefresh={onRefresh}
                depth={depth + 1}
                teamId={teamId}
                href={getFolderHref(child.id)}
              />
            )
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}


// ─── Folder Actions (Context & Dropdown) ──────────────────────────────────
function FolderActions({
  folder,
  onRefresh,
  depth,
  teamId,
  children,
}: {
  folder: Folder
  onRefresh: () => void
  depth: number
  teamId?: string | null
  children: React.ReactNode
}) {
  const [promptOpen, setPromptOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [promptTitle, setPromptTitle] = useState("")
  const [promptDefault, setPromptDefault] = useState("")
  const [promptCallback, setPromptCallback] = useState<((val: string) => Promise<void>) | null>(null)
  const confirm = useConfirm()

  const openPrompt = (title: string, def: string, cb: (val: string) => Promise<void>) => {
    setPromptTitle(title)
    setPromptDefault(def)
    setPromptCallback(() => cb)
    setPromptOpen(true)
  }

  const handleCreateSubfolder = () => {
    openPrompt("Subfolder name:", "", async (name) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from("folders").insert({
        name,
        user_id: user.id,
        parent_id: folder.id,
        team_id: teamId || folder.team_id,
        position: 0,
      })
      if (error) { toast.error("Failed to create subfolder"); return }
      toast.success("Subfolder created")
      onRefresh()
    })
  }

  const handleDuplicate = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const duplicateRecursive = async (folderToCopy: Folder, newParentId: string | null, newName: string) => {
        const { data: newFolder, error } = await supabase.from("folders").insert({
          name: newName,
          user_id: user.id,
          parent_id: newParentId,
          team_id: folderToCopy.team_id,
          icon: folderToCopy.icon,
          color: folderToCopy.color,
          position: folderToCopy.position,
        }).select().single()

        if (error || !newFolder) throw new Error("Failed to duplicate folder")

        // duplicate paper links
        const { data: papers } = await supabase.from("paper_folders").select("paper_id").eq("folder_id", folderToCopy.id)
        if (papers && papers.length > 0) {
          const rows = papers.map((p: any) => ({ paper_id: p.paper_id, folder_id: newFolder.id }))
          await supabase.from("paper_folders").insert(rows)
        }

        // duplicate subfolders
        const { data: subfolders } = await supabase.from("folders").select(FOLDER_SELECT).eq("parent_id", folderToCopy.id)
        if (subfolders && subfolders.length > 0) {
          for (const sub of subfolders) {
            await duplicateRecursive(sub as Folder, newFolder.id, sub.name)
          }
        }
      }

      await duplicateRecursive(folder, folder.parent_id, `${folder.name} (Copy)`)
      toast.success("Folder duplicated")
      onRefresh()
    } catch (e) {
      toast.error("Failed to duplicate folder")
    }
  }

  const handleDelete = async () => {
    if (!(await confirm({ title: `Delete folder "${folder.name}"?`, description: "Papers will not be deleted.", variant: "destructive", actionLabel: "Delete" }))) return
    const supabase = createClient()
    const { error } = await supabase.from("folders").delete().eq("id", folder.id)
    if (error) { toast.error("Failed to delete folder"); return }
    toast.success("Folder deleted")
    onRefresh()
  }

  const canCreateSubfolder = depth < MAX_FOLDER_DEPTH - 1

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setAppearanceOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Edit map
          </ContextMenuItem>
          {canCreateSubfolder && (
            <ContextMenuItem onClick={handleCreateSubfolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Create subfolder
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={() => setAppearanceOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Edit map
          </DropdownMenuItem>
          {canCreateSubfolder && (
            <DropdownMenuItem onClick={handleCreateSubfolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Create subfolder
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title={promptTitle}
        defaultValue={promptDefault}
        onSubmit={async (val) => {
          if (promptCallback) await promptCallback(val)
        }}
      />

      <FolderAppearanceDialog
        open={appearanceOpen}
        onOpenChange={setAppearanceOpen}
        folder={folder}
        onSaved={onRefresh}
      />
    </>
  )
}
