// ─── Paper Types ────────────────────────────────────────────────

export type PaperType =
  | "article"
  | "book"
  | "conference"
  | "thesis"
  | "report"
  | "webpage"
  | "preprint"
  | "other"

export interface Paper {
  id: string
  user_id: string
  team_id: string | null
  title: string
  authors: string[]
  year: number | null
  abstract: string | null
  paper_type: PaperType
  doi: string | null
  url: string | null
  metadata: PaperMetadata
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface PaperMetadata {
  arxiv_id?: string
  pubmed_id?: string
  isbn?: string
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  edition?: string
  language?: string
  keywords?: string[]
  source_url?: string
  [key: string]: unknown
}

export interface PaperFile {
  id: string
  paper_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

// ─── Folder Types ───────────────────────────────────────────────

export interface Folder {
  id: string
  user_id: string
  team_id: string | null
  parent_id: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  created_at: string
  updated_at: string
  children?: Folder[]
  paper_count?: number
}

// ─── Note Types ─────────────────────────────────────────────────

export interface Note {
  id: string
  paper_id: string
  user_id: string
  title: string | null
  content: string
  created_at: string
  updated_at: string
}

// ─── Tag Types ──────────────────────────────────────────────────

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string | null
  created_at: string
}

export interface PaperTag {
  paper_id: string
  tag_id: string
}

// ─── Team Types ─────────────────────────────────────────────────

export type TeamRole = "owner" | "admin" | "editor" | "viewer"

export interface Team {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: TeamRole
  joined_at: string
  profile?: Profile
}

export interface TeamInvite {
  id: string
  team_id: string
  email: string
  role: TeamRole
  invited_by: string
  status: "pending" | "accepted" | "declined"
  created_at: string
  expires_at: string
  team?: Team
}

// ─── Profile Types ──────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  plan: "free" | "plus" | "pro"
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  billing_status?: string | null
  plan_renewal_at?: string | null
  cancel_at_period_end?: boolean
  billing_grace_until?: string | null
  billing_last_event_created?: string | null
  paper_summary_model?: string | null
  created_at: string
  updated_at: string
}

// ─── Citation Types ─────────────────────────────────────────────

export type CitationFormat =
  | "apa"
  | "mla"
  | "chicago"
  | "harvard"
  | "ieee"
  | "vancouver"
  | "bibtex"

export interface CitationResult {
  format: CitationFormat
  label: string
  citation: string
}

// ─── Search Types ───────────────────────────────────────────────

export interface SearchOptions {
  query: string
  folder_id?: string
  folder_ids?: string[]
  paper_ids?: string[]
  team_id?: string
  user_id?: string
  scope?: "all" | "personal" | "team"
  tags?: string[]
  year_from?: number
  year_to?: number
  paper_type?: PaperType
  limit?: number
  offset?: number
}

export interface SearchResult {
  paper: Paper
  score: number
  highlights?: {
    field: string
    snippet: string
  }[]
}

// ─── AI Search Provider Interface ───────────────────────────────

export interface AISearchProvider {
  indexPaper(paper: Paper, client?: unknown, usageContext?: AIUsageContext): Promise<void>
  removePaper(paperId: string): Promise<void>
  search(
    query: string,
    options?: SearchOptions,
    client?: unknown,
    usageContext?: AIUsageContext
  ): Promise<SearchResult[]>
  similarPapers(
    paperId: string,
    limit?: number,
    client?: unknown,
    usageContext?: AIUsageContext
  ): Promise<Paper[]>
}

export type AIUsageFeature =
  | "chat_response"
  | "chat_retrieval"
  | "ai_citation"
  | "paper_auto_tag"
  | "paper_auto_summary"
  | "paper_indexing"
  | "paper_chunk_indexing"
  | "ai_search"

export type AIUsageOperation = "chat_completion" | "embedding"

export interface AIUsageContext {
  userId: string
  teamId?: string | null
  feature: AIUsageFeature
}

export interface AIUsageEvent {
  id: string
  user_id: string
  team_id: string | null
  feature: AIUsageFeature
  provider: string
  model: string
  operation: AIUsageOperation
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface AIUsageFeatureSummary {
  feature: AIUsageFeature
  requestCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  topModels: string[]
}

export interface AIUsageSummary {
  windowStart: string
  windowEnd: string
  limit: {
    plan: Profile["plan"]
    monthlyLimitUsd: number
    currentUsageUsd: number
    remainingUsd: number
    isExceeded: boolean
  }
  totals: {
    requestCount: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  byFeature: AIUsageFeatureSummary[]
  recentEvents: AIUsageEvent[]
}

// ─── Chat Types ─────────────────────────────────────────────────

export interface ChatConversation {
  id: string
  user_id: string
  team_id: string | null
  title: string
  model: string
  selected_folder_ids: string[]
  selected_paper_ids: string[]
  created_at: string
  updated_at: string
  last_message_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  sources: ChatSource[]
  model: string
  token_usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    estimated_input_tokens?: number
    context_budget?: number
    retrieval_tokens?: number
    history_tokens?: number
    system_tokens?: number
    source_count?: number
    was_trimmed?: boolean
    trim_steps?: string[]
  }
  created_at: string
}

export interface ChatSource {
  paperId: string
  sourceId: string
  title: string
  authors: string[]
  snippet?: string
  chunkId?: string
  chunkIndex?: number
  pageNumber?: number | null
  sourceType?: "chunk" | "paper"
}

export type ChatReasoningEffort = "default" | "low" | "medium" | "high"

export interface ChatGenerationSettings {
  temperature: number
  reasoningEffort: ChatReasoningEffort
}

export const CHAT_MODELS = [
  { id: "openai/gpt-5.4", name: "GPT-5.4", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "OpenRouter" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "OpenRouter" },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "OpenRouter" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "OpenRouter" },
  { id: "openrouter/elephant-alpha", name: "Elephant Alpha (Free)", provider: "OpenRouter" },
] as const

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"]

export function isValidChatModel(id: string): id is ChatModelId {
  return CHAT_MODELS.some((m) => m.id === id)
}

// ─── Import/Export Types ────────────────────────────────────────

export type ImportFormat = "bibtex" | "ris" | "csl-json" | "endnote-xml"
export type ExportFormat = "bibtex" | "ris" | "csl-json" | "endnote-xml"

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: { index: number; error: string }[]
  papers: Paper[]
}

// ─── API Response Types ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}
