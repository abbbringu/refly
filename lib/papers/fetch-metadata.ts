export interface FetchedMetadata {
  title: string
  authors: string[]
  year: number | null
  abstract: string | null
  doi: string | null
  paper_type: string
  url: string | null
  pdf_url: string | null
  metadata: Record<string, unknown>
}

interface CrossRefAuthor {
  given?: string
  family?: string
}

interface CrossRefWork {
  DOI?: string
  title?: string[] | string
  type?: string
  author?: CrossRefAuthor[]
}

interface CrossRefLink {
  "content-type"?: string
  content_type?: string
  URL?: string
}

interface PubMedAuthor {
  name?: string
}

interface OpenLibraryAuthor {
  key: string
}

export async function fetchDOI(doi: string): Promise<FetchedMetadata | null> {
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, "").trim()

  const res = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`,
    { headers: { Accept: "application/json" } }
  )

  if (!res.ok) return null

  const data = await res.json()
  const work = data.message

  const authors: string[] = (work.author as CrossRefAuthor[] || []).map((a) =>
    `${a.given || ""} ${a.family || ""}`.trim()
  )

  const crossrefPdfUrl: string | null =
    (work.link as CrossRefLink[] || []).find((link) => {
      const contentType = link["content-type"] || link.content_type || ""
      return String(contentType).toLowerCase().includes("pdf")
    })?.URL || null

  return {
    title: Array.isArray(work.title) ? work.title[0] : work.title || "",
    authors,
    year: work.published?.["date-parts"]?.[0]?.[0] || null,
    doi: cleanDoi,
    abstract: work.abstract ? work.abstract.replace(/<[^>]*>/g, "") : null,
    paper_type: mapCrossRefType(work.type),
    url: work.URL || null,
    pdf_url: crossrefPdfUrl,
    metadata: {
      journal: work["container-title"]?.[0] || undefined,
      volume: work.volume || undefined,
      issue: work.issue || undefined,
      pages: work.page || undefined,
      publisher: work.publisher || undefined,
      issn: work.ISSN?.[0] || undefined,
    },
  }
}

export async function fetchArxiv(arxivId: string): Promise<FetchedMetadata | null> {
  const cleanId = arxivId
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, "")
    .replace(/\.pdf$/, "")
    .trim()

  const res = await fetch(
    `http://export.arxiv.org/api/query?id_list=${cleanId}`
  )
  if (!res.ok) return null

  const xml = await res.text()

  return parseArxivResponse(xml, cleanId)
}

export async function searchArxivByTitleAndAuthors(
  title: string,
  authors: string[] = []
): Promise<FetchedMetadata | null> {
  const normalizedTitle = normalizeArxivQueryValue(title)
  if (!normalizedTitle) return null

  const normalizedAuthors = authors
    .map((author) => normalizeArxivQueryValue(author))
    .filter(Boolean)

  const queryParts = [`ti:"${normalizedTitle}"`]
  if (normalizedAuthors.length > 0) {
    queryParts.push(`au:"${normalizedAuthors[0]}"`)
  }

  const searchQuery = queryParts.join(" AND ")
  const res = await fetch(
    `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=1&sortBy=relevance&sortOrder=descending`
  )
  if (!res.ok) return null

  const xml = await res.text()

  return parseArxivResponse(xml)
}

export async function preferPublishedVersionForArxiv(
  arxivData: FetchedMetadata | null
): Promise<FetchedMetadata | null> {
  if (!arxivData) return null

  const doi = typeof arxivData.doi === "string" ? arxivData.doi.trim() : ""
  try {
    let publishedData: FetchedMetadata | null = null

    if (doi) {
      publishedData = await fetchDOI(doi)
    }

    if (!publishedData) {
      publishedData = await fetchPublishedByTitleAndAuthors(
        arxivData.title,
        arxivData.authors || []
      )
    }

    if (!publishedData) return arxivData

    return {
      ...arxivData,
      ...publishedData,
      abstract: publishedData.abstract || arxivData.abstract,
      pdf_url: publishedData.pdf_url || arxivData.pdf_url,
      metadata: {
        ...(arxivData.metadata || {}),
        ...(publishedData.metadata || {}),
      },
    }
  } catch {
    return arxivData
  }
}

async function fetchPublishedByTitleAndAuthors(
  title: string,
  authors: string[]
): Promise<FetchedMetadata | null> {
  const normalizedTitle = normalizeTitleForMatch(title)
  if (!normalizedTitle) return null

  const res = await fetch(
    `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=10`,
    { headers: { Accept: "application/json" } }
  )
  if (!res.ok) return null

  const data = await res.json()
  const items: CrossRefWork[] = Array.isArray(data?.message?.items)
    ? data.message.items
    : []

  let bestDoi: string | null = null
  let bestScore = -Infinity

  for (const item of items) {
    const candidateDoi = typeof item.DOI === "string" ? item.DOI.trim() : ""
    if (!candidateDoi) continue

    const itemTitle = Array.isArray(item.title)
      ? item.title[0]
      : typeof item.title === "string"
        ? item.title
        : ""
    const normalizedItemTitle = normalizeTitleForMatch(itemTitle)
    if (!normalizedItemTitle) continue

    let score = 0
    if (normalizedItemTitle === normalizedTitle) {
      score += 100
    } else if (
      normalizedItemTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(normalizedItemTitle)
    ) {
      score += 35
    } else {
      continue
    }

    if (item.type === "posted-content") {
      score -= 40
    }

    score += Math.min(countAuthorOverlap(authors, item.author || []) * 5, 20)

    if (score > bestScore) {
      bestScore = score
      bestDoi = candidateDoi
    }
  }

  if (!bestDoi || bestScore < 60) return null
  return fetchDOI(bestDoi)
}

function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function countAuthorOverlap(
  sourceAuthors: string[],
  candidateAuthors: CrossRefAuthor[]
): number {
  const sourceFamilies = new Set(
    sourceAuthors
      .map((author) => extractFamilyName(author))
      .filter(Boolean)
  )

  if (sourceFamilies.size === 0) return 0

  let overlap = 0
  for (const author of candidateAuthors) {
    const family = extractFamilyName(author.family || "")
    if (family && sourceFamilies.has(family)) {
      overlap += 1
    }
  }

  return overlap
}

function extractFamilyName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!clean) return ""
  const parts = clean.split(" ").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : ""
}

function parseArxivResponse(
  xml: string,
  fallbackId?: string
): FetchedMetadata | null {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/)
  if (!entryMatch) return null

  const entry = entryMatch[1]

  const getTag = (tag: string) => {
    const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
    return match ? match[1].trim() : null
  }

  const entryId = getTag("id")
  const cleanId = (fallbackId || entryId || "")
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, "")
    .replace(/\.pdf$/, "")
    .replace(/v\d+$/, "")
    .trim()

  if (!cleanId) return null

  const title = getTag("title")
  const abstract = getTag("summary")

  const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)
  const authors = [...authorMatches].map((m) => m[1].trim())

  const published = getTag("published")
  const year = published ? new Date(published).getFullYear() : null
  const arxivDoi = getTag("arxiv:doi")
  const journalRef = getTag("arxiv:journal_ref")

  const categoryMatches = entry.matchAll(/<category[^>]*term="([^"]+)"/g)
  const categories = [...categoryMatches].map((m) => m[1])

  return {
    title: title || "Untitled",
    authors,
    year,
    abstract,
    doi: arxivDoi,
    paper_type: "preprint",
    url: `https://arxiv.org/abs/${cleanId}`,
    pdf_url: `https://arxiv.org/pdf/${cleanId}.pdf`,
    metadata: {
      arxiv_id: cleanId,
      keywords: categories,
      journal_ref: journalRef,
      source_url: `https://arxiv.org/pdf/${cleanId}.pdf`,
    },
  }
}

function normalizeArxivQueryValue(value: string): string {
  return value
    .replace(/["\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function fetchPubMed(pmid: string): Promise<FetchedMetadata | null> {
  const cleanId = pmid.trim()

  const res = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${cleanId}&retmode=json`
  )
  if (!res.ok) return null

  const data = await res.json()
  const article = data.result?.[cleanId]

  if (!article) return null

  const authors = (article.authors as PubMedAuthor[] || []).map((a) => a.name || "")

  let abstract: string | null = null
  try {
    const abstractRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${cleanId}&rettype=abstract&retmode=text`
    )
    if (abstractRes.ok) {
      abstract = await abstractRes.text()
    }
  } catch {
    // Ignore
  }

  return {
    title: article.title || "Untitled",
    authors,
    year: article.pubdate ? parseInt(article.pubdate.split(" ")[0]) : null,
    abstract,
    doi:
      article.elocationid?.replace("doi: ", "")?.replace(/\. *$/, "") || null,
    paper_type: "article",
    url: `https://pubmed.ncbi.nlm.nih.gov/${cleanId}/`,
    pdf_url: null,
    metadata: {
      pubmed_id: cleanId,
      journal: article.fulljournalname || article.source || undefined,
      volume: article.volume || undefined,
      issue: article.issue || undefined,
      pages: article.pages || undefined,
    },
  }
}

export async function fetchISBN(isbn: string): Promise<FetchedMetadata | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, "").trim()

  const res = await fetch(`https://openlibrary.org/isbn/${cleanIsbn}.json`)
  if (!res.ok) return null

  const book = await res.json()

  let authors: string[] = []
  if (book.authors) {
    const authorPromises = (book.authors as OpenLibraryAuthor[]).map(async (a) => {
      try {
        const authorRes = await fetch(`https://openlibrary.org${a.key}.json`)
        const authorData = await authorRes.json()
        return authorData.name || "Unknown"
      } catch {
        return "Unknown"
      }
    })
    authors = await Promise.all(authorPromises)
  }

  return {
    title: book.title || "Untitled",
    authors,
    year: book.publish_date
      ? parseInt(book.publish_date.match(/\d{4}/)?.[0] || "0") || null
      : null,
    abstract: book.description?.value || book.description || null,
    doi: null,
    paper_type: "book",
    url: null,
    pdf_url: null,
    metadata: {
      isbn: cleanIsbn,
      publisher: book.publishers?.[0] || undefined,
      pages: book.number_of_pages?.toString() || undefined,
      edition: book.edition_name || undefined,
      language:
        book.languages?.[0]?.key?.replace("/languages/", "") || undefined,
    },
  }
}

function mapCrossRefType(type: string): string {
  const mapping: Record<string, string> = {
    "journal-article": "article",
    "book-chapter": "book",
    book: "book",
    "proceedings-article": "conference",
    dissertation: "thesis",
    report: "report",
    "posted-content": "preprint",
  }
  return mapping[type] || "article"
}
