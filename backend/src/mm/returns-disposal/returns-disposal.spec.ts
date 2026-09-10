import { BadRequestException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Decimal } from '@prisma/client/runtime/library'
import { SupplierReturnService } from './supplier-return.service'
import { DisposalService } from './disposal.service'
import { CustomerReturnService } from './customer-return.service'
import { DamagedExpiredQueryService } from './damaged-expired-query.service'
import { ReturnsDisposalConfigService } from './returns-disposal-config.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'

function mockPrisma() {
    return {
        mmReturnsDisposalConfig: { findUnique: jest.fn(), upsert: jest.fn() },
        mmSupplierReturn: {
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmSupplierReturnLine: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
        mmSupplierReturnAudit: { create: jest.fn() },
        mmDisposal: {
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmDisposalLine: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
        mmDisposalAudit: { create: jest.fn() },
        mmCustomerReturn: {
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
        },
        mmCustomerReturnLine: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
        },
        mmCustomerReturnAudit: { create: jest.fn() },
        mmInventoryTransaction: { findMany: jest.fn() },
        mmInventoryBalance: { findMany: jest.fn(), count: jest.fn() },
        mmAccountingEvent: { create: jest.fn() },
        mmMaterial: {
            findMany: jest.fn().mockResolvedValue([
                { id: 'mat-1', batchManaged: false, serialManaged: false },
            ]),
        },
    }
}

function makeLine(overrides: any = {}) {
    return {
        id: 'line-1',
        materialId: 'mat-1',
        uomId: 'uom-1',
        storageBinId: null,
        batchId: null,
        serialNumberId: null,
        quantity: new Decimal(10),
        unitCost: new Decimal(50),
        reason: 'DAMAGE',
        stockStatus: 'BLOCKED',
        ...overrides,
    }
}

describe('MM-11 Returns & Disposal', () => {
    let configService: ReturnsDisposalConfigService
    let returnService: SupplierReturnService
    let disposalService: DisposalService
    let customerReturnService: CustomerReturnService
    let damagedExpired: DamagedExpiredQueryService
    let prisma: any
    let postingService: any
    let events: EventEmitter2

    beforeEach(() => {
        prisma = mockPrisma()
        postingService = {
            postTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
            reverseTransaction: jest.fn().mockResolvedValue({ id: 'txn-rev-1' }),
        }
        events = new EventEmitter2()

        configService = new ReturnsDisposalConfigService(prisma)
        returnService = new SupplierReturnService(
            prisma,
            postingService,
            configService,
            events,
        )
        disposalService = new DisposalService(
            prisma,
            postingService,
            configService,
            events,
        )
        customerReturnService = new CustomerReturnService(
            prisma,
            postingService,
            configService,
            disposalService,
            events,
        )
        damagedExpired = new DamagedExpiredQueryService(
            prisma,
            postingService,
            returnService,
            disposalService,
        )
    })

    describe('needsApproval', () => {
        it('returns true when estimated value exceeds amount threshold', () => {
            expect(
                configService.needsApproval(15000, 5, {
                    amountThreshold: 10000,
                    quantityThreshold: 0,
                }),
            ).toBe(true)
        })

        it('returns false when under threshold', () => {
            expect(
                configService.needsApproval(5000, 5, {
                    amountThreshold: 10000,
                    quantityThreshold: 0,
                }),
            ).toBe(false)
        })
    })

    describe('supplier return', () => {
        const doc = {
            id: 'ret-1',
            returnNumber: 'RET-001',
            companyId: 'c1',
            warehouseId: 'w1',
            supplierId: 's1',
            estimatedValue: new Decimal(500),
            totalQuantity: new Decimal(10),
            status: 'APPROVED',
            lines: [makeLine()],
        }

        it('ship posts RETURN_OUT + accounting', async () => {
            prisma.mmSupplierReturn.findUnique.mockResolvedValue(doc)
            prisma.mmSupplierReturn.update.mockResolvedValue({
                ...doc,
                status: 'SHIPPED',
            })

            await returnService.ship('ret-1')

            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'RETURN_OUT',
                    stockStatus: 'BLOCKED',
                    quantity: 10,
                }),
            )
            expect(prisma.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'SUPPLIER_RETURN_POSTED',
                    }),
                }),
            )
        })

        it('rejects ship from DRAFT', async () => {
            prisma.mmSupplierReturn.findUnique.mockResolvedValue({
                ...doc,
                status: 'DRAFT',
            })
            await expect(returnService.ship('ret-1')).rejects.toThrow(
                BadRequestException,
            )
        })
    })

    describe('customer return + restock', () => {
        it('intake → inspection → disposition → complete RESTOCK posts RETURN_IN', async () => {
            const base = {
                id: 'crt-1',
                returnNumber: 'CRT-000001',
                companyId: 'c1',
                warehouseId: 'w1',
                estimatedValue: new Decimal(100),
                totalQuantity: new Decimal(2),
                lines: [
                    makeLine({
                        id: 'crl-1',
                        quantity: new Decimal(2),
                        unitCost: new Decimal(50),
                        disposition: null,
                        dispositionStatus: 'PENDING',
                        reason: undefined,
                    }),
                ],
            }

            prisma.mmCustomerReturn.findUnique
                .mockResolvedValueOnce({ ...base, status: 'DRAFT' })
                .mockResolvedValueOnce({ ...base, status: 'INTAKE' })
                .mockResolvedValueOnce({
                    ...base,
                    status: 'INSPECTION',
                    lines: [
                        {
                            ...base.lines[0],
                            disposition: 'RESTOCK',
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    ...base,
                    status: 'APPROVED',
                    lines: [
                        {
                            ...base.lines[0],
                            disposition: 'RESTOCK',
                            dispositionStatus: 'PENDING',
                        },
                    ],
                })

            prisma.mmCustomerReturn.update.mockImplementation(({ data }: any) =>
                Promise.resolve({ ...base, ...data }),
            )
            prisma.mmCustomerReturnLine.update.mockResolvedValue({})
            prisma.mmReturnsDisposalConfig.findUnique.mockResolvedValue({
                approvalAmountThreshold: new Decimal(10000),
                approvalQuantityThreshold: new Decimal(0),
            })

            await customerReturnService.startIntake('crt-1')
            await customerReturnService.startInspection('crt-1')

            prisma.mmCustomerReturnLine.findUnique.mockResolvedValue({
                ...base.lines[0],
                returnId: 'crt-1',
                customerReturn: { status: 'INSPECTION' },
            })
            await customerReturnService.setDisposition('crl-1', {
                disposition: 'RESTOCK',
            })

            const submitted = await customerReturnService.submit('crt-1')
            expect(submitted.status).toBe('APPROVED')

            await customerReturnService.complete('crt-1')

            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'RETURN_IN',
                    stockStatus: 'UNRESTRICTED',
                    reasonCode: 'RESTOCK',
                }),
            )
            expect(prisma.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'CUSTOMER_RETURN_COMPLETED',
                    }),
                }),
            )
        })
    })

    describe('scrap', () => {
        it('posts SCRAP + DISPOSAL_POSTED', async () => {
            const doc = {
                id: 'dsp-1',
                disposalNumber: 'DSP-001',
                companyId: 'c1',
                warehouseId: 'w1',
                disposalType: 'SCRAP',
                estimatedValue: new Decimal(200),
                totalQuantity: new Decimal(5),
                status: 'APPROVED',
                lines: [makeLine({ quantity: new Decimal(5) })],
            }
            prisma.mmDisposal.findUnique.mockResolvedValue(doc)
            prisma.mmDisposal.update.mockResolvedValue({ ...doc, status: 'POSTED' })

            await disposalService.post('dsp-1')

            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({ movementType: 'SCRAP', quantity: 5 }),
            )
            expect(prisma.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'DISPOSAL_POSTED',
                    }),
                }),
            )
        })
    })

    describe('expired stock', () => {
        it('markExpired transfers to EXPIRED then createDisposalFromBalances', async () => {
            await damagedExpired.markExpired({
                companyId: 'c1',
                warehouseId: 'w1',
                materialId: 'mat-1',
                uomId: 'uom-1',
                quantity: 3,
                unitCost: 10,
            })

            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'TRANSFER_OUT',
                    stockStatus: 'UNRESTRICTED',
                    reasonCode: 'EXPIRY',
                }),
            )
            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'TRANSFER_IN',
                    stockStatus: 'EXPIRED',
                }),
            )

            prisma.mmDisposal.create.mockResolvedValue({
                id: 'dsp-exp',
                disposalNumber: 'DSP-EXP',
                status: 'DRAFT',
                lines: [],
            })
            prisma.mmDisposal.findFirst.mockResolvedValue(null)

            const doc = await damagedExpired.createDisposalFromBalances({
                companyId: 'c1',
                warehouseId: 'w1',
                disposalType: 'DISPOSAL',
                reason: 'EXPIRY',
                lines: [
                    {
                        materialId: 'mat-1',
                        uomId: 'uom-1',
                        quantity: 3,
                        unitCost: 10,
                        stockStatus: 'EXPIRED',
                    },
                ],
            })
            expect(doc.status).toBe('DRAFT')
            expect(prisma.mmDisposal.create).toHaveBeenCalled()
        })
    })

    describe('disposal approval', () => {
        it('over threshold → PENDING_APPROVAL; reject → no postTransaction', async () => {
            const draft = {
                id: 'dsp-hi',
                disposalNumber: 'DSP-HI',
                companyId: 'c1',
                warehouseId: 'w1',
                disposalType: 'DISPOSAL',
                estimatedValue: new Decimal(50000),
                totalQuantity: new Decimal(10),
                status: 'DRAFT',
                lines: [makeLine()],
            }
            prisma.mmDisposal.findUnique.mockResolvedValue(draft)
            prisma.mmReturnsDisposalConfig.findUnique.mockResolvedValue({
                approvalAmountThreshold: new Decimal(10000),
                approvalQuantityThreshold: new Decimal(0),
            })
            prisma.mmDisposal.update.mockImplementation(({ data }: any) =>
                Promise.resolve({ ...draft, ...data }),
            )

            const pending = await disposalService.submit('dsp-hi')
            expect(pending.status).toBe('PENDING_APPROVAL')
            expect(postingService.postTransaction).not.toHaveBeenCalled()

            prisma.mmDisposal.findUnique.mockResolvedValue({
                ...draft,
                status: 'PENDING_APPROVAL',
            })
            await disposalService.reject('dsp-hi', {
                performedBy: 'admin',
                reason: 'No',
            })
            expect(postingService.postTransaction).not.toHaveBeenCalled()
        })
    })

    describe('reversal', () => {
        it('supplier return reverse → SUPPLIER_RETURN_REVERSED', async () => {
            const shippedDoc = {
                id: 'ret-3',
                returnNumber: 'RET-003',
                companyId: 'c1',
                status: 'SHIPPED',
                lines: [],
            }
            prisma.mmSupplierReturn.findUnique.mockResolvedValue(shippedDoc)
            prisma.mmInventoryTransaction.findMany.mockResolvedValue([{ id: 'txn-1' }])
            prisma.mmSupplierReturn.update.mockResolvedValue({
                ...shippedDoc,
                status: 'REVERSED',
            })

            await returnService.reverse('ret-3')
            expect(postingService.reverseTransaction).toHaveBeenCalled()
            expect(prisma.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'SUPPLIER_RETURN_REVERSED',
                    }),
                }),
            )
        })

        it('disposal reverse → DISPOSAL_REVERSED', async () => {
            const postedDoc = {
                id: 'dsp-2',
                disposalNumber: 'DSP-002',
                companyId: 'c1',
                status: 'POSTED',
                lines: [],
            }
            prisma.mmDisposal.findUnique.mockResolvedValue(postedDoc)
            prisma.mmInventoryTransaction.findMany.mockResolvedValue([{ id: 'txn-2' }])
            prisma.mmDisposal.update.mockResolvedValue({
                ...postedDoc,
                status: 'REVERSED',
            })

            await disposalService.reverse('dsp-2')
            expect(postingService.reverseTransaction).toHaveBeenCalled()
            expect(prisma.mmAccountingEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'DISPOSAL_REVERSED',
                    }),
                }),
            )
        })
    })

    describe('identify damage', () => {
        it('transfers UNRESTRICTED → BLOCKED', async () => {
            await damagedExpired.identifyDamage({
                companyId: 'c1',
                warehouseId: 'w1',
                materialId: 'mat-1',
                uomId: 'uom-1',
                quantity: 4,
                unitCost: 5,
            })
            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'TRANSFER_OUT',
                    stockStatus: 'UNRESTRICTED',
                    reasonCode: 'DAMAGE',
                }),
            )
            expect(postingService.postTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    movementType: 'TRANSFER_IN',
                    stockStatus: 'BLOCKED',
                }),
            )
        })
    })
})
