/**
 * COD delivery + Customer Returns QA runner (full payment, no partial accept).
 *
 * Runs the scripted acceptance suite plus the deeper units that back each scenario.
 * Does not need a live API or seed data.
 *
 *   node scripts/run-cod-delivery-qa.mjs
 *   # or from backend:
 *   npm run test:cod-delivery-qa
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backend = path.join(root, 'backend')

const suites = [
    'src/sd/cod-delivery-customer-returns.scenarios.spec.ts',
    'src/scm/trips/trips.service.execution.spec.ts',
    'src/scm/damage-reports/damage-reports.spec.ts',
    'src/sd/return-request.spec.ts',
]

console.log('COD delivery + Customer Returns — QA\n')
console.log('Suites:')
for (const s of suites) console.log(`  · ${s}`)
console.log('')

const result = spawnSync(
    'npx',
    ['jest', ...suites, '--runInBand', '--forceExit', '--no-coverage'],
    {
        cwd: backend,
        stdio: 'inherit',
        shell: true,
        env: process.env,
    },
)

if (result.status !== 0) {
    console.error('\nCOD delivery QA failed.')
    process.exit(result.status ?? 1)
}

console.log('\n✅ COD delivery QA passed.')
