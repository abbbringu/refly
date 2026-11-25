import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerFetch } from "@/utils/supabase/internal-fetch"

let adminClient: ReturnType<typeof createClient<any>> | null = null

export function getSupabaseAdminClient() {
  if (adminClient) {
    return adminClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin credentials are missing. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    )
  }

  const serverFetch = createSupabaseServerFetch()

  adminClient = createClient<any>(supabaseUrl, serviceRoleKey, {
    ...(serverFetch ? { global: { fetch: serverFetch } } : {}),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
