"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { ReflyLogo } from "@/components/layout/refly-logo"
import { cn } from "@/lib/utils"
import { isSelfHostedMode } from "@/lib/config/self-hosted"
import { createClient } from "@/utils/supabase/client"

export function MarketingNav() {
  const pathname = usePathname()
  const [authState, setAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading")

  const active = pathname === "/about" ? "about"
    : pathname === "/faq" ? "faq"
    : pathname === "/changelog" ? "changelog"
    : pathname === "/pricing" ? "pricing"
    : undefined

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: unknown } }) => {
      setAuthState(user ? "authenticated" : "unauthenticated")
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
      setAuthState(session ? "authenticated" : "unauthenticated")
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <div className="fixed inset-x-0 top-4 z-50 px-4 motion-safe:animate-fade-in">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between rounded-full border border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0.12)_100%)] bg-background/40 px-2 ring-1 ring-white/20 shadow-[0_12px_34px_-18px_rgba(15,23,42,0.7)] shadow-inner backdrop-blur-2xl supports-[backdrop-filter]:bg-background/30 md:px-3">
        <Link
          href="/"
          className="group flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-200 ease-out group-hover:scale-[1.03]">
            <ReflyLogo />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Refly Research
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Button
            variant={active === "about" ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "rounded-full px-3 backdrop-blur-md transition-transform duration-200 ease-out hover:-translate-y-0.5",
              active === "about" && "shadow-sm",
            )}
            asChild
          >
            <Link href="/about">About</Link>
          </Button>
          <Button
            variant={active === "faq" ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "rounded-full px-3 backdrop-blur-md transition-transform duration-200 ease-out hover:-translate-y-0.5",
              active === "faq" && "shadow-sm",
            )}
            asChild
          >
            <Link href="/faq">FAQ</Link>
          </Button>
          <Button
            variant={active === "changelog" ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "hidden rounded-full px-3 backdrop-blur-md transition-transform duration-200 ease-out hover:-translate-y-0.5 md:inline-flex",
              active === "changelog" && "shadow-sm",
            )}
            asChild
          >
            <Link href="/changelog">Changelog</Link>
          </Button>
          {!isSelfHostedMode() && (
            <Button
              variant={active === "pricing" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "rounded-full px-3 backdrop-blur-md transition-transform duration-200 ease-out hover:-translate-y-0.5",
                active === "pricing" && "bg-white/25 ring-1 ring-white/35 shadow-sm",
              )}
              asChild
            >
              <Link href="/pricing">Pricing</Link>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {authState === "loading" ? (
            <div className="h-9 w-24 animate-pulse rounded-full bg-muted/50" />
          ) : authState === "authenticated" ? (
            <Button size="sm" className="rounded-full px-4 transition-transform duration-200 ease-out hover:-translate-y-0.5" asChild>
              <Link href="/library">Library</Link>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden rounded-full px-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 sm:inline-flex"
                asChild
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" className="rounded-full px-4 transition-transform duration-200 ease-out hover:-translate-y-0.5" asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
