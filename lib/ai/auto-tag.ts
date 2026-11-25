import type { SupabaseClient } from "@supabase/supabase-js"
import type { Paper } from "@/types"
import { DEFAULT_CHAT_MODEL, getOpenRouterClient } from "@/lib/ai/openai"
import { estimateTextTokens } from "@/lib/ai/token-estimate"
import { recordAIUsageEvent } from "@/lib/ai/usage"
import type { AIUsageContext } from "@/types"

type UsageDbClient = Pick<SupabaseClient, "from">

const MAX_TAGS = 8
const FALLBACK_TAGS = ["paper", "research", "study", "article"]

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeTag(value: string) {
  const normalized = cleanText(
    value
      .replace(/^#+/, "")
      .replace(/[;,]+$/g, "")
      .replace(/^['\"]+|['\"]+$/g, "")
  )

  if (!normalized) return ""
  if (normalized.length < 2 || normalized.length > 40) return ""
  if (FALLBACK_TAGS.includes(normalized.toLowerCase())) return ""
  return normalized
}

function parseMetadataKeywords(metadata: Paper["metadata"]) {
  const raw = metadata?.keywords
  if (!Array.isArray(raw)) return []
  return raw
    .filter((value): value is string => typeof value === "string")
    .map(normalizeTag)
    .filter(Boolean)
}

function dedupeTags(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeTag(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
    if (result.length >= MAX_TAGS) break
  }

  return result
}

function buildPromptInput(paper: Pick<Paper, "title" | "authors" | "year" | "paper_type" | "doi" | "url" | "abstract" | "metadata">) {
  const authors = (paper.authors || []).filter(Boolean).join(", ")
  const keywords = parseMetadataKeywords(paper.metadata).join(", ")

  return [
    `Title: ${paper.title || ""}`,
    `Authors: ${authors}`,
    `Year: ${paper.year ?? ""}`,
    `Type: ${paper.paper_type || ""}`,
    paper.doi ? `DOI: ${paper.doi}` : "",
    paper.url ? `URL: ${paper.url}` : "",
    keywords ? `Keywords: ${keywords}` : "",
    paper.abstract ? `Abstract: ${paper.abstract}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function parseModelTags(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { tags?: unknown }
    const tags = Array.isArray(parsed?.tags) ? parsed.tags : []
    return tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => cleanText(tag))
      .filter(Boolean)
  } catch {
    return []
  }
}

export interface SuggestPaperTagsResult {
  allSuggestedTags: string[]
  newTags: string[]
  existingTags: string[]
}

export async function suggestPaperTags(
  paper: Pick<Paper, "title" | "authors" | "year" | "paper_type" | "doi" | "url" | "abstract" | "metadata">,
  existingTagNames: string[] = [],
  allUserTagNames: string[] = [],
  usageContext?: {
    supabase: UsageDbClient
    context: AIUsageContext
    metadata?: Record<string, unknown>
  }
): Promise<SuggestPaperTagsResult> {
  const existingLower = new Set(existingTagNames.map((tag) => tag.toLowerCase()))
  const promptInput = buildPromptInput(paper)
  const fallbackFromMetadata = parseMetadataKeywords(paper.metadata)

  if (!cleanText(promptInput)) {
    return { allSuggestedTags: [], newTags: [], existingTags: [] }
  }

  const userTagContext =
    allUserTagNames.length > 0
      ? `\n\nExisting tags in this workspace: ${allUserTagNames.join(", ")}\nPrefer reusing existing tags when they fit; only add new tags when needed.`
      : ""

  const client = getOpenRouterClient()
  const completion = await client.chat.completions.create({
    model: DEFAULT_CHAT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate concise topic tags for academic papers. Return strict JSON: {\"tags\": string[]}. Constraints: 3-8 tags, each 1-3 words, no hashtags, no punctuation-only tags, avoid generic words like paper/research/study/article.",
      },
      {
        role: "user",
        content: `Generate tags for this paper:\n\n${promptInput}${userTagContext}`,
      },
    ],
  })

  const rawContent = completion.choices?.[0]?.message?.content || ""
  if (usageContext) {
    const promptTokens =
      completion.usage?.prompt_tokens ||
      estimateTextTokens(
        `${promptInput}\n${userTagContext}\nYou generate concise topic tags for academic papers.`
      )
    const completionTokens =
      completion.usage?.completion_tokens || estimateTextTokens(rawContent)

    try {
      await recordAIUsageEvent({
        supabase: usageContext.supabase,
        context: usageContext.context,
        provider: "OpenRouter",
        model: DEFAULT_CHAT_MODEL,
        operation: "chat_completion",
        promptTokens,
        completionTokens,
        totalTokens: completion.usage?.total_tokens,
        metadata: usageContext.metadata,
      })
    } catch (error) {
      console.error("Failed to record auto-tag usage:", error)
    }
  }

  const modelTags = parseModelTags(rawContent)
  const normalized = dedupeTags([...modelTags, ...fallbackFromMetadata])

  const allSuggestedTags = normalized
  const newTags = normalized.filter((tag) => !existingLower.has(tag.toLowerCase()))
  const existingMatchedTags = normalized.filter((tag) => existingLower.has(tag.toLowerCase()))

  return {
    allSuggestedTags,
    newTags,
    existingTags: existingMatchedTags,
  }
}
