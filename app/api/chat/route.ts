import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import OpenAI from "openai"
import { v4 as uuidv4 } from "uuid"
import { createClient } from "@/utils/supabase/server"
import { hasAIAccess } from "@/lib/plans"
import { buildRagContext } from "@/lib/ai/rag"
import { getOpenRouterClient, resolveChatModel } from "@/lib/ai/openai"
import type { ChatGenerationSettings, ChatSource } from "@/types"
import { getContextPolicy } from "@/lib/ai/context-policy"
import { estimateInputTokens, estimateTextTokens } from "@/lib/ai/token-estimate"
import {
  assertWithinAIUsageLimit,
  estimateAIUsageCostUsd,
  recordAIUsageEvent,
} from "@/lib/ai/usage"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export const runtime = "nodejs"
export const maxDuration = 60

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface ChatContextStats {
  budget: number
  estimatedInputTokens: number
  wasTrimmed: boolean
  trimSteps: string[]
  sourceCount: number
  retrievedSourceCount: number
  historyMessageCount: number
  breakdown: {
    system: number
    retrieval: number
    history: number
    total: number
  }
}

interface ChatStreamUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

const DEFAULT_CHAT_GENERATION_SETTINGS: ChatGenerationSettings = {
  temperature: 0.2,
  reasoningEffort: "default",
}

function parseGenerationSettings(value: unknown): ChatGenerationSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_CHAT_GENERATION_SETTINGS
  }

  const candidate = value as Partial<ChatGenerationSettings>
  const nextTemperature =
    typeof candidate.temperature === "number" && Number.isFinite(candidate.temperature)
      ? Math.min(1, Math.max(0, candidate.temperature))
      : DEFAULT_CHAT_GENERATION_SETTINGS.temperature

  const nextReasoningEffort =
    candidate.reasoningEffort === "low" ||
    candidate.reasoningEffort === "medium" ||
    candidate.reasoningEffort === "high"
      ? candidate.reasoningEffort
      : DEFAULT_CHAT_GENERATION_SETTINGS.reasoningEffort

  return {
    temperature: nextTemperature,
    reasoningEffort: nextReasoningEffort,
  }
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const role =
        "role" in item && typeof item.role === "string" ? item.role : ""
      const content =
        "content" in item && typeof item.content === "string"
          ? item.content
          : ""
      if (!role || !content) return null
      if (role !== "user" && role !== "assistant") return null
      return { role, content }
    })
    .filter((item): item is ChatMessage => Boolean(item))
}

function getLatestUserMessage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i].content.trim()
    }
  }
  return ""
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}...`
}

function trimRagContextBySources(
  ragPromptContext: string,
  sources: ChatSource[],
  sourceLimit: number
) {
  if (sourceLimit >= sources.length) {
    return { promptContext: ragPromptContext, sources }
  }

  const sourceBlocks = ragPromptContext
    .split("\n\n")
    .filter((block) => /^\[S\d+\]/.test(block.trim()))

  if (sourceBlocks.length === 0) {
    return {
      promptContext: ragPromptContext,
      sources: sources.slice(0, sourceLimit),
    }
  }

  return {
    promptContext: sourceBlocks.slice(0, sourceLimit).join("\n\n"),
    sources: sources.slice(0, sourceLimit),
  }
}

function buildWorkspacePrompt(scopeSummary: string, promptContext: string) {
  return `WORKSPACE SCOPE\n${scopeSummary}\n\nSOURCE CONTEXT\n${promptContext}`
}

async function hasTeamAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  teamId: string
) {
  const { data, error } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("Team access validation failed:", error)
    throw new Error("Failed to validate team access")
  }

  return Boolean(data)
}

const SYSTEM_PROMPT = `You are Refly AI, a research assistant for academic literature review.

Rules:
- Ground answers only in the provided SOURCE CONTEXT.
- Do not invent papers, findings, or citations.
- Cite supporting sources inline using [S#] tags (for example: [S1], [S2]).
- If evidence is weak or missing, say so directly and suggest what to search next.
- When comparing papers, summarize points of agreement, disagreement, and limitations.
- Keep responses concise, structured, and academically precise.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const messages = normalizeMessages(body?.messages)
    const contextTeam =
      typeof body?.contextTeam === "string" ? body.contextTeam : "personal"
    const selectedFolders = parseStringArray(body?.selectedFolders)
    const selectedPapers = parseStringArray(body?.selectedPapers)
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null
    const requestedModel = typeof body?.model === "string" ? body.model : undefined
    const generationSettings = parseGenerationSettings(body?.generationSettings)

    const latestQuestion = getLatestUserMessage(messages)
    if (!latestQuestion) {
      return NextResponse.json(
        { error: "A user message is required" },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(req, user.id, "ai_chat")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, billing_status, billing_grace_until, plan_renewal_at")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("Profile lookup failed:", profileError)
      return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
    }

    const plan = getEffectiveBillingPlan(profile)
    if (!hasAIAccess(plan, "ai_search")) {
      return NextResponse.json(
        {
          error:
            "AI search is available on Plus and Pro plans. Upgrade your plan to use RAG chat.",
        },
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

    const policy = getContextPolicy(plan)

    let teamId: string | null = null
    if (contextTeam !== "personal") {
      const allowed = await hasTeamAccess(supabase, user.id, contextTeam)
      if (!allowed) {
        return NextResponse.json(
          { error: "Forbidden team context" },
          { status: 403 }
        )
      }
      teamId = contextTeam
    }

    const model = resolveChatModel(requestedModel)
    const normalizedLatestQuestion = truncateText(
      latestQuestion,
      policy.maxUserMessageChars
    )
    const ragContext = await buildRagContext({
      query: normalizedLatestQuestion,
      userId: user.id,
      teamId,
      selectedFolderIds: selectedFolders,
      selectedPaperIds: selectedPapers,
      supabase,
      limit: policy.maxSources,
    })

    const trimSteps: string[] = []
    let wasTrimmed = false
    let conversation = messages.slice(-policy.maxHistoryMessages).map((message) => ({
      role: message.role,
      content: message.content,
    }))
    let ragPromptContext = ragContext.promptContext
    let sources: ChatSource[] = ragContext.sources

    if (messages.length > policy.maxHistoryMessages) {
      wasTrimmed = true
      trimSteps.push("history_window_capped")
    }

    if (conversation.length > 0) {
      const lastIndex = conversation.length - 1
      if (conversation[lastIndex].role === "user") {
        const nextContent = truncateText(
          conversation[lastIndex].content,
          policy.maxUserMessageChars
        )
        if (nextContent.length < conversation[lastIndex].content.length) {
          conversation[lastIndex] = {
            ...conversation[lastIndex],
            content: nextContent,
          }
          wasTrimmed = true
          trimSteps.push("latest_user_message_truncated")
        }
      }
    }

    if (ragContext.sources.length > policy.maxSources) {
      const capped = trimRagContextBySources(
        ragContext.promptContext,
        ragContext.sources,
        policy.maxSources
      )
      ragPromptContext = capped.promptContext
      sources = capped.sources
      wasTrimmed = true
      trimSteps.push("retrieval_sources_capped")
    }

    let workspacePrompt = buildWorkspacePrompt(ragContext.scopeSummary, ragPromptContext)

    let estimate = estimateInputTokens({
      systemPrompt: SYSTEM_PROMPT,
      workspacePrompt,
      conversation,
    })

    while (estimate.breakdown.total > policy.maxInputTokens && conversation.length > 2) {
      conversation = conversation.slice(1)
      estimate = estimateInputTokens({
        systemPrompt: SYSTEM_PROMPT,
        workspacePrompt,
        conversation,
      })
      wasTrimmed = true
      if (!trimSteps.includes("history_trimmed_for_budget")) {
        trimSteps.push("history_trimmed_for_budget")
      }
    }

    while (
      estimate.breakdown.total > policy.maxInputTokens &&
      ragPromptContext.length > policy.minRetrievalChars
    ) {
      const nextLength = Math.max(
        policy.minRetrievalChars,
        Math.floor(ragPromptContext.length * 0.85)
      )
      ragPromptContext = truncateText(ragPromptContext, nextLength)
      workspacePrompt = buildWorkspacePrompt(ragContext.scopeSummary, ragPromptContext)
      estimate = estimateInputTokens({
        systemPrompt: SYSTEM_PROMPT,
        workspacePrompt,
        conversation,
      })
      wasTrimmed = true
      if (!trimSteps.includes("retrieval_context_truncated")) {
        trimSteps.push("retrieval_context_truncated")
      }
    }

    while (estimate.breakdown.total > policy.maxInputTokens && sources.length > 1) {
      const nextLimit = Math.max(1, sources.length - 1)
      const trimmed = trimRagContextBySources(
        ragPromptContext,
        sources,
        nextLimit
      )
      ragPromptContext = trimmed.promptContext
      sources = trimmed.sources
      workspacePrompt = buildWorkspacePrompt(ragContext.scopeSummary, ragPromptContext)
      estimate = estimateInputTokens({
        systemPrompt: SYSTEM_PROMPT,
        workspacePrompt,
        conversation,
      })
      wasTrimmed = true
      if (!trimSteps.includes("retrieval_sources_trimmed_for_budget")) {
        trimSteps.push("retrieval_sources_trimmed_for_budget")
      }
    }

    const contextStats: ChatContextStats = {
      budget: policy.maxInputTokens,
      estimatedInputTokens: estimate.breakdown.total,
      wasTrimmed,
      trimSteps,
      sourceCount: sources.length,
      retrievedSourceCount: ragContext.metadata.retrievedSourceCount,
      historyMessageCount: conversation.length,
      breakdown: estimate.breakdown,
    }

    let convId = conversationId

    if (!convId) {
      const { data: newConv, error: createError } = await supabase
        .from("chat_conversations")
        .insert({
          id: uuidv4(),
          user_id: user.id,
          team_id: teamId,
          title: latestQuestion.slice(0, 80),
          model,
          selected_folder_ids: selectedFolders,
          selected_paper_ids: selectedPapers,
        })
        .select("id")
        .single()

      if (createError) {
        console.error("Failed to create conversation:", createError)
        return NextResponse.json(
          { error: "An unexpected error occurred. Please try again later." },
          { status: 500 }
        )
      }
      convId = newConv.id
    } else {
      const { error: updateError } = await supabase
        .from("chat_conversations")
        .update({
          team_id: teamId,
          selected_folder_ids: selectedFolders,
          selected_paper_ids: selectedPapers,
          last_message_at: new Date().toISOString(),
          model,
        })
        .eq("id", convId)
        .eq("user_id", user.id)

      if (updateError) {
        console.error("Failed to update conversation:", updateError)
        return NextResponse.json(
          { error: "An unexpected error occurred. Please try again later." },
          { status: 500 }
        )
      }
    }

    const lastUserMessage = getLatestUserMessage(conversation) || normalizedLatestQuestion

    const { error: userMsgError } = await supabase
      .from("chat_messages")
      .insert({
        id: uuidv4(),
        conversation_id: convId,
        role: "user",
        content: lastUserMessage,
        model,
      })

    if (userMsgError) {
      console.error("Failed to save user message:", userMsgError)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    const client = getOpenRouterClient()
    const completionRequest: OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
      reasoning?: {
        effort: ChatGenerationSettings["reasoningEffort"]
      }
    } = {
      model,
      stream: true,
      stream_options: {
        include_usage: true,
      },
      temperature: generationSettings.temperature,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "system",
          content: workspacePrompt,
        },
        ...conversation,
      ],
    }

    if (generationSettings.reasoningEffort !== "default") {
      completionRequest.reasoning = {
        effort: generationSettings.reasoningEffort,
      }
    }

    const abortController = new AbortController()
    const requestTimeout = setTimeout(() => abortController.abort(), 55000)

    req.signal.addEventListener("abort", () => {
      clearTimeout(requestTimeout)
      abortController.abort()
    })

    const completion = await client.chat.completions.create(
      completionRequest as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal: abortController.signal }
    )

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = ""
        let apiUsage: ChatStreamUsage | null = null
        let usageRecorded = false
        let usageRecordingError: string | null = null
        try {
          for await (const chunk of completion) {
            const usage = (chunk as { usage?: ChatStreamUsage }).usage
            if (usage) {
              apiUsage = usage
            }
            const text = chunk.choices?.[0]?.delta?.content
            if (!text) continue
            fullContent += text
            controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`))
          }

          if (fullContent) {
            const promptTokens = apiUsage?.prompt_tokens ?? contextStats.estimatedInputTokens
            const completionTokens = apiUsage?.completion_tokens ?? estimateTextTokens(fullContent)
            const totalTokens = apiUsage?.total_tokens ?? promptTokens + completionTokens
            const estimatedCostUsd = estimateAIUsageCostUsd({
              model,
              operation: "chat_completion",
              promptTokens,
              completionTokens,
            })

            try {
              await recordAIUsageEvent({
                supabase,
                context: {
                  userId: user.id,
                  teamId,
                  feature: "chat_response",
                },
                provider: "OpenRouter",
                model,
                operation: "chat_completion",
                promptTokens,
                completionTokens,
                totalTokens,
                metadata: {
                  conversationId: convId,
                  sourceCount: contextStats.sourceCount,
                  retrievedSourceCount: contextStats.retrievedSourceCount,
                  wasTrimmed: contextStats.wasTrimmed,
                  tokenSource: apiUsage ? "openrouter" : "estimate",
                },
              })
              usageRecorded = true
            } catch (usageError) {
              console.error("Failed to record chat usage:", usageError)
              usageRecordingError = "Failed to record usage"
            }

            const { error: assistantMsgError } = await supabase
              .from("chat_messages")
              .insert({
                id: uuidv4(),
                conversation_id: convId,
                role: "assistant",
                content: fullContent,
                sources,
                model,
                token_usage: {
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  total_tokens: totalTokens,
                  estimated_input_tokens: contextStats.estimatedInputTokens,
                  context_budget: contextStats.budget,
                  retrieval_tokens: contextStats.breakdown.retrieval,
                  history_tokens: contextStats.breakdown.history,
                  system_tokens: contextStats.breakdown.system,
                  source_count: contextStats.sourceCount,
                  estimated_cost_usd: estimatedCostUsd,
                  usage_recorded: usageRecorded,
                  usage_recording_error: usageRecordingError,
                  token_source: apiUsage ? "openrouter" : "estimate",
                  was_trimmed: contextStats.wasTrimmed,
                  trim_steps: contextStats.trimSteps,
                },
              })

            if (assistantMsgError) {
              console.error("Failed to save assistant message:", assistantMsgError)
            }

            await supabase
              .from("chat_conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", convId)
              .eq("user_id", user.id)
          }
        } catch (streamError: unknown) {
          console.error("[API /chat] Stream error:", streamError)
          const safeMessage = "An error occurred while generating the response"
          controller.enqueue(encoder.encode(`3:${JSON.stringify(safeMessage)}\n`))
        } finally {
          clearTimeout(requestTimeout)
          controller.close()
        }
      },
    })

    const encodedSources = encodeURIComponent(JSON.stringify(sources))
    const encodedContextStats = encodeURIComponent(JSON.stringify(contextStats))

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
        "X-Refly-Rag-Sources": encodedSources,
        "X-Refly-Context-Stats": encodedContextStats,
        "X-Refly-Conversation-Id": convId,
      },
    })
  } catch (error: unknown) {
    return handleApiError(error, "chat")
  }
}
