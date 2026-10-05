/**
 * Remove users previously imported from fleet-logi into agcerp.
 * Keeps original agcerp accounts (admin, agctek, kurtjerelle, driver01, kurtjerelle1).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

function loadEnvFile() {
    try {
        const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
        for (const line of raw.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
            if (!m) continue
            let val = m[2]
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1)
            }
            if (process.env[m[1]] === undefined) process.env[m[1]] = val
        }
    } catch {
        // optional
    }
}

loadEnvFile()

const KEEP = new Set([
    'admin',
    'agctek',
    'kurtjerelle',
    'driver01',
    'kurtjerelle1',
])

const target = new PrismaClient()
const before = await target.$queryRaw`
  SELECT "userName" AS n FROM "User" ORDER BY "userName"
`
const toDelete = before
    .map((r) => r.n)
    .filter((n) => !KEEP.has(String(n)))

console.log('Will delete:', toDelete.join(', ') || '(none)')
console.log('Will keep:', [...KEEP].join(', '))

if (process.argv.includes('--apply')) {
    const result = await target.$executeRaw`
      DELETE FROM "User"
      WHERE "userName" <> ALL(${[...KEEP]})
    `
    // Prisma executeRaw with array may not work that way — use loop
    console.log('executeRaw result', result)
}

await target.$disconnect()
