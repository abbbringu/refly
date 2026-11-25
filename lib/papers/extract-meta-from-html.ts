export interface ExtractedMeta {
  title: string | null
  authors: string[]
  doi: string | null
  abstract: string | null
  year: string | null
  journal: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  publisher: string | null
  pdfUrl: string | null
  pdfCandidates: string[]
}

function getMeta(html: string, name: string): string | null {
  let match = html.match(
    new RegExp(
      `<meta[^>]*property=["']${name}["'][^>]*content=["']([^"']*)["']`,
      "i"
    )
  )
  if (match) return match[1]

  match = html.match(
    new RegExp(
      `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
      "i"
    )
  )
  if (match) return match[1]

  match = html.match(
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
      "i"
    )
  )
  if (match) return match[1]

  return null
}

function getLinkPdfUrls(html: string, baseUrl: string): string[] {
  const candidates: string[] = []

  const linkMatches = html.matchAll(
    /<link[^>]*type=["']application\/pdf["'][^>]*href=["']([^"']*)["']/gi
  )
  for (const m of linkMatches) {
    candidates.push(m[1])
  }

  const anchorMatches = html.matchAll(
    /<a[^>]*href=["']([^"']*\.pdf[^"']*)["'][^>]*>([^<]*)<\/a>/gi
  )
  for (const m of anchorMatches) {
    const href = m[1]
    const text = m[2].toLowerCase()
    if (
      !text.includes("xml") &&
      !text.includes("slides") &&
      !text.includes("supplement")
    ) {
      candidates.push(href)
    }
  }

  return candidates
}

function normalizeUrl(raw: string, base: string): string {
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw
    }
    const baseParsed = new URL(base)
    if (raw.startsWith("//")) {
      return `${baseParsed.protocol}${raw}`
    }
    if (raw.startsWith("/")) {
      return `${baseParsed.origin}${raw}`
    }
    return `${baseParsed.origin}/${raw}`
  } catch {
    return raw
  }
}

export function extractMetaFromHtml(
  html: string,
  pageUrl: string
): ExtractedMeta {
  const title =
    getMeta(html, "og:title") ||
    getMeta(html, "citation_title") ||
    getMeta(html, "dc.title") ||
    getMeta(html, "DC.Title") ||
    html.match(/<title>([^<]*)<\/title>/i)?.[1] ||
    null

  const authors: string[] = []
  const authorMatches = html.matchAll(
    /<meta[^>]*name=["']citation_author["'][^>]*content=["']([^"']*)["']/gi
  )
  for (const m of authorMatches) {
    authors.push(m[1])
  }
  if (authors.length === 0) {
    const dcAuthor = getMeta(html, "dc.creator") || getMeta(html, "DC.Creator")
    if (dcAuthor) authors.push(dcAuthor)
  }
  if (authors.length === 0) {
    const ogAuthor = getMeta(html, "article:author")
    if (ogAuthor) authors.push(ogAuthor)
  }

  const doi =
    getMeta(html, "citation_doi") ||
    getMeta(html, "dc.identifier") ||
    getMeta(html, "DC.Identifier")
  const abstract =
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    getMeta(html, "dc.description")
  const year =
    getMeta(html, "citation_publication_date") ||
    getMeta(html, "citation_date") ||
    getMeta(html, "dc.date")
  const journal =
    getMeta(html, "citation_journal_title") ||
    getMeta(html, "og:site_name")
  const volume = getMeta(html, "citation_volume")
  const issue = getMeta(html, "citation_issue")
  const pages =
    getMeta(html, "citation_firstpage") && getMeta(html, "citation_lastpage")
      ? `${getMeta(html, "citation_firstpage")}-${getMeta(html, "citation_lastpage")}`
      : getMeta(html, "citation_firstpage")
  const publisher = getMeta(html, "citation_publisher")
  const pdfUrl = getMeta(html, "citation_pdf_url")

  const rawCandidates = getLinkPdfUrls(html, pageUrl)
  const pdfCandidates = rawCandidates.map((c) => normalizeUrl(c, pageUrl))

  if (pdfUrl) {
    pdfCandidates.unshift(normalizeUrl(pdfUrl, pageUrl))
  }

  return {
    title,
    authors,
    doi: doi?.replace(/^doi:\s*/i, "") || null,
    abstract,
    year,
    journal,
    volume,
    issue,
    pages,
    publisher,
    pdfUrl: pdfUrl ? normalizeUrl(pdfUrl, pageUrl) : null,
    pdfCandidates: [...new Set(pdfCandidates)],
  }
}
