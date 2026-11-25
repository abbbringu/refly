import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, Compass, FlaskConical, Goal, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"


export const metadata: Metadata = {
  title: "About",
  description:
    "Refly is an AI-powered research workspace built by a solo developer to eliminate repetitive work and help researchers focus on discovery.",
  alternates: { canonical: "https://refly.ai/about" },
  openGraph: {
    title: "About Refly",
    description:
      "Refly is an AI-powered research workspace built by a solo developer to eliminate repetitive work and help researchers focus on discovery.",
    url: "https://refly.ai/about",

  },
}

const principles = [
  {
    icon: Goal,
    title: "Evidence before opinion",
    description:
      "I design every workflow around verifiable sources so researchers can move faster without losing rigor.",
  },
  {
    icon: Compass,
    title: "Clarity over complexity",
    description:
      "Research software should feel simple in daily use, even when the underlying systems are advanced.",
  },
  {
    icon: Users,
    title: "AI that works for you",
    description:
      "Smart features should amplify your thinking, not replace it. Refly uses AI to handle the repetitive work so you can focus on discovery.",
  },
]

const milestones = [
  {
    date: "Jan 2026",
    title: "The spark of an idea",
    description:
      "I started Refly after experiencing firsthand how much time researchers lose to manual organization and scattered information.",
  },
  {
    date: "Mar 2026",
    title: "First workspace engine",
    description:
      "I shipped searchable notes and source linking to help researchers keep ideas tied to evidence.",
  },
  {
    date: "Jun 2026",
    title: "AI research copilot",
    description:
      "Semantic retrieval and citation-aware answers became part of the everyday writing flow.",
  },
]

const foundingStory = [
  {
    title: "Collecting scattered material",
    description:
      "Papers, meeting notes, slide decks, and links lived in different tools. I built Refly to pull them into one searchable place automatically.",
  },
  {
    title: "Manual reference aggregation",
    description:
      "Researchers spent hours compiling citations and source lists by hand. Refly aggregates references in the background and keeps them connected to notes.",
  },
  {
    title: "Rebuilding context every week",
    description:
      "Starting new projects often meant repeating the same setup work. Refly preserves context so researchers can continue building on past insights.",
  },
]

export default function AboutPage() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden bg-background">
      <div className="marketing-glow pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <main className="flex-1">
        <section className="relative">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 pt-24 pb-20 md:pt-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="animate-in duration-700 slide-in-from-bottom-6">
              <Badge
                variant="outline"
                className="mb-6 h-7 rounded-full px-3 text-[11px] tracking-wide uppercase"
              >
                About Refly
              </Badge>
              <h1 className="max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.08]">
                One developer building smart AI for easier research.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                I built Refly after experiencing the same pain myself: endless
                time spent organizing files, aggregating references, and
                stitching context together by hand. Refly uses smart AI to
                handle repetitive research tasks so you can focus on actual
                thinking and discovery.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild className="px-7">
                  <Link href="/signup">
                    Start with Refly
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>
            </div>

            <Card className="border-border/70 bg-card/95 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  What I am building
                </CardTitle>
                <CardDescription>
                  A modern research workspace powered by smart AI features for
                  easier research tasks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The motivation was simple: too much valuable research time was
                  being consumed by boring admin work, not the research itself.
                </p>
                <p>
                  Refly unifies notes, PDFs, and references, uses smart AI to
                  automatically aggregate context, and keeps insights tied to
                  their sources so you can move faster with confidence.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="relative border-y border-border/60 bg-muted/30 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Founding story
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
              I repeatedly saw brilliant researchers slowed down by the same
              repetitive workflows. Refly started as a direct response to
              those friction points.
            </p>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {foundingStory.map((item) => (
                <Card
                  key={item.title}
                  className="border-border/70 bg-background/80 backdrop-blur-sm"
                >
                  <CardHeader>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <h2 className="mt-14 text-2xl font-semibold tracking-tight md:text-3xl">
              Our principles
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {principles.map((principle) => (
                <Card
                  key={principle.title}
                  className="border-border/70 bg-background/80 backdrop-blur-sm"
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <principle.icon className="h-4 w-4 text-primary" />
                      {principle.title}
                    </CardTitle>
                    <CardDescription>{principle.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="relative py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Milestones
            </h2>
            <div className="mt-10">
              <div className="space-y-12">
                {milestones.map((milestone, index) => (
                  <div key={milestone.date} className="relative md:flex md:items-start">
                    {/* Timeline line - only visible on desktop */}
                    {index !== milestones.length - 1 && (
                      <div className="hidden md:block absolute left-1/2 top-8 bottom-[-48px] w-0.5 -translate-x-1/2 bg-gradient-to-b from-primary/50 to-primary/20" />
                    )}
                    
                    {/* Left side content (even indices) */}
                    <div className={`hidden md:block md:w-[calc(50%-40px)] ${index % 2 === 0 ? 'md:pr-0' : 'md:pr-0 md:opacity-0'}`}>
                      {index % 2 === 0 && (
                        <div className="text-right">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                            {milestone.date}
                          </span>
                          <h3 className="mt-2 text-lg font-semibold tracking-tight">
                            {milestone.title}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                            {milestone.description}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Center dot */}
                    <div className="absolute left-0 top-1 md:static md:flex md:justify-center md:w-20 md:shrink-0">
                      <div className="h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                    </div>
                    
                    {/* Right side content (odd indices) */}
                    <div className={`pl-8 md:pl-0 md:w-[calc(50%-40px)] ${index % 2 === 1 ? 'md:ml-0' : 'md:ml-0 md:hidden'}`}>
                      <div className={`md:hidden ${index % 2 === 0 ? '' : 'hidden'}`}>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          {milestone.date}
                        </span>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight">
                          {milestone.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                          {milestone.description}
                        </p>
                      </div>
                      {index % 2 === 1 && (
                        <div className="hidden md:block">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                            {milestone.date}
                          </span>
                          <h3 className="mt-2 text-lg font-semibold tracking-tight">
                            {milestone.title}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                            {milestone.description}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative border-y border-border/60 bg-muted/30 py-16 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Get in touch
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                I am a one-person developer building Refly to make research
                easier with smart AI features. If you want to get involved, have
                ideas, or just want to share feedback, I would absolutely love to
                hear from you!
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild className="px-7">
                  <Link href="mailto:hello@refly.ai">
                    Contact me
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/signup">Try Refly</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
