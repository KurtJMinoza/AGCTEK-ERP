import * as fs from 'fs'
import * as path from 'path'

export type ArchitectureViolation = {
    ruleId: string
    file: string
    line: number
    forbiddenPattern: string
    expectedArchitecture: string
    snippet: string
}

export type ScanOptions = {
    excludeSpecFiles?: boolean
    excludeDirs?: string[]
}

const DEFAULT_EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'architecture'])

export function listTsFiles(root: string, options: ScanOptions = {}): string[] {
    const excludeDirs = new Set([
        ...DEFAULT_EXCLUDE_DIRS,
        ...(options.excludeDirs ?? []),
    ])
    const files: string[] = []

    function walk(dir: string) {
        if (!fs.existsSync(dir)) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (!excludeDirs.has(entry.name)) walk(full)
                continue
            }
            if (!entry.name.endsWith('.ts')) continue
            if (options.excludeSpecFiles !== false && entry.name.endsWith('.spec.ts')) continue
            files.push(full)
        }
    }

    walk(root)
    return files
}

export function formatViolation(v: ArchitectureViolation): string {
    return [
        `[${v.ruleId}] ${v.file}:${v.line}`,
        `  Forbidden: ${v.forbiddenPattern}`,
        `  Expected:  ${v.expectedArchitecture}`,
        `  Snippet:   ${v.snippet.trim()}`,
    ].join('\n')
}

export function scanLines(
    files: string[],
    ruleId: string,
    pattern: RegExp,
    expectedArchitecture: string,
    allowlist: Set<string> = new Set(),
): ArchitectureViolation[] {
    const violations: ArchitectureViolation[] = []

    for (const file of files) {
        const normalized = path.normalize(file)
        if (allowlist.has(normalized)) continue

        const src = fs.readFileSync(file, 'utf8')
        const lines = src.split(/\r?\n/)
        lines.forEach((line, index) => {
            if (!pattern.test(line)) return
            violations.push({
                ruleId,
                file: normalized,
                line: index + 1,
                forbiddenPattern: pattern.source,
                expectedArchitecture,
                snippet: line.trim().slice(0, 120),
            })
        })
    }

    return violations
}

/** Physical on-hand quantity changes — sole writer is InventoryPostingService. */
export const BALANCE_QUANTITY_WRITER = path.normalize(
    path.join(__dirname, '..', 'inventory', 'inventory-posting.service.ts'),
)

/** Reservation ATP fields — no physical movement. */
export const BALANCE_RESERVATION_WRITERS = new Set([
    BALANCE_QUANTITY_WRITER,
    path.normalize(path.join(__dirname, '..', 'inventory', 'reservation-allocation', 'reservation-balance.util.ts')),
    path.normalize(path.join(__dirname, '..', 'outbound', 'reservation.service.ts')),
])

/** Immutable ledger rows — posting + valuation cost extensions. */
export const LEDGER_WRITERS = new Set([
    BALANCE_QUANTITY_WRITER,
    path.normalize(path.join(__dirname, '..', 'valuation', 'valuation-engine.service.ts')),
])

export const PROCUREMENT_DIRS = [
    'purchase-requisition',
    'purchase-order',
    'purchase-contract',
    'rfq',
    'procurement',
    'workflow',
]

export const PLANNING_DIR = path.join(__dirname, '..', 'planning')

export const QUALITY_DIRS = [
    path.join(__dirname, '..', 'quality'),
    path.join(__dirname, '..', 'receiving'),
]

export const EXTERNAL_MODULE_ROOTS = [
    path.join(__dirname, '..', '..', 'sd'),
    path.join(__dirname, '..', '..', 'pp'),
    path.join(__dirname, '..', '..', 'fico'),
    path.join(__dirname, '..', '..', 'scm'),
]

export const FRONTEND_MM_ROOT = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'src',
    'modules',
    'mm',
)

export const STOCK_OPS_POSTING_SERVICES = new Set([
    path.normalize(path.join(__dirname, '..', 'stock-ops', 'goods-receipt.service.ts')),
    path.normalize(path.join(__dirname, '..', 'stock-ops', 'goods-issue.service.ts')),
    path.normalize(path.join(__dirname, '..', 'stock-ops', 'adjustment.service.ts')),
    path.normalize(path.join(__dirname, '..', 'stock-ops', 'bin-transfer.service.ts')),
    path.normalize(path.join(__dirname, '..', 'stock-ops', 'warehouse-transfer-order.service.ts')),
])
