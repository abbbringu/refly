// Matches arXiv IDs in various formats:
// - 2311.14782          (new format)
// - 2301.07041v2        (with version)
// - math.GT/0309136     (old format)
// - arXiv:2311.14782    (with prefix)
// - https://arxiv.org/abs/2311.14782  (URL)
const ARXIV_ID_PATTERN = /(?:(?:arXiv\s*:?\s*)|(?:https?:\/\/arxiv\.org\/(?:abs|pdf)\/))?(?:([a-z-]+\.[A-Z]{2})\/)?(\d{4}\.\d{4,5})(?:v\d+)?|(?:arXiv\s*:?\s*)([a-z-]+\/\d{7})/gi

export function extractArxivId(paper: {
  doi?: string | null
  url?: string | null
  metadata?: Record<string, unknown> | null
  title?: string | null
  abstract?: string | null
}): string | null {
  // 1. Direct metadata field
  const meta = paper.metadata || {}
  if (meta.arxiv_id && typeof meta.arxiv_id === "string") {
    return cleanArxivId(meta.arxiv_id)
  }

  // 2. source_url pointing to arxiv
  if (meta.source_url && typeof meta.source_url === "string") {
    const id = parseArxivIdFromString(meta.source_url)
    if (id) return id
  }

  // 3. URL field
  if (paper.url) {
    const id = parseArxivIdFromString(paper.url)
    if (id) return id
  }

  // 4. Journal field (e.g. "arXiv preprint arXiv:2311.14782")
  if (meta.journal && typeof meta.journal === "string") {
    const id = parseArxivIdFromString(meta.journal)
    if (id) return id
  }

  // 5. DOI field (some DOIs are arXiv DOIs like "10.48550/arXiv.2311.14782")
  if (paper.doi) {
    const doiLower = paper.doi.toLowerCase()
    if (doiLower.includes("arxiv")) {
      const id = parseArxivIdFromString(paper.doi)
      if (id) return id
    }
  }

  // 6. Abstract (often mentions "arXiv:XXXX.XXXXX")
  if (paper.abstract) {
    const id = parseArxivIdFromString(paper.abstract)
    if (id) return id
  }

  // 7. Title (sometimes contains arXiv ID)
  if (paper.title) {
    const id = parseArxivIdFromString(paper.title)
    if (id) return id
  }

  return null
}

function parseArxivIdFromString(text: string): string | null {
  if (!text) return null

  const matches = [...text.matchAll(ARXIV_ID_PATTERN)]

  for (const match of matches) {
    // New format: 2311.14782
    if (match[2]) {
      const prefix = match[1] ? `${match[1]}/` : ""
      return cleanArxivId(`${prefix}${match[2]}`)
    }
    // Old format: math.GT/0309136
    if (match[3]) {
      return cleanArxivId(match[3])
    }
  }

  return null
}

function cleanArxivId(raw: string): string {
  return raw
    .replace(/^arXiv\s*:?\s*/i, "")
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/, "")
    .trim()
}