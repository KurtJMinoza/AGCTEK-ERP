/**
 * Import companies and user ↔ company memberships from DBeaver MySQL
 * `mergeddatabase-dev.merged_users.company_name` → Postgres `agcerp.companies` / `user_companies`.
 *
 * Usage (from backend/):
 *   node scripts/import-merged-companies.mjs --dry-run
 *   node scripts/import-merged-companies.mjs
 *
 * Rules:
 *   - Company code and name are the source `company_name`, unchanged.
 *   - Plain `MCHISI` is not created; MCHISI stays split into `MCHISI LPG` / `MCHISI FAMES`.
 *   - Users with no company_name get no membership (no fallback default).
 *   - Users are matched by username (case-insensitive) against `User.userName`.
 *   - When a user maps to several companies, the `hris-dev` row is preferred for the default.
 *   - Idempotent: existing companies and memberships are kept; an existing default is never overridden.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
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

const EXCLUDED_COMPANIES = new Set(['MCHISI'])
const PREFERRED_SOURCE = 'hris-dev'

const dryRun = process.argv.includes('--dry-run')

function mysqlQuery(sql) {
    const tmp = resolve(process.cwd(), `.tmp-merged-query-${process.pid}.sql`)
    writeFileSync(tmp, sql, 'utf8')
    try {
        return execFileSync(
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
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
    } finally {
        try {
            unlinkSync(tmp)
        } catch {
            // ignore
        }
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

function loadMergedRows() {
    return parseTsv(
        mysqlQuery(`
SELECT username, source_database, company_name
FROM merged_users
ORDER BY username, source_database
`.trim()),
    )
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const rows = loadMergedRows()

        const companyNames = new Set()
        const excludedRows = []
        const noCompanyUsers = new Set()
        /** username(lower) → [{ company, source }] */
        const byUser = new Map()

        for (const row of rows) {
            const userName = String(row.username || '').trim()
            if (!userName) continue
            const company = row.company_name ? row.company_name.trim() : ''

            if (!company) {
                noCompanyUsers.add(userName.toLowerCase())
                continue
            }
            if (EXCLUDED_COMPANIES.has(company)) {
                excludedRows.push(`${userName} (${row.source_database}: ${company})`)
                continue
            }

            companyNames.add(company)
            const key = userName.toLowerCase()
            const list = byUser.get(key) ?? []
            if (!list.some((e) => e.company === company)) {
                list.push({ company, source: row.source_database })
            }
            byUser.set(key, list)
        }

        // A username with a company in any source is not "no company".
        for (const key of byUser.keys()) noCompanyUsers.delete(key)

        const erpUsers = await prisma.user.findMany({
            select: { id: true, userName: true },
        })
        const erpByName = new Map(
            erpUsers.map((u) => [u.userName.toLowerCase(), u]),
        )

        const existingCompanies = await prisma.company.findMany({
            where: { code: { in: [...companyNames] } },
            select: { id: true, code: true },
        })
        const companyIdByCode = new Map(
            existingCompanies.map((c) => [c.code, c.id]),
        )
        const companiesToCreate = [...companyNames]
            .filter((c) => !companyIdByCode.has(c))
            .sort()

        console.log(`Source ${MYSQL_DB}.merged_users rows: ${rows.length}`)
        console.log(
            `Companies: ${companyNames.size} distinct, ${companiesToCreate.length} to create, ${existingCompanies.length} already exist`,
        )
        for (const c of companiesToCreate) console.log(`  [create company] ${JSON.stringify(c)}`)

        if (!dryRun) {
            for (const code of companiesToCreate) {
                const created = await prisma.company.create({
                    data: { code, name: code },
                    select: { id: true },
                })
                companyIdByCode.set(code, created.id)
            }
        }

        const unmatched = []
        const summary = { created: 0, alreadyMember: 0, defaultsSet: 0 }

        for (const [key, entries] of byUser) {
            const user = erpByName.get(key)
            if (!user) {
                unmatched.push(key)
                continue
            }

            entries.sort(
                (a, b) =>
                    Number(b.source === PREFERRED_SOURCE) -
                    Number(a.source === PREFERRED_SOURCE),
            )

            const existing = await prisma.userCompany.findMany({
                where: { userId: user.id },
                select: { companyId: true, isDefault: true },
            })
            const existingIds = new Set(existing.map((m) => m.companyId))
            let hasDefault = existing.some((m) => m.isDefault)

            for (const entry of entries) {
                const companyId = companyIdByCode.get(entry.company)
                if (companyId && existingIds.has(companyId)) {
                    summary.alreadyMember++
                    continue
                }

                const isDefault = !hasDefault
                console.log(
                    `  [assign] ${user.userName} → ${entry.company}${isDefault ? ' (default)' : ''}`,
                )
                if (!dryRun) {
                    await prisma.userCompany.create({
                        data: { userId: user.id, companyId, isDefault },
                    })
                }
                summary.created++
                if (isDefault) {
                    summary.defaultsSet++
                    hasDefault = true
                }
            }
        }

        const noCompanyInErp = [...noCompanyUsers].filter((k) => erpByName.has(k))

        console.log('')
        console.log(`Memberships to create: ${summary.created} (defaults: ${summary.defaultsSet})`)
        console.log(`Memberships already present: ${summary.alreadyMember}`)
        console.log(`Merged users with a company but no ERP account: ${unmatched.length}`)
        if (unmatched.length) console.log(`  ${unmatched.sort().join(', ')}`)
        console.log(`Rows skipped for excluded company (MCHISI): ${excludedRows.length}`)
        for (const r of excludedRows) console.log(`  ${r}`)
        console.log(`ERP users with no company in source (left unassigned): ${noCompanyInErp.length}`)
        if (noCompanyInErp.length) console.log(`  ${noCompanyInErp.sort().join(', ')}`)
        console.log(dryRun ? '\nDry run — no changes written.' : '\nDone.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
