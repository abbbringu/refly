interface EstimateInput {
  systemPrompt: string
  workspacePrompt: string
  conversation: { role: "user" | "assistant"; content: string }[]
}

export interface TokenBreakdown {
  system: number
  retrieval: number
  history: number
  total: number
}

export interface SourceTokenEstimate {
  sourceId: string
  estimatedTokens: number
}

export interface TokenEstimateResult {
  breakdown: TokenBreakdown
  sourceEstimates: SourceTokenEstimate[]
}

const CHARS_PER_TOKEN = 4
const ROLE_OVERHEAD_TOKENS = 4
const MESSAGE_BASE_TOKENS = 3

function estimateTokensFromText(text: string) {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function estimateMessageTokens(role: "user" | "assistant", content: string) {
  return MESSAGE_BASE_TOKENS + ROLE_OVERHEAD_TOKENS + estimateTokensFromText(role) + estimateTokensFromText(content)
}

function extractSourceBlocks(workspacePrompt: string): SourceTokenEstimate[] {
  const matches = workspacePrompt.matchAll(/\[(S\d+)\][\s\S]*?(?=\n\n\[S\d+\]|$)/g)
  const estimates: SourceTokenEstimate[] = []

  for (const match of matches) {
    const sourceId = match[1]
    const block = match[0]
    estimates.push({
      sourceId,
      estimatedTokens: estimateTokensFromText(block),
    })
  }

  return estimates
}

export function estimateInputTokens(input: EstimateInput): TokenEstimateResult {
  const system = estimateTokensFromText(input.systemPrompt)
  const retrieval = estimateTokensFromText(input.workspacePrompt)
  const history = input.conversation.reduce(
    (acc, message) => acc + estimateMessageTokens(message.role, message.content),
    0
  )

  return {
    breakdown: {
      system,
      retrieval,
      history,
      total: system + retrieval + history,
    },
    sourceEstimates: extractSourceBlocks(input.workspacePrompt),
  }
}

export function estimateTextTokens(text: string) {
  return estimateTokensFromText(text)
}
