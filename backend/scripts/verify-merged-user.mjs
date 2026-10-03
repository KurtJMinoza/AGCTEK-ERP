import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
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

const username = process.argv[2] || 'john2'
const mysql =
    process.env.MYSQL_CLI ??
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe'

const out = execFileSync(
    mysql,
    [
        '-u',
        'root',
        '-proot',
        '--database=mergeddatabase-dev',
        '--batch',
        '--raw',
        '-e',
        `SELECT username, email, role, password_hash FROM merged_users WHERE username='${username.replace(/'/g, "''")}'`,
    ],
    { encoding: 'utf8' },
)
const srcLine = out.trim().split(/\n/)[1]
if (!srcLine) {
    console.error('Not found in merged_users:', username)
    process.exit(1)
}
const [srcUser, srcEmail, srcRole, srcHash] = srcLine.split('\t')
const normSrc = srcHash.startsWith('$2y$')
    ? '$2b$' + srcHash.slice(4)
    : srcHash

const target = new PrismaClient()
const agc = await target.$queryRaw`
  SELECT "userName" AS n, email, role, "passwordHash" AS h
  FROM "User" WHERE "userName" = ${username}
`

console.log(
    JSON.stringify(
        {
            source: { user: srcUser, email: srcEmail, role: srcRole },
            agcerp: agc[0] || null,
            hashesIdentical: Boolean(agc[0]) && normSrc === agc[0].h,
            wrongPasswordCompare: agc[0]
                ? await bcrypt.compare('definitely-wrong', agc[0].h)
                : null,
        },
        null,
        2,
    ),
)

await target.$disconnect()
