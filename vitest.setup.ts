import { vi } from "vitest"

process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000"
process.env.STRIPE_SECRET_KEY ||= "sk_test_refly"
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_refly"
process.env.STRIPE_PRICE_PLUS_MONTHLY ||= "price_plus"
process.env.STRIPE_PRICE_PRO_MONTHLY ||= "price_pro"

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => new Map()),
}))
