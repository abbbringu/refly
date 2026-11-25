import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { aiSearchProvider } from "@/lib/ai/search"
import { searchPaperChunks, type PaperChunkSearchResult } from "@/lib/ai/paper-chunks"
import { getOpenRouterClient } from "@/lib/ai/openai"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { estimateTextTokens } from "@/lib/ai/token-estimate"
import { assertWithinAIUsageLimit, recordAIUsageEvent } from "@/lib/ai/usage"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

const MAX_RESULTS = 8
const MAX_CHUNK_CANDIDATES = 24
const MAX_EVIDENCE_PER_PAPER = 3

type SupportLabel = "Strong support" | "Partial support" | "Background" | "Weak/uncertain"
const SUPPORT_LABELS = new Set<SupportLabel>([
  "Strong support",
  "Partial support",
  "Background",
  "Weak/uncertain",
])

interface CitationCandidate {
  paperId: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  abstract: string | null
  metadata?: Record<string, unknown>
  score: number
  evidenceQuotes: Array<{
    text: string
    pageNumber: number | null
    sectionTitle: string | null
    score: number
  }>
}

interface AIAnalysisItem {
  paperId: string
  supportLabel?: SupportLabel
  contextExplanation?: string
}

function formatCitation(paper: {
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  metadata?: Record<string, unknown>
}): string {
  const authors = paper.authors || []
  const year = paper.year
  const title = paper.title
  const journal = (paper.metadata?.journal as string) || ""
  const doi = paper.doi
  const volume = (paper.metadata?.volume as string) || ""
  const issue = (paper.metadata?.issue as string) || ""
  const pages = (paper.metadata?.pages as string) || ""

  const authorLastFirst = authors.map((a) => {
    const parts = a.trim().split(" ")
    if (parts.length > 1) {
      return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`
    }
    return a
  })

  const apaAuthors =
    authorLastFirst.length > 0
      ? authorLastFirst
          .map((a) => {
            const parts = a.split(", ")
            const initials = parts[1]
              ? parts[1]
                  .split(" ")
                  .map((n) => n[0] + ".")
                  .join(" ")
              : ""
            return `${parts[0]}, ${initials}`
          })
          .join(", ")
      : ""

  return `${apaAuthors}${year ? ` (${year})` : ""}. ${title}.${journal ? ` *${journal}*` : ""}${volume ? `, *${volume}*` : ""}${issue ? `(${issue})` : ""}${pages ? `, ${pages}` : ""}.${doi ? ` https://doi.org/${doi}` : ""}`
}

function truncateText(value: string, max = 900) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}...`
}

function groupChunkResults(chunks: PaperChunkSearchResult[], excludePaperId?: string) {
  const candidates = new Map<string, CitationCandidate>()

  for (const chunk of chunks) {
    if (excludePaperId && chunk.paperId === excludePaperId) continue

    const existing = candidates.get(chunk.paperId)
    const evidence = {
      text: truncateText(chunk.content, 900),
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
      score: chunk.score,
    }

    if (existing) {
      existing.score = Math.max(existing.score, chunk.score)
      if (existing.evidenceQuotes.length < MAX_EVIDENCE_PER_PAPER) {
        existing.evidenceQuotes.push(evidence)
      }
      continue
    }

    candidates.set(chunk.paperId, {
      paperId: chunk.paperId,
      title: chunk.paper.title,
      authors: chunk.paper.authors,
      year: chunk.paper.year,
      doi: chunk.paper.doi,
      url: chunk.paper.url,
      abstract: null,
      score: chunk.score,
      evidenceQuotes: [evidence],
    })
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
}

function parseAIAnalysis(content: string): AIAnalysisItem[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(jsonMatch?.[0] || content)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item): item is AIAnalysisItem => {
      return item && typeof item === "object" && typeof item.paperId === "string"
    }).map((item) => ({
      ...item,
      supportLabel: SUPPORT_LABELS.has(item.supportLabel as SupportLabel)
        ? item.supportLabel
        : "Weak/uncertain",
      contextExplanation:
        typeof item.contextExplanation === "string"
          ? item.contextExplanation
          : undefined,
    }))
  } catch {
    return []
  }
}

async function analyzeCandidatesWithAI({
  statement,
  candidates,
  supabase,
  userId,
}: {
  statement: string
  candidates: CitationCandidate[]
  supabase: ReturnType<typeof createClient>
  userId: string
}) {
  if (candidates.length === 0) return new Map<string, AIAnalysisItem>()

  try {
    const openai = getOpenRouterClient()
    const model = "openai/gpt-5.4"
    const systemPrompt =
      "You are a careful research assistant. Classify how well each candidate supports the user's claim using ONLY the provided evidence quotes or abstract. Do not infer beyond the evidence. Return valid JSON only: an array of objects with paperId, supportLabel, and contextExplanation. supportLabel must be one of: Strong support, Partial support, Background, Weak/uncertain. If direct support is insufficient, say so."
    const userPrompt = JSON.stringify({
      statement,
      candidates: candidates.map((candidate) => ({
        paperId: candidate.paperId,
        title: candidate.title,
        year: candidate.year,
        evidence: candidate.evidenceQuotes.length > 0
          ? candidate.evidenceQuotes.map((quote) => quote.text)
          : candidate.abstract
            ? [truncateText(candidate.abstract, 900)]
            : [],
      })),
    })
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: 900,
      temperature: 0.1,
    })

    const responseContent = completion.choices[0]?.message?.content || ""
    const promptTokens = completion.usage?.prompt_tokens ?? estimateTextTokens(`${systemPrompt}\n${userPrompt}`)
    const completionTokens = completion.usage?.completion_tokens ?? estimateTextTokens(responseContent)

    try {
      await recordAIUsageEvent({
        supabase,
        context: {
          userId,
          feature: "ai_citation",
        },
        provider: "OpenRouter",
        model,
        operation: "chat_completion",
        promptTokens,
        completionTokens,
        totalTokens: completion.usage?.total_tokens,
        metadata: {
          statementLength: statement.length,
          candidateCount: candidates.length,
        },
      })
    } catch (usageError) {
      console.error("Failed to record citation usage:", usageError)
    }

    const analysis = parseAIAnalysis(responseContent)
    return new Map(analysis.map((item) => [item.paperId, item]))
  } catch {
    return new Map<string, AIAnalysisItem>()
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(request, user.id, "ai_operation")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, billing_status, billing_grace_until, plan_renewal_at")
      .eq("id", user.id)
      .single()

    const plan = getEffectiveBillingPlan(profile)
    if (plan === "free") {
      return NextResponse.json(
        { error: "This feature requires a Plus or Pro plan" },
        { status: 403 }
      )
    }

    try {
      await assertWithinAIUsageLimit({
        supabase,
        userId: user.id,
        plan,
        planRenewalAt: profile?.plan_renewal_at || null,
      })
    } catch (limitError) {
      const message =
        limitError instanceof Error ? limitError.message : "AI usage limit reached"
      return NextResponse.json({ error: message }, { status: 403 })
    }

    const body = await request.json()
    const { statement, excludePaperId, limit = MAX_RESULTS } = body as {
      statement: string
      excludePaperId?: string
      limit?: number
    }

    if (!statement || !statement.trim()) {
      return NextResponse.json(
        { error: "Statement is required" },
        { status: 400 }
      )
    }

    const queryText = statement.trim()
    const chunkResults = await searchPaperChunks(
      queryText,
      {
        query: queryText,
        user_id: user.id,
        scope: "personal",
        limit: MAX_CHUNK_CANDIDATES,
      },
      supabase,
      {
        userId: user.id,
        feature: "ai_citation",
      }
    )

    let candidates = groupChunkResults(chunkResults, excludePaperId)

    if (candidates.length === 0) {
      const results = await aiSearchProvider.search(
        queryText,
        {
          query: queryText,
          user_id: user.id,
          scope: "personal",
          limit: Math.min(limit, MAX_RESULTS),
        },
        supabase,
        {
          userId: user.id,
          feature: "ai_citation",
        }
      )

      candidates = (excludePaperId
        ? results.filter((r) => r.paper.id !== excludePaperId)
        : results
      )
        .slice(0, MAX_RESULTS)
        .map((result) => ({
          paperId: result.paper.id,
          title: result.paper.title,
          authors: result.paper.authors,
          year: result.paper.year,
          doi: result.paper.doi,
          url: result.paper.url,
          abstract: result.paper.abstract,
          metadata: result.paper.metadata,
          score: result.score,
          evidenceQuotes: result.highlights?.map((highlight) => ({
            text: highlight.snippet,
            pageNumber: null,
            sectionTitle: highlight.field,
            score: result.score,
          })) || [],
        }))
    } else {
      const { data: paperRows } = await supabase
        .from("papers")
        .select("id, abstract, metadata")
        .in("id", candidates.map((candidate) => candidate.paperId))

      const paperById = new Map(
        (paperRows || []).map((paper: { id: string; abstract: string | null; metadata: Record<string, unknown> | null }) => [paper.id, paper])
      )
      candidates = candidates.map((candidate) => ({
        ...candidate,
        abstract: paperById.get(candidate.paperId)?.abstract ?? null,
        metadata: paperById.get(candidate.paperId)?.metadata ?? {},
      }))
    }

    const analysisByPaperId = await analyzeCandidatesWithAI({
      statement: queryText,
      candidates,
      supabase,
      userId: user.id,
    })

    const citations = candidates.map((paper) => {
      const analysis = analysisByPaperId.get(paper.paperId)
      const citation = formatCitation({
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        metadata: paper.metadata,
      })

      return {
        paperId: paper.paperId,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        abstract: paper.abstract,
        score: paper.score,
        citation,
        supportLabel: analysis?.supportLabel || "Weak/uncertain",
        contextExplanation:
          analysis?.contextExplanation || "This paper matched your statement, but direct support should be verified against the evidence.",
        evidenceQuotes: paper.evidenceQuotes,
      }
    })

    return NextResponse.json({
      data: {
        citations,
        totalFound: citations.length,
        statement: queryText,
      },
    })
  } catch (error) {
    return handleApiError(error, "citations/find-citations")
  }
}
