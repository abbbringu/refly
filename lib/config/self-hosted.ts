/**
 * Determines whether Refly is running in open-source / self-hosted mode.
 *
 * In self-hosted mode:
 * - All features (AI chat, semantic search, citations, auto-tagging, summaries, teams)
 *   are unlocked without requiring a Stripe subscription.
 * - Artificial SaaS storage quotas and monthly AI spend caps are disabled.
 * - Billing / upgrade UI surfaces are hidden.
 */
export function isSelfHostedMode(): boolean {
  return process.env.NEXT_PUBLIC_SELF_HOSTED === "true"
}
