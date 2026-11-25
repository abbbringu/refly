import { extractArxivId } from "./extract-arxiv-id"
import { extractMetaFromHtml } from "./extract-meta-from-html"
import { safeFetch } from "@/lib/fetch/safe-fetch"

export interface PdfCandidate {
  url: string
  source: "doi" | "arxiv" | "webpage"
}

export interface PaperForDiscovery {
  doi?: string | null
  url?: string | null
  metadata?: {
    arxiv_id?: string
    source_url?: string
  }
}

export async function discoverPdfCandidates(
  paper: PaperForDiscovery
): Promise<PdfCandidate[]> {
  const candidates: PdfCandidate[] = []
  const seen = new Set<string>()

  function add(url: string, source: PdfCandidate["source"]) {
    const normalized = url.trim().toLowerCase()
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      candidates.push({ url: url.trim(), source })
    }
  }

  if (paper.doi) {
    const cleanDoi = paper.doi.replace(/^https?:\/\/doi\.org\//, "").trim()

    const arxivDoiMatch = cleanDoi.match(/^10\.\d{4,9}\/arXiv\.(\d{4}\.\d{4,5})$/i)
    if (arxivDoiMatch) {
      add(`https://arxiv.org/pdf/${arxivDoiMatch[1]}.pdf`, "arxiv")
    } else {
      try {
        let html = ""
        let pdfLocation: string | null = null

        try {
          const res = await safeFetch(`https://doi.org/${encodeURIComponent(cleanDoi)}`, {
            headers: { "User-Agent": "Refly/1.0 (Reference Manager)" },
            maxBytes: 5 * 1024 * 1024,
            timeout: 15_000,
          })

          const contentType = res.headers.get("content-type") || ""
          if (contentType.includes("application/pdf")) {
            pdfLocation = res.headers.get("location") || `https://doi.org/${cleanDoi}`
          } else if (res.response.status === 200 || res.response.status === 302 || res.response.status === 303) {
            html = new TextDecoder().decode(res.arrayBuffer)
          } else if (res.response.status === 301 || res.response.status === 307 || res.response.status === 308) {
            const redirectUrl = res.headers.get("location")
            if (redirectUrl) {
              try {
                const redirectRes = await safeFetch(redirectUrl, {
                  headers: { "User-Agent": "Refly/1.0 (Reference Manager)" },
                  maxBytes: 50 * 1024 * 1024,
                  timeout: 15_000,
                })
                const redirectContentType = redirectRes.headers.get("content-type") || ""
                if (redirectContentType.includes("application/pdf")) {
                  pdfLocation = redirectUrl
                } else if (redirectRes.response.status === 200) {
                  html = new TextDecoder().decode(redirectRes.arrayBuffer)
                }
              } catch {}
            }
          }
        } catch {}

        if (pdfLocation) {
          add(pdfLocation, "doi")
        } else if (html) {
          const meta = extractMetaFromHtml(html, `https://doi.org/${cleanDoi}`)
          if (meta.pdfUrl) add(meta.pdfUrl, "doi")
          for (const c of meta.pdfCandidates) {
            add(c, "doi")
          }
        }
      } catch {}
    }
  }

  if (paper.metadata?.arxiv_id) {
    add(`https://arxiv.org/pdf/${paper.metadata?.arxiv_id}.pdf`, "arxiv")
  }

  const detectedArxivId = extractArxivId({
    doi: paper.doi,
    url: paper.url,
    metadata: paper.metadata as Record<string, unknown> | null,
  })
  if (detectedArxivId && detectedArxivId !== paper.metadata?.arxiv_id) {
    add(`https://arxiv.org/pdf/${detectedArxivId}.pdf`, "arxiv")
  }

  if (paper.url) {
    try {
      const res = await safeFetch(paper.url, {
        headers: { "User-Agent": "Refly/1.0 (Reference Manager)" },
        maxBytes: 5 * 1024 * 1024,
        timeout: 15_000,
      })
      if (res.response.ok) {
        const html = new TextDecoder().decode(res.arrayBuffer)
        const meta = extractMetaFromHtml(html, paper.url)
        if (meta.pdfUrl) add(meta.pdfUrl, "webpage")
        for (const c of meta.pdfCandidates) {
          add(c, "webpage")
        }
      }
    } catch {}
  }

  if (paper.metadata?.source_url && paper.metadata.source_url.toLowerCase().includes(".pdf")) {
    add(paper.metadata.source_url, "webpage")
  }

  return candidates
}
