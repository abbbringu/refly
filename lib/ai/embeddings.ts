import type { SupabaseClient } from "@supabase/supabase-js"
import type { Paper } from "@/types"
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  getOpenAIClient,
} from "@/lib/ai/openai"
import { estimateTextTokens } from "@/lib/ai/token-estimate"
import { recordAIUsageEvent } from "@/lib/ai/usage"
import type { AIUsageContext } from "@/types"

type UsageDbClient = Pick<SupabaseClient, "from">

const MAX_EMBEDDING_INPUT_CHARS = 12000

function truncateForEmbedding(value: string) {
  if (value.length <= MAX_EMBEDDING_INPUT_CHARS) {
    return value
  }
  return `${value.slice(0, MAX_EMBEDDING_INPUT_CHARS)}...`
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

export function buildPaperEmbeddingInput(
  paper: Pick<Paper, "title" | "authors" | "abstract" | "year" | "doi" | "url">
) {
  const title = normalizeText(paper.title || "")
  const authors = (paper.authors || [])
    .map((author) => normalizeText(author))
    .filter(Boolean)
  const abstract = normalizeText(paper.abstract || "")

  const sections = [
    title ? `Title: ${title}` : "",
    authors.length > 0 ? `Authors: ${authors.join(", ")}` : "",
    typeof paper.year === "number" ? `Year: ${paper.year}` : "",
    paper.doi ? `DOI: ${normalizeText(paper.doi)}` : "",
    paper.url ? `URL: ${normalizeText(paper.url)}` : "",
    abstract ? `Abstract: ${abstract}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  return truncateForEmbedding(sections)
}

export async function createEmbedding(
  input: string,
  usageContext?: {
    supabase: UsageDbClient
    context: AIUsageContext
    metadata?: Record<string, unknown>
  }
) {
  const normalized = normalizeText(input)
  if (!normalized) {
    throw new Error("Embedding input cannot be empty")
  }

  const client = getOpenAIClient()
  const response = await client.embeddings.create({
    model: DEFAULT_EMBEDDING_MODEL,
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    input: truncateForEmbedding(normalized),
  })

  if (usageContext) {
    const promptTokens =
      response.usage?.prompt_tokens || estimateTextTokens(truncateForEmbedding(normalized))

    try {
      await recordAIUsageEvent({
        supabase: usageContext.supabase,
        context: usageContext.context,
        provider: "OpenAI",
        model: DEFAULT_EMBEDDING_MODEL,
        operation: "embedding",
        promptTokens,
        metadata: usageContext.metadata,
      })
    } catch (error) {
      console.error("Failed to record embedding usage:", error)
    }
  }

  const embedding = response.data?.[0]?.embedding
  if (!embedding || embedding.length === 0) {
    throw new Error("OpenAI embedding response was empty")
  }

  if (embedding.length !== DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${DEFAULT_EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    )
  }

  return embedding
}
