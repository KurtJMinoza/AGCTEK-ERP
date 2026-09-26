/**
 * Legacy architecture boundary checks — extended in mm-guardrails.spec.ts (Phase 6).
 */
import * as fs from 'fs'
import * as path from 'path'
import {
    BALANCE_RESERVATION_WRITERS,
    PLANNING_DIR,
    formatViolation,
    listTsFiles,
    scanLines,
} from './mm-architecture-guardrails'

const MM_ROOT = path.join(__dirname, '..')

describe('MM architecture boundaries', () => {
    it('delegates balance mutation rules to guardrails allowlist', () => {
        const violations = scanLines(
            listTsFiles(MM_ROOT),
            'MM-08-QUANTITY',
            /mmInventoryBalance\.(update|updateMany|create|upsert|delete)/,
            'See mm-guardrails.spec.ts and docs/MM_FORBIDDEN_PATTERNS.md',
            BALANCE_RESERVATION_WRITERS,
        )
        expect(violations.map(formatViolation)).toEqual([])
    })

    it('MRP/planning must not import InventoryPostingService', () => {
        const planningFiles = listTsFiles(PLANNING_DIR)
        for (const file of planningFiles) {
            const src = fs.readFileSync(file, 'utf8')
            expect(src).not.toMatch(/InventoryPostingService/)
            expect(src).not.toMatch(/postTransaction\(/)
        }
    })
})
