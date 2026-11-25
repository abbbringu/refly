"use client"

import { useMemo, useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import type { Folder } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  APPEARANCE_COLORS,
  MAP_ICON_OPTIONS,
  getMapIcon,
} from "@/lib/entity-appearance"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface FolderAppearanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: Folder
  onSaved: () => void
}

export function FolderAppearanceDialog({
  open,
  onOpenChange,
  folder,
  onSaved,
}: FolderAppearanceDialogProps) {
  const [name, setName] = useState(folder.name)
  const [icon, setIcon] = useState(folder.icon ?? "folder")
  const [color, setColor] = useState(folder.color ?? APPEARANCE_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(folder.name)
    setIcon(folder.icon ?? "folder")
    setColor(folder.color ?? APPEARANCE_COLORS[0])
  }, [folder.name, folder.color, folder.icon, open])

  const PreviewIcon = useMemo(() => getMapIcon(icon), [icon])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Map name is required")
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("folders")
      .update({ name: trimmed, icon, color })
      .eq("id", folder.id)

    if (error) {
      toast.error("Failed to save map", { description: error.message })
      setSaving(false)
      return
    }

    toast.success("Map updated")
    setSaving(false)
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit map</DialogTitle>
          <DialogDescription>
            Update the name, icon, and color for this map.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60"
              style={{ color }}
            >
              <PreviewIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">{name || folder.name}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-name">Name</Label>
            <Input
              id="map-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Map name"
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue placeholder="Select icon" />
              </SelectTrigger>
              <SelectContent>
                {MAP_ICON_OPTIONS.map((option) => {
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

          <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
