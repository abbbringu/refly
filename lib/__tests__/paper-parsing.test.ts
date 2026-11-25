import { describe, expect, it } from "vitest"
import { extractArxivId } from "@/lib/papers/extract-arxiv-id"
import { extractMetaFromHtml } from "@/lib/papers/extract-meta-from-html"

describe("paper parsing helpers", () => {
  it("extracts arXiv IDs from metadata, URLs, DOIs, and text", () => {
    expect(extractArxivId({ metadata: { arxiv_id: "arXiv:2311.14782v2" } })).toBe("2311.14782")
    expect(extractArxivId({ url: "https://arxiv.org/pdf/2301.07041.pdf" })).toBe("2301.07041")
    expect(extractArxivId({ doi: "10.48550/arXiv.2401.12345" })).toBe("2401.12345")
    expect(extractArxivId({ abstract: "See arXiv:hep-th/9901001 for details." })).toBe(
      "hep-th/9901001",
    )
  })

  it("extracts scholarly metadata and PDF candidates from HTML", () => {
    const html = `
      <html>
        <head>
          <meta name="citation_title" content="Reliable Refly Testing">
          <meta name="citation_author" content="Ada Lovelace">
          <meta name="citation_author" content="Grace Hopper">
          <meta name="citation_doi" content="doi:10.1234/refly.1">
          <meta name="citation_publication_date" content="2026/01/02">
          <meta name="citation_journal_title" content="Journal of Smoke Tests">
          <meta name="citation_firstpage" content="10">
          <meta name="citation_lastpage" content="20">
          <meta name="citation_pdf_url" content="/paper.pdf">
        </head>
        <body><a href="supplement.pdf">Supplement</a><a href="full.pdf">PDF</a></body>
      </html>`

    expect(extractMetaFromHtml(html, "https://example.test/article")).toMatchObject({
      title: "Reliable Refly Testing",
      authors: ["Ada Lovelace", "Grace Hopper"],
      doi: "10.1234/refly.1",
      year: "2026/01/02",
      journal: "Journal of Smoke Tests",
      pages: "10-20",
      pdfUrl: "https://example.test/paper.pdf",
      pdfCandidates: ["https://example.test/paper.pdf", "https://example.test/full.pdf"],
    })
  })
})
