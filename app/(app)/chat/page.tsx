"use client"

import { useChat } from "ai/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Bot,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Send,
  StopCircle,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import type {
  Team,
  ChatConversation,
  ChatMessage as ChatMessageType,
  ChatGenerationSettings,
} from "@/types"
import { ChatContextSelector } from "@/components/ai/chat-context-selector"
import { ChatMessage } from "@/components/ai/chat-message"
import type { RagSource } from "@/lib/ai/rag"
import { CHAT_MODEL_OPTIONS } from "@/lib/ai/openai"

interface ContextStats {
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

const DEFAULT_CHAT_GENERATION_SETTINGS: ChatGenerationSettings = {
  temperature: 0.2,
  reasoningEffort: "default",
}

const CHAT_TEMPERATURE_OPTIONS = [
  { value: 0, label: "Precise" },
  { value: 0.2, label: "Balanced" },
  { value: 0.5, label: "Creative" },
  { value: 0.8, label: "Exploratory" },
] as const

const CHAT_REASONING_OPTIONS = [
  { value: "default", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const

function isTeam(value: unknown): value is Team {
  if (!value || typeof value !== "object") return false

  const candidate = value as { id?: unknown; name?: unknown }
  return typeof candidate.id === "string" && typeof candidate.name === "string"
}

function decodeRagSourcesHeader(headerValue: string | null): RagSource[] {
  if (!headerValue) return []

  try {
    const decoded = decodeURIComponent(headerValue)
    const parsed = JSON.parse(decoded)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is RagSource => {
        if (!item || typeof item !== "object") return false
        if (typeof item.paperId !== "string") return false
        if (typeof item.sourceId !== "string") return false
        if (typeof item.title !== "string") return false
        return true
      })
      .map((item) => ({
        ...item,
        authors: Array.isArray(item.authors)
          ? item.authors.filter(
              (author): author is string => typeof author === "string"
            )
          : [],
      }))
  } catch {
    return []
  }
}

function decodeContextStatsHeader(
  headerValue: string | null
): ContextStats | null {
  if (!headerValue) return null

  try {
    const decoded = decodeURIComponent(headerValue)
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== "object") return null

    const candidate = parsed as Partial<ContextStats>
    if (typeof candidate.budget !== "number") return null
    if (typeof candidate.estimatedInputTokens !== "number") return null
    if (!candidate.breakdown || typeof candidate.breakdown !== "object")
      return null

    return {
      budget: candidate.budget,
      estimatedInputTokens: candidate.estimatedInputTokens,
      wasTrimmed: Boolean(candidate.wasTrimmed),
      trimSteps: Array.isArray(candidate.trimSteps)
        ? candidate.trimSteps.filter(
            (step): step is string => typeof step === "string"
          )
        : [],
      sourceCount:
        typeof candidate.sourceCount === "number" ? candidate.sourceCount : 0,
      retrievedSourceCount:
        typeof candidate.retrievedSourceCount === "number"
          ? candidate.retrievedSourceCount
          : 0,
      historyMessageCount:
        typeof candidate.historyMessageCount === "number"
          ? candidate.historyMessageCount
          : 0,
      breakdown: {
        system:
          typeof candidate.breakdown.system === "number"
            ? candidate.breakdown.system
            : 0,
        retrieval:
          typeof candidate.breakdown.retrieval === "number"
            ? candidate.breakdown.retrieval
            : 0,
        history:
          typeof candidate.breakdown.history === "number"
            ? candidate.breakdown.history
            : 0,
        total:
          typeof candidate.breakdown.total === "number"
            ? candidate.breakdown.total
            : 0,
      },
    }
  } catch {
    return null
  }
}

function hasCitationTag(content: string) {
  return /\[S\d+\]/.test(content)
}

export default function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [contextTeam, setContextTeam] = useState("personal")
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [selectedPapers, setSelectedPapers] = useState<string[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [isRetrieving, setIsRetrieving] = useState(false)
  const [messageSources, setMessageSources] = useState<
    Record<string, RagSource[]>
  >({})
  const [messageContextStats, setMessageContextStats] = useState<
    Record<string, ContextStats>
  >({})
  const pendingSourcesRef = useRef<RagSource[] | null>(null)
  const pendingContextStatsRef = useRef<ContextStats | null>(null)

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [selectedModel, setSelectedModel] = useState<string>("openai/gpt-5.4")
  const [generationSettings, setGenerationSettings] =
    useState<ChatGenerationSettings>(DEFAULT_CHAT_GENERATION_SETTINGS)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadedConversationRef = useRef<string | null>(null)

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[Global Error]", event.error)
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[Global UnhandledRejection]", event.reason)
    }
    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)
    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  useEffect(() => {
    async function loadContextData() {
      const supabase = createClient()
      const { data } = await supabase
        .from("team_members")
        .select("team_id, role, teams(*)")

      if (data) {
        const rows = data as Array<{ teams?: unknown }>
        const userTeams = rows
          .map((entry) => {
            const teamValue = entry.teams

            if (Array.isArray(teamValue)) {
              return teamValue.find(isTeam) || null
            }

            return isTeam(teamValue) ? teamValue : null
          })
          .filter((entry): entry is Team => Boolean(entry))
        setTeams(userTeams)
      }
    }
    loadContextData()
  }, [])

  useEffect(() => {
    async function loadConversations() {
      setLoadingConversations(true)
      try {
        const res = await fetch("/api/chat/conversations")
        if (res.ok) {
          const { data } = await res.json()
          setConversations(data || [])
        }
      } catch (err) {
        console.error("Failed to load conversations:", err)
      } finally {
        setLoadingConversations(false)
      }
    }
    loadConversations()
  }, [])

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: aiHandleSubmit,
    isLoading,
    stop,
    reload,
    setMessages,
  } = useChat({
    api: "/api/chat",
    body: {
      contextTeam,
      selectedFolders,
      selectedPapers,
      conversationId: activeConversationId,
      model: selectedModel,
      generationSettings,
    },
    onResponse(response) {
      setIsRetrieving(false)
      pendingSourcesRef.current = decodeRagSourcesHeader(
        response.headers.get("x-refly-rag-sources")
      )
      pendingContextStatsRef.current = decodeContextStatsHeader(
        response.headers.get("x-refly-context-stats")
      )
      const newConvId = response.headers.get("x-refly-conversation-id")
      if (newConvId && !activeConversationId) {
        setActiveConversationId(newConvId)
      }
    },
    onError(error) {
      console.error("[useChat] onError", error)
      setIsRetrieving(false)
      pendingSourcesRef.current = []
      pendingContextStatsRef.current = null
      const message = error instanceof Error ? error.message : "Response failed"
      setStreamError(message)
      toast.error("Response failed", { description: message })
    },
    onFinish(message) {
      setIsRetrieving(false)
      if (!message || typeof message !== "object") return

      const messageId =
        "id" in message && typeof message.id === "string" ? message.id : null
      if (!messageId) return

      const sources = pendingSourcesRef.current || []
      pendingSourcesRef.current = null
      const contextStats = pendingContextStatsRef.current
      pendingContextStatsRef.current = null

      if (sources.length > 0 && hasCitationTag(message.content)) {
        setMessageSources((prev) => ({
          ...prev,
          [messageId]: sources,
        }))
      }

      if (contextStats) {
        setMessageContextStats((prev) => ({
          ...prev,
          [messageId]: contextStats,
        }))
      }

      fetch("/api/chat/conversations")
        .then((res) => res.json())
        .then(({ data }) => setConversations(data || []))
        .catch((error) => {
          console.error("Failed to refresh conversations:", error)
        })
    },
  })

  useEffect(() => {
    const teamParam = searchParams.get("team")
    const papersParam = searchParams.get("papers")

    if (!teamParam && !papersParam) {
      return
    }

    const paperIds = papersParam
      ? papersParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : []

    setActiveConversationId(null)
    setMessageSources({})
    setMessageContextStats({})
    setMessages([])
    setContextTeam(teamParam || "personal")
    setSelectedFolders([])
    setSelectedPapers(paperIds)
    router.replace("/chat")
  }, [router, searchParams, setMessages])

  useEffect(() => {
    async function loadConversationMessages(convId: string) {
      setLoadingMessages(true)
      setMessageSources({})
      setMessageContextStats({})
      try {
        const res = await fetch(`/api/chat/conversations/${convId}`)
        if (!res.ok) {
          return
        }

        const { data } = await res.json()
        const msgs = (data.messages || []).map(
          (m: ChatMessageType & { content: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        )

        const sourcesMap: Record<string, RagSource[]> = {}
        const contextStatsMap: Record<string, ContextStats> = {}
        ;(data.messages || []).forEach(
          (
            m: ChatMessageType & {
              content: string
              sources?: RagSource[]
              token_usage?: {
                context_budget?: number
                estimated_input_tokens?: number
                source_count?: number
                was_trimmed?: boolean
                trim_steps?: string[]
                retrieval_tokens?: number
                history_tokens?: number
                system_tokens?: number
              }
            }
          ) => {
            if (
              m.role === "assistant" &&
              Array.isArray(m.sources) &&
              m.sources.length > 0 &&
              hasCitationTag(m.content)
            ) {
              sourcesMap[m.id] = m.sources
            }

            const usage = m.token_usage
            if (
              m.role === "assistant" &&
              usage &&
              typeof usage.context_budget === "number" &&
              typeof usage.estimated_input_tokens === "number"
            ) {
              const system =
                typeof usage.system_tokens === "number"
                  ? usage.system_tokens
                  : 0
              const retrieval =
                typeof usage.retrieval_tokens === "number"
                  ? usage.retrieval_tokens
                  : 0
              const history =
                typeof usage.history_tokens === "number"
                  ? usage.history_tokens
                  : 0

              contextStatsMap[m.id] = {
                budget: usage.context_budget,
                estimatedInputTokens: usage.estimated_input_tokens,
                wasTrimmed: Boolean(usage.was_trimmed),
                trimSteps: Array.isArray(usage.trim_steps)
                  ? usage.trim_steps.filter(
                      (step): step is string => typeof step === "string"
                    )
                  : [],
                sourceCount:
                  typeof usage.source_count === "number"
                    ? usage.source_count
                    : 0,
                retrievedSourceCount:
                  typeof usage.source_count === "number"
                    ? usage.source_count
                    : 0,
                historyMessageCount: 0,
                breakdown: {
                  system,
                  retrieval,
                  history,
                  total: system + retrieval + history,
                },
              }
            }
          }
        )

        setMessages(msgs)
        setMessageSources(sourcesMap)
        setMessageContextStats(contextStatsMap)

        if (data.conversation) {
          setContextTeam(data.conversation.team_id || "personal")
          setSelectedFolders(data.conversation.selected_folder_ids || [])
          setSelectedPapers(data.conversation.selected_paper_ids || [])
          setSelectedModel(data.conversation.model || "openai/gpt-5.4")
        }
      } catch (err) {
        console.error("Failed to load messages:", err)
      } finally {
        setLoadingMessages(false)
      }
    }

    if (activeConversationId && !isLoading) {
      if (loadedConversationRef.current !== activeConversationId) {
        loadedConversationRef.current = activeConversationId
        loadConversationMessages(activeConversationId)
      }
    } else if (!activeConversationId && !isLoading) {
      loadedConversationRef.current = null
      setMessages([])
      setMessageSources({})
      setMessageContextStats({})
      setLoadingMessages(false)
    }
  }, [activeConversationId, isLoading, setMessages])

  const latestAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        return messages[i].id
      }
    }
    return null
  }, [messages])

  const activeContextStats =
    (latestAssistantMessageId &&
      messageContextStats[latestAssistantMessageId]) ||
    null

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setIsRetrieving(true)
    setStreamError(null)
    aiHandleSubmit(e)
  }

  const handleNewConversation = () => {
    setActiveConversationId(null)
    setMessageSources({})
    setMessages([])
    setStreamError(null)
    setContextTeam("personal")
    setSelectedFolders([])
    setSelectedPapers([])
    setSelectedModel("openai/gpt-5.4")
    setGenerationSettings(DEFAULT_CHAT_GENERATION_SETTINGS)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    convId: string
  ) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId))
        if (activeConversationId === convId) {
          handleNewConversation()
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err)
    }
  }

  const handleSelectConversation = (convId: string) => {
    if (isLoading) return
    setStreamError(null)
    setActiveConversationId(convId)
  }

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] w-full overflow-hidden">
      {/* Conversation Sidebar */}
      <div
        className={`flex min-h-0 flex-col overflow-hidden border-r bg-muted/10 transition-all duration-200 ${
          sidebarOpen ? "w-72" : "w-0"
        }`}
      >
        <div className="flex items-center justify-between border-b p-4">
          <span className="text-sm font-semibold">Conversations</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewConversation}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1 p-2">
            {loadingConversations ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                    activeConversationId === conv.id
                      ? "bg-muted/70 font-medium"
                      : ""
                  }`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header Context Bar */}
        <div className="glass-1 flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-9 w-9"
            >
              {sidebarOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {activeContextStats ? (
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Context</span>
                  <span className="text-muted-foreground">
                    {activeContextStats.estimatedInputTokens} /{" "}
                    {activeContextStats.budget} tok
                  </span>
                  {activeContextStats.wasTrimmed ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Trimmed
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Hist {activeContextStats.breakdown.history} · Ret{" "}
                  {activeContextStats.breakdown.retrieval} · Sys{" "}
                  {activeContextStats.breakdown.system} · Src{" "}
                  {activeContextStats.sourceCount}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
                No context loaded yet
              </div>
            )}

            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-9 w-[220px] text-foreground">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {CHAT_MODEL_OPTIONS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(generationSettings.reasoningEffort)}
              onValueChange={(value) =>
                setGenerationSettings((prev) => ({
                  ...prev,
                  reasoningEffort:
                    value as ChatGenerationSettings["reasoningEffort"],
                }))
              }
            >
              <SelectTrigger className="h-9 w-[130px] text-foreground">
                <SelectValue placeholder="Reasoning" />
              </SelectTrigger>
              <SelectContent>
                {CHAT_REASONING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(generationSettings.temperature)}
              onValueChange={(value) => {
                const nextTemperature = Number(value)
                setGenerationSettings((prev) => ({
                  ...prev,
                  temperature: Number.isFinite(nextTemperature)
                    ? nextTemperature
                    : prev.temperature,
                }))
              }}
            >
              <SelectTrigger className="h-9 w-[130px] text-foreground">
                <SelectValue placeholder="Temperature" />
              </SelectTrigger>
              <SelectContent>
                {CHAT_TEMPERATURE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ChatContextSelector
              contextTeam={contextTeam}
              setContextTeam={setContextTeam}
              teams={teams}
              selectedFolders={selectedFolders}
              setSelectedFolders={setSelectedFolders}
              selectedPapers={selectedPapers}
              setSelectedPapers={setSelectedPapers}
            />
          </div>
        </div>

        {/* Messages Area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6" ref={scrollRef}>
          <div className="mx-auto w-full max-w-5xl space-y-8 pb-4">
            {loadingMessages ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/15 text-primary shadow-sm">
                  <Bot className="h-8 w-8" />
                </div>
                <h2 className="mb-2 text-lg font-semibold">
                  Start a new conversation
                </h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  Ask me anything about your literature. I&apos;ll search
                  through your selected papers and folders to give you grounded,
                  cited responses.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.role !== "assistant" && msg.role !== "user") return null

                return (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    sources={
                      msg.role === "assistant"
                        ? messageSources[msg.id] || []
                        : []
                    }
                  />
                )
              })
            )}

            {streamError && !isLoading && (
              <div className="flex justify-start gap-4">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="glass-2 flex max-w-[80%] items-center gap-3 rounded-2xl rounded-tl-sm px-5 py-3.5 text-foreground shadow-sm">
                  <span className="text-sm text-destructive">
                    {streamError}
                  </span>
                </div>
              </div>
            )}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start gap-4">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/15 text-primary shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="glass-2 flex max-w-[80%] items-center gap-3 rounded-2xl rounded-tl-sm px-5 py-3.5 text-foreground shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="animate-pulse text-[15px] text-muted-foreground">
                    {isRetrieving
                      ? "Searching your selected sources..."
                      : "Generating grounded response..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="glass-1 w-full shrink-0 border-t p-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
            {isLoading ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsRetrieving(false)
                  stop()
                }}
                className="glass-hover mb-2 self-center"
              >
                <StopCircle className="mr-2 h-4 w-4" /> Stop generating
              </Button>
            ) : messages.length > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsRetrieving(true)
                  reload()
                }}
                className="glass-hover mb-2 self-center text-muted-foreground"
              >
                <RefreshCcw className="mr-2 h-4 w-4" /> Regenerate response
              </Button>
            ) : null}

            <form onSubmit={handleFormSubmit} className="relative rounded-2xl">
              <Input
                ref={inputRef}
                placeholder="Ask a question about your sources (e.g. 'What are the main findings in the latest ML papers?')"
                value={input}
                onChange={handleInputChange}
                className="glass-2 h-14 rounded-2xl border-border/40 pr-14 pl-5 text-base focus-visible:ring-primary/50"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="absolute top-2 right-2 bottom-2 h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <div className="mt-2 text-center text-xs text-muted-foreground">
              Responses are generated with retrieval over your selected papers
              and folders.
            </div>
            <details className="mx-auto mt-1 max-w-3xl text-center text-[11px] text-muted-foreground/70">
              <summary className="inline cursor-pointer list-none underline-offset-2 hover:text-muted-foreground hover:underline">
                AI data use
              </summary>
              <p className="mt-1 leading-relaxed">
                Chat sends your message, context, selected paper metadata, PDF
                excerpts, abstracts, and relevant notes through OpenRouter;
                retrieval queries are embedded with OpenAI. See the{" "}
                <a
                  href="/privacy"
                  className="underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
