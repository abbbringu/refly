import { checkStorageQuota } from "@/lib/storage/quota"
import { safeFetch, SSRFError } from "@/lib/fetch/safe-fetch"

const MAX_PDF_BYTES = 50 * 1024 * 1024

interface SupabaseClientForPdf {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      upload: (
        filePath: string,
        body: ArrayBuffer,
        options: { contentType: string; upsert: boolean },
      ) => PromiseLike<{ error: { message: string } | null }>
      remove: (
        filePaths: string[]
      ) => PromiseLike<{ error: { message: string } | null }>
    }
  }
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => PromiseLike<{
          data: Array<{ id?: string; file_path?: string }> | null
          error: { message: string } | null
        }>
      }
    }
    delete: () => {
      in: (column: string, values: string[]) => PromiseLike<{ error: { message: string } | null }>
    }
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
  }
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function fileNameFromUrl(pdfUrl: string, fallback: string): string {
  try {
    const url = new URL(pdfUrl)
    const candidate = decodeURIComponent(url.pathname.split("/").pop() || "")
    if (!candidate) return fallback
    const normalized = candidate.toLowerCase().endsWith(".pdf")
      ? candidate
      : `${candidate}.pdf`
    return sanitizeFileName(normalized) || fallback
  } catch {
    return fallback
  }
}

export async function persistRemotePdfForPaper({
  supabase,
  userId,
  paperId,
  pdfUrl,
  teamId,
}: {
  supabase: unknown
  userId: string
  paperId: string
  pdfUrl: string
  teamId?: string | null
}): Promise<{ stored: boolean; reason?: string; filePath?: string }> {
  const db = supabase as SupabaseClientForPdf
  const trimmedUrl = pdfUrl.trim()
  if (!trimmedUrl) return { stored: false, reason: "missing_url" }

  let safeResult: { arrayBuffer: ArrayBuffer; headers: Headers; finalUrl: string } | null = null
  try {
    safeResult = await safeFetch(trimmedUrl, {
      timeout: 30_000,
      maxBytes: MAX_PDF_BYTES,
    })
  } catch (err) {
    if (err instanceof SSRFError) {
      return { stored: false, reason: "ssrf_rejected" }
    }
    return { stored: false, reason: "fetch_failed" }
  }

  const arrayBuffer = safeResult.arrayBuffer

  if (arrayBuffer.byteLength === 0) {
    return { stored: false, reason: "empty_file" }
  }

  const contentType = safeResult.headers.get("content-type")?.toLowerCase() || ""
  const resolvedUrl = safeResult.finalUrl || trimmedUrl
  const looksLikePdf =
    contentType.includes("application/pdf") ||
    resolvedUrl.toLowerCase().includes(".pdf") ||
    trimmedUrl.toLowerCase().includes(".pdf")

  if (!looksLikePdf) {
    return { stored: false, reason: "not_pdf" }
  }

  try {
    const quotaCheck = await checkStorageQuota(db, arrayBuffer.byteLength, {
      teamId,
    })
    if (!quotaCheck.allowed) {
      return { stored: false, reason: "storage_quota_exceeded" }
    }
  } catch {
    return { stored: false, reason: "quota_check_failed" }
  }

  const fileName = fileNameFromUrl(resolvedUrl, "paper.pdf")
  const filePath = `${userId}/${paperId}/${fileName}`

  const { data: existingFiles, error: existingFilesError } = await db
    .from("paper_files")
    .select("id, file_path")
    .eq("paper_id", paperId)
    .eq("mime_type", "application/pdf")

  if (existingFilesError) {
    return { stored: false, reason: "load_existing_files_failed" }
  }

  const existingRows = existingFiles || []

  if (existingRows.length > 0) {
    const existingPaths = existingRows
      .map((file: { file_path?: string }) => file.file_path)
      .filter((path: string | undefined): path is string => Boolean(path))

    if (existingPaths.length > 0) {
      const { error: removeError } = await db.storage
        .from("papers")
        .remove(existingPaths)

      if (removeError) {
        return { stored: false, reason: "remove_existing_files_failed" }
      }
    }

    const existingIds = existingRows
      .map((file: { id?: string }) => file.id)
      .filter((id: string | undefined): id is string => Boolean(id))

    if (existingIds.length > 0) {
      const { error: deleteRowsError } = await db
        .from("paper_files")
        .delete()
        .in("id", existingIds)

      if (deleteRowsError) {
        return { stored: false, reason: "delete_existing_rows_failed" }
      }
    }
  }

  const { error: uploadError } = await db.storage
    .from("papers")
    .upload(filePath, arrayBuffer, { contentType: "application/pdf", upsert: false })

  if (uploadError) {
    return { stored: false, reason: "upload_failed" }
  }

  const { error: insertError } = await db.from("paper_files").insert({
    paper_id: paperId,
    file_name: fileName,
    file_path: filePath,
    file_size: arrayBuffer.byteLength,
    mime_type: "application/pdf",
  })

  if (insertError) {
    return { stored: false, reason: "db_insert_failed" }
  }

  return { stored: true, filePath }
}
