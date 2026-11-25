import Stripe from "stripe"
import { NextResponse } from "next/server"
import { getStripeClient } from "@/lib/stripe/server"
import { resolveEntitlementFromSubscription } from "@/lib/billing/entitlements"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"
import { handleApiError } from "@/lib/api/errors"

export const runtime = "nodejs"

type SupabaseMutationPayload = Record<string, unknown>

async function upsertBillingEvent(
  event: Stripe.Event,
  status: "processing" | "processed" | "failed",
) {
  const admin = getSupabaseAdminClient()
  const { error } = await admin.from("billing_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    status,
    payload: event,
    processed_at: status === "processed" ? new Date().toISOString() : null,
  } satisfies SupabaseMutationPayload)

  if (!error) {
    return { duplicate: false, status }
  }

  if (error.code === "23505") {
    const { data: existing, error: lookupError } = await admin
      .from("billing_events")
      .select("status")
      .eq("stripe_event_id", event.id)
      .maybeSingle()

    if (lookupError) {
      console.error("Billing event lookup failed:", lookupError)
      throw new Error("Failed to look up billing event")
    }

    const existingStatus = (existing as { status?: string } | null)?.status ?? null
    if (existingStatus === "failed") {
      const { error: retryError } = await admin
        .from("billing_events")
        .update({
          status: "processing",
          payload: event,
          processed_at: null,
        } satisfies SupabaseMutationPayload)
        .eq("stripe_event_id", event.id)

      if (retryError) {
        console.error("Billing event retry failed:", retryError)
        throw new Error("Failed to retry billing event")
      }

      return { duplicate: false, status: "processing" }
    }

    return { duplicate: true, status: existingStatus }
  }

  console.error("Billing event insert failed:", error)
  throw new Error("Failed to insert billing event")
}

async function updateBillingEventStatus(
  event: Stripe.Event,
  status: "processed" | "failed",
) {
  const admin = getSupabaseAdminClient()
  const { error } = await admin
    .from("billing_events")
    .update({
      status,
      payload: event,
      processed_at: status === "processed" ? new Date().toISOString() : null,
    } satisfies SupabaseMutationPayload)
    .eq("stripe_event_id", event.id)

  if (error) {
    console.error("Billing event status update failed:", error)
    throw new Error("Failed to update billing event status")
  }
}

async function syncFromSubscription(subscription: Stripe.Subscription, eventCreated?: number) {
  const admin = getSupabaseAdminClient()

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id

  if (!customerId) {
    return
  }

  const { data: profileByCustomer, error: customerLookupError } = await admin
    .from("profiles")
    .select("id, plan, billing_grace_until, billing_last_event_created")
    .eq("stripe_customer_id", customerId)
    .maybeSingle()

  if (customerLookupError) {
    console.error("Customer lookup failed:", customerLookupError)
    throw new Error("Failed to look up customer")
  }

  const profileByCustomerRow = profileByCustomer as {
    id?: string | null
    billing_grace_until?: string | null
    billing_last_event_created?: string | null
  } | null

  let profileId = profileByCustomerRow?.id ?? null
  let existingGrace = profileByCustomerRow?.billing_grace_until ?? null
  let lastEventCreated = profileByCustomerRow?.billing_last_event_created ?? null

  if (!profileId) {
    const metadataUserId = subscription.metadata?.supabase_user_id
    if (typeof metadataUserId === "string" && metadataUserId.trim()) {
      profileId = metadataUserId
      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId } satisfies SupabaseMutationPayload)
        .eq("id", metadataUserId)

      const { data: fallbackProfile, error: fallbackLookupError } = await admin
        .from("profiles")
        .select("billing_grace_until, billing_last_event_created")
        .eq("id", metadataUserId)
        .maybeSingle()

      if (fallbackLookupError) {
        console.error("Fallback profile lookup failed:", fallbackLookupError)
        throw new Error("Failed to look up profile")
      }

      const fallbackProfileRow = fallbackProfile as {
        billing_grace_until?: string | null
        billing_last_event_created?: string | null
      } | null
      existingGrace = fallbackProfileRow?.billing_grace_until ?? null
      lastEventCreated = fallbackProfileRow?.billing_last_event_created ?? null
    }
  }

  if (!profileId) {
    return
  }

  const incomingEventCreated = eventCreated
    ? new Date(eventCreated * 1000).toISOString()
    : new Date().toISOString()
  const lastEventCreatedMs = lastEventCreated ? new Date(lastEventCreated).getTime() : Number.NaN
  if (
    Number.isFinite(lastEventCreatedMs) &&
    lastEventCreatedMs > new Date(incomingEventCreated).getTime()
  ) {
    return
  }

  const entitlement = resolveEntitlementFromSubscription(subscription, existingGrace)

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      plan: entitlement.plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      billing_status: entitlement.billingStatus,
      plan_renewal_at: entitlement.planRenewalAt,
      cancel_at_period_end: entitlement.cancelAtPeriodEnd,
      billing_grace_until: entitlement.billingGraceUntil,
      billing_last_event_created: incomingEventCreated,
      updated_at: new Date().toISOString(),
    } satisfies SupabaseMutationPayload)
    .eq("id", profileId)

  if (updateError) {
    console.error("Profile update failed:", updateError)
    throw new Error("Failed to update profile")
  }
}

async function syncFromCheckoutSession(session: Stripe.Checkout.Session, eventCreated?: number) {
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id

  if (!subscriptionId) {
    return
  }

  const stripe = getStripeClient()
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await syncFromSubscription(subscription, eventCreated)
}

export async function POST(request: Request) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signingSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured")
    return NextResponse.json({ error: "An unexpected error occurred. Please try again later." }, { status: 500 })
  }

  const stripe = getStripeClient()
  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, signingSecret)
  } catch (error: unknown) {
    console.error("Stripe signature verification failed:", error)
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 })
  }

  try {
    const eventRecord = await upsertBillingEvent(event, "processing")
    if (eventRecord.duplicate) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        await syncFromCheckoutSession(session, event.created)
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await syncFromSubscription(subscription, event.created)
        break
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null
          parent?: { subscription_details?: { subscription?: string | null } | null } | null
        }
        const directSubscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id ?? null
        const subscriptionId =
          invoice.parent?.subscription_details?.subscription ?? directSubscriptionId

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          await syncFromSubscription(subscription, event.created)
        }
        break
      }
      default:
        break
    }

    await updateBillingEventStatus(event, "processed")
    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    await updateBillingEventStatus(event, "failed").catch(() => undefined)
    return handleApiError(error, "stripe/webhook")
  }
}
