import type { Paper } from "@/types"

// ─── BibTeX Export ──────────────────────────────────────────

export function exportBibTeX(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const key = generateBibKey(paper)
      const type = mapToBibtexType(paper.paper_type)
      const m = paper.metadata || {}

      const fields = [
        `  title = {${paper.title}}`,
        paper.authors.length > 0
          ? `  author = {${paper.authors.join(" and ")}}`
          : null,
        paper.year ? `  year = {${paper.year}}` : null,
        m.journal ? `  journal = {${m.journal}}` : null,
        m.volume ? `  volume = {${m.volume}}` : null,
        m.issue ? `  number = {${m.issue}}` : null,
        m.pages ? `  pages = {${m.pages}}` : null,
        m.publisher ? `  publisher = {${m.publisher}}` : null,
        paper.doi ? `  doi = {${paper.doi}}` : null,
        paper.url ? `  url = {${paper.url}}` : null,
        paper.abstract ? `  abstract = {${paper.abstract}}` : null,
      ]
        .filter(Boolean)
        .join(",\n")

      return `@${type}{${key},\n${fields}\n}`
    })
    .join("\n\n")
}

function generateBibKey(paper: Paper): string {
  const authorPart =
    paper.authors[0]
      ?.split(" ")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z]/g, "") || "unknown"
  const yearPart = paper.year || ""
  const titlePart =
    paper.title
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, "") || ""
  return `${authorPart}${yearPart}${titlePart}`
}

function mapToBibtexType(type: string): string {
  const map: Record<string, string> = {
    article: "article",
    book: "book",
    conference: "inproceedings",
    thesis: "phdthesis",
    report: "techreport",
    preprint: "unpublished",
    webpage: "misc",
    other: "misc",
  }
  return map[type] || "article"
}

// ─── RIS Export ─────────────────────────────────────────────

export function exportRIS(papers: Paper[]): string {
  return papers
    .map((paper) => {
      const m = paper.metadata || {}
      const lines = [
        `TY  - ${mapToRISType(paper.paper_type)}`,
        `TI  - ${paper.title}`,
        ...paper.authors.map((a) => `AU  - ${a}`),
        paper.year ? `PY  - ${paper.year}` : null,
        paper.abstract ? `AB  - ${paper.abstract}` : null,
        paper.doi ? `DO  - ${paper.doi}` : null,
        paper.url ? `UR  - ${paper.url}` : null,
        m.journal ? `JO  - ${m.journal}` : null,
        m.volume ? `VL  - ${m.volume}` : null,
        m.issue ? `IS  - ${m.issue}` : null,
        m.pages?.toString().includes("-")
          ? `SP  - ${(m.pages as string).split("-")[0]}`
          : m.pages
            ? `SP  - ${m.pages}`
            : null,
        m.pages?.toString().includes("-")
          ? `EP  - ${(m.pages as string).split("-")[1]}`
          : null,
        m.publisher ? `PB  - ${m.publisher}` : null,
        m.isbn ? `SN  - ${m.isbn}` : null,
        "ER  - ",
      ]
      return lines.filter(Boolean).join("\n")
    })
    .join("\n\n")
}

function mapToRISType(type: string): string {
  const map: Record<string, string> = {
    article: "JOUR",
    book: "BOOK",
    conference: "CONF",
    thesis: "THES",
    report: "RPRT",
    preprint: "GEN",
    webpage: "ELEC",
    other: "GEN",
  }
  return map[type] || "JOUR"
}

// ─── CSL JSON Export ────────────────────────────────────────

export function exportCSLJSON(papers: Paper[]): string {
  const items = papers.map((paper) => {
    const m = paper.metadata || {}
    return {
      type: mapToCSLType(paper.paper_type),
      title: paper.title,
      author: paper.authors.map((a) => {
        const parts = a.trim().split(" ")
        if (parts.length > 1) {
          return {
            family: parts[parts.length - 1],
            given: parts.slice(0, -1).join(" "),
          }
        }
        return { literal: a }
      }),
      issued: paper.year
        ? { "date-parts": [[paper.year]] }
        : undefined,
      abstract: paper.abstract || undefined,
      DOI: paper.doi || undefined,
      URL: paper.url || undefined,
      "container-title": m.journal || undefined,
      volume: m.volume || undefined,
      issue: m.issue || undefined,
      page: m.pages || undefined,
      publisher: m.publisher || undefined,
      ISBN: m.isbn || undefined,
    }
  })

  return JSON.stringify(items, null, 2)
}

function mapToCSLType(type: string): string {
  const map: Record<string, string> = {
    article: "article-journal",
    book: "book",
    conference: "paper-conference",
    thesis: "thesis",
    report: "report",
    preprint: "article",
    webpage: "webpage",
    other: "article",
  }
  return map[type] || "article-journal"
}

// ─── EndNote XML Export ─────────────────────────────────────

export function exportEndNoteXML(papers: Paper[]): string {
  const records = papers
    .map((paper) => {
      const m = paper.metadata || {}
      const authorXml = paper.authors
        .map((a) => `        <author><style face="normal" font="default" size="100%">${escapeXml(a)}</style></author>`)
        .join("\n")

      return `    <record>
      <ref-type name="Journal Article">17</ref-type>
      <contributors>
        <authors>
${authorXml}
        </authors>
      </contributors>
      <titles>
        <title><style face="normal" font="default" size="100%">${escapeXml(paper.title)}</style></title>
${m.journal ? `        <secondary-title><style face="normal" font="default" size="100%">${escapeXml(m.journal as string)}</style></secondary-title>` : ""}
      </titles>
${paper.year ? `      <dates><year><style face="normal" font="default" size="100%">${paper.year}</style></year></dates>` : ""}
${m.volume ? `      <volume><style face="normal" font="default" size="100%">${escapeXml(m.volume as string)}</style></volume>` : ""}
${m.issue ? `      <number><style face="normal" font="default" size="100%">${escapeXml(m.issue as string)}</style></number>` : ""}
${m.pages ? `      <pages><style face="normal" font="default" size="100%">${escapeXml(m.pages as string)}</style></pages>` : ""}
${paper.doi ? `      <electronic-resource-num><style face="normal" font="default" size="100%">${escapeXml(paper.doi)}</style></electronic-resource-num>` : ""}
${paper.abstract ? `      <abstract>${escapeXml(paper.abstract)}</abstract>` : ""}
    </record>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<xml>
  <records>
${records}
  </records>
</xml>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// ─── Export Dispatcher ──────────────────────────────────────

export function exportPapers(
  papers: Paper[],
  format: string,
): { content: string; filename: string; mimeType: string } {
  switch (format) {
    case "bibtex":
      return {
        content: exportBibTeX(papers),
        filename: "references.bib",
        mimeType: "application/x-bibtex",
      }
    case "ris":
      return {
        content: exportRIS(papers),
        filename: "references.ris",
        mimeType: "application/x-research-info-systems",
      }
    case "csl-json":
      return {
        content: exportCSLJSON(papers),
        filename: "references.json",
        mimeType: "application/json",
      }
    case "endnote-xml":
      return {
        content: exportEndNoteXML(papers),
        filename: "references.xml",
        mimeType: "application/xml",
      }
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}
