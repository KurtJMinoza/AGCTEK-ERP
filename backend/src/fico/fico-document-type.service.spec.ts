import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoDocumentTypeService } from './fico-document-type.service'

const user = { id: 'user-1', role: 'admin' } as never

function makeDocumentType(overrides: Record<string, unknown> = {}) {
    return {
        id: 'doc-1',
        companyId: 'company-1',
        code: 'SA',
        name: 'General Journal Entry',
        description: 'Standard manual accounting entry',
        documentCategory: 'GENERAL_JOURNAL',
        numberRangeId: 'range-je',
        numberAssignment: 'INTERNAL',
        externalNumberAllowed: false,
        numberRangeRequired: true,
        allowedAccountTypes: ['GL_ACCOUNT'],
        debitPostingAllowed: true,
        creditPostingAllowed: true,
        negativePostingAllowed: false,
        reversalAllowed: true,
        reversalDocumentTypeId: null,
        originalDocumentReferenceRequired: false,
        reversalReasonRequired: false,
        referenceRequired: false,
        headerTextRequired: true,
        lineTextRequired: false,
        status: 'ACTIVE',
        remarks: null,
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        company: { id: 'company-1', code: 'AGCTEK', name: 'AGCTEK Corporation' },
        numberRange: {
            id: 'range-je',
            rangeCode: 'JE',
            rangeName: 'Journal Entry',
            documentCategory: 'JOURNAL_ENTRY',
            numberingMethod: 'INTERNAL',
            allowExternalAssignment: false,
            validFrom: null,
            validTo: null,
            status: 'ACTIVE',
        },
        reversalDocumentType: null,
        ...overrides,
    }
}

function makeNumberRange(overrides: Record<string, unknown> = {}) {
    return {
        id: 'range-je',
        companyId: 'company-1',
        rangeCode: 'JE',
        rangeName: 'Journal Entry',
        documentCategory: 'JOURNAL_ENTRY',
        numberingMethod: 'INTERNAL',
        allowExternalAssignment: false,
        validFrom: null,
        validTo: null,
        status: 'ACTIVE',
        ...overrides,
    }
}

function setup() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: Record<string, any> = {
        ficoDocumentType: {
            findUnique: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            groupBy: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        ficoNumberRange: { findUnique: jest.fn() },
        ficoJournalEntry: { count: jest.fn().mockResolvedValue(0) },
        ficoDocumentSequence: { count: jest.fn().mockResolvedValue(0) },
        ficoCompanyAccountingSettings: {
            findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
        },
        company: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ id: 'company-1' }),
        },
        ficoAccountingAuditLog: {
            create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
    }
    prisma.$transaction = jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma),
    )

    const access = { assertAccess: jest.fn().mockResolvedValue(undefined) }
    const service = new FicoDocumentTypeService(
        prisma as never,
        access as never,
    )

    return { prisma, access, service }
}

const baseInput = {
    companyId: 'company-1',
    code: 'sa',
    name: 'General Journal Entry',
    description: 'Standard manual accounting entry',
    documentCategory: 'GENERAL_JOURNAL',
    numberRangeId: 'range-je',
    allowedAccountTypes: ['GL_ACCOUNT'],
}

describe('FicoDocumentTypeService', () => {
    describe('create', () => {
        it('rejects duplicate document type codes within a company', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType(),
            )

            await expect(service.create(baseInput, user)).rejects.toBeInstanceOf(
                ConflictException,
            )
        })

        it('normalizes the code and defaults to inactive internal numbering', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange(),
            )
            prisma.ficoDocumentType.create.mockResolvedValue(
                makeDocumentType({ status: 'INACTIVE' }),
            )

            await service.create(baseInput, user)

            expect(prisma.ficoDocumentType.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        code: 'SA',
                        status: 'INACTIVE',
                        numberAssignment: 'INTERNAL',
                        externalNumberAllowed: false,
                    }),
                }),
            )
        })

        it('rejects an empty account type selection', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)

            await expect(
                service.create(
                    { ...baseInput, allowedAccountTypes: [] },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects invalid account types', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)

            await expect(
                service.create(
                    { ...baseInput, allowedAccountTypes: ['COST_CENTER'] },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects a number range from another company', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange({ companyId: 'company-2' }),
            )

            await expect(service.create(baseInput, user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })

        it('rejects an inactive number range', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange({ status: 'INACTIVE' }),
            )

            await expect(service.create(baseInput, user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })

        it('rejects an incompatible number range category', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange({ documentCategory: 'CUSTOMER_INVOICE' }),
            )

            await expect(service.create(baseInput, user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })

        it('accepts a seeded journal-entry range for a general journal type', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange(),
            )
            prisma.ficoDocumentType.create.mockResolvedValue(
                makeDocumentType(),
            )

            await expect(
                service.create(baseInput, user),
            ).resolves.toBeDefined()
        })

        it('rejects external numbering when the range does not allow it', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange(),
            )

            await expect(
                service.create(
                    {
                        ...baseInput,
                        numberAssignment: 'EXTERNAL',
                        externalNumberAllowed: true,
                    },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('accepts external numbering when the range allows it', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange({ allowExternalAssignment: true }),
            )
            prisma.ficoDocumentType.create.mockResolvedValue(
                makeDocumentType({ numberAssignment: 'EXTERNAL' }),
            )

            await expect(
                service.create(
                    {
                        ...baseInput,
                        numberAssignment: 'EXTERNAL',
                        externalNumberAllowed: true,
                    },
                    user,
                ),
            ).resolves.toBeDefined()
        })

        it('rejects a missing number range when required', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)

            await expect(
                service.create(
                    { ...baseInput, numberRangeId: null },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('requires at least one posting side', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(null)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange(),
            )

            await expect(
                service.create(
                    {
                        ...baseInput,
                        debitPostingAllowed: false,
                        creditPostingAllowed: false,
                    },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects a company without active accounting settings', async () => {
            const { prisma, service } = setup()
            prisma.ficoCompanyAccountingSettings.findUnique.mockResolvedValue({
                status: 'INACTIVE',
            })

            await expect(service.create(baseInput, user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })

        it('rejects an unknown company', async () => {
            const { prisma, service } = setup()
            prisma.company.findUnique.mockResolvedValue(null)

            await expect(service.create(baseInput, user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })
    })

    describe('update', () => {
        it('rejects self-referencing reversal document types', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique
                .mockResolvedValueOnce(makeDocumentType())
                .mockResolvedValueOnce(makeDocumentType())

            await expect(
                service.update(
                    'doc-1',
                    { reversalDocumentTypeId: 'doc-1' },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('rejects circular reversal relationships', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique
                .mockResolvedValueOnce(
                    makeDocumentType({ reversalDocumentTypeId: null }),
                )
                .mockResolvedValueOnce(
                    makeDocumentType({
                        id: 'doc-2',
                        code: 'RV',
                        documentCategory: 'REVERSAL',
                    }),
                )
                .mockResolvedValueOnce({
                    id: 'doc-2',
                    reversalDocumentTypeId: 'doc-1',
                })

            await expect(
                service.update(
                    'doc-1',
                    { reversalDocumentTypeId: 'doc-2' },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('locks critical fields when journal entries reference the code', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType(),
            )
            prisma.ficoJournalEntry.count.mockResolvedValue(3)

            await expect(
                service.update(
                    'doc-1',
                    { numberRangeId: 'range-other' },
                    user,
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('allows descriptive changes when the document type is referenced', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType(),
            )
            prisma.ficoJournalEntry.count.mockResolvedValue(3)
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange(),
            )
            prisma.ficoDocumentType.update.mockResolvedValue(
                makeDocumentType({ name: 'General Journal' }),
            )

            await expect(
                service.update('doc-1', { name: 'General Journal' }, user),
            ).resolves.toBeDefined()
        })
    })

    describe('activate', () => {
        it('rejects activation when the assigned number range is inactive', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType({ status: 'INACTIVE' }),
            )
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange({ status: 'INACTIVE' }),
            )

            await expect(
                service.activate('doc-1', {}, user),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('activates a valid document type and writes audit history', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType({ status: 'INACTIVE' }),
            )
            prisma.ficoNumberRange.findUnique.mockResolvedValue(
                makeNumberRange(),
            )
            prisma.ficoDocumentType.update.mockResolvedValue(
                makeDocumentType({ status: 'ACTIVE' }),
            )

            const result = await service.activate('doc-1', {}, user)

            expect(result.status).toBe('ACTIVE')
            expect(prisma.ficoAccountingAuditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        action: 'DOCUMENT_TYPE_ACTIVATE',
                        entityType: 'FicoDocumentType',
                    }),
                }),
            )
        })
    })

    describe('remove', () => {
        it('blocks deletion when journal entries reference the code', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType(),
            )
            prisma.ficoJournalEntry.count.mockResolvedValue(1)

            await expect(service.remove('doc-1', user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
            expect(prisma.ficoDocumentType.delete).not.toHaveBeenCalled()
        })

        it('blocks deletion when another document type uses it for reversal', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType(),
            )
            prisma.ficoDocumentType.count.mockResolvedValue(1)

            await expect(service.remove('doc-1', user)).rejects.toBeInstanceOf(
                BadRequestException,
            )
        })

        it('deletes an unused document type and audits it', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType(),
            )

            const result = await service.remove('doc-1', user)

            expect(result).toEqual({ deleted: true })
            expect(prisma.ficoDocumentType.delete).toHaveBeenCalledWith({
                where: { id: 'doc-1' },
            })
            expect(prisma.ficoAccountingAuditLog.create).toHaveBeenCalled()
        })
    })

    describe('company isolation', () => {
        it('checks company access on list', async () => {
            const { access, service } = setup()

            await service.list({ companyId: 'company-1' }, user)

            expect(access.assertAccess).toHaveBeenCalledWith(
                user,
                'company-1',
            )
        })

        it('checks the stored company, not a caller-supplied id, on get', async () => {
            const { prisma, access, service } = setup()
            prisma.ficoDocumentType.findUnique.mockResolvedValue(
                makeDocumentType({ companyId: 'company-2' }),
            )

            await service.get('doc-1', user)

            expect(access.assertAccess).toHaveBeenCalledWith(
                user,
                'company-2',
            )
        })
    })

    describe('summary and list', () => {
        it('returns company-scoped summary counts', async () => {
            const { prisma, service } = setup()
            prisma.ficoDocumentType.count
                .mockResolvedValueOnce(5)
                .mockResolvedValueOnce(3)
                .mockResolvedValueOnce(2)
                .mockResolvedValueOnce(2)
            prisma.ficoDocumentType.groupBy.mockResolvedValue([
                { documentCategory: 'GENERAL_JOURNAL' },
                { documentCategory: 'VENDOR_INVOICE' },
            ])

            const result = await service.summary('company-1', user)

            expect(result).toEqual(
                expect.objectContaining({
                    total: 5,
                    active: 3,
                    inactive: 2,
                    categories: 2,
                    reversalAllowed: 2,
                }),
            )
        })

        it('applies search, status, and reversal filters', async () => {
            const { prisma, service } = setup()

            await service.list(
                {
                    companyId: 'company-1',
                    search: 'journal',
                    status: 'ACTIVE',
                    reversalAllowed: 'true',
                },
                user,
            )

            expect(prisma.ficoDocumentType.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        companyId: 'company-1',
                        status: 'ACTIVE',
                        reversalAllowed: true,
                    }),
                }),
            )
        })
    })

    describe('reference data', () => {
        it('exposes categories and account types from backend constants', () => {
            const { service } = setup()
            const data = service.referenceData()

            expect(data.categories.map((item) => item.value)).toContain(
                'GENERAL_JOURNAL',
            )
            expect(data.accountTypes.map((item) => item.value)).toEqual([
                'GL_ACCOUNT',
                'VENDOR',
                'CUSTOMER',
                'ASSET',
                'BANK',
                'INVENTORY',
            ])
        })
    })
})
