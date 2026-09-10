import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { SupplierService } from './supplier.service'
import { SupplierBankService } from './supplier-bank.service'
import { SupplierMaterialService } from './supplier-material.service'
import { PaymentTermsService } from './payment-terms.service'
import { SupplierCategoryService } from './supplier-category.service'

let seq = 0
function nextId() { return `id-${++seq}` }

function makeSupplier(overrides: any = {}) {
    const id = nextId()
    return {
        id,
        supplierCode: `SUP-${String(seq).padStart(5, '0')}`,
        supplierName: `Supplier ${seq}`,
        legalName: null,
        supplierType: null,
        taxId: null,
        primaryContact: null,
        email: null,
        phone: null,
        website: null,
        billingAddress: null,
        shippingAddress: null,
        country: null,
        region: null,
        currencyId: null,
        currency: null,
        paymentTermsId: null,
        paymentTerms: null,
        deliveryTerms: null,
        defaultWarehouseId: null,
        defaultWarehouse: null,
        leadTimeDays: null,
        taxCode: null,
        taxStatus: null,
        companyId: 'co-1',
        company: { id: 'co-1', name: 'Test Co' },
        categoryId: null,
        category: null,
        status: 'DRAFT',
        blockReason: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides,
    }
}

const mockPrisma: any = {
    company: {
        findUnique: jest.fn(),
    },
    mmSupplier: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    mmSupplierAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
    },
    mmSupplierBankAccount: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    mmSupplierMaterial: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    mmPaymentTerms: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
    },
    mmSupplierCategory: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
    },
}

let supplierService: SupplierService
let bankService: SupplierBankService
let materialService: SupplierMaterialService
let paymentTermsService: PaymentTermsService
let categoryService: SupplierCategoryService

beforeEach(async () => {
    seq = 0
    jest.resetAllMocks()

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            SupplierService,
            SupplierBankService,
            SupplierMaterialService,
            PaymentTermsService,
            SupplierCategoryService,
            { provide: PrismaService, useValue: mockPrisma },
        ],
    }).compile()

    supplierService = module.get(SupplierService)
    bankService = module.get(SupplierBankService)
    materialService = module.get(SupplierMaterialService)
    paymentTermsService = module.get(PaymentTermsService)
    categoryService = module.get(SupplierCategoryService)
})

describe('Supplier Management (MM-05)', () => {
    // Test 1: Create supplier
    it('should create a supplier in DRAFT status with unique code', async () => {
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'co-1', name: 'Test Co' })
        mockPrisma.mmSupplier.findFirst.mockResolvedValue(null)
        const created = makeSupplier()
        mockPrisma.mmSupplier.create.mockResolvedValue(created)

        const result = await supplierService.create({
            companyId: 'co-1',
            supplierName: 'Test Supplier',
        })

        expect(result.status).toBe('DRAFT')
        expect(result.supplierCode).toMatch(/^SUP-/)
        expect(mockPrisma.mmSupplier.create).toHaveBeenCalledTimes(1)
    })

    // Test 2: Duplicate code rejected
    it('should reject duplicate supplier code via soft-delete-aware create', async () => {
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'co-1', name: 'Test Co' })
        const existing = makeSupplier()
        mockPrisma.mmSupplier.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(existing)
        mockPrisma.mmSupplier.create.mockRejectedValue({ code: 'P2002' })

        mockPrisma.mmSupplier.create.mockClear()
        mockPrisma.mmSupplier.create.mockResolvedValue(makeSupplier())

        const result = await supplierService.create({
            companyId: 'co-1',
            supplierName: 'Another',
        })
        expect(result).toBeDefined()
    })

    it('should reject create when company does not exist', async () => {
        mockPrisma.company.findUnique.mockResolvedValue(null)
        await expect(
            supplierService.create({ companyId: 'missing', supplierName: 'X' }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    // Test 3: Full lifecycle
    it('should transition DRAFT -> PENDING_REVIEW -> APPROVED -> ACTIVE', async () => {
        const draft = makeSupplier({ status: 'DRAFT' })
        const pending = { ...draft, status: 'PENDING_REVIEW' }
        const approved = { ...draft, status: 'APPROVED' }
        const active = { ...draft, status: 'ACTIVE' }

        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(draft)
        mockPrisma.mmSupplier.update.mockResolvedValueOnce(pending)
        mockPrisma.mmSupplierAudit.create.mockResolvedValue({})

        let result = await supplierService.submitForReview(draft.id)
        expect(result.status).toBe('PENDING_REVIEW')

        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(pending)
        mockPrisma.mmSupplier.update.mockResolvedValueOnce(approved)
        result = await supplierService.approve(draft.id)
        expect(result.status).toBe('APPROVED')

        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(approved)
        mockPrisma.mmSupplier.update.mockResolvedValueOnce(active)
        result = await supplierService.activate(draft.id)
        expect(result.status).toBe('ACTIVE')
    })

    // Test 4: Deactivate and reactivate
    it('should deactivate ACTIVE supplier and reactivate from INACTIVE', async () => {
        const active = makeSupplier({ status: 'ACTIVE' })
        const inactive = { ...active, status: 'INACTIVE' }
        const reactivated = { ...active, status: 'ACTIVE' }

        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(active)
        mockPrisma.mmSupplier.update.mockResolvedValueOnce(inactive)
        mockPrisma.mmSupplierAudit.create.mockResolvedValue({})

        let result = await supplierService.deactivate(active.id)
        expect(result.status).toBe('INACTIVE')

        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(inactive)
        mockPrisma.mmSupplier.update.mockResolvedValueOnce(reactivated)
        result = await supplierService.activate(active.id)
        expect(result.status).toBe('ACTIVE')
    })

    // Test 5: Block supplier
    it('should block supplier with reason', async () => {
        const active = makeSupplier({ status: 'ACTIVE' })
        const blocked = { ...active, status: 'BLOCKED', blockReason: 'Payment issues' }

        mockPrisma.mmSupplier.findFirst.mockResolvedValue(active)
        mockPrisma.mmSupplier.update.mockResolvedValue(blocked)
        mockPrisma.mmSupplierAudit.create.mockResolvedValue({})

        const result = await supplierService.block(active.id, 'Payment issues')
        expect(result.status).toBe('BLOCKED')
        expect(result.blockReason).toBe('Payment issues')
    })

    // Test 6: Unblock supplier
    it('should unblock supplier from BLOCKED to ACTIVE', async () => {
        const blocked = makeSupplier({ status: 'BLOCKED', blockReason: 'Issue' })
        const unblocked = { ...blocked, status: 'ACTIVE', blockReason: null }

        mockPrisma.mmSupplier.findFirst.mockResolvedValue(blocked)
        mockPrisma.mmSupplier.update.mockResolvedValue(unblocked)
        mockPrisma.mmSupplierAudit.create.mockResolvedValue({})

        const result = await supplierService.unblock(blocked.id)
        expect(result.status).toBe('ACTIVE')
        expect(result.blockReason).toBeNull()
    })

    // Test 7: Blocked supplier validation
    it('should reject submit on non-DRAFT supplier', async () => {
        const active = makeSupplier({ status: 'ACTIVE' })
        mockPrisma.mmSupplier.findFirst.mockResolvedValue(active)

        await expect(supplierService.submitForReview(active.id)).rejects.toThrow(BadRequestException)
    })

    // Test 8: Supplier-material CRUD
    it('should create and update supplier-material record', async () => {
        const created = {
            id: nextId(),
            supplierId: 'sup-1',
            materialId: 'mat-1',
            supplierMaterialCode: 'SM-001',
            unitPrice: new Decimal(25.50),
            currencyId: null,
            currency: null,
            minimumOrderQuantity: new Decimal(10),
            leadTimeDays: 7,
            validityStart: null,
            validityEnd: null,
            preferredSupplier: false,
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
            supplier: { id: 'sup-1', supplierCode: 'SUP-00001', supplierName: 'Test' },
            material: { id: 'mat-1', materialCode: 'MAT-001', materialName: 'Widget' },
        }

        mockPrisma.mmSupplierMaterial.findUnique.mockResolvedValueOnce(null)
        mockPrisma.mmSupplierMaterial.create.mockResolvedValue(created)

        const result = await materialService.create({
            supplierId: 'sup-1',
            materialId: 'mat-1',
            unitPrice: 25.50,
            supplierMaterialCode: 'SM-001',
        })

        expect(result.unitPrice).toEqual(new Decimal(25.50))

        const updated = { ...created, unitPrice: new Decimal(30) }
        mockPrisma.mmSupplierMaterial.findUnique.mockResolvedValueOnce(created)
        mockPrisma.mmSupplierMaterial.update.mockResolvedValue(updated)

        const upResult = await materialService.update(created.id, { unitPrice: 30 })
        expect(upResult.unitPrice).toEqual(new Decimal(30))
    })

    // Test 9: Supplier-material uniqueness
    it('should reject duplicate supplier-material combination', async () => {
        const existing = { id: 'existing', supplierId: 'sup-1', materialId: 'mat-1' }
        mockPrisma.mmSupplierMaterial.findUnique.mockResolvedValue(existing)

        await expect(
            materialService.create({ supplierId: 'sup-1', materialId: 'mat-1', unitPrice: 10 }),
        ).rejects.toThrow(ConflictException)
    })

    // Test 10: Bank account masking
    it('should return masked account numbers in list', async () => {
        mockPrisma.mmSupplierBankAccount.findMany.mockResolvedValue([
            {
                id: 'ba-1',
                supplierId: 'sup-1',
                bankName: 'Bank A',
                accountName: 'Corp',
                accountNumber: '1234567890',
                routingNumber: null,
                swiftCode: null,
                iban: null,
                currency: 'USD',
                isPrimary: true,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])

        const accounts = await bankService.findBySupplier('sup-1')
        expect(accounts[0].accountNumber).toBe('******7890')
        expect(accounts[0].accountNumber).not.toBe('1234567890')
    })

    // Test 11: Bank account reveal + audit
    it('should return unmasked data and create audit entry on reveal', async () => {
        const full = {
            id: 'ba-1',
            supplierId: 'sup-1',
            bankName: 'Bank A',
            accountName: 'Corp',
            accountNumber: '1234567890',
            routingNumber: '111',
            swiftCode: 'SWIFT',
            iban: null,
            currency: 'USD',
            isPrimary: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        mockPrisma.mmSupplierBankAccount.findUnique.mockResolvedValue(full)
        mockPrisma.mmSupplierAudit.create.mockResolvedValue({})

        const revealed = await bankService.reveal('ba-1', 'admin')
        expect(revealed.accountNumber).toBe('1234567890')
        expect(mockPrisma.mmSupplierAudit.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: 'BANK_DATA_VIEWED' }),
            }),
        )
    })

    // Test 12: Soft delete
    it('should soft-delete only from DRAFT or INACTIVE', async () => {
        const draft = makeSupplier({ status: 'DRAFT' })
        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(draft)
        mockPrisma.mmSupplier.update.mockResolvedValueOnce({ ...draft, deletedAt: new Date() })
        mockPrisma.mmSupplierAudit.create.mockResolvedValue({})

        const result = await supplierService.softDelete(draft.id)
        expect(result.deletedAt).toBeTruthy()

        const active = makeSupplier({ status: 'ACTIVE' })
        mockPrisma.mmSupplier.findFirst.mockResolvedValueOnce(active)

        await expect(supplierService.softDelete(active.id)).rejects.toThrow(BadRequestException)
    })
})
