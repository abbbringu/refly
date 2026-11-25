import { NextResponse } from "next/server"
import { BILLING_PLAN_DETAILS } from "@/lib/billing/plans"
import { getStripeClient, getStripePriceId } from "@/lib/stripe/server"
import { checkApiRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit"
import { handleApiError } from "@/lib/api/errors"

function formatStripePrice(amount: number | null, currency: string) {
  if (amount === null) {
    return null
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100)
}

export async function GET(request: Request) {
  try {
    const rateLimit = checkApiRateLimit(request, null, "billing")
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const stripe = getStripeClient()
    const [plusPrice, proPrice] = await Promise.all([
      stripe.prices.retrieve(getStripePriceId("plus")),
      stripe.prices.retrieve(getStripePriceId("pro")),
    ])

    return NextResponse.json({
      plans: {
        free: {
          price: BILLING_PLAN_DETAILS.free.priceLabel,
          cadence: "forever",
        },
        plus: {
          price: formatStripePrice(plusPrice.unit_amount, plusPrice.currency) ?? BILLING_PLAN_DETAILS.plus.priceLabel,
          cadence: plusPrice.recurring?.interval ? `per user / ${plusPrice.recurring.interval}` : "per user / month",
        },
        pro: {
          price: formatStripePrice(proPrice.unit_amount, proPrice.currency) ?? BILLING_PLAN_DETAILS.pro.priceLabel,
          cadence: proPrice.recurring?.interval ? `per user / ${proPrice.recurring.interval}` : "per user / month",
        },
      },
    })
  } catch (error: unknown) {
    return handleApiError(error, "billing/plans")
  }
}
