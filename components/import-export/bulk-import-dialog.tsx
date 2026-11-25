"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BulkImportForm } from "@/components/import-export/bulk-import-form"

interface BulkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  teamId?: string
}

export function BulkImportDialog({
  open,
  onOpenChange,
  onSuccess,
  teamId,
}: BulkImportDialogProps) {
  const handleClose = () => {
    onOpenChange(false)
  }

  const handleSuccess = () => {
    onSuccess()
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import</DialogTitle>
          <DialogDescription>
            Import references from BibTeX, RIS, CSL JSON, or EndNote XML.
          </DialogDescription>
        </DialogHeader>

        <BulkImportForm
          onSuccess={handleSuccess}
          onCancel={handleClose}
          teamId={teamId}
        />
      </DialogContent>
    </Dialog>
  )
}

