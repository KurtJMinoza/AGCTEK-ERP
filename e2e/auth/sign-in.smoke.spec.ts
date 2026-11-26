import { test, expect } from '@playwright/test'

/**
 * Smoke: sign-in page renders and exposes credentials fields.
 * Full authenticated flows require E2E_USERNAME (or E2E_EMAIL) + E2E_PASSWORD.
 */
test.describe('Auth smoke', () => {
    test('sign-in page is reachable', async ({ page }) => {
        await page.goto('/sign-in')
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible({
            timeout: 20_000,
        })
        await expect(page.getByRole('textbox', { name: /username/i })).toBeVisible()
        await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
    })

    test('authenticated home when credentials provided', async ({ page }) => {
        const username = process.env.E2E_USERNAME || process.env.E2E_EMAIL
        const password = process.env.E2E_PASSWORD
        test.skip(
            !username || !password,
            'Set E2E_USERNAME (or E2E_EMAIL) and E2E_PASSWORD to run authenticated smoke',
        )

        await page.goto('/sign-in')
        await page.getByRole('textbox', { name: /username/i }).fill(username!)
        await page.getByRole('textbox', { name: /password/i }).fill(password!)
        await page.getByRole('button', { name: /^sign in$/i }).click()
        await expect(page).not.toHaveURL(/sign-in/i, { timeout: 30_000 })
    })
})
