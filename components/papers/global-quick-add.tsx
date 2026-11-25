"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import {
  AddPaperDialog,
  type AddPaperDialogPrefill,
} from "@/components/papers/add-paper-dialog"

const SPECIAL_LIBRARY_ROUTES = new Set(["add", "import", "recent", "favorites"])

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || target.isContentEditable
}

function extractDoi(text: string) {
  const doiUrlMatch = text.match(/https?:\/\/(?:dx\.)?doi\.org\/([^\s]+)/i)
  if (doiUrlMatch?.[1]) {
    return decodeURIComponent(doiUrlMatch[1]).replace(/[)\],.;]+$/, "")
  }

  const doiMatch = text.match(/\b10\.\d{4,9}\/[\-._;()/:A-Z0-9]+\b/i)
  return doiMatch?.[0] ? doiMatch[0].replace(/[)\],.;]+$/, "") : null
}

function extractArxivId(text: string) {
  const arxivUrlMatch = text.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)(?:\.pdf)?/i)
  if (arxivUrlMatch?.[1]) {
    return arxivUrlMatch[1].replace(/\.pdf$/i, "").replace(/[)\],.;]+$/, "")
  }

  const arxivIdMatch = text.match(
    /\b(?:arxiv:)?([a-z\-]+\/[0-9]{7}(?:v\d+)?|\d{4}\.\d{4,5}(?:v\d+)?)\b/i,
  )
  return arxivIdMatch?.[1] || null
}

function extractUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s]+/i)
  return match?.[0] ? match[0].replace(/[)\],.;]+$/, "") : null
}

function resolveContext(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)

  if (segments[0] === "teams" && segments[1]) {
    const teamId = segments[1]
    if (!segments[2]) {
      return { teamId }
    }
    if (segments[2] === "folder" && segments[3]) {
      return { teamId, folderId: segments[3] }
    }
    return {}
  }

  if (segments[0] === "library" && segments[1] && !SPECIAL_LIBRARY_ROUTES.has(segments[1])) {
    return { folderId: segments[1] }
  }

  return {}
}

export function GlobalQuickAdd() {
  const pathname = usePathname()
  const context = useMemo(() => resolveContext(pathname), [pathname])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefill, setPrefill] = useState<AddPaperDialogPrefill | null>(null)

  const prefillCounterRef = useRef(0)

  const openQuickAdd = useCallback((nextPrefill: Omit<AddPaperDialogPrefill, "key">) => {
    prefillCounterRef.current += 1
    setPrefill({
      ...nextPrefill,
      key: `quick-add-${Date.now()}-${prefillCounterRef.current}`,
    })
    setDialogOpen(true)
  }, [])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return

      const text = event.clipboardData?.getData("text")?.trim()
      if (!text) return

      const doi = extractDoi(text)
      if (doi) {
        event.preventDefault()
        toast.info("Importing DOI from clipboard…")
        openQuickAdd({
          tab: "identifier",
          identifierType: "doi",
          identifier: doi,
          autoSubmit: true,
        })
        return
      }

      const arxivId = extractArxivId(text)
      if (arxivId) {
        event.preventDefault()
        toast.info("Importing arXiv paper from clipboard…")
        openQuickAdd({
          tab: "identifier",
          identifierType: "arxiv",
          identifier: arxivId,
          autoSubmit: true,
        })
        return
      }

      const url = extractUrl(text)
      if (url) {
        event.preventDefault()
        toast.info("Importing paper URL from clipboard…")
        openQuickAdd({
          tab: "url",
          url,
          autoSubmit: true,
        })
      }
    }

    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [openQuickAdd])

  return (
    <>
      <AddPaperDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setDialogOpen(false)
        }}
        teamId={context.teamId}
        folderId={context.folderId}
        prefill={prefill}
      />
    </>
  )
}
