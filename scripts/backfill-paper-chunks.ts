#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"
import { indexPaperPdfChunks } from "../lib/ai/paper-chunks"

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {}

  const out: Record<string, string> = {}
  const raw = fs.readFileSync(filePath, "utf8")
  const lines = raw.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    let value = match[2]

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    out[key] = value
  }

  return out
}

function loadEnv() {
  const root = process.cwd()
  const merged = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function parseBooleanFlag(flag: string) {
  return process.argv.includes(flag)
}

function parseNumberFlag(flag: string, fallback: number) {
  const prefix = `${flag}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  if (!arg) return fallback

  const parsed = Number(arg.slice(prefix.length))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

async function paperHasChunks(
  supabase: ReturnType<typeof createClient>,
  paperId: string
) {
  const { data, error } = await supabase
    .from("paper_chunks")
    .select("id")
    .eq("paper_id", paperId)
    .limit(1)

  if (error) {
    throw new Error(`Failed to check paper chunks: ${error.message}`)
  }

  return Boolean(data?.length)
}

async function main() {
  loadEnv()

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  requireEnv("OPENAI_API_KEY")

  const batchSize = Math.max(1, parseNumberFlag("--batch", 10))
  const startOffset = parseNumberFlag("--offset", 0)
  const forceReindex = parseBooleanFlag("--force")

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log("Starting paper chunk backfill")
  console.log(`Batch size: ${batchSize}`)
  console.log(`Offset: ${startOffset}`)
  console.log(`Force mode: ${forceReindex ? "on" : "off"}`)

  let offset = startOffset
  let fetched = 0
  let indexed = 0
  let skipped = 0
  let missingFiles = 0
  let failed = 0

  while (true) {
    const { data, error } = await supabase
      .from("paper_files")
      .select("paper_id, file_path")
      .eq("mime_type", "application/pdf")
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) {
      throw new Error(`Failed to fetch paper files: ${error.message}`)
    }

    if (!data || data.length === 0) break
    fetched += data.length

    for (const row of data as Array<{ paper_id: string; file_path: string }>) {
      try {
        if (!forceReindex && (await paperHasChunks(supabase as never, row.paper_id))) {
          skipped += 1
          continue
        }

        const result = await indexPaperPdfChunks({
          paperId: row.paper_id,
          client: supabase,
          filePath: row.file_path,
        })

        if (result.reason === "missing_pdf") {
          missingFiles += 1
          console.warn(`Skipped ${row.paper_id}: PDF object not found`)
          continue
        }

        indexed += result.indexed > 0 ? 1 : 0
        console.log(`Indexed ${row.paper_id}: ${result.indexed} chunks`)
      } catch (error) {
        failed += 1
        console.error(`Failed ${row.paper_id}:`, error)
      }
    }

    offset += data.length
    if (data.length < batchSize) break
  }

  console.log("\nBackfill completed")
  console.log(`Fetched: ${fetched}`)
  console.log(`Indexed papers: ${indexed}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Missing PDF objects: ${missingFiles}`)
  console.log(`Failed: ${failed}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("Paper chunk backfill failed:", error)
  process.exit(1)
})
