"use client"

import { createClient } from "@/utils/supabase/client"
import type { TeamMember, TeamRole } from "@/types"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"

interface MemberListProps {
  teamId: string
  members: TeamMember[]
  currentUserRole: string | null
  onRefresh: () => void
}

const roleBadgeColors: Record<string, string> = {
  owner:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  admin:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  editor:
    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  viewer:
    "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
}

export function MemberList({
  teamId,
  members,
  currentUserRole,
  onRefresh,
}: MemberListProps) {
  const isAdmin = currentUserRole === "owner" || currentUserRole === "admin"
  const confirm = useConfirm()

  const handleChangeRole = async (
    memberId: string,
    newRole: TeamRole,
  ) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("team_members")
      .update({ role: newRole })
      .eq("id", memberId)

    if (error) {
      toast.error("Failed to update role")
    } else {
      toast.success("Role updated")
      onRefresh()
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    const name = member.profile?.full_name || member.profile?.email || "this member"
    if (!(await confirm({ title: `Remove ${name} from the team?`, variant: "destructive", actionLabel: "Remove" }))) return

    const supabase = createClient()
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", member.id)

    if (error) {
      toast.error("Failed to remove member")
    } else {
      toast.success("Member removed")
      onRefresh()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="w-[150px]">Role</TableHead>
              {isAdmin && <TableHead className="w-[50px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const profile = member.profile
              const initials = profile?.full_name
                ? profile.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : profile?.email?.slice(0, 2).toUpperCase() ?? "?"

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {profile?.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {profile?.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin && member.role !== "owner" ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          handleChangeRole(member.id, v as TeamRole)
                        }
                      >
                        <SelectTrigger className="h-8 w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`capitalize ${roleBadgeColors[member.role] || ""}`}
                      >
                        {member.role}
                      </Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
