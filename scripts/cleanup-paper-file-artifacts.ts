#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

type PaperFileRow = {
  id: string
  paper_id: string
  file_path: string
  created_at: string
}

interface StorageCleanupClient {
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>
    }
  }
}

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

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function removeStorageObjects(
  supabase: StorageCleanupClient,
  paths: string[]
) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  if (uniquePaths.length === 0) return

  for (const batch of chunk(uniquePaths, 100)) {
    const { error } = await supabase.storage.from("papers").remove(batch)
    if (error) {
      throw new Error(`Storage remove failed: ${error.message}`)
    }
  }
}

async function main() {
  loadEnv()

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log("Starting paper file artifact cleanup")

  const { data: paperFiles, error: paperFilesError } = await supabase
    .from("paper_files")
    .select("id, paper_id, file_path, created_at")
    .order("created_at", { ascending: false })

  if (paperFilesError) {
    throw new Error(`Failed to load paper_files: ${paperFilesError.message}`)
  }

  const rows = (paperFiles || []) as PaperFileRow[]
  const rowsByPaper = new Map<string, PaperFileRow[]>()

  for (const row of rows) {
    const list = rowsByPaper.get(row.paper_id) || []
    list.push(row)
    rowsByPaper.set(row.paper_id, list)
  }

  const duplicateRowsToDelete: PaperFileRow[] = []
  for (const paperRows of rowsByPaper.values()) {
    if (paperRows.length <= 1) continue
    duplicateRowsToDelete.push(...paperRows.slice(1))
  }

  if (duplicateRowsToDelete.length > 0) {
    const duplicateIds = duplicateRowsToDelete.map((row) => row.id)
    const duplicatePaths = duplicateRowsToDelete.map((row) => row.file_path)

    await removeStorageObjects(supabase, duplicatePaths)

    for (const batch of chunk(duplicateIds, 1000)) {
      const { error } = await supabase
        .from("paper_files")
        .delete()
        .in("id", batch)

      if (error) {
        throw new Error(`Failed deleting duplicate paper_files rows: ${error.message}`)
      }
    }
  }

  const { data: objects, error: objectsError } = await supabase
    .schema("storage")
    .from("objects")
    .select("name")
    .eq("bucket_id", "papers")

  if (objectsError) {
    throw new Error(`Failed to load storage objects: ${objectsError.message}`)
  }

  const { data: currentRows, error: currentRowsError } = await supabase
    .from("paper_files")
    .select("file_path")

  if (currentRowsError) {
    throw new Error(`Failed to reload paper_files: ${currentRowsError.message}`)
  }

  const referencedPaths = new Set(
    (currentRows || [])
      .map((row) => row.file_path)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  )

  const orphanedStoragePaths = (objects || [])
    .map((row) => row.name)
    .filter((name): name is string => typeof name === "string" && !referencedPaths.has(name))

  if (orphanedStoragePaths.length > 0) {
    await removeStorageObjects(supabase, orphanedStoragePaths)
  }

  console.log(`Duplicate rows removed: ${duplicateRowsToDelete.length}`)
  console.log(`Orphaned storage objects removed: ${orphanedStoragePaths.length}`)
  console.log("Paper file artifact cleanup completed")
}

main().catch((error) => {
  console.error("Paper file artifact cleanup failed:", error)
  process.exit(1)
})
