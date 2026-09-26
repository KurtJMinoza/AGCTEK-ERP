import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

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

const source = new PrismaClient({
    datasources: {
        db: { url: 'postgresql://postgres:postgres@localhost:5432/fleet-logi' },
    },
})
const target = new PrismaClient()

const fleetAdmin = await source.$queryRaw`
  SELECT name, "passwordHash" AS h FROM "User" WHERE name = 'admin'
`
const fleetAdminAgc = await target.$queryRaw`
  SELECT "userName" AS n, "passwordHash" AS h, role FROM "User" WHERE "userName" = 'fleet_admin'
`
const counts = await target.$queryRaw`SELECT COUNT(*)::int AS c FROM "User"`
const sample = await target.$queryRaw`
  SELECT "userName" AS n, role FROM "User"
  WHERE "userName" IN ('admin','fleet_admin','aaron','driver01','vicente')
  ORDER BY "userName"
`

console.log(JSON.stringify({
    agcerpUserCount: counts[0].c,
    fleetAdminHashMatch: fleetAdmin[0]?.h === fleetAdminAgc[0]?.h,
    sample,
}, null, 2))

await source.$disconnect()
await target.$disconnect()
