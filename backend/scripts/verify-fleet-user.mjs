import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const raw = readFileSync(resolve('.env'), 'utf8')
for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
    ) {
        v = v.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
}

const name = process.argv[2] || 'aaron'
const source = new PrismaClient({
    datasources: {
        db: { url: 'postgresql://postgres:postgres@localhost:5432/fleet-logi' },
    },
})
const target = new PrismaClient()

const fleet = await source.$queryRaw`
  SELECT name, email, "passwordHash" AS h, role::text AS role
  FROM "User" WHERE name = ${name}
`
const agc = await target.$queryRaw`
  SELECT id, "userName" AS n, email, "passwordHash" AS h, role
  FROM "User" WHERE "userName" = ${name}
`

console.log(JSON.stringify({
    foundInFleet: Boolean(fleet[0]),
    foundInAgcerp: Boolean(agc[0]),
    fleetRole: fleet[0]?.role,
    agcRole: agc[0]?.role,
    hashesIdentical: fleet[0]?.h === agc[0]?.h,
    fleetHashPrefix: fleet[0]?.h?.slice(0, 29),
    agcHashPrefix: agc[0]?.h?.slice(0, 29),
    wrongPasswordCompare: agc[0]
        ? await bcrypt.compare('definitely-wrong', agc[0].h)
        : null,
}, null, 2))

await source.$disconnect()
await target.$disconnect()
