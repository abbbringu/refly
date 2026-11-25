import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { isValidChatModel } from "@/types"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(req, user.id, "default")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const { data: conversation, error } = await supabase
      .from("chat_conversations")
      .select(
        `
        id,
        user_id,
        team_id,
        title,
        model,
        selected_folder_ids,
        selected_paper_ids,
        created_at,
        updated_at,
        last_message_at
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, role, content, sources, model, token_usage, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })

    if (messagesError) {
      console.error("Failed to fetch messages:", messagesError)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { conversation, messages } })
  } catch (error: unknown) {
    return handleApiError(error, "chat/conversations/[id]")
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(req, user.id, "default")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const updates: Record<string, unknown> = {}

    if (typeof body?.title === "string" && body.title.trim()) {
      updates.title = body.title.trim().slice(0, 80)
    }

    if (typeof body?.model === "string" && isValidChatModel(body.model)) {
      updates.model = body.model
    }

    if (Array.isArray(body?.selected_folder_ids)) {
      updates.selected_folder_ids = body.selected_folder_ids.filter(
        (id: unknown): id is string => typeof id === "string"
      )
    }

    if (Array.isArray(body?.selected_paper_ids)) {
      updates.selected_paper_ids = body.selected_paper_ids.filter(
        (id: unknown): id is string => typeof id === "string"
      )
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    const { data: conversation, error } = await supabase
      .from("chat_conversations")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        `
        id,
        user_id,
        team_id,
        title,
        model,
        selected_folder_ids,
        selected_paper_ids,
        created_at,
        updated_at,
        last_message_at
      `
      )
      .single()

    if (error || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: conversation })
  } catch (error: unknown) {
    return handleApiError(error, "chat/conversations/[id]")
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(req, user.id, "default")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const { error } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Failed to delete conversation:", error)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { deleted: true } })
  } catch (error: unknown) {
    return handleApiError(error, "chat/conversations/[id]")
  }
}
