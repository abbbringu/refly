/**
 * Creates a fetch wrapper for server-side Supabase clients running inside Docker.
 *
 * The browser reaches the local Supabase API gateway via NEXT_PUBLIC_SUPABASE_URL
 * (e.g. http://localhost:8000), while the Next.js server container reaches it over
 * the internal Docker network via SUPABASE_INTERNAL_URL (e.g. http://gateway:8000).
 *
 * Rewriting the origin inside fetch keeps NEXT_PUBLIC_SUPABASE_URL as the client's
 * nominal URL so @supabase/ssr derives identical auth cookie names on browser & server.
 */
export function createSupabaseServerFetch(): typeof fetch | undefined {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
  const internalUrl = process.env.SUPABASE_INTERNAL_URL?.replace(/\/+$/, "")

  if (!publicUrl || !internalUrl || publicUrl === internalUrl) {
    return undefined
  }

  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      const rewritten = input.startsWith(publicUrl)
        ? `${internalUrl}${input.slice(publicUrl.length)}`
        : input
      return fetch(rewritten, init)
    }

    if (input instanceof URL) {
      const str = input.toString()
      const rewritten = str.startsWith(publicUrl)
        ? `${internalUrl}${str.slice(publicUrl.length)}`
        : str
      return fetch(rewritten, init)
    }

    if (input.url.startsWith(publicUrl)) {
      const rewrittenUrl = `${internalUrl}${input.url.slice(publicUrl.length)}`
      return fetch(new Request(rewrittenUrl, input), init)
    }

    return fetch(input, init)
  }
}
