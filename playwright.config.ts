import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3010'

/**
 * Mode 2 — automated regression for AGCTEK ERP.
 * Exploratory AI QA (Mode 1) should land reusable specs under e2e/.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
    timeout: 60_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    outputDir: 'e2e-results',
})
