"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import type { TeamRole } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  onSuccess: () => void
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  teamId,
  onSuccess,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<TeamRole>("editor")
  const [loading, setLoading] = useState(false)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Check if the invited user exists in profiles
    const { data: invitedProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim())
      .single()

    if (invitedProfile) {
      // User exists — add directly as team member
      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: invitedProfile.id,
        role,
      })

      if (error) {
        if (error.code === "23505") {
          toast.error("This user is already a team member")
        } else {
          toast.error("Failed to add member", {
            description: error.message,
          })
        }
        setLoading(false)
        return
      }

      toast.success("Member added to team!")
    } else {
      // User doesn't exist — create invite
      const { error } = await supabase.from("team_invites").insert({
        team_id: teamId,
        email: email.trim(),
        role,
        invited_by: user.id,
      })

      if (error) {
        if (error.code === "23505") {
          toast.error("An invite has already been sent to this email")
        } else {
          toast.error("Failed to create invite", {
            description: error.message,
          })
        }
        setLoading(false)
        return
      }

      toast.success("Invitation sent!", {
        description: `${email} will be added when they sign up.`,
      })
    }

    setEmail("")
    setRole("editor")
    setLoading(false)
    onSuccess()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Add a team member by email. If they have an account, they'll
            be added immediately. Otherwise, they'll be invited.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@university.edu"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as TeamRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  Admin — Can manage members and settings
                </SelectItem>
                <SelectItem value="editor">
                  Editor — Can add and edit papers
                </SelectItem>
                <SelectItem value="viewer">
                  Viewer — Can only read papers
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inviting…
              </>
            ) : (
              "Send Invite"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
