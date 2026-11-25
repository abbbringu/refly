# Launch Smoke Checklist

Use this checklist against staging before each launch or production deploy. Record the date, tester, environment URL, Supabase project, Stripe mode, and commit SHA.

## Preconditions

- Use a fresh test user and one existing paid test user.
- Stripe is in test mode and webhook delivery points at `/api/stripe/webhook`.
- Email delivery is enabled for signup and password reset.
- OpenAI/OpenRouter keys are configured for AI indexing, search, and chat.
- Supabase Storage bucket `papers` exists and RLS policies are active.

## Auth

- Sign up with a new email and password.
- Confirm the verification email arrives and the link completes the Supabase auth callback.
- Verify the new user lands in `/library` and a profile row exists.
- Log out, then log in with the same email and password.
- Request a password reset from `/forgot-password`.
- Open the reset email, set a new password, then verify login succeeds with the new password.
- Verify unauthenticated access to `/library`, `/settings`, `/teams`, and `/chat` redirects to `/login`.

## PDF Upload And Delete

- Create or import a paper in the personal library.
- Upload a valid PDF smaller than 50 MB.
- Verify the paper shows an attached PDF and preview works.
- Verify a `paper_files` row exists and the object exists in Supabase Storage.
- On Plus/Pro, verify `paper_chunks` rows are created after indexing.
- Upload a replacement PDF and verify the old storage object and old chunks are removed.
- Delete the PDF and verify the file row, storage object, and chunks are removed.

## Paper Import

- Import a DOI and verify title, authors, DOI, year, URL, and abstract are populated.
- Import an arXiv ID and verify arXiv metadata is stored and the PDF is discovered when available.
- Import PubMed and ISBN identifiers if configured sources are reachable.
- Re-import the same identifier and verify duplicate detection returns the existing paper unless duplicates are explicitly allowed.
- Import into a folder and verify the paper-folder association is created.

## AI Indexing, Search, And Chat

- On a Free user, try AI search and chat and verify both are blocked with an upgrade message.
- On a Plus/Pro user, index a paper and verify the paper embedding is stored.
- Upload a PDF and verify chunk indexing completes.
- Run AI search for terms that appear in the paper and verify relevant results return.
- Start a chat, ask a question grounded in uploaded papers, and verify streaming response text appears.
- Verify chat sources include `[S#]` citations and the source header metadata includes paper references.
- Verify `ai_usage_events` records are created for search, chat response, paper indexing, and chunk indexing.

## Team Access

- Create a team from `/teams`.
- Invite a second user and accept the invite.
- Verify the invited user can see team papers and folders.
- Verify a viewer cannot upload/delete PDFs or manage members.
- Verify an editor can add/import papers and upload/delete PDFs.
- Verify an admin or owner can manage members and settings.
- Verify a non-member cannot access team-scoped search, chat, folders, papers, or PDF delete APIs.

## Billing Checkout, Webhook, And Portal

- From pricing or settings, start Plus checkout for a Free user.
- Complete Stripe Checkout with a test card.
- Verify the success redirect reaches `/settings`.
- Verify the Stripe webhook is delivered and the profile updates to `plan=plus`, `billing_status=active`, and a Stripe customer/subscription ID.
- Start checkout again as an active subscriber and verify the app opens the billing portal instead of creating a duplicate checkout.
- Open the billing portal from settings.
- Schedule a cancellation and verify `cancel_at_period_end` is reflected in the UI.
- Resume the subscription and verify cancellation state is cleared.
- Upgrade Plus to Pro and verify immediate entitlement change.
- Downgrade Pro to Plus and verify downgrade scheduling behavior is reflected.
- Replay a webhook event and verify idempotency prevents duplicate processing.

## Quota Enforcement

- Free user: upload files until projected storage exceeds 350 MB and verify upload is rejected with a quota message.
- Plus user: verify storage limit displays as 5 GB.
- Pro user: verify storage limit displays as 15 GB.
- Free user: verify AI search, auto-tag, summaries, citations, and chat are blocked.
- Plus user: seed AI usage at or above `$2` for the active billing window and verify AI calls are rejected.
- Pro user: seed AI usage at or above `$7` for the active billing window and verify AI calls are rejected.
- Mark a paid subscription `past_due` with active grace and verify paid access remains available.
- Expire grace and verify access falls back to Free limits.

## Pass Criteria

- No browser console errors during smoke flows except expected third-party warnings.
- No unhandled server exceptions in Next.js logs.
- No failed Stripe webhook deliveries.
- Supabase rows and Storage objects match the UI state after every create/delete flow.
- Quota and billing gates fail closed when data is missing or limits are exceeded.
