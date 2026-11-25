import { beforeEach, describe, expect, it, vi } from "vitest"
import { jsonRequest, queryResult, responseJson } from "./test-utils"

const mocks = vi.hoisted(() => ({
  supabase: null as unknown,
  admin: null as unknown,
  quotaAllowed: true,
  fetchedMetadata: null as unknown,
}))

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(() => mocks.supabase),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => mocks.admin),
}))

vi.mock("@/lib/storage/quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/quota")>()
  return {
    ...actual,
    checkStorageQuota: vi.fn(async () =>
      mocks.quotaAllowed
        ? { allowed: true, limit_bytes: 350, over_by_bytes: 0 }
        : { allowed: false, limit_bytes: 350, over_by_bytes: 100 },
    ),
  }
})

vi.mock("@/lib/rate-limit", () => ({
  checkApiRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitExceededResponse: vi.fn(() => Response.json({ error: "rate limited" }, { status: 429 })),
}))

vi.mock("@/lib/ai/paper-chunks", () => ({
  indexPaperPdfChunks: vi.fn(async () => ({ indexed: 2 })),
  removePaperChunks: vi.fn(async () => undefined),
}))

vi.mock("@/lib/ai/search", () => ({
  aiSearchProvider: { indexPaper: vi.fn(async () => undefined) },
}))

vi.mock("@/lib/ai/usage", () => ({
  assertWithinAIUsageLimit: vi.fn(async () => undefined),
}))

vi.mock("@/lib/papers/fetch-metadata", () => ({
  fetchDOI: vi.fn(async () => mocks.fetchedMetadata),
  fetchArxiv: vi.fn(async () => mocks.fetchedMetadata),
  fetchPubMed: vi.fn(async () => mocks.fetchedMetadata),
  fetchISBN: vi.fn(async () => mocks.fetchedMetadata),
  preferPublishedVersionForArxiv: vi.fn(async (metadata) => metadata),
}))

vi.mock("@/lib/papers/persist-remote-pdf", () => ({
  persistRemotePdfForPaper: vi.fn(async () => ({ stored: true, filePath: "user_1/paper_1/paper.pdf" })),
}))

function baseSupabase() {
  const storage = { from: vi.fn(() => ({ upload: vi.fn(async () => ({ error: null })), remove: vi.fn(async () => ({ error: null })) })) }
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user_1" } } })) },
    storage,
    rpc: vi.fn(async () => ({ data: ["team_1"], error: null })),
    from: vi.fn((table: string) => {
      if (table === "papers") return queryResult({ data: { id: "paper_1", user_id: "user_1", team_id: null }, error: null })
      if (table === "paper_files") return queryResult({ data: [], error: null })
      if (table === "profiles") return queryResult({ data: { plan: "plus", billing_status: "active" }, error: null })
      return queryResult({ data: null, error: null })
    }),
  }
}

describe("paper API routes", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.quotaAllowed = true
    mocks.supabase = baseSupabase()
    mocks.admin = {
      storage: { from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: null })) })) },
      from: vi.fn(() => queryResult({ data: null, error: null })),
    }
    mocks.fetchedMetadata = {
      title: "Launch Smoke Coverage",
      authors: ["Ada Lovelace"],
      doi: "10.1234/refly",
      abstract: "A test paper",
      year: "2026",
      url: "https://example.test/paper",
      metadata: {},
      pdf_url: "https://example.test/paper.pdf",
    }
  })

  it("rejects PDF uploads that exceed storage quota", async () => {
    mocks.quotaAllowed = false
    const { POST } = await import("@/app/api/papers/upload-pdf/route")
    const formData = new FormData()
    formData.set("paperId", "paper_1")
    formData.set("file", new File(["%PDF-1.4"], "paper.pdf", { type: "application/pdf" }))

    const request = {
      url: "http://localhost/api/papers/upload-pdf",
      headers: new Headers(),
      formData: async () => formData,
    }
    const response = await POST(request as never)

    expect(response.status).toBe(413)
    await expect(responseJson(response)).resolves.toMatchObject({ error: expect.stringContaining("Storage limit reached") })
  })

  it("uploads a PDF and records a paper_files row when quota allows it", async () => {
    const inserts: unknown[] = []
    ;(mocks.supabase as any).from = vi.fn((table: string) => {
      if (table === "papers") return queryResult({ data: { id: "paper_1", user_id: "user_1", team_id: null }, error: null })
      if (table === "paper_files") {
        return {
          ...queryResult({ data: [], error: null }),
          insert: vi.fn((payload: unknown) => {
            inserts.push(payload)
            return Promise.resolve({ data: null, error: null })
          }),
        }
      }
      if (table === "profiles") return queryResult({ data: { plan: "plus", billing_status: "active" }, error: null })
      return queryResult({ data: null, error: null })
    })
    const { POST } = await import("@/app/api/papers/upload-pdf/route")
    const formData = new FormData()
    formData.set("paperId", "paper_1")
    formData.append("file", new File(["%PDF-1.4"], "My Paper.pdf", { type: "application/pdf" }), "My Paper.pdf")

    const request = {
      url: "http://localhost/api/papers/upload-pdf",
      headers: new Headers(),
      formData: async () => formData,
    }
    const response = await POST(request as never)

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ stored: true, chunksIndexed: 2 })
    expect(inserts).toEqual([
      expect.objectContaining({ paper_id: "paper_1", file_name: "My-Paper.pdf", mime_type: "application/pdf" }),
    ])
  })

  it("deletes PDF storage objects and chunk records", async () => {
    ;(mocks.supabase as any).from = vi.fn((table: string) => {
      if (table === "papers") return queryResult({ data: { id: "paper_1", user_id: "user_1", team_id: null }, error: null })
      if (table === "paper_files") return queryResult({ data: [{ id: "file_1", file_path: "user_1/paper_1/paper.pdf" }], error: null })
      return queryResult({ data: null, error: null })
    })
    const adminRemove = vi.fn(async () => ({ error: null }))
    mocks.admin = {
      storage: { from: vi.fn(() => ({ remove: adminRemove })) },
      from: vi.fn(() => queryResult({ data: null, error: null })),
    }
    const { POST } = await import("@/app/api/papers/delete-pdf/route")

    const response = await POST(jsonRequest({ paperId: "paper_1" }) as never)

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({ success: true, deletedCount: 1 })
    expect(adminRemove).toHaveBeenCalledWith(["user_1/paper_1/paper.pdf"])
  })

  it("imports a DOI paper and attempts PDF persistence/indexing", async () => {
    const inserted = { id: "paper_1", team_id: null, title: "Launch Smoke Coverage", doi: "10.1234/refly" }
    ;(mocks.supabase as any).from = vi.fn((table: string) => {
      if (table === "profiles") return queryResult({ data: { plan: "plus", billing_status: "active" }, error: null })
      if (table === "papers") {
        return {
          ...queryResult({ data: [], error: null }),
          insert: vi.fn(() => ({ select: () => ({ single: vi.fn(async () => ({ data: inserted, error: null })) }) })),
        }
      }
      return queryResult({ data: null, error: null })
    })
    const { POST } = await import("@/app/api/papers/import/route")

    const response = await POST(jsonRequest({ type: "doi", id: "10.1234/refly" }) as never)

    expect(response.status).toBe(200)
    await expect(responseJson(response)).resolves.toMatchObject({
      data: expect.objectContaining({ id: "paper_1", title: "Launch Smoke Coverage" }),
      pdfStored: true,
      reusedExisting: false,
    })
  })
})
