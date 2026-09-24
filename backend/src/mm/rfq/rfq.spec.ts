import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { RfqService } from './rfq.service'
import { QuotationService } from './quotation.service'

const companyId = 'co-1'
const materialId = 'mat-1'
const uomId = 'uom-1'
const supplierA = 'sup-a'
const supplierB = 'sup-b'

function makeRfq(overrides: any = {}) {
    return {
        id: 'rfq-1',
        rfqNumber: 'RFQ-20260904-00001',
        companyId,
        buyerId: 'buyer-1',
        issueDate: null,
        responseDeadline: new Date('2099-12-31'),
        currencyId: null,
        status: 'DRAFT',
        purpose: 'Test RFQ',
        notes: null,
        autoSelectCheapest: false,
        purchaseRequisitionId: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        company: { id: companyId, code: 'AGC', name: 'AGC' },
        currency: null,
        purchaseRequisition: null,
        lines: [
            {
                id: 'line-1',
                rfqId: 'rfq-1',
                lineNumber: 1,
                materialId,
                quantity: new Decimal(10),
                uomId,
                requiredDate: null,
                specifications: null,
                prLineId: null,
                material: { id: materialId, materialCode: 'MAT-1', materialName: 'Widget' },
                uom: { id: uomId, code: 'EA', name: 'Each' },
            },
        ],
        invitedSuppliers: [
            {
                id: 'inv-a',
                rfqId: 'rfq-1',
                supplierId: supplierA,
                invitedAt: new Date(),
                responseStatus: 'INVITED',
                respondedAt: null,
                notes: null,
                supplier: { id: supplierA, supplierCode: 'SUP-A', supplierName: 'Alpha', status: 'ACTIVE' },
            },
            {
                id: 'inv-b',
                rfqId: 'rfq-1',
                supplierId: supplierB,
                invitedAt: new Date(),
                responseStatus: 'INVITED',
                respondedAt: null,
                notes: null,
                supplier: { id: supplierB, supplierCode: 'SUP-B', supplierName: 'Beta', status: 'ACTIVE' },
            },
        ],
        quotations: [],
        awards: [],
        ...overrides,
    }
}

function makeQuote(overrides: any = {}) {
    return {
        id: 'q-1',
        quotationNumber: 'SQ-20260904-00001',
        rfqId: 'rfq-1',
        supplierId: supplierA,
        validityDate: new Date('2099-06-01'),
        currencyId: null,
        paymentTermsId: null,
        deliveryTerms: 'FOB',
        freight: new Decimal(50),
        tax: new Decimal(10),
        total: new Decimal(1060),
        status: 'DRAFT',
        qualityScore: new Decimal(80),
        supplierScore: new Decimal(75),
        notes: null,
        submittedAt: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        supplier: { id: supplierA, supplierCode: 'SUP-A', supplierName: 'Alpha' },
        rfq: { id: 'rfq-1', rfqNumber: 'RFQ-1', status: 'ISSUED', responseDeadline: new Date('2099-12-31') },
        currency: null,
        paymentTerms: { id: 'pt-1', code: 'NET30', name: 'Net 30', dueDays: 30 },
        lines: [
            {
                id: 'ql-1',
                quotationId: 'q-1',
                rfqLineId: 'line-1',
                materialId,
                quantity: new Decimal(10),
                uomId,
                unitPrice: new Decimal(100),
                discount: new Decimal(0),
                tax: new Decimal(10),
                lineTotal: new Decimal(1010),
                leadTimeDays: 14,
                moq: new Decimal(5),
                warranty: '12 months',
                notes: null,
                material: { id: materialId, materialCode: 'MAT-1', materialName: 'Widget' },
                uom: { id: uomId, code: 'EA', name: 'Each' },
                rfqLine: { id: 'line-1', lineNumber: 1 },
            },
        ],
        ...overrides,
    }
}

const mockPrisma: any = {
    company: { findUnique: jest.fn() },
    mmRfq: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    mmRfqLine: { deleteMany: jest.fn() },
    mmRfqSupplier: { upsert: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    mmSupplier: { findFirst: jest.fn() },
    mmQuotationComparison: { create: jest.fn() },
    mmRfqAudit: { create: jest.fn(), findMany: jest.fn() },
    mmRfqAward: { create: jest.fn() },
    mmSupplierQuotation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
    },
    mmSupplierQuotationLine: { deleteMany: jest.fn() },
    mmPurchaseRequisition: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    mmPurchaseRequisitionLine: { update: jest.fn() },
    mmPrConversion: { create: jest.fn() },
    mmMaterial: { findMany: jest.fn() },
    $transaction: jest.fn((fn: any) =>
        fn({
            mmSupplierQuotation: mockPrisma.mmSupplierQuotation,
            mmRfqAward: mockPrisma.mmRfqAward,
            mmRfq: mockPrisma.mmRfq,
        }),
    ),
}

describe('MM-07 RFQ & Quotations', () => {
    let rfqService: RfqService
    let quotationService: QuotationService

    beforeEach(async () => {
        jest.resetAllMocks()
        mockPrisma.mmMaterial.findMany.mockResolvedValue([
            {
                id: materialId,
                status: 'ACTIVE',
                deletedAt: null,
                purchasable: true,
                inventoryManaged: true,
                materialCode: 'MAT-1',
            },
        ])
        mockPrisma.$transaction.mockImplementation((fn: any) =>
            fn({
                mmSupplierQuotation: mockPrisma.mmSupplierQuotation,
                mmRfqAward: mockPrisma.mmRfqAward,
                mmRfq: mockPrisma.mmRfq,
            }),
        )
        mockPrisma.mmSupplier.findFirst.mockResolvedValue({
            id: supplierA,
            status: 'ACTIVE',
            companyId,
            sourcingType: 'APPROVED',
            documents: [],
        })
        mockPrisma.mmRfqSupplier.findMany.mockResolvedValue([
            { supplier: { sourcingType: 'APPROVED' } },
            { supplier: { sourcingType: 'APPROVED' } },
        ])

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RfqService,
                QuotationService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()

        rfqService = module.get(RfqService)
        quotationService = module.get(QuotationService)
    })

    it('creates RFQ in DRAFT with lines and invited suppliers', async () => {
        mockPrisma.company.findUnique.mockResolvedValue({ id: companyId })
        mockPrisma.mmRfq.findFirst.mockResolvedValue(null)
        const created = makeRfq()
        mockPrisma.mmRfq.create.mockResolvedValue(created)
        mockPrisma.mmRfqAudit.create.mockResolvedValue({})

        const result = await rfqService.create({
            companyId,
            buyerId: 'buyer-1',
            responseDeadline: '2099-12-31',
            supplierIds: [supplierA, supplierB],
            lines: [{ materialId, quantity: 10, uomId }],
        })

        expect(result.status).toBe('DRAFT')
        expect(result.invitedSuppliers).toHaveLength(2)
        expect(mockPrisma.mmRfq.create).toHaveBeenCalled()
    })

    it('issues RFQ only when suppliers are invited', async () => {
        mockPrisma.mmRfq.findUnique.mockResolvedValue(
            makeRfq({ invitedSuppliers: [] }),
        )
        await expect(rfqService.issue('rfq-1')).rejects.toBeInstanceOf(BadRequestException)

        mockPrisma.mmRfq.findUnique.mockResolvedValue(makeRfq())
        mockPrisma.mmRfq.update.mockResolvedValue(makeRfq({ status: 'ISSUED', issueDate: new Date() }))
        mockPrisma.mmRfqAudit.create.mockResolvedValue({})
        const issued = await rfqService.issue('rfq-1')
        expect(issued.status).toBe('ISSUED')
    })

    it('tracks partial responses across multiple suppliers', async () => {
        mockPrisma.mmRfq.findUnique.mockResolvedValue(
            makeRfq({
                status: 'ISSUED',
                invitedSuppliers: [
                    { ...makeRfq().invitedSuppliers[0], responseStatus: 'RESPONDED' },
                    makeRfq().invitedSuppliers[1],
                ],
                quotations: [makeQuote({ status: 'SUBMITTED' })],
            }),
        )
        mockPrisma.mmRfq.update.mockResolvedValue({})

        await rfqService.refreshResponseStatus('rfq-1')
        expect(mockPrisma.mmRfq.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: 'PARTIALLY_RESPONDED' },
            }),
        )
    })

    it('marks expired quotations in comparison and blocks award', async () => {
        const expiredQuote = makeQuote({
            id: 'q-expired',
            status: 'SUBMITTED',
            validityDate: new Date('2020-01-01'),
            total: new Decimal(500),
        })
        const liveQuote = makeQuote({
            id: 'q-live',
            supplierId: supplierB,
            status: 'SUBMITTED',
            total: new Decimal(900),
            supplier: { id: supplierB, supplierCode: 'SUP-B', supplierName: 'Beta' },
        })

        mockPrisma.mmRfq.findUnique.mockResolvedValue(
            makeRfq({
                status: 'EVALUATION',
                quotations: [expiredQuote, liveQuote],
            }),
        )

        const comparison = await rfqService.getComparison('rfq-1')
        expect(comparison.quotations.find((q) => q.quotationId === 'q-expired')?.expired).toBe(true)
        expect(comparison.cheapestQuotationId).toBe('q-live')
        expect(comparison.quotations.find((q) => q.quotationId === 'q-live')?.landedCost).toBe(900)
        expect(comparison.awardHint).toContain('Manual')

        mockPrisma.mmSupplierQuotation.findUnique.mockResolvedValue(expiredQuote)
        await expect(
            rfqService.award('rfq-1', { quotationId: 'q-expired', reason: 'cheap' }),
        ).rejects.toThrow(/expired/i)
    })

    it('does not auto-award cheapest unless RFQ is configured', async () => {
        mockPrisma.mmRfq.findUnique.mockResolvedValue(makeRfq({ status: 'EVALUATION', autoSelectCheapest: false }))
        await expect(
            rfqService.award('rfq-1', { useCheapest: true, reason: 'auto' }),
        ).rejects.toThrow(/not enabled/i)
    })

    it('awards selected supplier and records evaluation metadata', async () => {
        const quote = makeQuote({ status: 'SUBMITTED' })
        mockPrisma.mmRfq.findUnique
            .mockResolvedValueOnce(makeRfq({ status: 'EVALUATION', quotations: [quote] }))
            .mockResolvedValueOnce(makeRfq({ status: 'AWARDED', quotations: [quote] }))
        mockPrisma.mmSupplierQuotation.findUnique.mockResolvedValue(quote)
        mockPrisma.mmSupplierQuotation.updateMany.mockResolvedValue({})
        mockPrisma.mmSupplierQuotation.update.mockResolvedValue({ ...quote, status: 'SELECTED' })
        mockPrisma.mmRfqAward.create.mockResolvedValue({
            id: 'award-1',
            rfqId: 'rfq-1',
            supplierId: supplierA,
            quotationId: quote.id,
            reason: 'Best lead time and quality',
            evaluatedBy: 'buyer-1',
            evaluatedAt: new Date(),
            autoSelected: false,
            supplier: { id: supplierA, supplierCode: 'SUP-A', supplierName: 'Alpha' },
            quotation: { id: quote.id, quotationNumber: quote.quotationNumber, total: quote.total },
        })
        mockPrisma.mmRfq.update.mockResolvedValue({})
        mockPrisma.mmRfqAudit.create.mockResolvedValue({})

        const result = await rfqService.award('rfq-1', {
            quotationId: quote.id,
            reason: 'Best lead time and quality',
            evaluatedBy: 'buyer-1',
        })

        expect(result.award.reason).toBe('Best lead time and quality')
        expect(result.award.evaluatedBy).toBe('buyer-1')
        expect(result.award.autoSelected).toBe(false)
        expect(mockPrisma.mmRfqAward.create).toHaveBeenCalled()
    })

    it('submits quotation and updates invite response status', async () => {
        const draft = makeQuote({ status: 'DRAFT' })
        mockPrisma.mmSupplierQuotation.findUnique.mockResolvedValue(draft)
        mockPrisma.mmSupplierQuotation.update.mockResolvedValue({ ...draft, status: 'SUBMITTED' })
        mockPrisma.mmRfqSupplier.updateMany.mockResolvedValue({})
        mockPrisma.mmRfq.findUnique.mockResolvedValue(
            makeRfq({
                status: 'ISSUED',
                invitedSuppliers: [
                    { ...makeRfq().invitedSuppliers[0], responseStatus: 'RESPONDED' },
                    { ...makeRfq().invitedSuppliers[1], responseStatus: 'RESPONDED' },
                ],
                quotations: [],
            }),
        )
        mockPrisma.mmRfq.update.mockResolvedValue({})

        const submitted = await quotationService.submit('q-1')
        expect(submitted.status).toBe('SUBMITTED')
        expect(mockPrisma.mmRfqSupplier.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ responseStatus: 'RESPONDED' }),
            }),
        )
    })

    it('rejects quotation create for uninvited supplier', async () => {
        mockPrisma.mmRfq.findUnique.mockResolvedValue(
            makeRfq({
                status: 'ISSUED',
                invitedSuppliers: [makeRfq().invitedSuppliers[0]],
            }),
        )
        await expect(
            quotationService.create({
                rfqId: 'rfq-1',
                supplierId: supplierB,
                validityDate: '2099-06-01',
                lines: [{ materialId, quantity: 10, uomId, unitPrice: 100 }],
            }),
        ).rejects.toThrow(/not invited/i)
    })
})
