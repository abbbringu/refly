import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"

const protectedRoutes = ["/library", "/paper", "/teams", "/settings"]
const signedOutRoutes = ["/login", "/signup"]

function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  path: string
) {
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = path
  redirectUrl.search = ""

  if (path === "/login") {
    redirectUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )
  }

  const redirectResponse = NextResponse.redirect(redirectUrl)
  response.cookies
    .getAll()
    .forEach((cookie) => redirectResponse.cookies.set(cookie))

  return redirectResponse
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === "/api/health") {
    return NextResponse.next()
  }

  const { response, user } = await updateSession(request)

  const isSignedOutRoute = signedOutRoutes.some((route) =>
    pathname.startsWith(route)
  )
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )
  const isApiRoute = pathname.startsWith("/api/")
  const isWebhookRoute = pathname.startsWith("/api/stripe/webhook")

  if (isApiRoute && !isWebhookRoute && !user) {
    const rateLimit = checkApiRateLimit(
      request,
      null,
      "unauthenticated_api"
    )
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }
  }

  if (isProtectedRoute && !user) {
    return redirectWithCookies(request, response, "/login")
  }

  if (isSignedOutRoute && user) {
    return redirectWithCookies(request, response, "/library")
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
