import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { checkStorageQuota, formatBytes } from "@/lib/storage/quota"
import { assertWithinAIUsageLimit } from "@/lib/ai/usage"
import { indexPaperPdfChunks, removePaperChunks } from "@/lib/ai/paper-chunks"
import { hasAIAccess } from "@/lib/plans"
import { getEffectiveBillingPlan } from "@/lib/billing/entitlements"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024

async function replaceExistingPdfForPaper(
  supabase: ReturnType<typeof createClient>,
  paperId: string
) {
  const { data: existingFiles, error: existingFilesError } = await supabase
    .from("paper_files")
    .select("id, file_path")
    .eq("paper_id", paperId)
    .eq("mime_type", "application/pdf")

  if (existingFilesError) {
    console.error("Failed to load existing files:", existingFilesError)
    throw new Error("Failed to load existing files")
  }

  if (!existingFiles || existingFiles.length === 0) {
    return
  }

  const existingPaths = existingFiles
    .map((file) => file.file_path)
    .filter((path): path is string => Boolean(path))

  if (existingPaths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("papers")
      .remove(existingPaths)

    if (removeError) {
      console.error("Failed to remove existing files from storage:", removeError)
      throw new Error("Failed to remove existing files")
    }
  }

  const existingIds = existingFiles
    .map((file) => file.id)
    .filter((id): id is string => Boolean(id))

  if (existingIds.length > 0) {
    const { error: deleteRowsError } = await supabase
      .from("paper_files")
      .delete()
      .in("id", existingIds)

    if (deleteRowsError) {
      console.error("Failed to delete existing file records:", deleteRowsError)
      throw new Error("Failed to delete existing file records")
    }
  }
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

  const rateLimit = checkApiRateLimit(request, user.id, "upload")
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit)
  }

  try {
    const formData = await request.formData()
    const paperId = formData.get("paperId") as string
    const file = formData.get("file") as File | null

    if (!paperId || !file) {
      return NextResponse.json(
        { error: "Missing paperId or file" },
        { status: 400 }
      )
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      )
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${formatBytes(MAX_UPLOAD_FILE_SIZE)}.`,
        },
        { status: 413 }
      )
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

    const arrayBuffer = await file.arrayBuffer()
    const fileSize = arrayBuffer.byteLength

    const quotaCheck = await checkStorageQuota(supabase, fileSize, {
      teamId: paper.team_id,
    })
    if (!quotaCheck.allowed) {
      const limitLabel =
        quotaCheck.limit_bytes === null
          ? "your plan"
          : formatBytes(quotaCheck.limit_bytes)
      return NextResponse.json(
        {
          error: `Storage limit reached. This upload would exceed your ${limitLabel} quota by ${formatBytes(quotaCheck.over_by_bytes)}.`,
        },
        { status: 413 }
      )
    }

    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "paper.pdf"

    const filePath = `${user.id}/${paperId}/${sanitizedName}`

    await replaceExistingPdfForPaper(supabase, paperId)
    await removePaperChunks(paperId, supabase)

    const { error: uploadError } = await supabase.storage
      .from("papers")
      .upload(filePath, arrayBuffer, {
        contentType: "application/pdf",
        upsert: false,
      })

    if (uploadError) {
      console.error("Storage upload failed:", uploadError)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    const { error: insertError } = await supabase.from("paper_files").insert({
      paper_id: paperId,
      file_name: sanitizedName,
      file_path: filePath,
      file_size: fileSize,
      mime_type: "application/pdf",
    })

    if (insertError) {
      console.error("Paper file insert failed:", insertError)
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      )
    }

    let chunksIndexed = 0
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan, billing_status, billing_grace_until, plan_renewal_at")
        .eq("id", user.id)
        .maybeSingle()
      const plan = getEffectiveBillingPlan(profile)

      if (hasAIAccess(plan, "ai_search")) {
        await assertWithinAIUsageLimit({
          supabase,
          userId: user.id,
          plan,
          planRenewalAt: profile?.plan_renewal_at || null,
        })

        const chunkResult = await indexPaperPdfChunks({
          paperId,
          client: supabase,
          pdfBuffer: Buffer.from(arrayBuffer),
          filePath,
          usageContext: {
            userId: user.id,
            teamId: paper.team_id,
            feature: "paper_chunk_indexing",
          },
        })
        chunksIndexed = chunkResult.indexed
      }
    } catch (chunkError) {
      console.error("Failed to index PDF chunks:", chunkError)
    }

    return NextResponse.json({ stored: true, chunksIndexed })
  } catch (err: unknown) {
    return handleApiError(err, "papers/upload-pdf")
  }
}
