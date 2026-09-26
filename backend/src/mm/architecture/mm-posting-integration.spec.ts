import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { postingKey, reversalKey } from '../common/idempotency.util'

describe('MM posting integration contracts', () => {
    it('postingKey is deterministic', () => {
        expect(postingKey('gr', 'doc-1', 'line-1', 'good')).toBe('gr:doc-1:line-1:good')
    })

    it('reversalKey defaults to reversal prefix', () => {
        expect(reversalKey('txn-abc')).toBe('reversal:txn-abc')
    })

    it('quality services never write inventory balances directly', () => {
        const dirs = [
            join(__dirname, '../quality'),
            join(__dirname, '../receiving'),
        ]
        const forbidden = [
            /mmInventoryBalance\.(update|create|upsert|delete)/,
            /mmInventoryLedger\.create/,
        ]
        for (const dir of dirs) {
            const files = readdirSync(dir).filter(
                (f) =>
                    f.endsWith('.service.ts') &&
                    (f.includes('quality') || f.includes('inspection')),
            )
            for (const file of files) {
                const content = readFileSync(join(dir, file), 'utf8')
                for (const pattern of forbidden) {
                    expect(content).not.toMatch(pattern)
                }
            }
        }
    })
})
