import { Test } from '@nestjs/testing'
import { QualityRuleService, type InspectionRuleContext } from './quality-rule.service'
import { PrismaService } from '../../prisma/prisma.service'

const baseContext: InspectionRuleContext = {
    companyId: 'co-1',
    materialId: 'mat-1',
    supplierId: 'sup-1',
    warehouseId: 'wh-1',
    materialCategoryId: 'cat-1',
    supplierCategoryId: 'scat-1',
    plantId: 'plant-1',
    purchaseType: 'PO',
    receiptType: 'PO',
}

describe('QualityRuleService — rule precedence', () => {
    let service: QualityRuleService
    const mockPrisma = {
        mmQualityInspectionRule: {
            findMany: jest.fn(),
        },
        mmMaterial: { findUnique: jest.fn() },
        warehouse: { findUnique: jest.fn() },
        mmSupplier: { findUnique: jest.fn() },
        mmExpectedReceipt: { findUnique: jest.fn() },
        mmPurchaseOrder: { findUnique: jest.fn() },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module = await Test.createTestingModule({
            providers: [
                QualityRuleService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(QualityRuleService)
    })

    const rule = (
        overrides: Partial<{
            id: string
            ruleCode: string
            priority: number
            action: string
            materialId: string | null
            supplierId: string | null
            effectiveFrom: Date | null
            effectiveTo: Date | null
            active: boolean
        }>,
    ) => ({
        id: 'r1',
        ruleCode: 'RULE-A',
        priority: 10,
        action: 'INSPECTION_REQUIRED',
        materialId: null,
        materialCategoryId: null,
        supplierId: null,
        supplierCategoryId: null,
        plantId: null,
        warehouseId: null,
        purchaseType: null,
        receiptType: null,
        effectiveFrom: null,
        effectiveTo: null,
        active: true,
        ...overrides,
    })

    it('1. higher priority wins', () => {
        const result = service.resolveFromRules(
            [
                rule({ id: 'low', ruleCode: 'LOW', priority: 10, action: 'NO_INSPECTION' }),
                rule({ id: 'high', ruleCode: 'HIGH', priority: 100, action: 'FULL_INSPECTION' }),
            ],
            baseContext,
        )
        expect(result.action).toBe('FULL_INSPECTION')
        expect(result.matchedRuleCode).toBe('HIGH')
        expect(result.samplingOverride).toBe('FULL')
    })

    it('2. same priority tie-break by ruleCode ASC', () => {
        const result = service.resolveFromRules(
            [
                rule({ id: 'b', ruleCode: 'RULE-B', priority: 50, action: 'SAMPLE_INSPECTION' }),
                rule({ id: 'a', ruleCode: 'RULE-A', priority: 50, action: 'FULL_INSPECTION' }),
            ],
            baseContext,
        )
        expect(result.matchedRuleCode).toBe('RULE-A')
        expect(result.action).toBe('FULL_INSPECTION')
    })

    it('3. wildcard dimension matches any supplier', () => {
        const result = service.resolveFromRules(
            [rule({ supplierId: null, action: 'INSPECTION_REQUIRED' })],
            { ...baseContext, supplierId: 'any-supplier' },
        )
        expect(result.inspectionRequired).toBe(true)
    })

    it('4. specific rule does not beat wildcard at same priority — priority only', () => {
        const result = service.resolveFromRules(
            [
                rule({
                    id: 'wildcard',
                    ruleCode: 'WILD',
                    priority: 50,
                    materialId: null,
                    action: 'NO_INSPECTION',
                }),
                rule({
                    id: 'specific',
                    ruleCode: 'SPEC',
                    priority: 50,
                    materialId: 'mat-1',
                    action: 'FULL_INSPECTION',
                }),
            ],
            baseContext,
        )
        expect(result.matchedRuleCode).toBe('SPEC')
    })

    it('5. effective date filtering excludes future rules', () => {
        const future = new Date(Date.now() + 86400000)
        const result = service.resolveFromRules(
            [rule({ effectiveFrom: future, action: 'FULL_INSPECTION' })],
            baseContext,
        )
        expect(result.action).toBe('NO_INSPECTION')
    })

    it('6. inactive rules excluded via findMany filter (integration)', async () => {
        mockPrisma.mmQualityInspectionRule.findMany.mockResolvedValue([])
        const result = await service.resolveInspectionRequirement({
            companyId: 'co-1',
            materialId: 'mat-1',
            warehouseId: 'wh-1',
        })
        expect(result.action).toBe('NO_INSPECTION')
    })

    it('7. no match returns NO_INSPECTION', () => {
        const result = service.resolveFromRules(
            [rule({ materialId: 'other-mat', action: 'FULL_INSPECTION' })],
            baseContext,
        )
        expect(result.action).toBe('NO_INSPECTION')
        expect(result.inspectionRequired).toBe(false)
    })

    it('8. NO_INSPECTION at highest priority suppresses lower rules', () => {
        const result = service.resolveFromRules(
            [
                rule({ ruleCode: 'BLOCK', priority: 200, action: 'NO_INSPECTION' }),
                rule({ ruleCode: 'REQ', priority: 100, action: 'FULL_INSPECTION' }),
            ],
            baseContext,
        )
        expect(result.action).toBe('NO_INSPECTION')
        expect(result.inspectionRequired).toBe(false)
    })

    it('9. dimension-specific match requires exact value', () => {
        const result = service.resolveFromRules(
            [rule({ supplierId: 'sup-2', action: 'FULL_INSPECTION' })],
            baseContext,
        )
        expect(result.action).toBe('NO_INSPECTION')
    })

    it('buildReceivingContext derives purchase and receipt types', async () => {
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ materialCategoryId: 'cat-1' })
        mockPrisma.warehouse.findUnique.mockResolvedValue({ plantId: 'plant-1' })
        mockPrisma.mmSupplier.findUnique.mockResolvedValue({ categoryId: 'scat-1' })
        mockPrisma.mmExpectedReceipt.findUnique.mockResolvedValue({ sourceType: 'ASN' })
        mockPrisma.mmPurchaseOrder.findUnique.mockResolvedValue({ purchaseContractId: 'pc-1' })

        const ctx = await service.buildReceivingContext({
            companyId: 'co-1',
            materialId: 'mat-1',
            supplierId: 'sup-1',
            warehouseId: 'wh-1',
            expectedReceiptId: 'er-1',
            purchaseOrderId: 'po-1',
        })

        expect(ctx.purchaseType).toBe('CONTRACT')
        expect(ctx.receiptType).toBe('ASN')
    })
})
