"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { FOLDER_SELECT, TAG_SELECT } from "@/lib/db/selects"
import { REFLY_DATA_UPDATED_EVENT, shouldHandleReflyDataUpdate } from "@/lib/refly-events"
import type { Profile, Folder, Team, Tag } from "@/types"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  ChevronRight,
  FolderPlus,
  Library,
  Clock,
  Star,
  Plus,
  Upload,
  Settings,
  Tags,
  X,
  Sparkles,
} from "lucide-react"
import { FolderTree } from "@/components/layout/folder-tree"
import { ReflyLogo } from "@/components/layout/refly-logo"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"
import { PromptDialog } from "@/components/ui/prompt-dialog"
import { PlanCtaButton } from "@/components/billing/plan-cta-button"
import { isSelfHostedMode } from "@/lib/config/self-hosted"
import { ensurePapersInScope } from "@/lib/papers/scope-move-client"
import { getTeamIcon } from "@/lib/entity-appearance"
import { AddPaperDialog } from "@/components/papers/add-paper-dialog"

const SPECIAL_LIBRARY_ROUTES = new Set(["add", "import", "recent", "favorites"])

function getAddPaperContext(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)

  if (segments[0] === "teams" && segments[1]) {
    if (segments[2] === "folder" && segments[3]) {
      return { teamId: segments[1], folderId: segments[3] }
    }

    return { teamId: segments[1], folderId: undefined }
  }

  if (segments[0] === "library" && segments[1] && !SPECIAL_LIBRARY_ROUTES.has(segments[1])) {
    return { teamId: undefined, folderId: segments[1] }
  }

  return { teamId: undefined, folderId: undefined }
}

interface AppSidebarProps {
  profile: Profile | null
}

export function AppSidebar({ profile }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [teams, setTeams] = useState<(Team & { role?: string })[]>([])
  const [teamFolders, setTeamFolders] = useState<Record<string, Folder[]>>({})
  const [tags, setTags] = useState<Tag[]>([])

  const [promptOpen, setPromptOpen] = useState(false)
  const [promptTitle, setPromptTitle] = useState("")
  const [promptCallback, setPromptCallback] = useState<((val: string) => Promise<void>) | null>(null)
  const [addPaperOpen, setAddPaperOpen] = useState(false)
  const confirm = useConfirm()

  const openPrompt = (title: string, submit: (val: string) => Promise<void>) => {
    setPromptTitle(title)
    setPromptCallback(() => submit)
    setPromptOpen(true)
  }

  const loadData = useCallback(async () => {
    const supabase = createClient()

    const [foldersRes, teamsRes, tagsRes] = await Promise.all([
      supabase
        .from("folders")
        .select(FOLDER_SELECT)
        .is("team_id", null)
        .order("position"),
      supabase.from("team_members").select("team_id, role, teams(*)"),
      supabase.from("tags").select(TAG_SELECT).order("name"),
    ])

    if (foldersRes.data) setFolders(foldersRes.data)
    if (tagsRes.data) setTags(tagsRes.data)

    if (teamsRes.data) {
      const teamsWithRole = teamsRes.data.map((m: any) => ({
        ...m.teams,
        role: m.role,
      }))
      setTeams(teamsWithRole)

      // Load folders for each team
      const teamIds = teamsWithRole.map((t: any) => t.id)
      if (teamIds.length > 0) {
        const { data: allTeamFolders } = await supabase
          .from("folders")
          .select(FOLDER_SELECT)
          .in("team_id", teamIds)
          .order("position")

        if (allTeamFolders) {
          const grouped: Record<string, Folder[]> = {}
          for (const folder of allTeamFolders) {
            if (!folder.team_id) continue
            if (!grouped[folder.team_id]) grouped[folder.team_id] = []
            grouped[folder.team_id].push(folder)
          }
          setTeamFolders(grouped)
        }
      }
    }
  }, [])

  useEffect(() => {
    loadData()
    const handleUpdate = (event: Event) => {
      if (!shouldHandleReflyDataUpdate(event, ["folder", "tag", "team"])) return
      loadData()
    }
    window.addEventListener(REFLY_DATA_UPDATED_EVENT, handleUpdate)
    return () => window.removeEventListener(REFLY_DATA_UPDATED_EVENT, handleUpdate)
  }, [loadData])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  const handleDeleteTag = async (e: React.MouseEvent, tagId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!(await confirm({ title: "Delete this tag entirely?", variant: "destructive", actionLabel: "Delete" }))) return
    const supabase = createClient()
    const { error } = await supabase.from("tags").delete().eq("id", tagId)
    if (error) {
      toast.error("Failed to delete tag", { description: error.message })
      return
    }
    toast.success("Tag deleted")
    loadData()
  }

  const handleCreateFolder = () => {
    openPrompt("New Folder Name:", async (name) => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.from("folders").insert({
        name,
        user_id: user.id,
        position: folders.length,
      })

      if (error) {
        toast.error("Failed to create folder")
        return
      }

      toast.success("Folder created")
      loadData()
    })
  }

  const handleCreateTeamFolder = (teamId: string) => {
    openPrompt("New Team Folder Name:", async (name) => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const existing = teamFolders[teamId] ?? []
      const { error } = await supabase.from("folders").insert({
        name,
        user_id: user.id,
        team_id: teamId,
        position: existing.length,
      })

      if (error) {
        toast.error("Failed to create folder")
        return
      }

      toast.success("Folder created")
      loadData()
    })
  }

  // ─── Drop handler for teams — moves paper or folder into the team ─────────
  const handleTeamDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-paper-ids") || e.dataTransfer.types.includes("application/x-folder-id")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      const target = e.currentTarget as HTMLElement
      target.classList.add(
        "ring-2",
        "ring-primary/60",
        "bg-primary/10",
        "rounded-md",
      )
    }
  }

  const handleTeamDragLeave = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    target.classList.remove(
      "ring-2",
      "ring-primary/60",
      "bg-primary/10",
      "rounded-md",
    )
  }

  const handleTeamDrop = async (e: React.DragEvent, teamId: string) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.classList.remove(
      "ring-2",
      "ring-primary/60",
      "bg-primary/10",
      "rounded-md",
    )

    const supabase = createClient()

    if (e.dataTransfer.types.includes("application/x-folder-id")) {
      const droppedFolderId = e.dataTransfer.getData("application/x-folder-id")
      if (!droppedFolderId) return

      // Optimistic update: move folder in local state immediately
      // Handle personal → team
      const fromPersonal = folders.find((f) => f.id === droppedFolderId)
      if (fromPersonal) {
        setFolders((prev) => prev.filter((f) => f.id !== droppedFolderId))
        setTeamFolders((prev) => ({
          ...prev,
          [teamId]: [fromPersonal, ...(prev[teamId] ?? [])],
        }))
      } else {
        // Handle team → team
        for (const [srcTid, fldrs] of Object.entries(teamFolders)) {
          if (srcTid === teamId) continue
          const fromTeam = fldrs.find((f) => f.id === droppedFolderId)
          if (fromTeam) {
            setTeamFolders((prev) => ({
              ...prev,
              [srcTid]: prev[srcTid].filter((f) => f.id !== droppedFolderId),
              [teamId]: [fromTeam, ...(prev[teamId] ?? [])],
            }))
            break
          }
        }
      }

      try {
        const res = await fetch("/api/folders/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: droppedFolderId,
            targetTeamId: teamId,
            targetParentId: null,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed" }))
          toast.error(err.error || "Failed to move folder")
          loadData()
          return
        }

        const json = await res.json()
        const { copiedCount, reusedCount } = json.data ?? {}
        if (copiedCount > 0 || reusedCount > 0) {
          toast.success(
            `Folder moved to team (${copiedCount} copied, ${reusedCount} reused)`
          )
        } else {
          toast.success("Folder moved to team")
        }
      } catch {
        toast.error("Failed to move folder")
      }

      loadData()
      return
    }

    const raw = e.dataTransfer.getData("application/x-paper-ids")
    if (!raw) return
    const paperIds: string[] = JSON.parse(raw)
    if (paperIds.length === 0) return

    const mappingResult = await ensurePapersInScope({
      supabase,
      paperIds,
      targetTeamId: teamId,
    })

    if (mappingResult.mappedPaperIds.length === 0) {
      toast.error("No papers could be added to this team")
      return
    }

    toast.success(
      `Added ${mappingResult.mappedPaperIds.length} paper${mappingResult.mappedPaperIds.length > 1 ? "s" : ""} to team (${mappingResult.copiedCount} copied, ${mappingResult.reusedCount} reused)`,
    )
    loadData()
  }

  const handleChatDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-paper-ids")) {
      return
    }

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

  const handleChatDragLeave = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    target.classList.remove(
      "ring-2",
      "ring-primary/60",
      "bg-primary/10",
      "rounded-md",
    )
  }

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.classList.remove(
      "ring-2",
      "ring-primary/60",
      "bg-primary/10",
      "rounded-md",
    )

    const raw = e.dataTransfer.getData("application/x-paper-ids")
    if (!raw) return

    let paperIds: string[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        paperIds = parsed.filter((id): id is string => typeof id === "string")
      }
    } catch {
      return
    }

    if (paperIds.length === 0) return

    const params = new URLSearchParams()
    params.set("papers", paperIds.join(","))

    const teamMatch = pathname.match(/^\/teams\/([^/]+)/)
    if (teamMatch?.[1]) {
      params.set("team", teamMatch[1])
    }

    router.push(`/chat?${params.toString()}`)
  }

  const handleRootFolderDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.classList.remove("ring-2", "ring-primary/60", "bg-primary/10", "rounded-md")

    const supabase = createClient()

    if (e.dataTransfer.types.includes("application/x-folder-id")) {
      const droppedFolderId = e.dataTransfer.getData("application/x-folder-id")
      if (!droppedFolderId) return

      // Find which team the folder is coming from for optimistic state update
      let sourceTeamId: string | null = null
      for (const [tid, fldrs] of Object.entries(teamFolders)) {
        if (fldrs.some((f) => f.id === droppedFolderId)) {
          sourceTeamId = tid
          break
        }
      }

      // Optimistic update: move folder to personal in local state
      if (sourceTeamId) {
        const movedFolder = teamFolders[sourceTeamId]?.find((f) => f.id === droppedFolderId)
        if (movedFolder) {
          setTeamFolders((prev) => ({
            ...prev,
            [sourceTeamId!]: prev[sourceTeamId!].filter((f) => f.id !== droppedFolderId),
          }))
          setFolders((prev) => [movedFolder, ...prev])
        }
      }

      try {
        const res = await fetch("/api/folders/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: droppedFolderId,
            targetTeamId: null,
            targetParentId: null,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed" }))
          toast.error(err.error || "Failed to move folder")
          loadData()
          return
        }

        const json = await res.json()
        const { copiedCount, reusedCount } = json.data ?? {}
        if (copiedCount > 0 || reusedCount > 0) {
          toast.success(
            `Folder moved to personal library (${copiedCount} copied, ${reusedCount} reused)`
          )
        } else {
          toast.success("Folder moved to personal library")
        }
      } catch {
        toast.error("Failed to move folder")
      }

      loadData()
      return
    }

    const raw = e.dataTransfer.getData("application/x-paper-ids")
    if (!raw) return

    const paperIds: string[] = JSON.parse(raw)
    if (paperIds.length === 0) return

    const mappingResult = await ensurePapersInScope({
      supabase,
      paperIds,
      targetTeamId: null,
    })

    if (mappingResult.mappedPaperIds.length === 0) {
      toast.error("No papers could be added to personal library")
      return
    }

    toast.success(
      `Added ${mappingResult.mappedPaperIds.length} paper${mappingResult.mappedPaperIds.length > 1 ? "s" : ""} to personal library (${mappingResult.copiedCount} copied, ${mappingResult.reusedCount} reused)`
    )
    loadData()
  }

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() ?? "?"
  const addPaperContext = getAddPaperContext(pathname)

  return (
    <>
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/library"
              className="flex items-center gap-2.5 px-2 py-1.5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm border border-primary/10">
                <ReflyLogo />
              </div>
              <span className="font-bold tracking-tight">Refly</span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Quick Actions */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  className="glass-hover"
                  onClick={() => setAddPaperOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Paper</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="glass-hover">
                  <Link href="/library/import">
                    <Upload className="h-4 w-4" />
                    <span>Import</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Library */}
        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/library"}
                  className="glass-hover"
                >
                  <Link href="/library">
                    <Library className="h-4 w-4" />
                    <span>All Papers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <div
                  onDragOver={handleChatDragOver}
                  onDragLeave={handleChatDragLeave}
                  onDrop={handleChatDrop}
                  className="transition-all duration-150"
                >
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/chat"}
                    className="glass-hover text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    <Link href="/chat">
                      <Sparkles className="h-4 w-4" />
                      <span>AI Chat</span>
                    </Link>
                  </SidebarMenuButton>
                </div>
              </SidebarMenuItem>
              {(isSelfHostedMode() || profile?.plan === "plus" || profile?.plan === "pro") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/ai-citations"}
                    className="glass-hover text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    <Link href="/ai-citations">
                      <Sparkles className="h-4 w-4" />
                      <span>AI Citations</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/library/recent"}
                  className="glass-hover"
                >
                  <Link href="/library/recent">
                    <Clock className="h-4 w-4" />
                    <span>Recently Added</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/library/favorites"}
                  className="glass-hover"
                >
                  <Link href="/library/favorites">
                    <Star className="h-4 w-4" />
                    <span>Favorites</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Folders */}
        <SidebarGroup
          onDragOver={handleTeamDragOver}
          onDragLeave={handleTeamDragLeave}
          onDrop={handleRootFolderDrop}
          className="transition-all duration-150"
        >
          <SidebarGroupLabel className="w-full">Folders (Personal)</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <FolderTree
                folders={folders}
                onRefresh={loadData}
              />
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleCreateFolder}
                  className="text-muted-foreground hover:text-foreground cursor-pointer mt-1 glass-hover"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span>New Folder</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Teams */}
        <SidebarGroup>
          <SidebarGroupLabel>Teams</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="glass-hover">
                  <Link href="/teams">
                    <Settings className="h-4 w-4" />
                    <span>Manage Teams</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {teams.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No teams yet
                </p>
              ) : (
                teams.map((team) => (
                  <TeamSidebarItem
                    key={team.id}
                    team={team}
                    teamFolders={teamFolders[team.id] ?? []}
                    onRefresh={loadData}
                    onCreateFolder={() => handleCreateTeamFolder(team.id)}
                    onDragOver={handleTeamDragOver}
                    onDragLeave={handleTeamDragLeave}
                    onDrop={(e) => handleTeamDrop(e, team.id)}
                  />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {tags.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Tags</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="flex flex-wrap gap-1.5 px-2 py-1">
                  {tags.slice(0, 12).map((tag) => (
                    <Link
                      key={tag.id}
                      href={`/library?tag=${tag.id}`}
                      className="group inline-flex items-center gap-1 rounded-lg border border-border/40 bg-muted/30 backdrop-blur-sm pl-2 pr-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground glass-hover"
                    >
                      <Tags className="h-3 w-3" />
                      {tag.name}
                      <button
                        onClick={(e) => handleDeleteTag(e, tag.id)}
                        className="ml-0.5 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10"
                        title="Delete tag"
                        type="button"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Link>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        {!isSelfHostedMode() && profile?.plan !== "pro" && (
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="px-2 pb-1">
                <PlanCtaButton
                  plan={profile?.plan === "plus" ? "pro" : "plus"}
                  cta={profile?.plan === "plus" ? "Upgrade to Pro" : "Upgrade to Plus"}
                  featured
                  href="/pricing"
                />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-auto py-2 glass-hover">
              <Link href="/settings">
                <Avatar className="h-8 w-8 border border-border/30">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col items-start truncate">
                  <span className="truncate text-sm font-medium">
                    {profile?.full_name ?? "User"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {profile?.email}
                  </span>
                </div>
                <Settings className="ml-auto h-4 w-4" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    <PromptDialog
      open={promptOpen}
      onOpenChange={setPromptOpen}
      title={promptTitle}
      onSubmit={async (val) => {
        if (promptCallback) await promptCallback(val)
      }}
    />
    <AddPaperDialog
      open={addPaperOpen}
      onOpenChange={setAddPaperOpen}
      onSuccess={() => {
        setAddPaperOpen(false)
        loadData()
      }}
      teamId={addPaperContext.teamId}
      folderId={addPaperContext.folderId}
    />
  </>
)
}

// ─── Team sidebar item — collapsible with papers + folders ────────
function TeamSidebarItem({
  team,
  teamFolders,
  onRefresh,
  onCreateFolder,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  team: Team & { role?: string }
  teamFolders: Folder[]
  onRefresh: () => void
  onCreateFolder: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const isActive = pathname === `/teams/${team.id}`
  const TeamIcon = getTeamIcon(team.icon)
  const canEdit =
    team.role === "owner" || team.role === "admin" || team.role === "editor"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDragEnter={(e) => {
                if (e.dataTransfer.types.includes("application/x-paper-ids") || e.dataTransfer.types.includes("application/x-folder-id")) {
                  setOpen(true)
                }
              }}
              onDrop={onDrop}
              className="relative transition-all duration-150"
            >
          <SidebarMenuButton asChild isActive={isActive} className="glass-hover">
            <Link href={`/teams/${team.id}`}>
              <TeamIcon
                className="h-4 w-4"
                style={{ color: team.color ?? "#2563eb" }}
              />
              <span>{team.name}</span>
            </Link>
          </SidebarMenuButton>
        </div>
        <CollapsibleTrigger asChild>
          <button className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground glass-hover">
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          {/* All Papers link */}
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild isActive={isActive} className="glass-hover">
              <Link href={`/teams/${team.id}`}>
                <Library className="h-3.5 w-3.5" />
                <span>All Papers</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>

          {/* Team folders */}
          {teamFolders.length > 0 && (
            <FolderTree
              folders={teamFolders}
              onRefresh={onRefresh}
              depth={1}
              teamId={team.id}
            />
          )}

          {/* Create folder action */}
          {canEdit && (
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                onClick={onCreateFolder}
                className="text-muted-foreground hover:text-foreground cursor-pointer glass-hover"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>New Folder</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}
