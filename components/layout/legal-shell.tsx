import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"

type LegalShellProps = {
  title: string
  description: string
  updatedAt: string
  children: ReactNode
}

export function LegalShell({ title, description, updatedAt, children }: LegalShellProps) {
  return (
    <main className="relative min-h-svh overflow-x-hidden bg-background pb-20">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[340px]" />

      <section className="relative mx-auto w-full max-w-4xl px-6 pt-24 md:pt-32">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="mt-5 space-y-4">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide">
            Legal
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {description}
          </p>
          <p className="text-sm text-muted-foreground">Last updated: {updatedAt}</p>
        </div>
      </section>

      <section className="mx-auto mt-10 w-full max-w-4xl px-6">
        <div className="prose prose-zinc max-w-none rounded-2xl border border-border/70 bg-card/65 p-6 shadow-sm md:p-8 dark:prose-invert">
          {children}
        </div>
      </section>

      <section className="mx-auto mt-8 w-full max-w-4xl px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">More legal docs:</span>
          <Link href="/legal" className="hover:text-foreground hover:underline">
            Legal index
          </Link>
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms of Service
          </Link>
          <Link href="/cookies" className="hover:text-foreground hover:underline">
            Cookie Policy
          </Link>
        </div>
      </section>
    </main>
  )
}
