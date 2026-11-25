"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { TEAM_SELECT } from "@/lib/db/selects"
import type { Team } from "@/types"
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  APPEARANCE_COLORS,
  TEAM_ICON_OPTIONS,
  getTeamIcon,
} from "@/lib/entity-appearance"
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

export default function TeamSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.teamId as string

  const [team, setTeam] = useState<Team | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("users")
  const [color, setColor] = useState(APPEARANCE_COLORS[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const PreviewIcon = getTeamIcon(icon)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("teams")
        .select(TEAM_SELECT)
        .eq("id", teamId)
        .single()
      if (data) {
        setTeam(data)
        setName(data.name)
        setDescription(data.description || "")
        setIcon(data.icon || "users")
        setColor(data.color || APPEARANCE_COLORS[0])
      }
      setLoading(false)
    }
    load()
  }, [teamId])

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("teams")
      .update({ name, description: description || null, icon, color })
      .eq("id", teamId)

    if (error) {
      toast.error("Failed to save")
    } else {
      toast.success("Settings saved")
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    const supabase = createClient()
    const { error } = await supabase.from("teams").delete().eq("id", teamId)

    if (error) {
      toast.error("Failed to delete team")
    } else {
      toast.success("Team deleted")
      router.push("/teams")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Team Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>
            Update your team&apos;s name and description.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Team name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Danger Zone
          </CardTitle>
          <CardDescription>
            Deleting a team is permanent and cannot be undone. All team
            papers will be deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Team
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete team?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the team &quot;{team?.name}&quot;
                  and all its papers. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
