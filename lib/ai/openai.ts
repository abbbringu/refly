import OpenAI from "openai"
import { isValidChatModel, CHAT_MODELS } from "@/types"
import { AppError } from "@/lib/api/errors"

export const CHAT_MODEL_OPTIONS = CHAT_MODELS

export const DEFAULT_CHAT_MODEL =
  process.env.AI_CHAT_MODEL ||
  process.env.OPENROUTER_CHAT_MODEL ||
  "openai/gpt-5.4"
export const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large"

const EMBEDDING_DIMENSION_FROM_ENV = Number(
  process.env.OPENAI_EMBEDDING_DIMENSIONS
)
export const DEFAULT_EMBEDDING_DIMENSIONS = Number.isFinite(
  EMBEDDING_DIMENSION_FROM_ENV
)
  ? EMBEDDING_DIMENSION_FROM_ENV
  : 3072

export function isAllowedChatModel(model: string): model is string {
  const customDefault = process.env.AI_CHAT_MODEL || process.env.OPENROUTER_CHAT_MODEL
  if (customDefault && model === customDefault) {
    return true
  }
  return isValidChatModel(model)
}

export function resolveChatModel(requestedModel?: string): string {
  const selected =
    requestedModel && isAllowedChatModel(requestedModel)
      ? requestedModel
      : DEFAULT_CHAT_MODEL

  // When routing directly to OpenAI (no OpenRouter key and no custom base URL),
  // strip the "openai/" vendor prefix if present so direct OpenAI calls work seamlessly.
  const usingDirectOpenAI =
    !process.env.AI_CHAT_BASE_URL &&
    !process.env.OPENROUTER_API_KEY &&
    Boolean(process.env.OPENAI_API_KEY)

  if (usingDirectOpenAI && selected.startsWith("openai/")) {
    return selected.slice("openai/".length)
  }

  return selected
}

let openAIClient: OpenAI | null = null
let openRouterClient: OpenAI | null = null

export function getOpenAIClient() {
  if (openAIClient) return openAIClient

  const baseURL = process.env.OPENAI_BASE_URL
  const apiKey = process.env.OPENAI_API_KEY || (baseURL ? "local" : "")
  if (!apiKey) {
    throw new AppError(
      503,
      "Embeddings are not configured. Set OPENAI_API_KEY (or OPENAI_BASE_URL for a local OpenAI-compatible server) in your .env file."
    )
  }

  openAIClient = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
  return openAIClient
}

export function getOpenRouterClient() {
  if (openRouterClient) return openRouterClient

  const customBaseURL = process.env.AI_CHAT_BASE_URL
  if (customBaseURL) {
    const apiKey =
      process.env.AI_CHAT_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "local"
    openRouterClient = new OpenAI({
      apiKey,
      baseURL: customBaseURL,
    })
    return openRouterClient
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY
  if (openRouterKey) {
    openRouterClient = new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Refly",
      },
    })
    return openRouterClient
  }

  const openAIKey = process.env.OPENAI_API_KEY
  if (openAIKey) {
    const baseURL = process.env.OPENAI_BASE_URL
    openRouterClient = new OpenAI({
      apiKey: openAIKey,
      ...(baseURL ? { baseURL } : {}),
    })
    return openRouterClient
  }

  throw new AppError(
    503,
    "AI chat is not configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or AI_CHAT_BASE_URL in your .env file to enable AI features."
  )
}
