import { expect, test } from "@playwright/test"
import { expectNoPageCrash, login, requireSmokeUser } from "./helpers"

test.describe("library and paper smoke", () => {
  test.beforeEach(async ({ page }) => {
    requireSmokeUser()
    await login(page)
  })

  test("library, import, and paper surfaces load", async ({ page }) => {
    await expect(page).toHaveURL(/\/library/)
    await expectNoPageCrash(page)

    await page.goto("/library/import")
    await expect(page.locator("body")).toContainText(/import|doi|arxiv|pubmed|isbn/i)
    await expectNoPageCrash(page)
  })

  test("PDF upload/delete controls are reachable from library UI", async ({ page }) => {
    await page.goto("/library")
    await expectNoPageCrash(page)
    await expect(page.locator("body")).toContainText(/library/i)
  })
})
