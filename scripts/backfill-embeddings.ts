#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"
import { aiSearchProvider } from "../lib/ai/search"
import type { Paper } from "../types"

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
  const envPath = path.join(root, ".env")
  const envLocalPath = path.join(root, ".env.local")

  const merged = {
    ...parseEnvFile(envPath),
    ...parseEnvFile(envLocalPath),
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

  const rawValue = arg.slice(prefix.length)
  const parsed = Number(rawValue)
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

async function main() {
  loadEnv()

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  requireEnv("OPENAI_API_KEY")

  const batchSize = Math.max(1, parseNumberFlag("--batch", 20))
  const startOffset = parseNumberFlag("--offset", 0)
  const forceReindex = parseBooleanFlag("--force")

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log("Starting embedding backfill")
  console.log(`Batch size: ${batchSize}`)
  console.log(`Offset: ${startOffset}`)
  console.log(`Force mode: ${forceReindex ? "on" : "off"}`)

  let offset = startOffset
  let totalFetched = 0
  let indexed = 0
  let skipped = 0
  let failed = 0

  while (true) {
    const { data, error } = await supabase
      .from("papers")
      .select(
        "id, user_id, team_id, title, authors, year, abstract, paper_type, doi, url, metadata, is_favorite, created_at, updated_at, embedding"
      )
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) {
      throw new Error(`Failed to fetch papers: ${error.message}`)
    }

    if (!data || data.length === 0) {
      break
    }

    totalFetched += data.length

    for (const row of data as Array<Paper & { embedding?: number[] | null }>) {
      if (
        !forceReindex &&
        Array.isArray(row.embedding) &&
        row.embedding.length > 0
      ) {
        skipped += 1
        continue
      }

      try {
        await aiSearchProvider.indexPaper(row, supabase)
        indexed += 1
        console.log(`Indexed ${row.id}`)
      } catch (error) {
        failed += 1
        console.error(`Failed ${row.id}:`, error)
      }
    }

    offset += data.length
    if (data.length < batchSize) {
      break
    }
  }

  console.log("\nBackfill completed")
  console.log(`Fetched: ${totalFetched}`)
  console.log(`Indexed: ${indexed}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed: ${failed}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("Embedding backfill failed:", error)
  process.exit(1)
})
