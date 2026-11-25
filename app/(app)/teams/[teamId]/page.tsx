"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/utils/supabase/client"
import { PAPER_LIST_SELECT, TEAM_SELECT } from "@/lib/db/selects"
import { REFLY_DATA_UPDATED_EVENT, shouldHandleReflyDataUpdate } from "@/lib/refly-events"
import type { Team, TeamMember, Paper } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PaperTable, PaperTableColumnsButton } from "@/components/papers/paper-table"
import { PaperDetailSheet } from "@/components/papers/paper-detail-sheet"
import { PaperCard } from "@/components/papers/paper-card"
import { AddPaperDialog } from "@/components/papers/add-paper-dialog"
import { ExportDialog } from "@/components/import-export/export-dialog"
import { MoveToFolderDialog } from "@/components/papers/move-to-folder-dialog"
import { BatchProcessDialog } from "@/components/papers/batch-process-dialog"
import { MemberList } from "@/components/teams/member-list"
import { InviteMemberDialog } from "@/components/teams/invite-member-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Search,
  Download,
  Settings,
  Users,
  UserPlus,
  Library,
  LayoutGrid,
  LayoutList,
} from "lucide-react"
import { PaperBatchActions } from "@/components/papers/paper-batch-actions"
import { getTeamIcon } from "@/lib/entity-appearance"

export default function TeamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.teamId as string

  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [addPaperOpen, setAddPaperOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [batchProcessOpen, setBatchProcessOpen] = useState(false)
  const [batchProcessMode, setBatchProcessMode] = useState<"pdf" | "enrich">("pdf")
  const [selectedPapers, setSelectedPapers] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const lastSelectedRef = useRef<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [teamRes, membersRes, papersRes] = await Promise.all([
      supabase.from("teams").select(TEAM_SELECT).eq("id", teamId).single(),
      supabase
        .from("team_members")
        .select("*, profiles(*)")
        .eq("team_id", teamId),
      supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
    ])

    if (teamRes.data) setTeam(teamRes.data)
    if (membersRes.data) {
      setMembers(
        membersRes.data.map((m: any) => ({
          ...m,
          profile: m.profiles,
        })),
      )
      const currentUser = membersRes.data.find(
        (m: any) => m.user_id === user.id,
      )
      setUserRole(currentUser?.role || null)
    }
    if (papersRes.data) setPapers(papersRes.data)
    setLoading(false)
  }, [teamId])

  const refreshData = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [teamRes, membersRes, papersRes] = await Promise.all([
      supabase.from("teams").select(TEAM_SELECT).eq("id", teamId).single(),
      supabase
        .from("team_members")
        .select("*, profiles(*)")
        .eq("team_id", teamId),
      supabase
        .from("papers")
        .select(PAPER_LIST_SELECT)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
    ])

    if (teamRes.data) setTeam(teamRes.data)
    if (membersRes.data) {
      setMembers(
        membersRes.data.map((m: any) => ({
          ...m,
          profile: m.profiles,
        })),
      )
      const currentUser = membersRes.data.find(
        (m: any) => m.user_id === user.id,
      )
      setUserRole(currentUser?.role || null)
    }
    if (papersRes.data) setPapers(papersRes.data)
  }, [teamId])

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
      if (!shouldHandleReflyDataUpdate(event, ["paper", "team"])) return
      refreshData()
    }

    window.addEventListener(REFLY_DATA_UPDATED_EVENT, handleDataUpdated)
    return () => window.removeEventListener(REFLY_DATA_UPDATED_EVENT, handleDataUpdated)
  }, [refreshData])

  const canEdit = userRole === "owner" || userRole === "admin" || userRole === "editor"
  const isAdmin = userRole === "owner" || userRole === "admin"

  // Filter papers by search + type
  const filteredPapers = papers.filter((p) => {
    const matchesType = typeFilter === "all" || p.paper_type === typeFilter
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.abstract?.toLowerCase().includes(search.toLowerCase()) ||
      p.doi?.toLowerCase().includes(search.toLowerCase()) ||
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!team) {
    return <p className="text-center text-muted-foreground">Team not found</p>
  }

  const TeamIcon = getTeamIcon(team.icon)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `${team.color ?? "#2563eb"}20`,
              color: team.color ?? "#2563eb",
            }}
          >
            <TeamIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
            {team.description && (
              <p className="text-sm text-muted-foreground">
                {team.description}
              </p>
            )}
          </div>
          <Badge variant="outline" className="ml-2 capitalize">
            {userRole}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInviteOpen(true)}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Invite
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/teams/${teamId}/settings`}>
                  <Settings className="mr-1.5 h-4 w-4" />
                  Settings
                </Link>
              </Button>
            </>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setAddPaperOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Paper
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="papers">
        <TabsList>
          <TabsTrigger value="papers" className="gap-1.5">
            <Library className="h-3.5 w-3.5" />
            Papers ({papers.length})
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Members ({members.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="papers" className="mt-4 space-y-4">
          {/* Filters */}
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
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportDialogOpen(true)}
                disabled={papers.length === 0}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export
              </Button>
            </div>
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

          {/* Content */}
          {filteredPapers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
              <Library className="mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="font-semibold">
                {papers.length === 0
                  ? "No papers in this team"
                  : "No papers match your filters"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {papers.length === 0
                  ? "Add papers to share with your team."
                  : "Try adjusting your search or type filter."}
              </p>
              {canEdit && papers.length === 0 && (
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => setAddPaperOpen(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Paper
                </Button>
              )}
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
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MemberList
            teamId={teamId}
            members={members}
            currentUserRole={userRole}
            onRefresh={loadData}
          />
        </TabsContent>
      </Tabs>

      <AddPaperDialog
        open={addPaperOpen}
        onOpenChange={setAddPaperOpen}
        onSuccess={() => {
          setAddPaperOpen(false)
          loadData()
        }}
        teamId={teamId}
      />

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        teamId={teamId}
        onSuccess={loadData}
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
