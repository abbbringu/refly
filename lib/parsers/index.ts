import type { Paper, PaperType } from "@/types"

// ─── BibTeX Parser ────────────────────────────────────────────

function stripBibTeXComments(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("%")
      if (idx === -1) return line
      let i = idx
      while (i > 0 && line[i - 1] === "\\") i -= 2
      if (i === idx) return line.substring(0, idx)
      return line
    })
    .join("\n")
}

function extractBracedValue(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== "{") return null
  let depth = 0
  let i = start
  while (i < text.length) {
    if (text[i] === "{" && (i === 0 || text[i - 1] !== "\\")) depth++
    else if (text[i] === "}" && (i === 0 || text[i - 1] !== "\\")) {
      depth--
      if (depth === 0) {
        return { value: text.substring(start + 1, i), end: i + 1 }
      }
    }
    i++
  }
  return null
}

function extractQuotedValue(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '"') return null
  let i = start + 1
  while (i < text.length) {
    if (text[i] === '"' && text[i - 1] !== "\\") {
      return { value: text.substring(start + 1, i), end: i + 1 }
    }
    i++
  }
  return null
}

function parseBibTeXFields(fieldStr: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let pos = 0

  while (pos < fieldStr.length) {
    while (pos < fieldStr.length && /[\s,]/.test(fieldStr[pos])) pos++
    if (pos >= fieldStr.length) break

    const keyResult = fieldStr.substring(pos).match(/^[a-zA-Z_][a-zA-Z0-9_-]*/)
    if (!keyResult) {
      pos++
      continue
    }

    const key = keyResult[0].toLowerCase()
    pos += keyResult[0].length

    const wsResult = fieldStr.substring(pos).match(/^\s*=\s*/)
    if (!wsResult) continue
    pos += wsResult[0].length

    if (pos >= fieldStr.length) break

    let value = ""
    if (fieldStr[pos] === "{") {
      const result = extractBracedValue(fieldStr, pos)
      if (result) {
        value = result.value
        pos = result.end
      }
    } else if (fieldStr[pos] === '"') {
      const result = extractQuotedValue(fieldStr, pos)
      if (result) {
        value = result.value
        pos = result.end
      }
    } else {
      const bareResult = fieldStr.substring(pos).match(/^([^\s,}]+)/)
      if (bareResult) {
        value = bareResult[1]
        pos += bareResult[1].length
      }
    }

    const commaResult = fieldStr.substring(pos).match(/^\s*,?\s*/)
    if (commaResult) pos += commaResult[0].length

    if (value) fields[key] = value.trim()
  }

  return fields
}

export function parseBibTeX(input: string): Partial<Paper>[] {
  const cleaned = stripBibTeXComments(input)
  const entries: Partial<Paper>[] = []

  let pos = 0
  while (pos < cleaned.length) {
    const atIdx = cleaned.indexOf("@", pos)
    if (atIdx === -1) break

    const typeResult = cleaned.substring(atIdx + 1).match(/^[a-zA-Z]+/)
    if (!typeResult) {
      pos = atIdx + 1
      continue
    }

    const type = typeResult[0].toLowerCase()
    let i = atIdx + 1 + typeResult[0].length

    while (i < cleaned.length && /\s/.test(cleaned[i])) i++
    if (i >= cleaned.length || cleaned[i] !== "{") {
      pos = i
      continue
    }

    const braceResult = extractBracedValue(cleaned, i)
    if (!braceResult) {
      pos = i + 1
      continue
    }

    const body = braceResult.value
    pos = braceResult.end

    const commaIdx = body.indexOf(",")
    if (commaIdx === -1) continue

    body.substring(0, commaIdx).trim()
    const fieldStr = body.substring(commaIdx + 1)

    const fields = parseBibTeXFields(fieldStr)

    const paperType = mapBibtexType(type)
    const authors = fields.author
      ? fields.author
          .split(/\s+and\s+/)
          .map((a) =>
            a
              .trim()
              .replace(/\{\\["'^`~=.](\w)\}/g, "$1")
              .replace(/\{\\["'^`~=.]\{(\w)\}\}/g, "$1")
              .replace(/\{(\w)\}/g, "$1")
              .trim(),
          )
          .filter(Boolean)
      : []

    const cleanTitle = (fields.title || "Untitled")
      .replace(/\{\\["'^`~=.](\w)\}/g, "$1")
      .replace(/\{\\["'^`~=.]\{(\w)\}\}/g, "$1")
      .replace(/\{(\w+)\}/g, "$1")

    const cleanAbstract = fields.abstract
      ? fields.abstract
          .replace(/\{\\["'^`~=.](\w)\}/g, "$1")
          .replace(/\{\\["'^`~=.]\{(\w)\}\}/g, "$1")
          .replace(/\{(\w+)\}/g, "$1")
      : null

    entries.push({
      title: cleanTitle,
      authors,
      year: fields.year ? parseInt(fields.year) : null,
      abstract: cleanAbstract,
      doi: fields.doi || null,
      paper_type: paperType,
      url: fields.url || null,
      metadata: {
        journal: fields.journal || fields.journaltitle || undefined,
        volume: fields.volume || undefined,
        issue: fields.number || undefined,
        pages: fields.pages || undefined,
        publisher: fields.publisher || undefined,
        isbn: fields.isbn || undefined,
        booktitle: fields.booktitle || undefined,
      },
    })
  }

  return entries
}

function mapBibtexType(type: string): PaperType {
  const map: Record<string, PaperType> = {
    article: "article",
    book: "book",
    inproceedings: "conference",
    conference: "conference",
    phdthesis: "thesis",
    mastersthesis: "thesis",
    techreport: "report",
    misc: "other",
    online: "webpage",
    unpublished: "preprint",
  }
  return map[type] || "article"
}

// ─── RIS Parser ─────────────────────────────────────────────

export function parseRIS(input: string): Partial<Paper>[] {
  const entries: Partial<Paper>[] = []
  const records = input.split(/\nER\s*-/).filter((r) => r.trim())

  for (const record of records) {
    const fields: Record<string, string[]> = {}
    const lines = record.split("\n")

    for (const line of lines) {
      const match = line.match(/^([A-Z0-9]{2})\s+-\s+(.*)/)
      if (match) {
        const tag = match[1]
        const value = match[2].trim()
        if (!fields[tag]) fields[tag] = []
        fields[tag].push(value)
      }
    }

    if (!fields.TY) continue

    const authors = [
      ...(fields.AU || []),
      ...(fields.A1 || []),
    ]

    entries.push({
      title: fields.TI?.[0] || fields.T1?.[0] || "Untitled",
      authors,
      year: fields.PY?.[0] || fields.Y1?.[0]
        ? parseInt((fields.PY?.[0] || fields.Y1?.[0]).match(/\d{4}/)?.[0] || "0") || null
        : null,
      abstract: fields.AB?.[0] || fields.N2?.[0] || null,
      doi: fields.DO?.[0] || null,
      paper_type: mapRISType(fields.TY[0]),
      url: fields.UR?.[0] || null,
      metadata: {
        journal: fields.JO?.[0] || fields.JF?.[0] || fields.T2?.[0] || undefined,
        volume: fields.VL?.[0] || undefined,
        issue: fields.IS?.[0] || undefined,
        pages: fields.SP?.[0] && fields.EP?.[0]
          ? `${fields.SP[0]}-${fields.EP[0]}`
          : fields.SP?.[0] || undefined,
        publisher: fields.PB?.[0] || undefined,
        isbn: fields.SN?.[0] || undefined,
        keywords: fields.KW || undefined,
      },
    })
  }

  return entries
}

function mapRISType(type: string): PaperType {
  const map: Record<string, PaperType> = {
    JOUR: "article",
    BOOK: "book",
    CHAP: "book",
    CONF: "conference",
    CPAPER: "conference",
    THES: "thesis",
    RPRT: "report",
    ELEC: "webpage",
    GEN: "other",
  }
  return map[type] || "article"
}

// ─── CSL JSON Parser ────────────────────────────────────────

export function parseCSLJSON(input: string): Partial<Paper>[] {
  const data = JSON.parse(input)
  const items = Array.isArray(data) ? data : [data]

  return items.map((item: any) => {
    const authors = (item.author || []).map((a: any) => {
      if (a.literal) return a.literal
      return `${a.given || ""} ${a.family || ""}`.trim()
    })

    return {
      title: item.title || "Untitled",
      authors,
      year: item.issued?.["date-parts"]?.[0]?.[0] || null,
      abstract: item.abstract || null,
      doi: item.DOI || null,
      paper_type: mapCSLType(item.type),
      url: item.URL || null,
      metadata: {
        journal: item["container-title"] || undefined,
        volume: item.volume || undefined,
        issue: item.issue || undefined,
        pages: item.page || undefined,
        publisher: item.publisher || undefined,
        isbn: item.ISBN || undefined,
      },
    }
  })
}

function mapCSLType(type: string): PaperType {
  const map: Record<string, PaperType> = {
    "article-journal": "article",
    book: "book",
    chapter: "book",
    "paper-conference": "conference",
    thesis: "thesis",
    report: "report",
    webpage: "webpage",
    article: "article",
  }
  return map[type] || "article"
}

// ─── EndNote XML Parser ─────────────────────────────────────

export function parseEndNoteXML(input: string): Partial<Paper>[] {
  const entries: Partial<Paper>[] = []

  // Extract records
  const recordMatches = input.matchAll(
    /<record>([\s\S]*?)<\/record>/g,
  )

  for (const recordMatch of recordMatches) {
    const record = recordMatch[1]

    const getField = (tag: string) => {
      const match = record.match(
        new RegExp(`<${tag}>\\s*<style[^>]*>([^<]*)</style>\\s*</${tag}>`, "i"),
      )
      if (match) return match[1].trim()
      const simpleMatch = record.match(
        new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"),
      )
      return simpleMatch ? simpleMatch[1].trim() : null
    }

    // Extract authors
    const authors: string[] = []
    const authorMatches = record.matchAll(
      /<author><style[^>]*>([^<]*)<\/style><\/author>/g,
    )
    for (const am of authorMatches) {
      authors.push(am[1].trim())
    }
    // Fallback
    if (authors.length === 0) {
      const simpleAuthors = record.matchAll(
        /<author>([^<]*)<\/author>/g,
      )
      for (const am of simpleAuthors) {
        authors.push(am[1].trim())
      }
    }

    const title = getField("title") || "Untitled"
    const year = getField("year")
    const abstract = getField("abstract")

    entries.push({
      title,
      authors,
      year: year ? parseInt(year) : null,
      abstract: abstract || null,
      doi: getField("electronic-resource-num") || null,
      paper_type: "article",
      url: getField("web-urls") || getField("url") || null,
      metadata: {
        journal:
          getField("secondary-title") ||
          getField("full-title") ||
          undefined,
        volume: getField("volume") || undefined,
        issue: getField("number") || undefined,
        pages: getField("pages") || undefined,
        publisher: getField("publisher") || undefined,
        isbn: getField("isbn") || undefined,
      },
    })
  }

  return entries
}

// ─── Format Detector ────────────────────────────────────────

export function detectFormat(
  input: string,
): "bibtex" | "ris" | "csl-json" | "endnote-xml" | null {
  const trimmed = input.trim()

  if (trimmed.startsWith("@")) return "bibtex"
  if (trimmed.startsWith("TY  -") || /^[A-Z0-9]{2}\s+-/.test(trimmed))
    return "ris"
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed)
      return "csl-json"
    } catch {
      return null
    }
  }
  if (trimmed.includes("<xml") || trimmed.includes("<records"))
    return "endnote-xml"

  return null
}

export function parseByFormat(
  input: string,
  format: string,
): Partial<Paper>[] {
  switch (format) {
    case "bibtex":
      return parseBibTeX(input)
    case "ris":
      return parseRIS(input)
    case "csl-json":
      return parseCSLJSON(input)
    case "endnote-xml":
      return parseEndNoteXML(input)
    default:
      throw new Error(`Unsupported format: ${format}`)
  }
}
