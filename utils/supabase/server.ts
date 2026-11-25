import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseServerFetch } from "@/utils/supabase/internal-fetch";

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serverFetch = createSupabaseServerFetch();

  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      ...(serverFetch ? { global: { fetch: serverFetch } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
