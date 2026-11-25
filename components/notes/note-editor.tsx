"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { createClient } from "@/utils/supabase/client"
import type { Note } from "@/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Bold,
  ChevronDown,
  ChevronRight,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  Loader2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pencil,
  Plus,
  Quote,
  Save,
  Sigma,
  SquareCode,
  Table2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/confirm-provider"
import { formatDistanceToNow } from "date-fns"
import rehypeKatex from "rehype-katex"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { checkStorageQuota, formatBytes, utf8Length } from "@/lib/storage/quota"

interface NoteEditorProps {
  paperId: string
  notes: Note[]
  onRefresh: () => void
}

interface MarkdownToolbarProps {
  onInsert: (before: string, after?: string, placeholder?: string) => void
}

interface MarkdownContentProps {
  content: string
  emptyMessage?: string
  compact?: boolean
}

interface InteractiveMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoFocus?: boolean
  panelClassName?: string
}

interface MarkdownBlockRange {
  start: number
  end: number
  type: "code" | "table"
}

function getNotePreview(content: string) {
  const plain = content
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#>*_~\-\[\]()|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!plain) return "Empty note"
  if (plain.length <= 120) return plain
  return `${plain.slice(0, 117)}...`
}

function MarkdownToolbar({ onInsert }: MarkdownToolbarProps) {
  const actions = [
    {
      label: "H1",
      icon: Heading1,
      before: "# ",
      after: "",
      placeholder: "Heading",
    },
    {
      label: "H2",
      icon: Heading2,
      before: "## ",
      after: "",
      placeholder: "Subheading",
    },
    {
      label: "Bold",
      icon: Bold,
      before: "**",
      after: "**",
      placeholder: "bold",
    },
    {
      label: "Italic",
      icon: Italic,
      before: "*",
      after: "*",
      placeholder: "italic",
    },
    {
      label: "Code",
      icon: Code,
      before: "`",
      after: "`",
      placeholder: "code",
    },
    {
      label: "Quote",
      icon: Quote,
      before: "> ",
      after: "",
      placeholder: "quote",
    },
    {
      label: "Bullet",
      icon: List,
      before: "- ",
      after: "",
      placeholder: "item",
    },
    {
      label: "Numbered",
      icon: ListOrdered,
      before: "1. ",
      after: "",
      placeholder: "item",
    },
    {
      label: "Task",
      icon: ListTodo,
      before: "- [ ] ",
      after: "",
      placeholder: "task",
    },
    {
      label: "Link",
      icon: Link2,
      before: "[",
      after: "](https://)",
      placeholder: "text",
    },
    {
      label: "Code Block",
      icon: SquareCode,
      before: "```\n",
      after: "\n```",
      placeholder: "your code",
    },
    {
      label: "Math",
      icon: Sigma,
      before: "$",
      after: "$",
      placeholder: "x^2 + y^2 = z^2",
    },
    {
      label: "Math Block",
      icon: Sigma,
      before: "$$\n",
      after: "\n$$",
      placeholder: "\\int_0^1 x^2 \\mathrm{d}x",
    },
    {
      label: "Table",
      icon: Table2,
      before: "| Column 1 | Column 2 |\n| --- | --- |\n| ",
      after: " | value |",
      placeholder: "value",
    },
    {
      label: "Divider",
      icon: Minus,
      before: "\n---\n",
      after: "",
      placeholder: "",
    },
  ] as {
    label: string
    icon: LucideIcon
    before: string
    after: string
    placeholder: string
  }[]

  return (
    <div className="flex flex-wrap gap-1 border-b pb-2">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          title={action.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            onInsert(action.before, action.after, action.placeholder)
          }
        >
          <action.icon className="h-3.5 w-3.5" />
          {action.label}
        </Button>
      ))}
    </div>
  )
}

function MarkdownContent({
  content,
  emptyMessage = "Nothing to preview yet.",
  compact = false,
}: MarkdownContentProps) {
  if (!content.trim()) {
    return emptyMessage ? (
      <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>
    ) : (
      <div className="h-7" />
    )
  }

  return (
    <div
      className={`text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_hr]:my-4 [&_li]:ml-4 [&_li.task-list-item]:ml-0 [&_li.task-list-item]:flex [&_li.task-list-item]:list-none [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 [&_li.task-list-item>input]:mt-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-md [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_ul]:list-disc [&_ul]:space-y-1 [&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0 ${
        compact ? "[&_p]:mb-0" : "space-y-3 [&_p]:mb-2"
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function InteractiveMarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus = false,
  panelClassName,
}: InteractiveMarkdownEditorProps) {
  const lines = value.split("\n")
  const [activeLine, setActiveLine] = useState(0)
  const [isRawMode, setIsRawMode] = useState(false)
  const activeIndex = Math.min(activeLine, lines.length - 1)
  const lineRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const codeBlockEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const rawEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const hasAutoFocused = useRef(false)

  const markdownBlockRanges: MarkdownBlockRange[] = []
  let codeBlockStart: number | null = null

  lines.forEach((line, index) => {
    if (!line.trimStart().startsWith("```")) return

    if (codeBlockStart === null) {
      codeBlockStart = index
      return
    }

    markdownBlockRanges.push({
      start: codeBlockStart,
      end: index,
      type: "code",
    })
    codeBlockStart = null
  })

  if (codeBlockStart !== null) {
    markdownBlockRanges.push({
      start: codeBlockStart,
      end: lines.length - 1,
      type: "code",
    })
  }

  const isCodeLine = (lineIndex: number) =>
    markdownBlockRanges.some(
      (range) =>
        range.type === "code" &&
        lineIndex >= range.start &&
        lineIndex <= range.end
    )

  const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line)
  let tableStart: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    if (isCodeLine(index)) {
      if (tableStart !== null && index - tableStart >= 2) {
        markdownBlockRanges.push({
          start: tableStart,
          end: index - 1,
          type: "table",
        })
      }
      tableStart = null
      continue
    }

    if (isTableLine(lines[index] ?? "")) {
      if (tableStart === null) tableStart = index
      continue
    }

    if (tableStart !== null && index - tableStart >= 2) {
      markdownBlockRanges.push({
        start: tableStart,
        end: index - 1,
        type: "table",
      })
    }
    tableStart = null
  }

  if (tableStart !== null && lines.length - tableStart >= 2) {
    markdownBlockRanges.push({
      start: tableStart,
      end: lines.length - 1,
      type: "table",
    })
  }

  markdownBlockRanges.sort((a, b) => a.start - b.start)

  const activeMarkdownBlock =
    markdownBlockRanges.find(
      (range) => activeIndex >= range.start && activeIndex <= range.end
    ) ?? null
  const activeMarkdownBlockKey = activeMarkdownBlock
    ? `${activeMarkdownBlock.type}-${activeMarkdownBlock.start}-${activeMarkdownBlock.end}`
    : ""

  useEffect(() => {
    if (!autoFocus || hasAutoFocused.current) return
    hasAutoFocused.current = true
    requestAnimationFrame(() => {
      if (isRawMode) {
        rawEditorRef.current?.focus()
        return
      }

      if (activeMarkdownBlock) {
        codeBlockEditorRef.current?.focus()
        return
      }

      lineRefs.current[activeIndex]?.focus()
    })
  }, [activeMarkdownBlock, activeIndex, autoFocus, isRawMode])

  useEffect(() => {
    if (!activeMarkdownBlock) return
    requestAnimationFrame(() => {
      codeBlockEditorRef.current?.focus()
    })
  }, [activeMarkdownBlock, activeMarkdownBlockKey])

  const focusLine = (lineIndex: number, caret: "start" | "end" = "end") => {
    requestAnimationFrame(() => {
      const target = lineRefs.current[lineIndex]
      if (!target) return
      target.focus()
      const position = caret === "start" ? 0 : target.value.length
      target.setSelectionRange(position, position)
    })
  }

  const setLines = (nextLines: string[]) => {
    onChange(nextLines.join("\n"))
  }

  const updateLine = (lineIndex: number, lineValue: string) => {
    const nextLines = [...lines]
    nextLines[lineIndex] = lineValue
    setLines(nextLines)
  }

  const insertMarkdown = (
    before: string,
    after = "",
    placeholderText = "text"
  ) => {
    if (isRawMode) {
      const target = rawEditorRef.current
      if (!target) return

      const start = target.selectionStart
      const end = target.selectionEnd
      const selected = value.slice(start, end)
      const content = selected || placeholderText
      const nextValue = `${value.slice(0, start)}${before}${content}${after}${value.slice(end)}`

      onChange(nextValue)

      requestAnimationFrame(() => {
        const textarea = rawEditorRef.current
        if (!textarea) return
        textarea.focus()
        const selectionStart = start + before.length
        const selectionEnd = selectionStart + content.length
        textarea.setSelectionRange(selectionStart, selectionEnd)
      })

      return
    }

    if (activeMarkdownBlock) {
      const target = codeBlockEditorRef.current
      if (!target) return

      const start = target.selectionStart
      const end = target.selectionEnd
      const blockValue = lines
        .slice(activeMarkdownBlock.start, activeMarkdownBlock.end + 1)
        .join("\n")
      const selected = blockValue.slice(start, end)
      const content = selected || placeholderText
      const nextBlockValue = `${blockValue.slice(0, start)}${before}${content}${after}${blockValue.slice(end)}`

      const replacementLines = nextBlockValue.split("\n")
      const nextLines = [...lines]
      nextLines.splice(
        activeMarkdownBlock.start,
        activeMarkdownBlock.end - activeMarkdownBlock.start + 1,
        ...replacementLines
      )

      setLines(nextLines)
      const nextActiveLine = Math.min(
        activeMarkdownBlock.start + replacementLines.length - 1,
        nextLines.length - 1
      )
      setActiveLine(nextActiveLine)

      requestAnimationFrame(() => {
        const textarea = codeBlockEditorRef.current
        if (!textarea) return
        textarea.focus()
        const selectionStart = start + before.length
        const selectionEnd = selectionStart + content.length
        textarea.setSelectionRange(selectionStart, selectionEnd)
      })

      return
    }

    const target = lineRefs.current[activeIndex]
    if (!target) return

    const lineValue = lines[activeIndex] ?? ""
    const start = target.selectionStart
    const end = target.selectionEnd
    const selected = lineValue.slice(start, end)
    const content = selected || placeholderText
    const nextLine = `${lineValue.slice(0, start)}${before}${content}${after}${lineValue.slice(end)}`

    updateLine(activeIndex, nextLine)

    requestAnimationFrame(() => {
      const textarea = lineRefs.current[activeIndex]
      if (!textarea) return
      textarea.focus()
      const selectionStart = start + before.length
      const selectionEnd = selectionStart + content.length
      textarea.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  const getLineContinuationPrefix = (line: string) => {
    const taskMatch = line.match(/^(\s*)- \[(?: |x|X)\]\s+(.*)$/)
    if (taskMatch) return `${taskMatch[1]}- [ ] `

    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)$/)
    if (bulletMatch) return `${bulletMatch[1]}${bulletMatch[2]} `

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
    if (orderedMatch)
      return `${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `

    const quoteMatch = line.match(/^(\s*)>\s?(.*)$/)
    if (quoteMatch) return `${quoteMatch[1]}> `

    return null
  }

  const isPrefixOnlyLine = (line: string) => {
    const taskMatch = line.match(/^(\s*)- \[(?: |x|X)\]\s*(.*)$/)
    if (taskMatch) return taskMatch[2].trim().length === 0

    const bulletMatch = line.match(/^(\s*)([-*+])\s*(.*)$/)
    if (bulletMatch) return bulletMatch[3].trim().length === 0

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s*(.*)$/)
    if (orderedMatch) return orderedMatch[3].trim().length === 0

    const quoteMatch = line.match(/^(\s*)>\s*(.*)$/)
    if (quoteMatch) return quoteMatch[2].trim().length === 0

    return false
  }

  const handleLineKeyDown = (
    lineIndex: number,
    e: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget

    if (
      e.altKey &&
      e.shiftKey &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault()
      const current = lines[lineIndex] ?? ""
      const nextLines = [...lines]
      const column = target.selectionStart

      if (e.key === "ArrowDown") {
        nextLines.splice(lineIndex + 1, 0, current)
        setLines(nextLines)
        const nextLineIndex = lineIndex + 1
        setActiveLine(nextLineIndex)
        requestAnimationFrame(() => {
          const textarea = lineRefs.current[nextLineIndex]
          if (!textarea) return
          textarea.focus()
          const cursor = Math.min(column, textarea.value.length)
          textarea.setSelectionRange(cursor, cursor)
        })
      } else {
        nextLines.splice(lineIndex, 0, current)
        setLines(nextLines)
        setActiveLine(lineIndex)
        requestAnimationFrame(() => {
          const textarea = lineRefs.current[lineIndex]
          if (!textarea) return
          textarea.focus()
          const cursor = Math.min(column, textarea.value.length)
          textarea.setSelectionRange(cursor, cursor)
        })
      }

      return
    }

    if (e.key === "Tab") {
      e.preventDefault()
      const start = target.selectionStart
      const end = target.selectionEnd
      const nextLine = `${target.value.slice(0, start)}  ${target.value.slice(end)}`
      updateLine(lineIndex, nextLine)
      requestAnimationFrame(() => {
        const textarea = lineRefs.current[lineIndex]
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(start + 2, start + 2)
      })
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      const start = target.selectionStart
      const current = lines[lineIndex] ?? ""
      const before = current.slice(0, start)
      const after = current.slice(start)

      if (start === current.length && isPrefixOnlyLine(before)) {
        const nextLines = [...lines]
        nextLines[lineIndex] = ""
        setLines(nextLines)
        setActiveLine(lineIndex)
        focusLine(lineIndex, "start")
        return
      }

      const continuationPrefix = getLineContinuationPrefix(before)
      const nextLines = [...lines]

      if (continuationPrefix) {
        nextLines.splice(lineIndex, 1, before, `${continuationPrefix}${after}`)
      } else {
        nextLines.splice(lineIndex, 1, before, after)
      }

      setLines(nextLines)
      const nextLineIndex = lineIndex + 1
      setActiveLine(nextLineIndex)
      focusLine(nextLineIndex, continuationPrefix ? "end" : "start")
      return
    }

    if (e.key === "Backspace" && target.selectionStart === 0 && lineIndex > 0) {
      e.preventDefault()
      const previous = lines[lineIndex - 1] ?? ""
      const current = lines[lineIndex] ?? ""
      const nextLines = [...lines]
      nextLines.splice(lineIndex - 1, 2, `${previous}${current}`)
      setLines(nextLines)
      const nextLineIndex = lineIndex - 1
      setActiveLine(nextLineIndex)
      focusLine(nextLineIndex, "end")
      return
    }

    if (e.key === "ArrowUp" && target.selectionStart === 0 && lineIndex > 0) {
      e.preventDefault()
      const nextLineIndex = lineIndex - 1
      setActiveLine(nextLineIndex)
      focusLine(nextLineIndex, "end")
      return
    }

    if (
      e.key === "ArrowDown" &&
      target.selectionStart === target.value.length &&
      lineIndex < lines.length - 1
    ) {
      e.preventDefault()
      const nextLineIndex = lineIndex + 1
      setActiveLine(nextLineIndex)
      focusLine(nextLineIndex, "start")
    }
  }

  const handleMarkdownBlockKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    const activeRange = activeMarkdownBlock
    if (!activeRange) return

    if (e.key === "ArrowUp") {
      const target = e.currentTarget
      if (
        target.selectionStart === 0 &&
        target.selectionEnd === 0 &&
        activeRange.start > 0
      ) {
        e.preventDefault()
        const nextLineIndex = activeRange.start - 1
        setActiveLine(nextLineIndex)
        focusLine(nextLineIndex, "end")
      }
      return
    }

    if (e.key === "ArrowDown") {
      const target = e.currentTarget
      const atEnd =
        target.selectionStart === target.value.length &&
        target.selectionEnd === target.value.length

      if (atEnd && activeRange.end < lines.length - 1) {
        e.preventDefault()
        const nextLineIndex = activeRange.end + 1
        setActiveLine(nextLineIndex)
        focusLine(nextLineIndex, "start")
      }
      return
    }

    if (
      e.altKey &&
      e.shiftKey &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const activeText = lines
        .slice(activeRange.start, activeRange.end + 1)
        .join("\n")
      const lineStart = activeText.lastIndexOf("\n", start - 1) + 1
      const lineBreak = activeText.indexOf("\n", end)
      const lineEnd = lineBreak === -1 ? activeText.length : lineBreak
      const lineContent = activeText.slice(lineStart, lineEnd)
      const column = start - lineStart

      let nextText = activeText
      let nextCursor = start

      if (e.key === "ArrowDown") {
        if (lineEnd === activeText.length) {
          nextText = `${activeText}\n${lineContent}`
        } else {
          const insertAt = lineEnd + 1
          nextText = `${activeText.slice(0, insertAt)}${lineContent}\n${activeText.slice(insertAt)}`
        }
        nextCursor = Math.min(lineEnd + 1 + column, nextText.length)
      } else {
        nextText = `${activeText.slice(0, lineStart)}${lineContent}\n${activeText.slice(lineStart)}`
        nextCursor = Math.max(lineStart + column, 0)
      }

      const replacementLines = nextText.split("\n")
      const nextLines = [...lines]
      nextLines.splice(
        activeRange.start,
        activeRange.end - activeRange.start + 1,
        ...replacementLines
      )
      setLines(nextLines)
      setActiveLine(activeRange.start)

      requestAnimationFrame(() => {
        const textarea = codeBlockEditorRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(nextCursor, nextCursor)
      })
      return
    }

    if (e.key !== "Tab") return

    e.preventDefault()
    const target = e.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd

    const blockValue = lines
      .slice(activeRange.start, activeRange.end + 1)
      .join("\n")
    const nextBlockValue = `${blockValue.slice(0, start)}  ${blockValue.slice(end)}`
    const replacementLines = nextBlockValue.split("\n")
    const nextLines = [...lines]

    nextLines.splice(
      activeRange.start,
      activeRange.end - activeRange.start + 1,
      ...replacementLines
    )

    setLines(nextLines)
    setActiveLine(Math.min(activeRange.start, nextLines.length - 1))

    requestAnimationFrame(() => {
      const textarea = codeBlockEditorRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(start + 2, start + 2)
    })
  }

  const handleRawEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget

    if (
      e.altKey &&
      e.shiftKey &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault()
      const start = target.selectionStart
      const end = target.selectionEnd
      const lineStart = value.lastIndexOf("\n", start - 1) + 1
      const lineBreak = value.indexOf("\n", end)
      const lineEnd = lineBreak === -1 ? value.length : lineBreak
      const lineContent = value.slice(lineStart, lineEnd)
      const column = start - lineStart

      let nextValue = value
      let nextCursor = start

      if (e.key === "ArrowDown") {
        if (lineEnd === value.length) {
          nextValue = `${value}\n${lineContent}`
        } else {
          const insertAt = lineEnd + 1
          nextValue = `${value.slice(0, insertAt)}${lineContent}\n${value.slice(insertAt)}`
        }
        nextCursor = Math.min(lineEnd + 1 + column, nextValue.length)
      } else {
        nextValue = `${value.slice(0, lineStart)}${lineContent}\n${value.slice(lineStart)}`
        nextCursor = Math.max(lineStart + column, 0)
      }

      onChange(nextValue)

      requestAnimationFrame(() => {
        const textarea = rawEditorRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(nextCursor, nextCursor)
      })
      return
    }

    if (e.key !== "Tab") return

    e.preventDefault()
    const start = target.selectionStart
    const end = target.selectionEnd
    const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`
    onChange(nextValue)

    requestAnimationFrame(() => {
      const textarea = rawEditorRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(start + 2, start + 2)
    })
  }

  const segments: Array<
    | { type: "line"; index: number }
    | { type: "block"; range: MarkdownBlockRange }
  > = []
  let cursor = 0

  while (cursor < lines.length) {
    const blockRange = markdownBlockRanges.find(
      (range) => range.start === cursor
    )

    if (blockRange) {
      segments.push({ type: "block", range: blockRange })
      cursor = blockRange.end + 1
      continue
    }

    segments.push({ type: "line", index: cursor })
    cursor += 1
  }

  return (
    <div
      className={`flex flex-col rounded-md border bg-background px-3 py-2 ${panelClassName ?? ""}`}
    >
      <MarkdownToolbar onInsert={insertMarkdown} />
      <div className="flex justify-end border-b pt-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setIsRawMode((prev) => !prev)}
        >
          {isRawMode ? "Interactive" : "Multi-line"}
        </Button>
      </div>
      {isRawMode ? (
        <div className="pt-2">
          <Textarea
            ref={rawEditorRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleRawEditorKeyDown}
            placeholder={placeholder}
            rows={12}
            className="min-h-[46vh] resize-y border-0 bg-transparent px-0 py-1 font-mono text-sm leading-7 shadow-none focus-visible:ring-0"
          />
        </div>
      ) : (
        <div className="space-y-1 pt-2">
          {segments.map((segment) => {
            if (segment.type === "line") {
              const index = segment.index
              const line = lines[index] ?? ""

              return index === activeIndex ? (
                <Textarea
                  key={`${index}-edit`}
                  ref={(node) => {
                    lineRefs.current[index] = node
                  }}
                  value={line}
                  onChange={(e) => updateLine(index, e.target.value)}
                  onFocus={() => setActiveLine(index)}
                  onKeyDown={(e) => handleLineKeyDown(index, e)}
                  placeholder={index === 0 ? placeholder : ""}
                  rows={1}
                  className="min-h-0 resize-none border-0 bg-transparent px-0 py-1 font-sans text-sm leading-7 shadow-none focus-visible:ring-0"
                  autoFocus={autoFocus}
                />
              ) : (
                <button
                  key={`${index}-render`}
                  type="button"
                  onClick={() => {
                    setActiveLine(index)
                    focusLine(index)
                  }}
                  className="block min-h-8 w-full cursor-text py-1 text-left"
                >
                  <MarkdownContent content={line} emptyMessage="" compact />
                </button>
              )
            }

            const blockValue = lines
              .slice(segment.range.start, segment.range.end + 1)
              .join("\n")
            const isEditingBlock =
              activeIndex >= segment.range.start &&
              activeIndex <= segment.range.end

            if (isEditingBlock) {
              return (
                <Textarea
                  key={`${segment.range.type}-edit-${segment.range.start}`}
                  ref={codeBlockEditorRef}
                  value={blockValue}
                  onChange={(e) => {
                    const replacementLines = e.target.value.split("\n")
                    const nextLines = [...lines]
                    nextLines.splice(
                      segment.range.start,
                      segment.range.end - segment.range.start + 1,
                      ...replacementLines
                    )
                    setLines(nextLines)
                    setActiveLine(segment.range.start)
                  }}
                  onKeyDown={handleMarkdownBlockKeyDown}
                  rows={Math.max(
                    3,
                    segment.range.end - segment.range.start + 1
                  )}
                  className={`min-h-0 resize-none border-0 px-2 py-2 text-sm leading-7 shadow-none focus-visible:ring-0 ${
                    segment.range.type === "code"
                      ? "bg-muted/30 font-mono"
                      : "bg-muted/15 font-sans"
                  }`}
                />
              )
            }

            return (
              <button
                key={`${segment.range.type}-render-${segment.range.start}`}
                type="button"
                onClick={() => {
                  setActiveLine(
                    segment.range.type === "code"
                      ? Math.min(segment.range.start + 1, segment.range.end)
                      : segment.range.start
                  )
                }}
                className="block w-full cursor-text py-1 text-left"
              >
                <MarkdownContent content={blockValue} emptyMessage="" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function NoteEditor({ paperId, notes, onRefresh }: NoteEditorProps) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const activeEditNote = editingId
    ? notes.find((note) => note.id === editingId)
    : null

  const handleCreate = async () => {
    if (!newContent.trim()) return
    setSaving(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      return
    }

    const { data: paperRecord, error: paperRecordError } = await supabase
      .from("papers")
      .select("team_id")
      .eq("id", paperId)
      .maybeSingle()

    if (paperRecordError) {
      toast.error("Could not validate storage quota", {
        description: paperRecordError.message,
      })
      setSaving(false)
      return
    }

    const teamId = paperRecord?.team_id ?? null

    try {
      const additionalBytes =
        utf8Length(newTitle || "") + utf8Length(newContent)
      const quotaCheck = await checkStorageQuota(supabase, additionalBytes, {
        teamId,
      })
      if (!quotaCheck.allowed) {
        toast.error("Note exceeds storage limit", {
          description:
            quotaCheck.limit_bytes === null
              ? "This note exceeds your current storage policy."
              : `You are over your ${formatBytes(quotaCheck.limit_bytes)} limit by ${formatBytes(quotaCheck.over_by_bytes)}.`,
        })
        setSaving(false)
        return
      }
    } catch (quotaError: unknown) {
      const message =
        quotaError instanceof Error ? quotaError.message : "Unknown error"
      toast.error("Could not validate storage quota", {
        description: message,
      })
      setSaving(false)
      return
    }

    const { error } = await supabase.from("notes").insert({
      paper_id: paperId,
      user_id: user.id,
      title: newTitle || null,
      content: newContent,
    })

    if (error) {
      toast.error("Failed to create note")
    } else {
      toast.success("Note added")
      setNewTitle("")
      setNewContent("")
      setCreating(false)
      onRefresh()
    }
    setSaving(false)
  }

  const handleUpdate = async (noteId: string) => {
    setSaving(true)

    const supabase = createClient()

    const { data: paperRecord, error: paperRecordError } = await supabase
      .from("papers")
      .select("team_id")
      .eq("id", paperId)
      .maybeSingle()

    if (paperRecordError) {
      toast.error("Could not validate storage quota", {
        description: paperRecordError.message,
      })
      setSaving(false)
      return
    }

    const teamId = paperRecord?.team_id ?? null

    const existingNote = notes.find((note) => note.id === noteId)
    const existingBytes = existingNote
      ? utf8Length(existingNote.title || "") +
        utf8Length(existingNote.content || "")
      : 0
    const nextBytes = utf8Length(editTitle || "") + utf8Length(editContent)
    const additionalBytes = Math.max(0, nextBytes - existingBytes)

    if (additionalBytes > 0) {
      try {
        const quotaCheck = await checkStorageQuota(supabase, additionalBytes, {
          teamId,
        })
        if (!quotaCheck.allowed) {
          toast.error("Note exceeds storage limit", {
            description:
              quotaCheck.limit_bytes === null
                ? "This update exceeds your current storage policy."
                : `You are over your ${formatBytes(quotaCheck.limit_bytes)} limit by ${formatBytes(quotaCheck.over_by_bytes)}.`,
          })
          setSaving(false)
          return
        }
      } catch (quotaError: unknown) {
        const message =
          quotaError instanceof Error ? quotaError.message : "Unknown error"
        toast.error("Could not validate storage quota", {
          description: message,
        })
        setSaving(false)
        return
      }
    }

    const { error } = await supabase
      .from("notes")
      .update({
        title: editTitle || null,
        content: editContent,
      })
      .eq("id", noteId)

    if (error) {
      toast.error("Failed to update note")
    } else {
      toast.success("Note updated")
      setEditingId(null)
      onRefresh()
    }
    setSaving(false)
  }

  const handleDelete = async (noteId: string) => {
    if (!(await confirm({ title: "Delete this note?", description: "This cannot be undone.", variant: "destructive", actionLabel: "Delete" }))) return
    const supabase = createClient()
    const { error } = await supabase.from("notes").delete().eq("id", noteId)

    if (error) {
      toast.error("Failed to delete note")
    } else {
      toast.success("Note deleted")
      onRefresh()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Notes</h3>
        {!creating && !editingId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingId(null)
              setCreating(true)
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Note
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Note title (optional)"
            />
            <InteractiveMarkdownEditor
              value={newContent}
              onChange={setNewContent}
              placeholder="Start typing your note..."
              autoFocus
              panelClassName="min-h-[60vh]"
            />
            <p className="text-xs text-muted-foreground">
              Focus mode: writing uses the full note area. Active line is
              markdown text; completed lines render immediately. Use the toolbar
              for tasks, tables, code blocks, dividers, and more. Use
              Alt+Shift+Arrow to duplicate lines.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false)
                  setNewTitle("")
                  setNewContent("")
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={saving || !newContent.trim()}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!creating && !editingId && notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No notes yet. Click &quot;Add Note&quot; to get started.
        </p>
      ) : null}

      {!creating && editingId && activeEditNote ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Note title (optional)"
                  className="mb-1"
                />
                <CardDescription className="text-xs">
                  {formatDistanceToNow(new Date(activeEditNote.created_at), {
                    addSuffix: true,
                  })}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <InteractiveMarkdownEditor
                value={editContent}
                onChange={setEditContent}
                placeholder="Start typing your note..."
                autoFocus
                panelClassName="min-h-[60vh]"
              />
              <p className="text-xs text-muted-foreground">
                Focus mode: writing uses the full note area. Active line is
                markdown text; completed lines render immediately. Use the
                toolbar for tasks, tables, code blocks, dividers, and more. Use
                Alt+Shift+Arrow to duplicate lines.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(null)}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleUpdate(activeEditNote.id)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!creating && !editingId
        ? notes.map((note) => {
            const isOpen = openNoteId === note.id

            return (
              <Card key={note.id}>
                <CardHeader className="py-3">
                  <div className="flex items-start justify-between">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted/40"
                      onClick={() =>
                        setOpenNoteId((current) =>
                          current === note.id ? null : note.id
                        )
                      }
                    >
                      <span className="mt-0.5 flex h-7 w-7 items-center justify-center">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-sm">
                          {note.title || "Untitled note"}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {formatDistanceToNow(new Date(note.created_at), {
                            addSuffix: true,
                          })}
                        </CardDescription>
                        {!isOpen && (
                          <p className="truncate pt-1 text-xs text-muted-foreground">
                            {getNotePreview(note.content)}
                          </p>
                        )}
                      </div>
                    </button>
                    {editingId !== note.id && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setCreating(false)
                            setOpenNoteId(note.id)
                            setEditingId(note.id)
                            setEditTitle(note.title || "")
                            setEditContent(note.content)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className={isOpen ? "pt-0 pb-4" : "hidden"}>
                  {isOpen ? <MarkdownContent content={note.content} /> : null}
                </CardContent>
              </Card>
            )
          })
        : null}
    </div>
  )
}
