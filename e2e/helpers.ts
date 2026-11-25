import { expect, type Page, test } from "@playwright/test"

export const smokeUser = {
  email: process.env.E2E_USER_EMAIL || "",
  password: process.env.E2E_USER_PASSWORD || "",
}

export function requireSmokeUser() {
  test.skip(!smokeUser.email || !smokeUser.password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated smoke tests")
}

export async function login(page: Page) {
  await page.goto("/login")
  await page.getByLabel(/email/i).fill(smokeUser.email)
  await page.getByLabel(/password/i).fill(smokeUser.password)
  await page.getByRole("button", { name: /log in|sign in/i }).click()
  await expect(page).toHaveURL(/\/library/)
}

export async function expectNoPageCrash(page: Page) {
  await expect(page.locator("body")).not.toContainText(/application error|failed to load|internal server error/i)
}
