"use client"

import { createPortal } from "react-dom"
import { Bot, FileText, User } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import { createClient } from "@/utils/supabase/client"
import { PAPER_FILE_SELECT } from "@/lib/db/selects"
import type { RagSource } from "@/lib/ai/rag"
import { toast } from "sonner"
import { ChatMessageErrorBoundary } from "./chat-message-error-boundary"

interface ChatMessageProps {
  role: "assistant" | "user"
  content: string
  sources?: RagSource[]
}

function enrichCitations(content: string, sources: RagSource[]) {
  if (sources.length === 0) return content

  const sourceById = new Map(sources.map((source) => [source.sourceId, source]))

  return content.replace(/\[S(\d+)\]/g, (match, index) => {
    const sourceId = `S${index}`
    const source = sourceById.get(sourceId)
    if (!source) return match

    return `[${sourceId}](/paper/${source.paperId})`
  })
}

function preprocessMathDelimiters(content: string): string {
  // remark-math v6 only parses $...$ and $$...$$ by default.
  // Display $$ must be on its own line for the parser to recognize it.
  // $$ in replacement string = literal $ (so $$$$ = $$)
  const result = content
    .replace(/\\\[([\s\S]*?)\\\]/g, "\n$$$$\n$1\n$$$$\n")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$$1$$")
  return result
}

function SafeMarkdown({
  content,
  components,
}: {
  content: string
  components: React.ComponentProps<typeof ReactMarkdown>["components"]
}) {
  const processed = preprocessMathDelimiters(content)
  try {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: false }],
        ]}
        components={components}
      >
        {processed}
      </ReactMarkdown>
    )
  } catch (error) {
    console.error("[SafeMarkdown] ReactMarkdown threw:", error)
    return (
      <pre className="whitespace-pre-wrap text-sm text-red-500">
        {String(error)}
      </pre>
    )
  }
}

function CitationCard({
  source,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  source: RagSource
  anchorRect: DOMRect | null
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [openingPdf, setOpeningPdf] = useState(false)

  if (!anchorRect) return null

  const authorPreview = source.authors.slice(0, 3).join(", ")
  const authorText =
    source.authors.length > 3
      ? `${authorPreview}, et al.`
      : authorPreview || "Unknown authors"

  const left = anchorRect.left + anchorRect.width / 2
  const top = anchorRect.top - 8

  const handleOpenPDF = async () => {
    setOpeningPdf(true)
    const supabase = createClient()
    const { data: files } = await supabase
      .from("paper_files")
      .select(PAPER_FILE_SELECT)
      .eq("paper_id", source.paperId)
      .eq("mime_type", "application/pdf")
      .limit(1)
      .single()

    if (files) {
      const { data, error } = await supabase.storage
        .from("papers")
        .createSignedUrl(files.file_path, 3600)

      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank")
      } else {
        toast.error("Failed to load PDF")
      }
    } else {
      toast.error("No PDF available")
    }
    setOpeningPdf(false)
  }

  return createPortal(
    <div
      className="fixed z-[100] w-80 -translate-x-1/2 -translate-y-full rounded-xl border border-border/60 bg-popover px-4 py-3 text-left text-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-border/60 bg-popover" />
      <div className="relative space-y-2">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {source.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {authorText}
          {source.year ? ` · ${source.year}` : ""}
        </p>
        {source.abstractSnippet ? (
          <p className="line-clamp-5 text-xs leading-relaxed text-muted-foreground">
            {source.abstractSnippet}
          </p>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/paper/${source.paperId}`}
            className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary no-underline hover:bg-primary/15"
          >
            Open paper →
          </Link>
          {source.hasPdf && (
            <button
              onClick={handleOpenPDF}
              disabled={openingPdf}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 no-underline hover:bg-emerald-500/15 disabled:opacity-50"
            >
              <FileText className="h-3 w-3" />
              {openingPdf ? "Loading..." : "View PDF"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CitationLink({
  href,
  source,
  onHover,
  onLeave,
  children,
}: {
  href: string
  source: RagSource
  onHover: (source: RagSource, rect: DOMRect) => void
  onLeave: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLAnchorElement>(null)

  const handleMouseEnter = useCallback(() => {
    if (ref.current) {
      onHover(source, ref.current.getBoundingClientRect())
    }
  }, [source, onHover])

  return (
    <Link
      ref={ref}
      href={href}
      className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium text-primary no-underline hover:bg-muted/60"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </Link>
  )
}

export function ChatMessage({ role, content, sources = [] }: ChatMessageProps) {
  const isAssistant = role === "assistant"
  const markdownContent = isAssistant ? enrichCitations(content, sources) : content
  const sourceByPaperId = new Map(sources.map((source) => [source.paperId, source]))

  const [hoveredSource, setHoveredSource] = useState<RagSource | null>(null)
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCitationHover = useCallback((source: RagSource, rect: DOMRect) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setHoveredSource(source)
    setHoveredRect(rect)
  }, [])

  const handleCitationLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setHoveredSource(null)
      setHoveredRect(null)
    }, 150)
  }, [])

  const handleCardLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setHoveredSource(null)
      setHoveredRect(null)
    }, 150)
  }, [])

  const handleCardEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  return (
    <div
      className={`flex gap-4 ${isAssistant ? "flex-row" : "flex-row-reverse"}`}
    >
      <div
        className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 shadow-sm ${
          isAssistant
            ? "bg-primary/15 text-primary"
            : "bg-primary/10 text-primary"
        }`}
      >
        {isAssistant ? (
          <Bot className="h-5 w-5" />
        ) : (
          <User className="h-5 w-5" />
        )}
      </div>

      <div
        className={`${isAssistant ? "w-full" : "max-w-[80%]"} ${isAssistant ? "text-left" : "text-right"}`}
      >
        <div
          className={`rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${
            isAssistant
              ? "glass-2 rounded-tl-sm bg-card/80 text-foreground"
              : "rounded-tr-sm bg-blue-600 text-white"
          }`}
        >
          {isAssistant ? (
            <div className="space-y-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_thead]:bg-muted/40 [&_th]:border [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-xs [&_th]:font-semibold [&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top">
              <ChatMessageErrorBoundary
                onError={(error, errorInfo) => {
                  console.error(
                    "[ChatMessage] ErrorBoundary caught:",
                    error,
                    errorInfo
                  )
                }}
              >
                <SafeMarkdown
                  content={markdownContent}
                  components={{
                    table: ({ ...props }) => (
                      <div className="my-3 overflow-x-auto rounded-lg border border-border/50">
                        <table {...props} />
                      </div>
                    ),
                    a: ({ href, children, ...props }) => {
                      if (!href) return <a {...props}>{children}</a>

                      if (href.startsWith("/paper/")) {
                        const paperId = href.split("/")[2] || ""
                        const source = sourceByPaperId.get(paperId)

                        if (source) {
                          return (
                            <CitationLink
                              href={href}
                              source={source}
                              onHover={handleCitationHover}
                              onLeave={handleCitationLeave}
                            >
                              {children}
                            </CitationLink>
                          )
                        }
                      }

                      if (href.startsWith("/")) {
                        return <Link href={href}>{children}</Link>
                      }

                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          {...props}
                        >
                          {children}
                        </a>
                      )
                    },
                  }}
                />
              </ChatMessageErrorBoundary>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{content}</p>
          )}
        </div>
      </div>

      {hoveredSource && (
        <CitationCard
          source={hoveredSource}
          anchorRect={hoveredRect}
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleCardLeave}
        />
      )}
    </div>
  )
}
