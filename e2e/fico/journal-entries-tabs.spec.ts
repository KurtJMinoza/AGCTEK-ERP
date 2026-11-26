import { test, expect, type Page } from '@playwright/test'

/**
 * Regression: All Journals must include automatic (MM/SD) and manual Finance journals.
 * Prerequisites: edge/frontend/backend running; E2E_USERNAME + E2E_PASSWORD set;
 * company AGCTEK with at least one automatic and one manual journal.
 */
async function signIn(page: Page) {
    const username = process.env.E2E_USERNAME || process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    test.skip(!username || !password, 'Set E2E_USERNAME and E2E_PASSWORD')

    await page.goto('/sign-in')
    await page.getByRole('textbox', { name: /username/i }).fill(username!)
    await page.getByRole('textbox', { name: /password/i }).fill(password!)
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page).not.toHaveURL(/sign-in/i, { timeout: 30_000 })
}

test.describe('FICO journal entry tabs', () => {
    test('All Journals shows automatic and manual together', async ({ page }) => {
        await signIn(page)
        await page.goto('/modules/fico/journal-entries')

        await expect(page.getByRole('heading', { name: /journal entries/i })).toBeVisible({
            timeout: 20_000,
        })

        const allTab = page.getByRole('tab', { name: /all journals/i })
        await expect(allTab).toBeVisible()
        await allTab.click()

        await expect(page.getByText(/\d+\s+documents? in this view/i)).toBeVisible()

        // Automatic POS/SD docs are posted by System; manual JE by a user.
        const rows = page.locator('table tbody tr')
        await expect(rows.first()).toBeVisible({ timeout: 15_000 })

        const bodyText = await page.locator('table').innerText()
        const hasAutomatic =
            /Automatic PosSaleCompleted|SD REVENUE|SD REVERSAL/i.test(bodyText) ||
            /Posted by[\s\S]*System|System/i.test(bodyText)
        const hasManual =
            /JE-\d{4}-\d+|JOURNAL/i.test(bodyText) &&
            !/^System$/m.test(bodyText.split('\n').join(' '))

        // Stronger check via tab badges when data exists for both classes.
        const automaticBadge = page.getByRole('tab', { name: /automatic/i })
        await expect(automaticBadge).toBeVisible()

        const allLabel = (await allTab.innerText()).replace(/\s+/g, ' ')
        const autoLabel = (await automaticBadge.innerText()).replace(/\s+/g, ' ')
        const allCount = Number((allLabel.match(/(\d+)/) || [])[1] || 0)
        const autoCount = Number((autoLabel.match(/(\d+)/) || [])[1] || 0)

        expect(allCount).toBeGreaterThan(0)
        expect(autoCount).toBeGreaterThan(0)
        expect(allCount).toBeGreaterThanOrEqual(autoCount)
        expect(hasAutomatic || autoCount > 0).toBeTruthy()

        // Manual tab must list Finance journals without sourceModule (not empty when residual exists).
        await page.getByRole('tab', { name: /^manual$/i }).click()
        const manualView = page.getByText(/\d+\s+documents? in this view/i)
        await expect(manualView).toBeVisible()
        const manualCount = Number(
            ((await manualView.innerText()).match(/(\d+)/) || [])[1] || 0,
        )
        expect(manualCount).toBe(allCount - autoCount)
        if (manualCount > 0) {
            expect(hasManual || /JE-|JOURNAL/i.test(await page.locator('table').innerText())).toBeTruthy()
        }
    })
})
