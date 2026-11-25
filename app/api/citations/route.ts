import { NextRequest, NextResponse } from "next/server"
import type { Paper } from "@/types"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  const rateLimit = checkApiRateLimit(request, null, "default")
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit)
  }

  const body = await request.json()
  const { paper } = body as { paper: Paper }

  if (!paper) {
    return NextResponse.json(
      { error: "Missing paper data" },
      { status: 400 },
    )
  }

  const citations = generateCitations(paper)
  return NextResponse.json({ citations })
}

function generateCitations(paper: Paper): Record<string, string> {
  const authors = paper.authors || []
  const year = paper.year
  const title = paper.title
  const metadata = paper.metadata || {}
  const journal = (metadata.journal as string) || ""
  const doi = paper.doi
  const volume = (metadata.volume as string) || ""
  const issue = (metadata.issue as string) || ""
  const pages = (metadata.pages as string) || ""
  const publisher = (metadata.publisher as string) || ""

  const authorLastFirst = authors.map((a) => {
    const parts = a.trim().split(" ")
    if (parts.length > 1) {
      return {
        last: parts[parts.length - 1],
        first: parts.slice(0, -1).join(" "),
        initials: parts
          .slice(0, -1)
          .map((n) => n[0])
          .join(". ") + ".",
      }
    }
    return { last: a, first: "", initials: "" }
  })

  // ─── APA 7th ─────────────────────────────────────────────
  const apaAuthors = authorLastFirst
    .map((a) => `${a.last}, ${a.initials}`)
    .join(", ")
  const apa = [
    apaAuthors,
    year ? ` (${year}). ` : ". ",
    title,
    ". ",
    journal ? `*${journal}*` : "",
    volume ? `, *${volume}*` : "",
    issue ? `(${issue})` : "",
    pages ? `, ${pages}` : "",
    journal || volume || pages ? "." : "",
    doi ? ` https://doi.org/${doi}` : "",
  ].join("")

  // ─── MLA 9th ─────────────────────────────────────────────
  const mlaAuthors =
    authorLastFirst.length > 0
      ? `${authorLastFirst[0].last}, ${authorLastFirst[0].first}`
      : ""
  const mlaOthers =
    authorLastFirst.length > 2
      ? ", et al"
      : authorLastFirst.length === 2
        ? `, and ${authorLastFirst[1].first} ${authorLastFirst[1].last}`
        : ""
  const mla = [
    mlaAuthors + mlaOthers,
    `. "${title}." `,
    journal ? `*${journal}*, ` : "",
    volume ? `vol. ${volume}, ` : "",
    issue ? `no. ${issue}, ` : "",
    year ? `${year}, ` : "",
    pages ? `pp. ${pages}` : "",
    ".",
    doi ? ` doi:${doi}.` : "",
  ].join("")

  // ─── Chicago 17th ────────────────────────────────────────
  const chicagoAuthors = authorLastFirst
    .map((a, i) =>
      i === 0
        ? `${a.last}, ${a.first}`
        : `${a.first} ${a.last}`,
    )
    .join(", ")
  const chicago = [
    chicagoAuthors,
    ". ",
    year ? `${year}. ` : "",
    `"${title}." `,
    journal ? `*${journal}* ` : "",
    volume || "",
    issue ? `, no. ${issue}` : "",
    pages ? `: ${pages}` : "",
    ".",
    doi ? ` https://doi.org/${doi}.` : "",
  ].join("")

  // ─── Harvard ─────────────────────────────────────────────
  const harvardAuthors = authorLastFirst
    .map((a) => `${a.last}, ${a.initials}`)
    .join(", ")
  const harvard = [
    harvardAuthors,
    year ? ` (${year}) ` : " ",
    `'${title}', `,
    journal ? `*${journal}*` : "",
    volume ? `, ${volume}` : "",
    issue ? `(${issue})` : "",
    pages ? `, pp. ${pages}` : "",
    ".",
  ].join("")

  // ─── IEEE ────────────────────────────────────────────────
  const ieeeAuthors = authorLastFirst
    .map((a) => `${a.initials} ${a.last}`)
    .join(", ")
  const ieee = [
    ieeeAuthors,
    `, "${title}," `,
    journal ? `*${journal}*` : "",
    volume ? `, vol. ${volume}` : "",
    issue ? `, no. ${issue}` : "",
    pages ? `, pp. ${pages}` : "",
    year ? `, ${year}` : "",
    ".",
    doi ? ` doi: ${doi}.` : "",
  ].join("")

  // ─── Vancouver ───────────────────────────────────────────
  const vancouverAuthors = authorLastFirst
    .map(
      (a) =>
        `${a.last} ${a.first
          .split(" ")
          .map((n) => n[0])
          .join("")}`,
    )
    .join(", ")
  const vancouver = [
    vancouverAuthors,
    ". ",
    title,
    ". ",
    journal || "",
    ". ",
    year ? `${year}` : "",
    volume ? `;${volume}` : "",
    issue ? `(${issue})` : "",
    pages ? `:${pages}` : "",
    ".",
    doi ? ` doi:${doi}` : "",
  ].join("")

  // ─── BibTeX ──────────────────────────────────────────────
  const bibtexKey = [
    authorLastFirst[0]?.last.toLowerCase() || "unknown",
    year || "",
    title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "",
  ].join("")

  const bibtexType =
    paper.paper_type === "book"
      ? "book"
      : paper.paper_type === "conference"
        ? "inproceedings"
        : paper.paper_type === "thesis"
          ? "phdthesis"
          : "article"

  const bibtexFields = [
    `  title = {${title}}`,
    `  author = {${authors.join(" and ")}}`,
    year ? `  year = {${year}}` : null,
    journal ? `  journal = {${journal}}` : null,
    volume ? `  volume = {${volume}}` : null,
    issue ? `  number = {${issue}}` : null,
    pages ? `  pages = {${pages}}` : null,
    publisher ? `  publisher = {${publisher}}` : null,
    doi ? `  doi = {${doi}}` : null,
    paper.url ? `  url = {${paper.url}}` : null,
  ]
    .filter(Boolean)
    .join(",\n")

  const bibtex = `@${bibtexType}{${bibtexKey},\n${bibtexFields}\n}`

  return { apa, mla, chicago, harvard, ieee, vancouver, bibtex }
}
