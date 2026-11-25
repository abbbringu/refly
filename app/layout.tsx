import { Geist_Mono, Inter } from "next/font/google"
import "katex/dist/katex.min.css"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { BillingProvider } from "@/hooks/use-billing"
import { ConfirmProvider } from "@/components/confirm-provider"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata = {
  title: {
    default: "Refly — AI-Powered Research Workspace",
    template: "%s | Refly",
  },
  description:
    "Read, think, and write with clarity. Refly is the AI-powered research workspace for search, summaries, references, and notes.",
  alternates: {
    canonical: "https://refly.ai",
  },
  openGraph: {
    title: "Refly — AI-Powered Research Workspace",
    description:
      "Read, think, and write with clarity. Refly is the AI-powered research workspace for search, summaries, references, and notes.",
    url: "https://refly.ai",
    siteName: "Refly",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Refly — AI-Powered Research Workspace",
    description:
      "Read, think, and write with clarity. Refly is the AI-powered research workspace for search, summaries, references, and notes.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
      )}
    >
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const key = "refly-accent-theme";
    const valid = new Set(["blue", "emerald", "amber", "rose"]);
    const stored = window.localStorage.getItem(key);
    const theme = stored && valid.has(stored) ? stored : "blue";
    document.documentElement.setAttribute("data-accent-theme", theme);
  } catch (_) {
    document.documentElement.setAttribute("data-accent-theme", "blue");
  }
})();`,
          }}
        />
        <ThemeProvider>
          <BillingProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </BillingProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
