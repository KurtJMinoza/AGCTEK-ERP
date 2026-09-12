import * as fs from 'fs'
import * as path from 'path'

const MM_ROOT = path.join(__dirname, '..')

function listTsFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files: string[] = []
    for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'architecture') continue
            files.push(...listTsFiles(full))
        } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
            files.push(full)
        }
    }
    return files
}

describe('MM architecture boundaries', () => {
    it('only InventoryPostingService and ReservationService mutate mmInventoryBalance quantity fields', () => {
        const allowed = new Set([
            path.normalize(path.join(MM_ROOT, 'inventory', 'inventory-posting.service.ts')),
            path.normalize(path.join(MM_ROOT, 'outbound', 'reservation.service.ts')),
        ])
        const violations: string[] = []

        for (const file of listTsFiles(MM_ROOT)) {
            const normalized = path.normalize(file)
            if (allowed.has(normalized)) continue
            const src = fs.readFileSync(file, 'utf8')
            if (/mmInventoryBalance\.(update|updateMany|create)/.test(src)) {
                violations.push(path.relative(MM_ROOT, file))
            }
        }

        expect(violations).toEqual([])
    })

    it('MRP/planning must not import InventoryPostingService', () => {
        const planningDir = path.join(MM_ROOT, 'planning')
        for (const file of listTsFiles(planningDir)) {
            const src = fs.readFileSync(file, 'utf8')
            expect(src).not.toMatch(/InventoryPostingService/)
            expect(src).not.toMatch(/postTransaction/)
        }
    })
})
