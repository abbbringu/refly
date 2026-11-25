import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  browserClient ??= createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );
  return browserClient;
}
