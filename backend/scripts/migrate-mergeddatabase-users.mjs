/**
 * Carry credentials from DBeaver MySQL `mergeddatabase-dev.merged_users` → Postgres `agcerp.User`.
 *
 * Usage (from backend/):
 *   node scripts/migrate-mergeddatabase-users.mjs --dry-run
 *   node scripts/migrate-mergeddatabase-users.mjs --pilot john2
 *   node scripts/migrate-mergeddatabase-users.mjs --all --active-only
 *   node scripts/migrate-mergeddatabase-users.mjs --probe-passwords
 *
 * Mapping:
 *   username → userName (skip if blank)
 *   email → email (synthetic if blank: {username}@hris.merged)
 *   password_hash → passwordHash (bcrypt $2b$ / $2y$)
 *   super_admin → super_admin | admin → admin | employee → admin
 *   name → firstName/lastName best-effort split
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const doAll = args.has('--all')
const activeOnly = args.has('--active-only')
const probe = args.has('--probe-passwords')
const pilotIdx = process.argv.indexOf('--pilot')
const pilotName =
    pilotIdx >= 0 ? String(process.argv[pilotIdx + 1] || '').trim() : ''

function mapRole(role) {
    const r = String(role || '').toLowerCase()
    if (r === 'super_admin') return 'super_admin'
    return 'admin' // admin + employee
}

function splitName(full) {
    const n = String(full || '').trim()
    if (!n) return { firstName: '', lastName: '' }
    // "Last, First Middle" or "First Last"
    if (n.includes(',')) {
        const [last, rest] = n.split(',').map((s) => s.trim())
        return { firstName: rest || '', lastName: last || '' }
    }
    const parts = n.split(/\s+/)
    if (parts.length === 1) return { firstName: parts[0], lastName: '' }
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) }
}

function mysqlQuery(sql) {
    const tmp = resolve(process.cwd(), `.tmp-merged-query-${process.pid}.sql`)
    writeFileSync(tmp, sql, 'utf8')
    try {
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
                `-e`,
                sql,
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
        return out
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

function loadMergedUsers() {
    const where = activeOnly ? 'WHERE is_active = 1' : ''
    const sql = `
SELECT
  source_user_id,
  source_database,
  username,
  email,
  name,
  role,
  is_active,
  password_hash,
  \`position\` AS job_position
FROM merged_users
${where}
ORDER BY username
`.trim()
    return parseTsv(mysqlQuery(sql))
}

async function main() {
    if (!TARGET_URL) throw new Error('DATABASE_URL is not set')

    const merged = loadMergedUsers()
    const target = new PrismaClient({ datasources: { db: { url: TARGET_URL } } })

    try {
        const agcUsers = await target.$queryRaw`
      SELECT id, "userName" AS user_name, email, role FROM "User"
    `

        console.log(`Source ${MYSQL_DB}.merged_users: ${merged.length}`)
        console.log(`Target agcerp users:              ${agcUsers.length}`)

        if (probe) {
            const candidates = [
                '123Qwe',
                '123456',
                'password',
                'Password1',
                'admin',
                'admin123',
                'changeme',
                'hris',
                'Hris123',
                'merged',
            ]
            const samples = []
            for (const u of merged) {
                if (!u.password_hash) continue
                if (samples.length >= 3) break
                if (!samples.find((s) => s.password_hash === u.password_hash)) {
                    samples.push(u)
                }
            }
            for (const u of samples) {
                let hit = null
                const hash = u.password_hash.startsWith('$2y$')
                    ? '$2b$' + u.password_hash.slice(4)
                    : u.password_hash
                for (const p of candidates) {
                    if (await bcrypt.compare(p, hash)) {
                        hit = p
                        break
                    }
                }
                console.log(
                    `Probe ${u.username}: ${hit ? `MATCH "${hit}"` : 'no common match'} (${u.password_hash.slice(0, 4)})`,
                )
            }
            return
        }

        let selected = merged
        if (pilotName) {
            selected = merged.filter(
                (u) =>
                    String(u.username || '').toLowerCase() ===
                    pilotName.toLowerCase(),
            )
            if (!selected.length) {
                throw new Error(`Pilot username not found: ${pilotName}`)
            }
        } else if (!doAll && !dryRun) {
            console.log(
                'Nothing to do. Use --dry-run, --pilot <username>, or --all',
            )
            return
        }

        if (dryRun && !pilotName && !doAll) selected = merged

        const byUser = new Map(
            agcUsers.map((u) => [String(u.user_name).toLowerCase(), u]),
        )
        const byEmail = new Map(
            agcUsers.map((u) => [String(u.email).toLowerCase(), u]),
        )
        // Also prevent duplicates within this import batch (plan is built upfront).
        const plannedUsers = new Set()
        const plannedEmails = new Set()

        const plan = []
        for (const u of selected) {
            const userName = String(u.username || '').trim()
            if (!userName) {
                plan.push({
                    action: 'skip',
                    note: 'missing username',
                    sourceName: u.name,
                    sourceRole: u.role,
                })
                continue
            }
            if (!u.password_hash) {
                plan.push({
                    action: 'skip',
                    note: 'missing password_hash',
                    sourceName: u.name,
                    userName,
                    sourceRole: u.role,
                })
                continue
            }

            let email = String(u.email || '').trim().toLowerCase()
            if (!email) email = `${userName.toLowerCase()}@hris.merged`

            const role = mapRole(u.role)
            const { firstName, lastName } = splitName(u.name)
            const passwordHash = u.password_hash.startsWith('$2y$')
                ? '$2b$' + u.password_hash.slice(4)
                : u.password_hash

            const userConflict = byUser.get(userName.toLowerCase())
            const emailConflict = byEmail.get(email)
            const batchUserClash = plannedUsers.has(userName.toLowerCase())
            const batchEmailClash = plannedEmails.has(email)

            let action = 'insert'
            let note = ''
            let targetId = null
            let deleteIds = []

            if (batchUserClash || batchEmailClash) {
                // Same username/email already claimed earlier in this batch —
                // merged later row wins: retarget that earlier plan entry.
                action = 'replace'
                note = batchUserClash
                    ? 'duplicate username in import batch — merged wins'
                    : 'duplicate email in import batch — merged wins'
                // Find earlier plan row with same user/email and reuse its target
                const earlier = plan.find(
                    (p) =>
                        p.action !== 'skip' &&
                        ((batchUserClash &&
                            String(p.userName || '').toLowerCase() ===
                                userName.toLowerCase()) ||
                            (batchEmailClash && p.email === email)),
                )
                if (earlier) {
                    earlier.action = 'skip'
                    earlier.note = `superseded by later merged row ${userName}`
                    targetId = earlier.targetId
                    // If earlier was insert (no target yet), keep as replace-insert via same keys
                    if (!targetId) {
                        action = 'insert'
                        note =
                            'batch duplicate — earlier insert superseded; this row inserts'
                    }
                }
            } else if (userConflict || emailConflict) {
                // Merged credentials replace existing agcerp duplicate(s).
                action = 'replace'
                if (
                    userConflict &&
                    emailConflict &&
                    userConflict.id !== emailConflict.id
                ) {
                    // Username and email owned by different rows: keep username row,
                    // free the email-only conflict so merged email can be applied.
                    targetId = userConflict.id
                    deleteIds = [emailConflict.id]
                    note = `replace ${userConflict.user_name}; free email-dup ${emailConflict.user_name}`
                } else {
                    targetId = (userConflict || emailConflict).id
                    note = userConflict
                        ? `replace existing userName ${userConflict.user_name}`
                        : `replace existing email owner ${emailConflict.user_name}`
                }
            }

            if (action === 'insert' || action === 'replace') {
                plannedUsers.add(userName.toLowerCase())
                plannedEmails.add(email)
            }

            plan.push({
                action,
                note,
                sourceId: u.source_user_id,
                sourceDb: u.source_database,
                sourceRole: u.role,
                userName,
                email,
                role,
                firstName,
                lastName,
                jobPosition: u.job_position || '',
                passwordHash,
                targetId,
                deleteIds,
                isActive: u.is_active,
            })
        }

        const counts = plan.reduce((acc, row) => {
            acc[row.action] = (acc[row.action] || 0) + 1
            return acc
        }, {})

        console.log('\nPlan summary:', counts)
        console.log('First 20 rows:')
        for (const row of plan.slice(0, 20)) {
            console.log(
                `  [${row.action}] ${row.userName || '(none)'} (${row.sourceRole}) → ${row.email || ''} / ${row.role || ''}${
                    row.note ? ` — ${row.note}` : ''
                }`,
            )
        }
        if (plan.length > 20) console.log(`  … +${plan.length - 20} more`)

        if (dryRun) {
            console.log('\nDry-run only — no writes.')
            return
        }

        let inserted = 0
        let updated = 0
        let skipped = 0

        for (const row of plan) {
            if (row.action === 'skip') {
                skipped++
                continue
            }
            if (row.action === 'insert') {
                try {
                    const id = randomUUID()
                    await target.$executeRaw`
          INSERT INTO "User" (
            id, email, "userName", "firstName", "lastName",
            "jobPosition", bio, "passwordHash", role, avatar,
            "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${row.email}, ${row.userName}, ${row.firstName}, ${row.lastName},
            ${row.jobPosition}, '', ${row.passwordHash}, ${row.role}, '',
            NOW(), NOW()
          )
        `
                    console.log(`Inserted ${row.userName}`)
                    inserted++
                    byUser.set(row.userName.toLowerCase(), {
                        id,
                        user_name: row.userName,
                        email: row.email,
                        role: row.role,
                    })
                    byEmail.set(row.email, byUser.get(row.userName.toLowerCase()))
                } catch (err) {
                    const msg = String(err?.message || err)
                    console.warn(`Skip insert ${row.userName}: ${msg}`)
                    skipped++
                }
            } else if (row.action === 'replace' || row.action === 'update_hash') {
                try {
                    for (const delId of row.deleteIds || []) {
                        // Free unique email/userName on the losing row (keep row for FK safety).
                        const freedUser = `freed_${String(delId).slice(0, 8)}`
                        const freedEmail = `freed_${String(delId).slice(0, 8)}@duplicate.local`
                        await target.$executeRaw`
              UPDATE "User"
              SET email = ${freedEmail},
                  "userName" = ${freedUser},
                  "updatedAt" = NOW()
              WHERE id = ${delId}
            `
                        console.log(
                            `Freed conflicting user ${delId} → ${freedUser}`,
                        )
                    }
                    await target.$executeRaw`
          UPDATE "User"
          SET email = ${row.email},
              "userName" = ${row.userName},
              "passwordHash" = ${row.passwordHash},
              role = ${row.role},
              "firstName" = ${row.firstName},
              "lastName" = ${row.lastName},
              "jobPosition" = ${row.jobPosition},
              "updatedAt" = NOW()
          WHERE id = ${row.targetId}
        `
                    console.log(
                        `Replaced ${row.userName} (${row.note || 'merged wins'})`,
                    )
                    updated++
                    byUser.set(row.userName.toLowerCase(), {
                        id: row.targetId,
                        user_name: row.userName,
                        email: row.email,
                        role: row.role,
                    })
                    byEmail.set(row.email, byUser.get(row.userName.toLowerCase()))
                } catch (err) {
                    const msg = String(err?.message || err)
                    console.warn(`Skip replace ${row.userName}: ${msg}`)
                    skipped++
                }
            }
        }

        console.log(
            `\nDone. inserted=${inserted} updated=${updated} skipped=${skipped}`,
        )
    } finally {
        await target.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
