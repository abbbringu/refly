#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import process from "node:process"

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const out = {}
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

function upsertEnv(content, key, value) {
  const escaped = value.replace(/"/g, '\\"')
  const line = `${key}="${escaped}"`
  const pattern = new RegExp(`^${key}=.*$`, "m")

  if (pattern.test(content)) {
    return content.replace(pattern, line)
  }

  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n"
  return `${content}${suffix}${line}\n`
}

const args = process.argv.slice(2)
const shouldWrite = args.includes("--write")

const root = process.cwd()
const envLocalPath = path.join(root, ".env.local")
const envPath = path.join(root, ".env")

const merged = {
  ...parseEnvFile(envPath),
  ...parseEnvFile(envLocalPath),
  ...process.env,
}

const supabaseUrl = merged.NEXT_PUBLIC_SUPABASE_URL || ""
const refMatch = supabaseUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i)
const projectRef = merged.SUPABASE_PROJECT_REF || (refMatch ? refMatch[1] : "")

if (!projectRef) {
  console.error("Could not detect Supabase project ref.")
  console.error("Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_REF first.")
  process.exit(1)
}

const dbUser = merged.SUPABASE_DB_USER || "postgres"
const dbPasswordRaw = merged.SUPABASE_DB_PASSWORD || "<password>"
const dbHost = merged.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`
const dbPort = merged.SUPABASE_DB_PORT || "5432"
const dbName = merged.SUPABASE_DB_NAME || "postgres"
const sslMode = merged.SUPABASE_DB_SSLMODE || "require"

const encodedUser = encodeURIComponent(dbUser)
const encodedPassword =
  dbPasswordRaw === "<password>" ? dbPasswordRaw : encodeURIComponent(dbPasswordRaw)

const databaseUrl = `postgresql://${encodedUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}?sslmode=${sslMode}`

console.log(`Project ref: ${projectRef}`)
console.log("")
console.log("DATABASE_URL template:")
console.log(databaseUrl)
console.log("")
console.log("Copy/paste:")
console.log(`DATABASE_URL="${databaseUrl}"`)

if (dbPasswordRaw === "<password>") {
  console.log("")
  console.log("Tip: set SUPABASE_DB_PASSWORD in your environment to avoid the placeholder.")
}

if (shouldWrite) {
  const targetPath = fs.existsSync(envLocalPath) ? envLocalPath : envPath
  const initial = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : ""
  const next = upsertEnv(initial, "DATABASE_URL", databaseUrl)
  fs.writeFileSync(targetPath, next)
  console.log("")
  console.log(`Wrote DATABASE_URL to ${path.basename(targetPath)}`)
}
