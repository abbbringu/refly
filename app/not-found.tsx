import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MarketingNav } from "@/components/layout/marketing-nav"
import { ReflyLogo } from "@/components/layout/refly-logo"
import { ArrowRight } from "lucide-react"

export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(circle_at_20%_10%,oklch(0.94_0.03_202)_0%,transparent_40%),radial-gradient(circle_at_85%_15%,oklch(0.88_0.06_180)_0%,transparent_35%)]" />
      <MarketingNav />

      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-24">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ReflyLogo className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
            404
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            We couldn't find the page you're looking for.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            It might have been moved or doesn't exist.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Button size="lg" asChild className="px-7">
              <Link href="/">
                Go home
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 bg-muted/25">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <ReflyLogo className="h-4 w-4" />
            <span>Refly Research</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Refly. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}