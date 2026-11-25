"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/utils/supabase/client"
import type { Team, TeamMember } from "@/types"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreateTeamDialog } from "@/components/teams/create-team-dialog"
import { Plus, Users, ChevronRight } from "lucide-react"
import Link from "next/link"
import { getTeamIcon } from "@/lib/entity-appearance"

export default function TeamsPage() {
  const [teams, setTeams] = useState<(Team & { member_count?: number; role?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const loadTeams = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id, role, teams(*)")
      .eq("user_id", user.id)

    if (memberships) {
      const teamsWithRole = memberships.map((m: any) => ({
        ...m.teams,
        role: m.role,
      }))
      setTeams(teamsWithRole)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadTeams()
  }, [loadTeams])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Collaborate with others on shared reference libraries.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create Team
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-20 text-center glass-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold">No teams yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a team to start collaborating.
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Team
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => {
            const TeamIcon = getTeamIcon(team.icon)
            return (
              <Link key={team.id} href={`/teams/${team.id}`}>
                <Card className="group transition-all duration-200 glass-2 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20"
                          style={{
                            backgroundColor: `${team.color ?? "#2563eb"}20`,
                            color: team.color ?? "#2563eb",
                          }}
                        >
                          <TeamIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            {team.name}
                          </CardTitle>
                          <Badge
                            variant="outline"
                            className="mt-1 text-[10px] capitalize glass-1"
                          >
                            {team.role}
                          </Badge>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </CardHeader>
                  {team.description && (
                    <CardContent>
                      <CardDescription className="line-clamp-2 text-xs">
                        {team.description}
                      </CardDescription>
                    </CardContent>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <CreateTeamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false)
          loadTeams()
        }}
      />
    </div>
  )
}
