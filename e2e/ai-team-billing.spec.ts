import { expect, test } from "@playwright/test"
import { expectNoPageCrash, login, requireSmokeUser } from "./helpers"

test.describe("AI, team, billing, and quota smoke", () => {
  test.beforeEach(async ({ page }) => {
    requireSmokeUser()
    await login(page)
  })

  test("AI chat/search page loads for the signed-in user", async ({ page }) => {
    await page.goto("/chat")
    await expect(page.locator("body")).toContainText(/chat|ask|message|research/i)
    await expectNoPageCrash(page)
  })

  test("team pages load and expose access controls", async ({ page }) => {
    await page.goto("/teams")
    await expect(page.locator("body")).toContainText(/team|workspace|invite|create/i)
    await expectNoPageCrash(page)
  })

  test("billing settings and pricing surfaces load", async ({ page }) => {
    await page.goto("/pricing")
    await expect(page.locator("body")).toContainText(/free|plus|pro/i)
    await expectNoPageCrash(page)

    await page.goto("/settings")
    await expect(page.locator("body")).toContainText(/billing|plan|storage|usage|settings/i)
    await expectNoPageCrash(page)
  })
})
