import { describe, expect, it } from "vitest"
import { chunkPdfPages, chunkPlainText } from "@/lib/ai/chunking"

describe("AI text chunking", () => {
  it("returns no chunks for empty pages", () => {
    expect(chunkPlainText("   \n\t")).toEqual([])
  })

  it("preserves page number and sequential chunk indexes", () => {
    const chunks = chunkPdfPages([
      { pageNumber: 3, text: "A sentence with useful context. ".repeat(450) },
    ])

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index))
    expect(chunks.every((chunk) => chunk.pageNumber === 3)).toBe(true)
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true)
  })

  it("merges tiny trailing chunks into the previous chunk when possible", () => {
    const chunks = chunkPdfPages([
      { pageNumber: 1, text: "This is a short paragraph. It should stay together." },
      { pageNumber: 2, text: "Tiny." },
    ])

    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain("Tiny.")
  })
})
