import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimit = checkApiRateLimit(request, user.id, "default")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const { data: conversations, error } = await supabase
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
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Failed to fetch conversations:", error)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: conversations })
  } catch (error: unknown) {
    return handleApiError(error, "chat/conversations")
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const title =
      typeof body?.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 80)
        : "New conversation"

    const { data: conversation, error } = await supabase
      .from("chat_conversations")
      .insert({
        user_id: user.id,
        title,
      })
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

    if (error) {
      console.error("Failed to create conversation:", error)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: conversation }, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error, "chat/conversations")
  }
}
