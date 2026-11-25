import Stripe from "stripe"

let stripeClient: Stripe | null = null

export function getStripeClient() {
  if (stripeClient) {
    return stripeClient
  }

  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured")
  }

  stripeClient = new Stripe(apiKey)
  return stripeClient
}

export function getStripePriceId(plan: "plus" | "pro") {
  const priceMap = {
    plus: process.env.STRIPE_PRICE_PLUS_MONTHLY,
    pro: process.env.STRIPE_PRICE_PRO_MONTHLY,
  } as const

  const priceId = priceMap[plan]
  if (!priceId) {
    throw new Error(`Stripe price ID is missing for ${plan}`)
  }

  return priceId
}
