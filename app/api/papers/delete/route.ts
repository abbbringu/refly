import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"

function uniqueIds(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : []
  }

  if (!Array.isArray(value)) return []

  const ids = value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean)

  return Array.from(new Set(ids))
}

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

  const ids = uniqueIds(body.paperIds ?? body.paperId)
  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing paperIds" }, { status: 400 })
  }

  const adminSupabase = getSupabaseAdminClient()
  const failedIds: string[] = []
  const errors: string[] = []
  let deletedCount = 0

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

  for (const paperId of ids) {
    const { data: paper, error: paperError } = await supabase
      .from("papers")
      .select("id, user_id, team_id")
      .eq("id", paperId)
      .single()

    if (paperError || !paper) {
      failedIds.push(paperId)
      errors.push(`Could not access paper ${paperId}`)
      continue
    }

    const canDelete =
      paper.user_id === user.id ||
      (typeof paper.team_id === "string" && editableTeamIds.has(paper.team_id))

    if (!canDelete) {
      failedIds.push(paperId)
      errors.push(`Not authorized to delete paper ${paperId}`)
      continue
    }

    const { data: files, error: filesError } = await supabase
      .from("paper_files")
      .select("file_path")
      .eq("paper_id", paperId)

    if (filesError) {
      failedIds.push(paperId)
      errors.push(`Could not load files for paper ${paperId}`)
      continue
    }

    const filePaths = (files || [])
      .map((file) => file.file_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0)

    if (filePaths.length > 0) {
      const { error: storageError } = await adminSupabase.storage
        .from("papers")
        .remove(filePaths)

      if (storageError) {
        errors.push(
          `Warning: could not remove storage objects for paper ${paperId}; paper record delete will continue`
        )
      }
    }

    const { error: deleteError } = await adminSupabase
      .from("papers")
      .delete()
      .eq("id", paperId)

    if (deleteError) {
      failedIds.push(paperId)
      errors.push(
        `Failed to delete paper ${paperId}`
      )
      continue
    }

    deletedCount += 1
  }

  const status = failedIds.length > 0 ? 207 : 200
  return NextResponse.json(
    {
      data: {
        deletedCount,
        failedIds,
        errors,
      },
    },
    { status }
  )
}
