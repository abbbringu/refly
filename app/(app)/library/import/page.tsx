"use client"

import { BulkImportForm } from "@/components/import-export/bulk-import-form"
import { useRouter } from "next/navigation"

export default function ImportPage() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import References</h1>
        <p className="text-sm text-muted-foreground">
          Import references from BibTeX, RIS, CSL JSON, or EndNote XML files.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <BulkImportForm
          onSuccess={() => {
            router.push("/library")
          }}
        />
      </div>
    </div>
  )
}
