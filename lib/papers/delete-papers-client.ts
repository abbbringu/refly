export interface DeletePapersResult {
  deletedCount: number
  failedIds: string[]
  errors: string[]
}

export async function deletePapersById(
  paperIds: string[]
): Promise<DeletePapersResult> {
  const ids = Array.from(new Set(paperIds.filter(Boolean)))

  if (ids.length === 0) {
    return { deletedCount: 0, failedIds: [], errors: [] }
  }

  const res = await fetch("/api/papers/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paperIds: ids }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    const errorMessage =
      (payload && typeof payload.error === "string" && payload.error) ||
      "Failed to delete paper(s)"
    throw new Error(errorMessage)
  }

  const data = payload?.data || {}

  return {
    deletedCount:
      typeof data.deletedCount === "number" ? data.deletedCount : 0,
    failedIds: Array.isArray(data.failedIds)
      ? data.failedIds.filter((id: unknown): id is string => typeof id === "string")
      : [],
    errors: Array.isArray(data.errors)
      ? data.errors.filter((message: unknown): message is string => typeof message === "string")
      : [],
  }
}

export interface DeletePdfResult {
  success: boolean
  deletedCount: number
}

export async function deletePdfForPaper(
  paperId: string
): Promise<DeletePdfResult> {
  const res = await fetch("/api/papers/delete-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paperId }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    const errorMessage =
      (payload && typeof payload.error === "string" && payload.error) ||
      "Failed to delete PDF"
    throw new Error(errorMessage)
  }

  return {
    success: payload?.success === true,
    deletedCount:
      typeof payload?.deletedCount === "number" ? payload.deletedCount : 0,
  }
}

export interface DeletePdfsResult {
  deletedCount: number
  failedIds: string[]
  errors: string[]
}

export async function deletePdfsById(
  paperIds: string[]
): Promise<DeletePdfsResult> {
  const ids = Array.from(new Set(paperIds.filter(Boolean)))

  if (ids.length === 0) {
    return { deletedCount: 0, failedIds: [], errors: [] }
  }

  const results = await Promise.allSettled(
    ids.map((id) => deletePdfForPaper(id))
  )

  let deletedCount = 0
  const failedIds: string[] = []
  const errors: string[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === "fulfilled") {
      deletedCount += result.value.deletedCount
    } else {
      failedIds.push(ids[i])
      errors.push(result.reason?.message ?? "Failed to delete PDF")
    }
  }

  return { deletedCount, failedIds, errors }
}
