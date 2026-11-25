import { expect, test } from "@playwright/test"
import { expectNoPageCrash, login, requireSmokeUser, smokeUser } from "./helpers"

test.describe("auth smoke", () => {
  test("signup page renders", async ({ page }) => {
    await page.goto("/signup")
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expectNoPageCrash(page)
  })

  test("login redirects an existing user to the library", async ({ page }) => {
    requireSmokeUser()
    await login(page)
    await expectNoPageCrash(page)
  })

  test("forgot and reset password pages render", async ({ page }) => {
    await page.goto("/forgot-password")
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expectNoPageCrash(page)

    await page.goto("/reset-password")
    await expect(page.getByLabel(/password/i).first()).toBeVisible()
    await expectNoPageCrash(page)
  })

  test("forgot password request accepts configured smoke email", async ({ page }) => {
    test.skip(!smokeUser.email, "Set E2E_USER_EMAIL to run reset request smoke")
    await page.goto("/forgot-password")
    await page.getByLabel(/email/i).fill(smokeUser.email)
    await page.getByRole("button", { name: /reset|send/i }).click()
    await expect(page.locator("body")).toContainText(/check|email|sent|reset/i)
  })
})
