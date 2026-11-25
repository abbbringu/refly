import { estimateTextTokens } from "@/lib/ai/token-estimate"

export interface ExtractedPdfPage {
  pageNumber: number | null
  text: string
}

export interface PaperChunkInput {
  chunkIndex: number
  pageNumber: number | null
  sectionTitle?: string | null
  content: string
  tokenCount: number
}

const TARGET_CHUNK_TOKENS = 800
const OVERLAP_TOKENS = 120
const MIN_CHUNK_TOKENS = 80
const MAX_CHUNK_CHARS = TARGET_CHUNK_TOKENS * 4
const OVERLAP_CHARS = OVERLAP_TOKENS * 4

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function splitSentences(text: string) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function hardSplitLongText(text: string) {
  const chunks: string[] = []
  let offset = 0

  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + MAX_CHUNK_CHARS))
    offset += Math.max(1, MAX_CHUNK_CHARS - OVERLAP_CHARS)
  }

  return chunks
}

function buildPageChunks(page: ExtractedPdfPage) {
  const text = cleanText(page.text)
  if (!text) return []

  const sentences = splitSentences(text)
  if (sentences.length === 0) return hardSplitLongText(text)

  const chunks: string[] = []
  let current = ""

  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK_CHARS) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      chunks.push(...hardSplitLongText(sentence))
      continue
    }

    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > MAX_CHUNK_CHARS && current) {
      chunks.push(current)
      const overlap = current.slice(Math.max(0, current.length - OVERLAP_CHARS))
      current = cleanText(`${overlap} ${sentence}`)
    } else {
      current = next
    }
  }

  if (current) chunks.push(current)
  return chunks
}

export function chunkPdfPages(pages: ExtractedPdfPage[]) {
  const out: PaperChunkInput[] = []

  for (const page of pages) {
    const pageChunks = buildPageChunks(page)
    for (const content of pageChunks) {
      const tokenCount = estimateTextTokens(content)
      if (tokenCount < MIN_CHUNK_TOKENS && out.length > 0) {
        const previous = out[out.length - 1]
        const combined = cleanText(`${previous.content} ${content}`)
        if (estimateTextTokens(combined) <= TARGET_CHUNK_TOKENS + OVERLAP_TOKENS) {
          previous.content = combined
          previous.tokenCount = estimateTextTokens(combined)
          continue
        }
      }

      out.push({
        chunkIndex: out.length,
        pageNumber: page.pageNumber,
        sectionTitle: null,
        content,
        tokenCount,
      })
    }
  }

  return out.map((chunk, index) => ({ ...chunk, chunkIndex: index }))
}

export function chunkPlainText(text: string) {
  return chunkPdfPages([{ pageNumber: null, text }])
}
