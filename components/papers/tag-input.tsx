"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { TAG_SELECT } from "@/lib/db/selects"
import { dispatchReflyDataUpdated } from "@/lib/refly-events"
import type { Tag } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Check, Plus, X, Sparkles, Tags } from "lucide-react"
import { toast } from "sonner"

export interface SuggestedTag {
  name: string
  isNew: boolean
  onPaper: boolean
  rejected?: boolean
}

interface TagInputProps {
  paperId: string
  tags: Tag[]
  suggestedTags: SuggestedTag[]
  onRefresh: () => void
  onRemoveSuggestion: (name: string) => void
  onApplySuggestions: (names: string[]) => Promise<void>
  applyingSuggestions: boolean
}

const TAG_COLORS = [
  "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
]

export function TagInput({
  paperId,
  tags,
  suggestedTags,
  onRefresh,
  onRemoveSuggestion,
  onApplySuggestions,
  applyingSuggestions,
}: TagInputProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [allTags, setAllTags] = useState<Tag[]>([])

  useEffect(() => {
    const loadAllTags = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("tags")
        .select(TAG_SELECT)
        .order("name")
      if (data) setAllTags(data)
    }
    loadAllTags()
  }, [])

  const handleAddTag = async (tagName: string) => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    let tagId: string
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === tagName.toLowerCase(),
    )

    if (existing) {
      tagId = existing.id
    } else {
      const { data: newTag, error: tagError } = await supabase
        .from("tags")
        .insert({
          user_id: user.id,
          name: tagName,
          color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
        })
        .select()
        .single()

      if (tagError || !newTag) {
        toast.error("Failed to create tag")
        return
      }
      tagId = newTag.id
    }

    if (tags.some((t) => t.id === tagId)) {
      toast.info("Tag already on this paper")
      return
    }

    const { error } = await supabase.from("paper_tags").insert({
      paper_id: paperId,
      tag_id: tagId,
    })

    if (error) {
      toast.error("Failed to add tag")
      return
    }

    setInput("")
    onRefresh()
    dispatchReflyDataUpdated({ type: "tag", ids: [tagId] })
  }

  const handleRemoveTag = async (tagId: string) => {
    const supabase = createClient()
    await supabase
      .from("paper_tags")
      .delete()
      .eq("paper_id", paperId)
      .eq("tag_id", tagId)

    onRefresh()
    dispatchReflyDataUpdated({ type: "tag", ids: [tagId] })
  }

  const handleApplyApproved = async () => {
    const approved = suggestedTags.filter((s) => !s.rejected && !s.onPaper && s.isNew)
    const approvedExisting = suggestedTags.filter((s) => !s.rejected && !s.onPaper && !s.isNew)
    const allApproved = [...approved, ...approvedExisting]
    if (allApproved.length === 0) {
      toast.info("No new tags to apply")
      return
    }
    await onApplySuggestions(allApproved.map((s) => s.name))
  }

  const filteredSuggestions = allTags.filter(
    (t) =>
      t.name.toLowerCase().includes(input.toLowerCase()) &&
      !tags.some((pt) => pt.id === t.id),
  )

  const pendingSuggestions = suggestedTags.filter((s) => !s.onPaper && !s.rejected)
  const alreadyOnPaper = suggestedTags.filter((s) => s.onPaper && !s.rejected)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tags className="h-3.5 w-3.5 text-muted-foreground" />
        {tags.map((tag) => (
          <Badge
            key={tag.id}
            variant="outline"
            className="gap-1 text-xs"
          >
            {tag.name}
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="ml-0.5 rounded-full hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Plus className="mr-1 h-3 w-3" />
              Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="z-[10010] w-60 p-2" align="start">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search or create tag…"
              className="h-8 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  handleAddTag(input.trim())
                }
              }}
            />
            {filteredSuggestions.length > 0 && (
              <div className="mt-2 max-h-40 space-y-0.5 overflow-auto">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Existing tags
                </div>
                {filteredSuggestions.map((tag) => (
                  <button
                    key={tag.id}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    onClick={() => handleAddTag(tag.name)}
                  >
                    <Tags className="h-3 w-3 text-muted-foreground" />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
            {input.trim() &&
              !allTags.some(
                (t) => t.name.toLowerCase() === input.toLowerCase(),
              ) && (
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary hover:bg-primary/10"
                  onClick={() => handleAddTag(input.trim())}
                >
                  <Plus className="h-3 w-3" />
                  Create &quot;{input.trim()}&quot;
                </button>
              )}
          </PopoverContent>
        </Popover>
      </div>

      {suggestedTags.some((s) => !s.rejected) && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span className="font-medium">AI suggestions</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {pendingSuggestions.map((s) => (
              <Badge
                key={`new-${s.name}`}
                variant="outline"
                className={`gap-1 text-xs ${
                  s.isNew
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-400"
                }`}
              >
                {s.isNew && (
                  <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-70">
                    new
                  </span>
                )}
                {s.name}
                <button
                  onClick={() => onRemoveSuggestion(s.name)}
                  className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                  title="Remove suggestion"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}

            {alreadyOnPaper.map((s) => (
              <Badge
                key={`existing-${s.name}`}
                variant="outline"
                className="cursor-pointer gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400"
                onClick={() => onRemoveSuggestion(s.name)}
              >
                {s.name}
                <Check className="h-3 w-3" />
              </Badge>
            ))}
          </div>

          {pendingSuggestions.length > 0 && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleApplyApproved}
              disabled={applyingSuggestions}
            >
              {applyingSuggestions ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Add {pendingSuggestions.length} tag{pendingSuggestions.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
