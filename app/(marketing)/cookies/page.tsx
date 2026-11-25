import type { Metadata } from "next"
import { LegalShell } from "@/components/layout/legal-shell"

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Understand how Refly uses cookies and similar technologies.",
  alternates: { canonical: "https://refly.ai/cookies" },
  openGraph: {
    title: "Cookie Policy — Refly",
    description:
      "Understand how Refly uses cookies and similar technologies.",
    url: "https://refly.ai/cookies",

  },
}

export default function CookiePolicyPage() {
  return (
    <LegalShell
      title="Cookie Policy"
      description="This policy describes how Refly uses cookies and similar technologies on our website and services."
      updatedAt="April 13, 2026"
    >
      <h2>1. What are cookies?</h2>
      <p>
        Cookies are small text files stored on your device by your browser.
        They help websites remember settings, improve performance, and measure
        usage.
      </p>

      <h2>2. Types of cookies we use</h2>
      <ul>
        <li>
          <strong>Essential cookies:</strong> required for core functionality
          such as login sessions, security checks, and navigation.
        </li>
        <li>
          <strong>Preference cookies:</strong> remember your choices such as UI
          preferences and workspace settings.
        </li>
        <li>
          <strong>Analytics cookies:</strong> help us understand usage patterns
          and improve product performance.
        </li>
      </ul>

      <h2>3. How we use cookies</h2>
      <p>
        We use cookies to keep you signed in, protect your account, provide a
        smoother product experience, and evaluate feature usage.
      </p>

      <h2>4. Third-party cookies</h2>
      <p>
        Some cookies may be placed by trusted third-party providers we use for
        analytics, infrastructure, and payment processing.
      </p>

      <h2>5. Managing cookie choices</h2>
      <p>
        You can manage or disable cookies through your browser settings.
        Disabling some cookies may affect website functionality.
      </p>

      <h2>6. Policy updates</h2>
      <p>
        We may update this Cookie Policy from time to time. Material changes
        will be posted on this page with a revised effective date.
      </p>

      <h2>7. Contact</h2>
      <p>Questions about cookies can be sent to hello@refly.ai.</p>
    </LegalShell>
  )
}
