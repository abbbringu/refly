import type { Metadata } from "next"
import { LegalShell } from "@/components/layout/legal-shell"

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the terms of service for using the Refly AI-powered research workspace.",
  alternates: { canonical: "https://refly.ai/terms" },
  openGraph: {
    title: "Terms of Service — Refly",
    description:
      "Read the terms of service for using the Refly AI-powered research workspace.",
    url: "https://refly.ai/terms",

  },
}

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      description="These terms govern your access to and use of Refly products, websites, and related services."
      updatedAt="May 19, 2026"
    >
      <h2>1. Acceptance of terms</h2>
      <p>
        By using Refly, you agree to these Terms of Service and our Privacy
        Policy. If you do not agree, do not use the service.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must provide accurate account information and keep your login
        credentials secure. You are responsible for activity under your account.
      </p>

      <h2>3. Permitted use</h2>
      <p>
        You may use Refly only in compliance with applicable laws and these
        terms. You agree not to misuse the service, interfere with operations,
        or attempt unauthorized access.
      </p>

      <h2>4. Your content</h2>
      <p>
        You retain ownership of content you upload or create in Refly. You grant
        Refly a limited license to host, store, index, transmit, process,
        display, and otherwise use that content only to operate, secure,
        support, and improve the service.
      </p>
      <p>
        This license includes processing your content through third-party AI
        service providers when you use AI-powered features. Depending on the
        feature, this may include sending uploaded PDFs, extracted PDF text,
        notes, paper metadata, abstracts, search queries, citation evidence, and
        chat history to providers used for embeddings, search, summaries, tags,
        citation analysis, and chat responses.
      </p>

      <h2>5. Subscription and billing</h2>
      <p>
        Paid plans are billed according to your selected subscription. Fees are
        non-refundable except where required by law or explicitly stated in
        writing.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        Refly and its related software, branding, and documentation are owned by
        Refly or its licensors and are protected by intellectual property laws.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        Refly may integrate with third-party services. These include AI
        processing providers such as OpenAI for embeddings and OpenRouter for
        chat and completion requests. OpenRouter may route requests to model
        providers such as OpenAI, Google, Anthropic, or other providers
        depending on the selected model.
      </p>
      <p>
        Third-party services process data according to their own terms, privacy
        policies, and data processing commitments. We are not responsible for
        third-party products, content, or policies.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        Refly is provided on an &quot;as is&quot; and &quot;as available&quot;
        basis to the fullest extent permitted by law. We do not guarantee
        uninterrupted or error-free service.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the extent permitted by law, Refly is not liable for indirect,
        incidental, special, consequential, or punitive damages, or any loss of
        profits, data, or goodwill.
      </p>

      <h2>10. Termination</h2>
      <p>
        We may suspend or terminate access if you violate these terms. You may
        stop using the service at any time.
      </p>

      <h2>11. Changes to terms</h2>
      <p>
        We may update these terms periodically. Continued use of Refly after
        updates means you accept the revised terms.
      </p>

      <h2>12. Contact</h2>
      <p>Questions about these terms can be sent to hello@refly.ai.</p>
    </LegalShell>
  )
}
