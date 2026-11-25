import { inflateSync } from "node:zlib"

const MAX_SEGMENTS = 1500
const MAX_TEXT_LENGTH = 300000

function decodeEscapedString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\\d{3}/g, (oct) => {
      const parsed = Number.parseInt(oct.slice(1), 8)
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : ""
    })
}

function decodeHexString(value: string) {
  const clean = value.replace(/\s+/g, "")
  if (!clean) return ""
  const even = clean.length % 2 === 0 ? clean : `${clean}0`
  const bytes: number[] = []

  for (let i = 0; i < even.length; i += 2) {
    const byte = Number.parseInt(even.slice(i, i + 2), 16)
    if (Number.isNaN(byte)) continue
    bytes.push(byte)
  }

  return Buffer.from(bytes).toString("utf8")
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function extractTextFromStream(streamBody: Buffer) {
  const streamText = streamBody.toString("latin1")
  const chunks: string[] = []

  const literalMatches = streamText.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)
  for (const match of literalMatches) {
    const raw = match[0]
    const start = raw.indexOf("(")
    const end = raw.lastIndexOf(")")
    if (start < 0 || end <= start) continue
    const decoded = decodeEscapedString(raw.slice(start + 1, end))
    const normalized = normalizeText(decoded)
    if (normalized) chunks.push(normalized)
  }

  const arrayMatches = streamText.matchAll(/\[([\s\S]*?)\]\s*TJ/g)
  for (const match of arrayMatches) {
    const body = match[1]
    const arrayLiteralMatches = body.matchAll(/\((?:\\.|[^\\)])*\)/g)
    for (const literal of arrayLiteralMatches) {
      const decoded = decodeEscapedString(literal[0].slice(1, -1))
      const normalized = normalizeText(decoded)
      if (normalized) chunks.push(normalized)
    }

    const arrayHexMatches = body.matchAll(/<([0-9A-Fa-f\s]+)>/g)
    for (const hex of arrayHexMatches) {
      const decoded = decodeHexString(hex[1])
      const normalized = normalizeText(decoded)
      if (normalized) chunks.push(normalized)
    }
  }

  const hexMatches = streamText.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)
  for (const match of hexMatches) {
    const decoded = decodeHexString(match[1])
    const normalized = normalizeText(decoded)
    if (normalized) chunks.push(normalized)
  }

  return chunks
}

export function extractPdfText(pdfBuffer: Buffer) {
  const content = pdfBuffer.toString("latin1")
  const chunks: string[] = []
  const streamMatches = content.matchAll(/(<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)
  let streamCount = 0

  for (const match of streamMatches) {
    if (streamCount >= MAX_SEGMENTS) break
    streamCount += 1
    const dict = match[1]
    const body = match[2]
    const raw = Buffer.from(body, "latin1")

    let decoded: Buffer | null = null
    if (/\/Filter\s*\/FlateDecode/.test(dict)) {
      try {
        decoded = inflateSync(raw)
      } catch {
        decoded = null
      }
    } else if (!/\/Filter\s*\//.test(dict)) {
      decoded = raw
    }

    if (!decoded) continue

    const streamChunks = extractTextFromStream(decoded)
    chunks.push(...streamChunks)
    if (chunks.join(" ").length >= MAX_TEXT_LENGTH) {
      break
    }
  }

  const text = normalizeText(chunks.join(" ")).slice(0, MAX_TEXT_LENGTH)
  return {
    text,
    hasContent: text.length > 0,
  }
}
