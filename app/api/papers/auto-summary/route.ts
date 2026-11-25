import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { hasAIAccess } from "@/lib/plans"
import {
  assertWithinAIUsageLimit,
  recordAIUsageEvent,
} from "@/lib/ai/usage"
import {
  buildPaperSummaryPrompt,
  normalizeGeneratedPaperSummary,
} from "@/lib/ai/paper-summary"
import { getOpenRouterClient, resolveChatModel } from "@/lib/ai/openai"
import { estimateTextTokens } from "@/lib/ai/token-estimate"
import { extractPdfText } from "@/lib/papers/extract-pdf-text"
import { checkStorageQuota, utf8Length } from "@/lib/storage/quota"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export const runtime = "nodejs"

interface AutoSummaryRequestBody {
  paperId?: unknown
  model?: unknown
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

    const body = (await request.json()) as AutoSummaryRequestBody
    const paperId = typeof body?.paperId === "string" ? body.paperId.trim() : ""
    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 })
    }

    const requestedModel = typeof body?.model === "string" ? body.model : undefined

    const { data: profileWithModel, error: profileWithModelError } = await supabase
      .from("profiles")
      .select("plan, billing_status, billing_grace_until, plan_renewal_at, paper_summary_model")
      .eq("id", user.id)
      .single()

    let profile = profileWithModel

    if (profileWithModelError) {
      const missingColumn =
        profileWithModelError.code === "42703" ||
        profileWithModelError.message.includes("paper_summary_model")

      if (!missingColumn) {
        console.error("Profile lookup failed:", profileWithModelError)
        return NextResponse.json(
          { error: "An unexpected error occurred. Please try again later." },
          { status: 500 }
        )
      }

      const { data: fallbackProfile, error: fallbackProfileError } = await supabase
        .from("profiles")
        .select("plan, billing_status, billing_grace_until, plan_renewal_at")
        .eq("id", user.id)
        .single()

      if (fallbackProfileError || !fallbackProfile) {
        console.error("Fallback profile lookup failed:", fallbackProfileError)
        return NextResponse.json(
          { error: "An unexpected error occurred. Please try again later." },
          { status: 500 }
        )
      }

      profile = {
        ...fallbackProfile,
        paper_summary_model: null,
      }
    }

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const plan = getEffectiveBillingPlan(profile)
    if (!hasAIAccess(plan, "ai_basic_summaries")) {
      return NextResponse.json(
        {
          error:
            "AI summaries are available on Plus and Pro plans. Upgrade your plan to continue.",
        },
        { status: 403 }
      )
    }

    try {
      await assertWithinAIUsageLimit({
        supabase,
        userId: user.id,
        plan,
        planRenewalAt: profile.plan_renewal_at || null,
      })
    } catch (limitError) {
      const message =
        limitError instanceof Error ? limitError.message : "AI usage limit reached"
      return NextResponse.json({ error: message }, { status: 403 })
    }

    const { data: paper, error: paperError } = await supabase
      .from("papers")
      .select("id, user_id, team_id, title, authors, year, abstract, paper_type, doi, url")
      .eq("id", paperId)
      .single()

    if (paperError || !paper) {
      return NextResponse.json(
        { error: "Paper not found" },
        { status: 404 }
      )
    }

    if (paper.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { data: paperFile } = await supabase
      .from("paper_files")
      .select("file_path")
      .eq("paper_id", paper.id)
      .eq("mime_type", "application/pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    let extractedPdfText = ""
    let usedPdfText = false

    if (paperFile?.file_path) {
      const download = await supabase.storage
        .from("papers")
        .download(paperFile.file_path)

      if (!download.error && download.data) {
        const buffer = Buffer.from(await download.data.arrayBuffer())
        const extracted = extractPdfText(buffer)
        if (extracted.hasContent) {
          extractedPdfText = extracted.text
          usedPdfText = true
        }
      }
    }

    const { systemPrompt, userPrompt } = buildPaperSummaryPrompt({
      paper,
      abstractText: paper.abstract || "",
      pdfText: extractedPdfText,
    })

    const model = resolveChatModel(requestedModel || profile.paper_summary_model || undefined)
    const client = getOpenRouterClient()
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
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
    })

    const rawContent = completion.choices?.[0]?.message?.content || ""
    const noteContent = normalizeGeneratedPaperSummary(rawContent)
    const noteTitle = "AI Summary & Notes"

    const { data: existingSummaryNote, error: existingSummaryNoteError } = await supabase
      .from("notes")
      .select("id, title, content")
      .eq("paper_id", paper.id)
      .eq("user_id", user.id)
      .eq("title", noteTitle)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingSummaryNoteError) {
      console.error("Failed to fetch existing summary note:", existingSummaryNoteError)
      return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
    }

    const existingBytes = existingSummaryNote
      ? utf8Length(existingSummaryNote.title || "") +
        utf8Length(existingSummaryNote.content || "")
      : 0
    const nextBytes = utf8Length(noteTitle) + utf8Length(noteContent)
    const additionalBytes = Math.max(0, nextBytes - existingBytes)
    try {
      const quotaCheck = await checkStorageQuota(supabase, additionalBytes, {
        teamId: paper.team_id,
      })
      if (!quotaCheck.allowed) {
        return NextResponse.json(
          {
            error:
              "Storage limit reached. Delete old notes or upgrade your plan to save this summary.",
          },
          { status: 413 }
        )
      }
    } catch (quotaError) {
      console.error("Quota check failed:", quotaError)
      return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
    }

    const noteMutation = existingSummaryNote
      ? await supabase
          .from("notes")
          .update({
            title: noteTitle,
            content: noteContent,
          })
          .eq("id", existingSummaryNote.id)
          .eq("user_id", user.id)
          .select("id, title, content, created_at")
          .single()
      : await supabase
          .from("notes")
          .insert({
            paper_id: paper.id,
            user_id: user.id,
            title: noteTitle,
            content: noteContent,
          })
          .select("id, title, content, created_at")
          .single()

    const note = noteMutation.data
    const noteError = noteMutation.error

    if (noteError) {
      console.error("Note mutation failed:", noteError)
      return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
    }

    const promptTokens =
      completion.usage?.prompt_tokens ||
      estimateTextTokens(`${systemPrompt}\n${userPrompt}`)
    const completionTokens =
      completion.usage?.completion_tokens || estimateTextTokens(rawContent)

    try {
      await recordAIUsageEvent({
        supabase,
        context: {
          userId: user.id,
          teamId: paper.team_id,
          feature: "paper_auto_summary",
        },
        provider: "OpenRouter",
        model,
        operation: "chat_completion",
        promptTokens,
        completionTokens,
        totalTokens: completion.usage?.total_tokens,
        metadata: {
          paperId: paper.id,
          usedPdfText,
          pdfAttached: Boolean(paperFile?.file_path),
        },
      })
    } catch (usageError) {
      console.error("Failed to record auto-summary usage:", usageError)
    }

    return NextResponse.json({
      data: {
        note,
        mode: existingSummaryNote ? "updated" : "created",
        usedPdfText,
        model,
      },
    })
  } catch (error: unknown) {
    return handleApiError(error, "papers/auto-summary")
  }
}
