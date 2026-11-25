import type { Paper } from "@/types"

const MAX_ABSTRACT_CHARS = 6000
const MAX_PDF_TEXT_CHARS = 24000

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

export const PAPER_SUMMARY_NOTE_TEMPLATE = `# Paper Summary\n\n## TL;DR\n- \n\n## Research Question\n- \n\n## Core Claims\n- \n\n## Methods\n- \n\n## Key Evidence\n- \n\n## Limitations\n- \n\n## Practical Implications\n- \n\n## Follow-up Questions\n- \n\n## Citation\n- Title: \n- Authors: \n- Year: \n- DOI/URL: \n- Notes: `

export function buildPaperSummaryPrompt({
  paper,
  abstractText,
  pdfText,
}: {
  paper: Pick<Paper, "title" | "authors" | "year" | "doi" | "url" | "paper_type" | "abstract">,
  abstractText: string,
  pdfText: string,
}) {
  const normalizedAbstract = truncate(cleanText(abstractText), MAX_ABSTRACT_CHARS)
  const normalizedPdfText = truncate(cleanText(pdfText), MAX_PDF_TEXT_CHARS)

  const paperMeta = [
    `Title: ${paper.title || "Untitled"}`,
    `Authors: ${(paper.authors || []).join(", ") || "Unknown"}`,
    `Year: ${paper.year ?? "Unknown"}`,
    `Type: ${paper.paper_type || "article"}`,
    paper.doi ? `DOI: ${paper.doi}` : "",
    paper.url ? `URL: ${paper.url}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const abstractSection = normalizedAbstract
    ? `ABSTRACT\n${normalizedAbstract}`
    : "ABSTRACT\n(Not available)"

  const pdfSection = normalizedPdfText
    ? `PDF TEXT EXCERPT\n${normalizedPdfText}`
    : "PDF TEXT EXCERPT\n(Not available or could not be extracted)"

  return {
    systemPrompt:
      "You are Refly AI. Produce a precise, source-grounded markdown note for one academic paper. Use ONLY provided content. Do not invent findings. If evidence is missing, explicitly state uncertainty. Return markdown only.",
    userPrompt: `Create a note using this exact markdown structure and section order:\n\n${PAPER_SUMMARY_NOTE_TEMPLATE}\n\nRules:\n- Keep bullets concise and concrete.\n- Prefer evidence from PDF text when present; otherwise use abstract.\n- In Citation, fill known metadata and leave unknown as \"Unknown\".\n- Keep total length under 500 words.\n\nPAPER METADATA\n${paperMeta}\n\n${abstractSection}\n\n${pdfSection}`,
  }
}

export function normalizeGeneratedPaperSummary(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim()
  if (!normalized) return PAPER_SUMMARY_NOTE_TEMPLATE
  if (!normalized.startsWith("# ")) {
    return `${PAPER_SUMMARY_NOTE_TEMPLATE}\n\n---\n\n${normalized}`
  }
  return normalized
}
