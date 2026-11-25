import Link from "next/link"
import type { ReactNode } from "react"
import { ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"

type AIDataNoticeProps = {
  children: ReactNode
  className?: string
}

export function AIDataNotice({ children, className }: AIDataNoticeProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground",
        className
      )}
    >
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <p>
        {children} See the{" "}
        <Link
          href="/privacy"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  )
}
