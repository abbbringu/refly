"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  defaultValue?: string
  onSubmit: (value: string) => void | Promise<void>
  placeholder?: string
}

export function PromptDialog({ 
  open, 
  onOpenChange, 
  title, 
  description, 
  defaultValue = "", 
  placeholder = "",
  onSubmit 
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      setLoading(true)
      try {
        await onSubmit(value.trim())
        onOpenChange(false)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="py-4">
            <Input 
              autoFocus 
              value={value} 
              onChange={e => setValue(e.target.value)} 
              placeholder={placeholder}
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !value.trim()}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
