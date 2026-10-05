/**
 * One-time / dry-run helper: carry fleet-logi User credentials into agcerp.
 *
 * Usage (from backend/):
 *   node scripts/migrate-fleet-logi-users.mjs --dry-run
 *   node scripts/migrate-fleet-logi-users.mjs --pilot aaron
 *   node scripts/migrate-fleet-logi-users.mjs --all
 *   node scripts/migrate-fleet-logi-users.mjs --probe-passwords
 *
 * Mapping:
 *   fleet name  → agcerp userName
 *   fleet email → agcerp email (lowercased)
 *   passwordHash copied as-is (bcrypt)
 *   ADMIN → super_admin | DRIVER/DISPATCHER → admin
 *   username "admin" conflict → fleet_admin
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

/** Load backend/.env without adding a dotenv dependency. */
function loadEnvFile() {
    try {
        const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
        for (const line of raw.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
            if (!m) continue
            const key = m[1]
            let val = m[2]
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1)
            }
            if (process.env[key] === undefined) process.env[key] = val
        }
    } catch {
        // optional
    }
}

loadEnvFile()

const SOURCE_URL =
    process.env.FLEET_LOGI_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/fleet-logi'
const TARGET_URL = process.env.DATABASE_URL

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const doAll = args.has('--all')
const probe = args.has('--probe-passwords')
const pilotIdx = process.argv.indexOf('--pilot')
const pilotName =
    pilotIdx >= 0 ? String(process.argv[pilotIdx + 1] || '').trim() : ''

function mapRole(fleetRole) {
    const r = String(fleetRole || '').toUpperCase()
    if (r === 'ADMIN') return 'super_admin'
    return 'admin'
}

function mapUserName(name) {
    const n = String(name || '').trim()
    if (n.toLowerCase() === 'admin') return 'fleet_admin'
    return n
}

function newId() {
    return randomUUID()
}

async function main() {
    if (!TARGET_URL) {
        throw new Error('DATABASE_URL is not set (load backend/.env or export it)')
    }

    const source = new PrismaClient({
        datasources: { db: { url: SOURCE_URL } },
    })
    const target = new PrismaClient({
        datasources: { db: { url: TARGET_URL } },
    })

    try {
        const fleetUsers = await source.$queryRaw`
            SELECT id, name, email, "passwordHash" AS password_hash,
                   role::text AS role, "createdAt" AS created_at
            FROM "User"
            ORDER BY name
        `
        const agcUsers = await target.$queryRaw`
            SELECT id, "userName" AS user_name, email, role
            FROM "User"
        `

        console.log(`Source fleet-logi users: ${fleetUsers.length}`)
        console.log(`Target agcerp users:     ${agcUsers.length}`)

        if (probe) {
            const candidates = [
                '123Qwe',
                '123456',
                'password',
                'admin',
                'admin123',
                'Password1',
                'fleetlogi',
                'FleetLogi',
                'driver',
                'Driver123',
                'changeme',
                'Abc123',
                'mconpinco',
                'Mconpinco1',
            ]
            const samples = new Map()
            for (const u of fleetUsers) {
                if (!samples.has(u.role)) samples.set(u.role, u)
            }
            for (const [role, u] of samples) {
                let hit = null
                for (const p of candidates) {
                    if (await bcrypt.compare(p, u.password_hash)) {
                        hit = p
                        break
                    }
                }
                console.log(
                    `Probe ${role} (${u.name}): ${
                        hit ? `MATCH "${hit}"` : 'no common password match'
                    }`,
                )
            }
            console.log(
                `Unique password hashes: ${
                    new Set(fleetUsers.map((u) => u.password_hash)).size
                }`,
            )
            return
        }

        let selected = fleetUsers
        if (pilotName) {
            selected = fleetUsers.filter(
                (u) => String(u.name).toLowerCase() === pilotName.toLowerCase(),
            )
            if (!selected.length) {
                throw new Error(`Pilot user not found in fleet-logi: ${pilotName}`)
            }
        } else if (!doAll && !dryRun) {
            console.log(
                'Nothing to do. Use --dry-run, --pilot <name>, --all, or --probe-passwords',
            )
            return
        }

        const byUser = new Map(
            agcUsers.map((u) => [String(u.user_name).toLowerCase(), u]),
        )
        const byEmail = new Map(
            agcUsers.map((u) => [String(u.email).toLowerCase(), u]),
        )

        const plan = []
        for (const u of selected.length ? selected : fleetUsers) {
            if (!pilotName && !doAll && dryRun) {
                // dry-run with full set
            }
            const userName = mapUserName(u.name)
            const email = String(u.email).trim().toLowerCase()
            const role = mapRole(u.role)
            const userConflict = byUser.get(userName.toLowerCase())
            const emailConflict = byEmail.get(email)

            let action = 'insert'
            let note = ''
            if (
                userConflict &&
                emailConflict &&
                userConflict.id === emailConflict.id
            ) {
                action = 'update_hash'
                note = 'same account — refresh passwordHash + role'
            } else if (userConflict || emailConflict) {
                action = 'skip'
                note = [
                    userConflict
                        ? `userName taken by ${userConflict.user_name}`
                        : null,
                    emailConflict
                        ? `email taken by ${emailConflict.user_name}`
                        : null,
                ]
                    .filter(Boolean)
                    .join('; ')
            }

            plan.push({
                action,
                note,
                sourceName: u.name,
                sourceRole: u.role,
                userName,
                email,
                role,
                passwordHash: u.password_hash,
                targetId: userConflict?.id ?? emailConflict?.id ?? null,
            })
        }

        // For dry-run without pilot/all, plan all
        const effectivePlan =
            pilotName || doAll || dryRun
                ? plan
                : plan

        console.log('\nPlan:')
        for (const row of effectivePlan) {
            console.log(
                `  [${row.action}] ${row.sourceName} (${row.sourceRole}) → ${row.userName} / ${row.email} / ${row.role}${
                    row.note ? ` — ${row.note}` : ''
                }`,
            )
        }

        if (dryRun) {
            console.log('\nDry-run only — no writes.')
            return
        }

        let inserted = 0
        let updated = 0
        let skipped = 0

        for (const row of effectivePlan) {
            if (row.action === 'skip') {
                skipped++
                continue
            }
            if (row.action === 'insert') {
                const id = newId()
                await target.$executeRaw`
                    INSERT INTO "User" (
                        id, email, "userName", "firstName", "lastName",
                        "jobPosition", bio, "passwordHash", role, avatar,
                        "createdAt", "updatedAt"
                    ) VALUES (
                        ${id}, ${row.email}, ${row.userName}, ${String(row.sourceName)}, '',
                        '', '', ${row.passwordHash}, ${row.role}, '',
                        NOW(), NOW()
                    )
                `
                console.log(`Inserted ${row.userName} (${id})`)
                inserted++
                byUser.set(row.userName.toLowerCase(), {
                    id,
                    user_name: row.userName,
                    email: row.email,
                    role: row.role,
                })
                byEmail.set(row.email, byUser.get(row.userName.toLowerCase()))
            } else if (row.action === 'update_hash') {
                await target.$executeRaw`
                    UPDATE "User"
                    SET "passwordHash" = ${row.passwordHash},
                        role = ${row.role},
                        "updatedAt" = NOW()
                    WHERE id = ${row.targetId}
                `
                console.log(`Updated hash/role for ${row.userName}`)
                updated++
            }
        }

        console.log(
            `\nDone. inserted=${inserted} updated=${updated} skipped=${skipped}`,
        )
    } finally {
        await source.$disconnect()
        await target.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
