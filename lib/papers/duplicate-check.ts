import { createClient } from "@/utils/supabase/client"

export async function checkDuplicatePaper(userId: string, title?: string | null, doi?: string | null) {
  if (!title && !doi) return null
  
  const supabase = createClient()
  
  let query = supabase.from("papers").select("id, title, doi").eq("user_id", userId)
  
  if (doi) {
    query = query.eq("doi", doi)
  } else if (title) {
    query = query.ilike("title", title)
  }
  
  const { data, error } = await query.limit(1)
  
  if (error || !data || data.length === 0) return null
  return data[0]
}
