import { Suspense } from "react"
import Image from "next/image"
import type { Metadata } from "next"
import { BookMarked, FileSearch, Sparkles } from "lucide-react"
import styles from "./layout.module.css"

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Refly AI-powered research workspace.",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh grid-cols-1 bg-background lg:grid-cols-2">
      <div className="relative min-h-[280px] lg:min-h-svh">
        <Image
          src="/auth-placeholder.svg"
          alt="Decorative preview"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/20 to-black/0" />

        <div className="absolute inset-0 hidden lg:block">
          <div
            className={`${styles.illustrationFloat1} absolute left-[10%] top-[16%] w-64 rounded-2xl border border-white/25 bg-white/10 p-4 text-white backdrop-blur-md`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-300/25">
                <FileSearch className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Find citations fast</p>
                <p className="text-xs text-white/80">Search by title, DOI, and author</p>
              </div>
            </div>
          </div>

          <div
            className={`${styles.illustrationFloat2} absolute right-[12%] top-[36%] w-72 rounded-2xl border border-white/25 bg-white/10 p-4 text-white backdrop-blur-md`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/25">
                <BookMarked className="h-5 w-5" />
              </span>
              <div className="w-full">
                <p className="text-sm font-medium">Organized reading list</p>
                <div className="mt-2 space-y-2">
                  <div className="h-2 w-full rounded-full bg-white/35" />
                  <div className="h-2 w-4/5 rounded-full bg-white/25" />
                  <div className="h-2 w-3/5 rounded-full bg-white/20" />
                </div>
              </div>
            </div>
          </div>

          <div
            className={`${styles.illustrationFloat3} absolute bottom-[18%] left-[18%] w-60 rounded-2xl border border-white/25 bg-white/10 p-4 text-white backdrop-blur-md`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/25">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Write with confidence</p>
                <p className="text-xs text-white/80">Keep every source one click away</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-8 right-8 text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-white/80">
            Refly Workspace
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">
            Keep every source organized while you write.
          </h2>
        </div>
      </div>

      <div className="flex min-h-[60svh] items-center justify-center p-6 sm:p-10 lg:min-h-svh lg:p-16">
        <div className="w-full max-w-md">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
    </div>
  )
}
