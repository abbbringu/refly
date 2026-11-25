import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, FileCheck2, Scale, Shield, Cookie } from "lucide-react"


import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const legalDocs = [
  {
    title: "Privacy Policy",
    description:
      "How we collect, use, store, and protect account and workspace data.",
    href: "/privacy",
    icon: Shield,
  },
  {
    title: "Terms of Service",
    description:
      "The terms that govern access to and use of Refly products and services.",
    href: "/terms",
    icon: Scale,
  },
  {
    title: "Cookie Policy",
    description:
      "Details about cookies and similar technologies used on Refly websites.",
    href: "/cookies",
    icon: Cookie,
  },
]

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Access Refly's privacy policy, terms of service, and cookie policy documents.",
  alternates: { canonical: "https://refly.ai/legal" },
  openGraph: {
    title: "Legal — Refly",
    description:
      "Access Refly's privacy policy, terms of service, and cookie policy documents.",
    url: "https://refly.ai/legal",

  },
}

export default function LegalIndexPage() {
  return (
    <main className="relative min-h-svh overflow-x-hidden bg-background pb-20">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[360px]" />
      <section className="relative mx-auto w-full max-w-6xl px-6 pt-24 md:pt-32">
        <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide">
          Legal
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl md:leading-[1.06]">
          Legal and policy documents
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Access our current policies for privacy, terms, and cookie usage.
          These documents describe how Refly operates and how your data is
          handled.
        </p>
      </section>

      <section className="mx-auto mt-10 grid w-full max-w-6xl gap-5 px-6 md:grid-cols-3">
        {legalDocs.map((doc) => {
          const Icon = doc.icon

          return (
            <Card key={doc.href} className="border-border/80 bg-card/80 shadow-sm">
              <CardHeader className="space-y-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle className="text-xl">{doc.title}</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-relaxed">
                    {doc.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild>
                  <Link href={doc.href}>
                    View document
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="mx-auto mt-10 w-full max-w-6xl px-6">
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              Questions about policy updates? Contact hello@refly.ai.
            </p>
          </div>
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
