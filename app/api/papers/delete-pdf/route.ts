import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { removePaperChunks } from "@/lib/ai/paper-chunks"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const paperId =
    typeof body.paperId === "string" && body.paperId.trim()
      ? body.paperId.trim()
      : null

  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId" }, { status: 400 })
  }

  const { data: paper, error: paperError } = await supabase
    .from("papers")
    .select("id, user_id, team_id")
    .eq("id", paperId)
    .single()

  if (paperError || !paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 })
  }

  if (paper.user_id !== user.id) {
    const { data: editableTeamIdsData } = await supabase.rpc(
      "user_team_ids_with_roles",
      {
        p_user_id: user.id,
        p_roles: ["owner", "admin", "editor"],
      }
    )

    const editableTeamIds = new Set(
      Array.isArray(editableTeamIdsData)
        ? editableTeamIdsData.filter(
            (teamId: unknown): teamId is string => typeof teamId === "string"
          )
        : []
    )

    const canEdit =
      typeof paper.team_id === "string" && editableTeamIds.has(paper.team_id)

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const { data: fileRows, error: filesError } = await supabase
    .from("paper_files")
    .select("id, file_path")
    .eq("paper_id", paperId)
    .eq("mime_type", "application/pdf")

  if (filesError) {
    return NextResponse.json(
      { error: "Failed to load PDF files" },
      { status: 500 }
    )
  }

  const rows = fileRows || []

  if (rows.length === 0) {
    return NextResponse.json({ success: true, deletedCount: 0 })
  }

  const filePaths = rows
    .map((row) => row.file_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0)

  if (filePaths.length > 0) {
    const adminSupabase = getSupabaseAdminClient()
    const { error: storageError } = await adminSupabase.storage
      .from("papers")
      .remove(filePaths)

    if (storageError) {
      return NextResponse.json(
        { error: "Failed to remove PDF from storage" },
        { status: 500 }
      )
    }
  }

  const rowIds = rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  if (rowIds.length > 0) {
    const adminSupabase = getSupabaseAdminClient()
    const { error: deleteError } = await adminSupabase
      .from("paper_files")
      .delete()
      .in("id", rowIds)

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete PDF records" },
        { status: 500 }
      )
    }
  }

  try {
    await removePaperChunks(paperId, getSupabaseAdminClient())
  } catch (chunkError) {
    console.error("Failed to remove paper chunks:", chunkError)
  }

  return NextResponse.json({
    success: true,
    deletedCount: rows.length,
  })
}
