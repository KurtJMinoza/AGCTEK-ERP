/**
 * Phase 6: MM architecture governance — automated guardrails.
 * Run: npm run test:architecture
 */
import * as fs from 'fs'
import * as path from 'path'
import {
    BALANCE_QUANTITY_WRITER,
    BALANCE_RESERVATION_WRITERS,
    EXTERNAL_MODULE_ROOTS,
    FRONTEND_MM_ROOT,
    LEDGER_WRITERS,
    PLANNING_DIR,
    PROCUREMENT_DIRS,
    QUALITY_DIRS,
    STOCK_OPS_POSTING_SERVICES,
    formatViolation,
    listTsFiles,
    scanLines,
} from './mm-architecture-guardrails'

const MM_ROOT = path.join(__dirname, '..')

function assertNoViolations(ruleId: string, violations: ReturnType<typeof scanLines>) {
    if (violations.length) {
        const report = violations.map(formatViolation).join('\n\n')
        throw new Error(`${ruleId} — ${violations.length} violation(s):\n\n${report}`)
    }
}

describe('MM architecture guardrails (Phase 6)', () => {
    const mmFiles = listTsFiles(MM_ROOT)

    it('MM-08-QUANTITY: only approved services touch mmInventoryBalance rows', () => {
        const violations = scanLines(
            mmFiles,
            'MM-08-QUANTITY',
            /mmInventoryBalance\.(update|updateMany|create|upsert|delete)/,
            'Physical quantity via InventoryPostingService; reservations via reservation-balance.util',
            BALANCE_RESERVATION_WRITERS,
        )
        assertNoViolations('MM-08-QUANTITY', violations)
    })

    it('MM-08-RESERVATION: reservation fields only in approved reservation utilities', () => {
        const violations = scanLines(
            mmFiles,
            'MM-08-RESERVATION',
            /mmInventoryBalance\.(update|updateMany|create)/,
            'Reserved/available quantity updates must use reservation-balance.util or ReservationService',
            BALANCE_RESERVATION_WRITERS,
        )
        assertNoViolations('MM-08-RESERVATION', violations)
    })

    it('MM-08-LEDGER: ledger rows created only by posting and valuation services', () => {
        const violations = scanLines(
            mmFiles,
            'MM-08-LEDGER',
            /mmInventoryTransaction\.(create|update|upsert|delete)/,
            'Ledger mutations must go through InventoryPostingService or ValuationEngineService',
            LEDGER_WRITERS,
        )
        assertNoViolations('MM-08-LEDGER', violations)
    })

    it('MM-05-MRP: planning must not import or call inventory posting', () => {
        const planningFiles = listTsFiles(PLANNING_DIR)
        const violations: ReturnType<typeof scanLines> = []

        for (const file of planningFiles) {
            const src = fs.readFileSync(file, 'utf8')
            const lines = src.split(/\r?\n/)
            lines.forEach((line, index) => {
                if (/InventoryPostingService|postTransaction\(/.test(line)) {
                    violations.push({
                        ruleId: 'MM-05-MRP',
                        file: path.normalize(file),
                        line: index + 1,
                        forbiddenPattern: 'InventoryPostingService / postTransaction',
                        expectedArchitecture:
                            'MRP is planning-only; it reads ATP but never posts inventory',
                        snippet: line.trim(),
                    })
                }
            })
        }

        assertNoViolations('MM-05-MRP', violations)
    })

    it('MM-06-PROCUREMENT: procurement domains must not post inventory', () => {
        const procFiles = PROCUREMENT_DIRS.flatMap((d) =>
            listTsFiles(path.join(MM_ROOT, d)),
        )
        const violations = scanLines(
            procFiles,
            'MM-06-PROCUREMENT',
            /postTransaction\(|InventoryPostingService/,
            'Procurement creates PO/PR; receiving + GoodsReceiptService posts inventory',
        )
        assertNoViolations('MM-06-PROCUREMENT', violations)
    })

    it('MM-07-QUALITY: quality/receiving must not write balances or ledger directly', () => {
        const qualityFiles = QUALITY_DIRS.flatMap((d) => listTsFiles(d))
        const violations = scanLines(
            qualityFiles,
            'MM-07-QUALITY',
            /mmInventoryBalance\.(update|create|upsert|delete)|mmInventoryTransaction\.(create|update)/,
            'Quality changes stock status via QualityDecisionService → InventoryPostingService STATUS_CHANGE',
        )
        assertNoViolations('MM-07-QUALITY', violations)
    })

    it('MM-12-SCANNER: mobile/scanner must not post inventory directly', () => {
        const scannerFiles = listTsFiles(path.join(MM_ROOT, 'scanner'))
        const violations = scanLines(
            scannerFiles,
            'MM-12-SCANNER',
            /postTransaction\(|mmInventoryBalance\.(update|create)/,
            'Scanner/mobile executes warehouse tasks; stock-ops services post via InventoryPostingService',
        )
        assertNoViolations('MM-12-SCANNER', violations)
    })

    it('MM-INT-EXTERNAL: non-MM modules must not write MM inventory tables', () => {
        const violations: ReturnType<typeof scanLines> = []

        for (const root of EXTERNAL_MODULE_ROOTS) {
            const files = listTsFiles(root)
            violations.push(
                ...scanLines(
                    files,
                    'MM-INT-EXTERNAL',
                    /prisma\.(mmInventoryBalance|mmInventoryTransaction)\.(create|update|upsert|delete)/,
                    'External modules integrate via MM APIs/events — never direct MM inventory table writes',
                ),
            )
        }

        assertNoViolations('MM-INT-EXTERNAL', violations)
    })

    it('MM-08-IDEMPOTENCY: stock-ops posting calls must include idempotencyKey', () => {
        const violations: ReturnType<typeof scanLines> = []

        for (const file of STOCK_OPS_POSTING_SERVICES) {
            const src = fs.readFileSync(file, 'utf8')
            const blocks = src.split('postTransaction(')
            for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i].slice(0, 2500)
                if (!/idempotencyKey/.test(block)) {
                    violations.push({
                        ruleId: 'MM-08-IDEMPOTENCY',
                        file: path.normalize(file),
                        line: 0,
                        forbiddenPattern: 'postTransaction without idempotencyKey',
                        expectedArchitecture:
                            'All posting endpoints must pass idempotencyKey (postingKey helper)',
                        snippet: `postTransaction block #${i}`,
                    })
                }
            }
        }

        assertNoViolations('MM-08-IDEMPOTENCY', violations)
    })

    it('MM-FE-NOMATH: frontend must not compute ATP/stock mathematics', () => {
        if (!fs.existsSync(FRONTEND_MM_ROOT)) return

        const frontendFiles = listTsFiles(FRONTEND_MM_ROOT, { excludeSpecFiles: true }).filter(
            (f) => f.endsWith('.tsx') || f.endsWith('.ts'),
        )

        const atpPatterns = [
            /quantity\s*-\s*.*reserved/i,
            /onHand\s*-\s*.*reserved/i,
            /unrestrictedOnHand\s*[-+*/]/,
            /availableQuantity\s*=\s*.*[-+*/]/,
            /\.quantity\s*[-+*/]\s*\.reserved/,
        ]

        const violations: ReturnType<typeof scanLines> = []
        for (const file of frontendFiles) {
            const src = fs.readFileSync(file, 'utf8')
            const lines = src.split(/\r?\n/)
            lines.forEach((line, index) => {
                if (line.trim().startsWith('//')) return
                for (const pattern of atpPatterns) {
                    if (pattern.test(line)) {
                        violations.push({
                            ruleId: 'MM-FE-NOMATH',
                            file: path.normalize(file),
                            line: index + 1,
                            forbiddenPattern: pattern.source,
                            expectedArchitecture:
                                'Frontend displays API-provided ATP/balance fields; never computes stock math',
                            snippet: line.trim(),
                        })
                    }
                }
            })
        }

        assertNoViolations('MM-FE-NOMATH', violations)
    })

    it('MM-INT-OUTBOX: receiving/quality should not dual-publish via EventEmitter2 and MmDomainEventsService', () => {
        /** Legacy bridge — migrate to MmDomainEventsService only (see MM_FORBIDDEN_PATTERNS.md). */
        const dualPublishLegacy = new Set([
            path.normalize(path.join(MM_ROOT, 'receiving', 'quality-decision.service.ts')),
        ])
        const dualPublishDirs = QUALITY_DIRS.map((d) => listTsFiles(d))
        const violations: ReturnType<typeof scanLines> = []

        for (const files of dualPublishDirs) {
            for (const file of files) {
                if (!file.endsWith('.service.ts')) continue
                if (dualPublishLegacy.has(path.normalize(file))) continue
                const src = fs.readFileSync(file, 'utf8')
                if (/this\.events\.emit\(/.test(src) && /domainEvents\.emit\(/.test(src)) {
                    violations.push({
                        ruleId: 'MM-INT-OUTBOX',
                        file: path.normalize(file),
                        line: 1,
                        forbiddenPattern: 'EventEmitter2.emit + MmDomainEventsService.emit in same service',
                        expectedArchitecture:
                            'Use MmDomainEventsService only — avoids duplicate event delivery',
                        snippet: path.basename(file),
                    })
                }
            }
        }

        assertNoViolations('MM-INT-OUTBOX', violations)
    })
})
