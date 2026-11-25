"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { dispatchReflyDataUpdated } from "@/lib/refly-events"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  APPEARANCE_COLORS,
  TEAM_ICON_OPTIONS,
  getTeamIcon,
} from "@/lib/entity-appearance"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface CreateTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTeamDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("users")
  const [color, setColor] = useState(APPEARANCE_COLORS[0])
  const [loading, setLoading] = useState(false)
  const PreviewIcon = getTeamIcon(icon)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Create team
    const { data: team, error: teamError } = await supabase
      .from("teams")
        .insert({
          name,
          description: description || null,
          icon,
          color,
          created_by: user.id,
        })
      .select()
      .single()

    if (teamError || !team) {
      toast.error("Failed to create team", {
        description: teamError?.message,
      })
      setLoading(false)
      return
    }

    // Add creator as owner
    const { error: memberError } = await supabase
      .from("team_members")
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: "owner",
      })

    if (memberError) {
      toast.error("Team created but failed to add you as owner")
    } else {
      toast.success("Team created!")
    }

    setName("")
    setDescription("")
    setIcon("users")
    setColor(APPEARANCE_COLORS[0])
    setLoading(false)
    dispatchReflyDataUpdated({ type: "team", ids: [team.id] })
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Team</DialogTitle>
          <DialogDescription>
            Create a team to collaborate on shared reference libraries.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Team name</Label>
            <Input
              id="teamName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NLP Research Group"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamDescription">Description (optional)</Label>
            <Textarea
              id="teamDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this team about?"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue placeholder="Select icon" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ICON_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60"
                style={{ color }}
              >
                <PreviewIcon className="h-4 w-4" />
              </div>
              <div className="flex flex-wrap gap-2">
                {APPEARANCE_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Set color ${option}`}
                    className={`h-6 w-6 rounded-full border ${
                      color === option ? "border-foreground" : "border-border/60"
                    }`}
                    style={{ backgroundColor: option }}
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create Team"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
