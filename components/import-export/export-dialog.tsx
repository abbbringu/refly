"use client"

import { useState } from "react"
import type { Paper } from "@/types"
import { exportPapers } from "@/lib/exporters"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Download, FileText } from "lucide-react"
import { toast } from "sonner"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  papers: Paper[]
}

export function ExportDialog({
  open,
  onOpenChange,
  papers,
}: ExportDialogProps) {
  const [format, setFormat] = useState("bibtex")

  const handleExport = () => {
    try {
      const { content, filename, mimeType } = exportPapers(papers, format)

      // Create blob and download
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${papers.length} paper(s) as ${format.toUpperCase()}`)
      onOpenChange(false)
    } catch (err: any) {
      toast.error("Export failed", { description: err.message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export References</DialogTitle>
          <DialogDescription>
            Export {papers.length} paper{papers.length !== 1 ? "s" : ""} to
            a reference file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Export format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bibtex">
                  BibTeX (.bib)
                </SelectItem>
                <SelectItem value="ris">
                  RIS (.ris)
                </SelectItem>
                <SelectItem value="csl-json">
                  CSL JSON (.json)
                </SelectItem>
                <SelectItem value="endnote-xml">
                  EndNote XML (.xml)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>
                {papers.length} paper{papers.length !== 1 ? "s" : ""} will
                be exported
              </span>
            </div>
          </div>

          <Button onClick={handleExport} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Download{" "}
            {format === "bibtex"
              ? ".bib"
              : format === "ris"
                ? ".ris"
                : format === "csl-json"
                  ? ".json"
                  : ".xml"}{" "}
            file
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
