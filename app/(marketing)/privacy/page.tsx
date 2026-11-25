import type { Metadata } from "next"
import { LegalShell } from "@/components/layout/legal-shell"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Refly collects, uses, shares, and protects your information when you use our research workspace.",
  alternates: { canonical: "https://refly.ai/privacy" },
  openGraph: {
    title: "Privacy Policy — Refly",
    description:
      "Learn how Refly collects, uses, shares, and protects your information when you use our research workspace.",
    url: "https://refly.ai/privacy",

  },
}

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="This policy explains how Refly collects, uses, shares, and protects your information when you use our research workspace products and services."
      updatedAt="May 19, 2026"
    >
      <h2>1. Information we collect</h2>
      <p>
        We collect account details (such as name and email), billing details,
        usage data, and content you upload or create in Refly including notes,
        documents, PDFs, extracted document text, metadata, chat messages, and
        workspace settings.
      </p>

      <h2>2. How we use information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>operate and improve Refly services;</li>
        <li>authenticate users and secure accounts;</li>
        <li>process payments and provide customer support;</li>
        <li>
          provide product features, including search, embeddings, summaries,
          citation assistance, and AI-assisted workflows based on your workspace
          content.
        </li>
      </ul>

      <h2>3. Legal bases for processing</h2>
      <p>
        Where applicable, we process data based on contract performance,
        legitimate interests, consent, and legal obligations.
      </p>

      <h2>4. How we share information</h2>
      <p>
        We share data with trusted service providers (such as cloud hosting,
        analytics, payment providers, and AI processing providers) strictly as
        needed to deliver the service. We do not sell personal information.
      </p>
      <p>
        Refly uses OpenAI to create embeddings for search and retrieval. The
        content sent for embeddings may include search queries, paper titles,
        authors, year, DOI, URL, abstracts, and extracted PDF text chunks.
      </p>
      <p>
        Refly uses OpenRouter to route chat and completion requests to supported
        AI model providers. Depending on the feature you use, prompts may
        include your chat messages, conversation history, selected paper
        metadata, abstracts, extracted PDF excerpts or full extracted PDF text,
        citation evidence, tag metadata, and your notes. These requests are used
        to generate responses, summaries, tags, and citation analysis.
      </p>
      <p>
        OpenRouter may route requests to model providers such as OpenAI, Google,
        Anthropic, or other providers depending on the model selected. Those
        providers process the data according to their applicable terms, privacy
        policies, and data processing commitments.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We retain personal data for as long as needed to provide services,
        satisfy legal obligations, and resolve disputes. You may request
        deletion of your account and associated data, subject to legal retention
        requirements.
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard administrative, technical, and organizational
        safeguards designed to protect your data against unauthorized access,
        loss, misuse, or alteration.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Your data may be processed in countries other than your own. When
        required, we apply appropriate safeguards for cross-border transfers. AI
        processing providers, including OpenAI, OpenRouter, and model providers
        routed through OpenRouter, may process data in the United States or
        other countries where they or their infrastructure providers operate.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct,
        delete, or export your personal data, and to object to or restrict some
        processing activities.
      </p>

      <h2>9. AI processing choices</h2>
      <p>
        AI features are optional product features. If you do not want workspace
        content sent to AI processing providers, do not use AI chat, AI search,
        AI summaries, AI tags, citation finding, or PDF features that require
        indexing. You may contact us to request deletion of your account and
        associated content, subject to legal retention requirements.
      </p>

      <h2>10. Children&apos;s privacy</h2>
      <p>
        Refly is not directed to children under 13 (or the minimum age required
        by local law), and we do not knowingly collect personal data from
        children.
      </p>

      <h2>11. Contact us</h2>
      <p>
        If you have privacy questions or requests, contact us at hello@refly.ai.
      </p>
    </LegalShell>
  )
}
