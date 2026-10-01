/**
 * Create/update SCM Driver rows for active mergeddatabase-dev users whose
 * job position looks like a driver / delivery rider.
 *
 * Usage (from backend/):
 *   node scripts/seed-drivers-from-merged.mjs --dry-run
 *   node scripts/seed-drivers-from-merged.mjs --apply
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
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

const MYSQL =
    process.env.MYSQL_CLI ??
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe'
const MYSQL_USER = process.env.MERGED_MYSQL_USER ?? 'root'
const MYSQL_PASSWORD = process.env.MERGED_MYSQL_PASSWORD ?? 'root'
const MYSQL_DB = process.env.MERGED_MYSQL_DB ?? 'mergeddatabase-dev'
const TARGET_URL = process.env.DATABASE_URL

const dryRun = process.argv.includes('--dry-run')
const apply = process.argv.includes('--apply')

function isDriverPosition(position) {
    const p = String(position || '').toLowerCase()
    return p.includes('driver') || p.includes('rider')
}

function splitName(full) {
    const n = String(full || '').trim()
    if (!n) return { firstName: 'Driver', lastName: 'Unknown' }
    if (n.includes(',')) {
        const [last, rest] = n.split(',').map((s) => s.trim())
        return {
            firstName: rest || 'Driver',
            lastName: last || 'Unknown',
        }
    }
    const parts = n.split(/\s+/)
    if (parts.length === 1) return { firstName: parts[0], lastName: 'Unknown' }
    return {
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts.at(-1) || 'Unknown',
    }
}

function parseTsv(out) {
    const lines = out.replace(/\r\n/g, '\n').trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split('\t')
    return lines.slice(1).map((line) => {
        const cols = line.split('\t')
        const row = {}
        headers.forEach((h, i) => {
            const v = cols[i] ?? ''
            row[h] = v === 'NULL' ? null : v
        })
        return row
    })
}

function loadMergedDrivers() {
    const sql = `
SELECT
  source_user_id,
  username,
  employee_code,
  name,
  email,
  phone_number,
  position,
  company_name
FROM merged_users
WHERE is_active = 1
  AND username IS NOT NULL
  AND TRIM(username) <> ''
  AND (
    LOWER(IFNULL(position,'')) LIKE '%driver%'
    OR LOWER(IFNULL(position,'')) LIKE '%rider%'
  )
ORDER BY username
`.trim()

    const out = execFileSync(
        MYSQL,
        [
            '-u',
            MYSQL_USER,
            `-p${MYSQL_PASSWORD}`,
            `--database=${MYSQL_DB}`,
            '--batch',
            '--raw',
            '--default-character-set=utf8mb4',
            '-e',
            sql,
        ],
        { encoding: 'utf8' },
    )
    return parseTsv(out).filter((r) => isDriverPosition(r.position))
}

async function main() {
    if (!TARGET_URL) throw new Error('DATABASE_URL is not set')
    if (!dryRun && !apply) {
        console.log('Use --dry-run or --apply')
        return
    }

    const merged = loadMergedDrivers()
    const prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } })

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                userName: true,
                firstName: true,
                lastName: true,
                jobPosition: true,
                driver: { select: { id: true, employeeCode: true } },
            },
        })
        const byUser = new Map(
            users.map((u) => [u.userName.toLowerCase(), u]),
        )

        const usedEmployeeCodes = new Set(
            (
                await prisma.driver.findMany({
                    select: { employeeCode: true },
                    where: { employeeCode: { not: null } },
                })
            )
                .map((d) => d.employeeCode)
                .filter(Boolean),
        )
        const usedLicenses = new Set(
            (
                await prisma.driver.findMany({ select: { licenseNumber: true } })
            ).map((d) => d.licenseNumber),
        )

        const licenseExpiry = new Date()
        licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 2)

        const plan = []
        for (const m of merged) {
            const userName = String(m.username).trim()
            const user = byUser.get(userName.toLowerCase())
            if (!user) {
                plan.push({
                    action: 'skip',
                    userName,
                    note: 'no matching User in agcerp',
                    position: m.position,
                })
                continue
            }

            const { firstName, lastName } = splitName(m.name)
            let employeeCode = String(m.employee_code || '').trim() || null
            if (
                employeeCode &&
                usedEmployeeCodes.has(employeeCode) &&
                user.driver?.employeeCode !== employeeCode
            ) {
                employeeCode = `${employeeCode}-${userName}`
            }

            let licenseNumber = `LIC-MERGED-${userName}`.toUpperCase()
            if (
                usedLicenses.has(licenseNumber) &&
                !user.driver
            ) {
                licenseNumber = `LIC-MERGED-${m.source_user_id}`
            }

            const phone =
                String(m.phone_number || '').trim() || '+630000000000'
            const position = String(m.position || '').trim()

            plan.push({
                action: user.driver ? 'update' : 'create',
                userId: user.id,
                userName,
                firstName: user.firstName?.trim() || firstName,
                lastName: user.lastName?.trim() || lastName,
                employeeCode,
                licenseNumber,
                licenseExpiry,
                phone,
                position,
                company: m.company_name,
            })

            if (employeeCode) usedEmployeeCodes.add(employeeCode)
            usedLicenses.add(licenseNumber)
        }

        const summary = plan.reduce((acc, row) => {
            acc[row.action] = (acc[row.action] || 0) + 1
            return acc
        }, {})
        console.log(`Merged driver-like users: ${merged.length}`)
        console.log('Plan summary:', summary)
        for (const row of plan) {
            console.log(
                `  [${row.action}] ${row.userName} — ${row.position || ''}${
                    row.note ? ` (${row.note})` : ''
                }`,
            )
        }

        if (dryRun) {
            console.log('\nDry-run only — no writes.')
            return
        }

        let created = 0
        let updated = 0
        let skipped = 0

        for (const row of plan) {
            if (row.action === 'skip') {
                skipped++
                continue
            }

            await prisma.user.update({
                where: { id: row.userId },
                data: {
                    jobPosition: row.position,
                    firstName: row.firstName,
                    lastName: row.lastName,
                },
            })

            if (row.action === 'create') {
                await prisma.driver.create({
                    data: {
                        id: randomUUID(),
                        userId: row.userId,
                        employeeCode: row.employeeCode,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        licenseNumber: row.licenseNumber,
                        licenseExpiry: row.licenseExpiry,
                        phone: row.phone,
                        status: 'AVAILABLE',
                    },
                })
                console.log(`Created driver ${row.userName}`)
                created++
            } else {
                await prisma.driver.update({
                    where: { userId: row.userId },
                    data: {
                        employeeCode: row.employeeCode,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        phone: row.phone,
                        status: 'AVAILABLE',
                    },
                })
                console.log(`Updated driver ${row.userName}`)
                updated++
            }
        }

        const total = await prisma.driver.count()
        console.log(
            `\nDone. created=${created} updated=${updated} skipped=${skipped} totalDrivers=${total}`,
        )
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
