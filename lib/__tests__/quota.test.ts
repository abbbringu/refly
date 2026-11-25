import { describe, expect, it, vi } from "vitest"
import { checkStorageQuota, formatBytes, getStorageUsage, utf8Length } from "@/lib/storage/quota"

describe("storage quota helpers", () => {
  it("normalizes storage usage returned by the database", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: {
          plan: "plus",
          file_bytes: "1024",
          note_bytes: 2,
          metadata_bytes: null,
          chat_bytes: 4,
          total_bytes: "1030",
          limit_bytes: `${5 * 1024 * 1024 * 1024}`,
          remaining_bytes: "100",
          is_over_limit: false,
        },
        error: null,
      })),
    }

    await expect(getStorageUsage(supabase)).resolves.toMatchObject({
      plan: "plus",
      file_bytes: 1024,
      metadata_bytes: 0,
      total_bytes: 1030,
      is_over_limit: false,
    })
    expect(supabase.rpc).toHaveBeenCalledWith("get_storage_usage")
  })

  it("passes normalized quota check arguments including team scope", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: {
          allowed: true,
          plan: "pro",
          current_bytes: 10,
          additional_bytes: 25,
          projected_total_bytes: 35,
          limit_bytes: null,
          remaining_bytes: null,
          over_by_bytes: 0,
        },
        error: null,
      })),
    }

    await expect(checkStorageQuota(supabase, 25.9, { teamId: "team_1" })).resolves.toMatchObject({
      allowed: true,
      additional_bytes: 25,
      plan: "pro",
    })
    expect(supabase.rpc).toHaveBeenCalledWith("check_storage_quota", {
      p_additional_bytes: 25,
      p_team_id: "team_1",
    })
  })

  it("formats byte values for user-facing quota errors", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1024)).toBe("1.00 KB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB")
    expect(formatBytes(15 * 1024 * 1024 * 1024)).toBe("15.00 GB")
  })

  it("counts UTF-8 bytes instead of JavaScript code units", () => {
    expect(utf8Length("abc")).toBe(3)
    expect(utf8Length("€")).toBe(3)
  })
})
