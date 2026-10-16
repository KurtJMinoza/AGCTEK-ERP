import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { CustomerReturnService } from '../mm/returns-disposal/customer-return.service'
import { ReturnRequestService } from './return-request.service'

const ORDER = {
    id: 'so-1',
    orderNumber: 'SO-100',
    status: 'DELIVERED',
    companyId: 'comp-1',
    customerId: 'cust-1',
    branchId: 'BR_AWIC_MNL',
    warehouseId: 'wh-1',
    invoices: [{ invoiceNumber: 'INV-20261013-0001' }],
    lines: [
        {
            id: 'ol-1',
            lineNumber: 1,
            materialId: 'm-1',
            variantId: 'v-1',
            quantity: new Decimal('5'),
            baseQuantity: new Decimal('5'),
            issuedQuantity: new Decimal('5'),
        },
        {
            id: 'ol-2',
            lineNumber: 2,
            materialId: 'm-2',
            variantId: 'v-2',
            quantity: new Decimal('3'),
            baseQuantity: new Decimal('3'),
            issuedQuantity: new Decimal('3'),
        },
    ],
}

const baseInput = {
    companyId: 'comp-1',
    salesOrderId: 'so-1',
    customerId: 'cust-1',
    reason: 'DAMAGED_ITEM',
    preferredResolution: 'REFUND',
    lines: [{ salesOrderLineId: 'ol-1', quantity: 2 }],
}

function setup(overrides: {
    orderStatus?: string
    orderOwner?: string
    priorReturns?: Array<{ salesOrderLineId: string; quantity: Decimal }>
    dispatchedPackages?: Array<{
        items: Array<{ materialId: string; expectedQty: Decimal }>
    }>
    orderFound?: boolean
} = {}) {
    const order = {
        ...ORDER,
        status: overrides.orderStatus ?? ORDER.status,
        customerId: overrides.orderOwner ?? ORDER.customerId,
        lines: ORDER.lines.map((l) => ({ ...l })),
    }
    type CreatedRequestRow = {
        id: string
        requestNumber: string
        status: string
        reason?: string | null
        conditionNote?: string | null
        photos?: unknown
        branchId?: string | null
        warehouseId?: string | null
        invoiceNumber?: string | null
        preferredResolution?: string | null
        refundStatus?: string
        lines: Array<Record<string, unknown>>
        salesOrder?: unknown
    }
    const created: CreatedRequestRow[] = []
    const requests: Array<{ id: string; status: string }> = []

    type CreateLineInput = {
        salesOrderLineId: string
        quantity: Decimal
        reason?: string
        conditionNote?: string
        disposition?: string
    }
    type CreateRequestData = {
        requestNumber: string
        status: string
        reason?: string
        conditionNote?: string
        photos?: unknown
        branchId?: string | null
        warehouseId?: string | null
        invoiceNumber?: string | null
        preferredResolution?: string | null
        refundStatus?: string
        lines: { create: CreateLineInput[] }
    }

    const prisma = {
        $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
        $queryRaw: async () => [{ id: 'locked' }],
        sdSalesOrder: {
            findUnique: async () => (overrides.orderFound === false ? null : order),
        },
        wmPackage: {
            findMany: async () => overrides.dispatchedPackages ?? [],
        },
        sdReturnRequest: {
            findFirst: async () => requests.find((r) => r.status === 'REQUESTED') ?? null,
            findUnique: async ({ where }: { where: { id: string } }) =>
                created.find((c) => c.id === where.id) ?? null,
            count: async () => 0,
            create: async ({
                data,
                include,
            }: {
                data: CreateRequestData
                include?: { salesOrder?: unknown }
            }) => {
                const row = {
                    id: 'rr-1',
                    requestNumber: data.requestNumber,
                    status: data.status,
                    reason: data.reason,
                    conditionNote: data.conditionNote,
                    photos: data.photos,
                    branchId: data.branchId,
                    warehouseId: data.warehouseId,
                    invoiceNumber: data.invoiceNumber,
                    preferredResolution: data.preferredResolution,
                    refundStatus: data.refundStatus,
                    lines: data.lines.create.map(
                        (l: CreateLineInput, index: number) => ({
                            id: `rrl-${index + 1}`,
                            salesOrderLineId: l.salesOrderLineId,
                            quantity: l.quantity,
                            reason: l.reason,
                            disposition: l.disposition,
                        }),
                    ),
                    salesOrder: include?.salesOrder ?? undefined,
                }
                created.push(row)
                requests.push(row)
                return row
            },
        },
        sdReturnRequestLine: {
            groupBy: async () =>
                (overrides.priorReturns ?? []).map((r) => ({
                    salesOrderLineId: r.salesOrderLineId,
                    _sum: { quantity: r.quantity },
                })),
        },
    }

    const service = new ReturnRequestService(
        prisma as unknown as PrismaService,
        {} as unknown as CustomerReturnService,
    )
    return { service, created, requests }
}

describe('ReturnRequestService — return eligibility', () => {
    it('only allows DELIVERED orders through the storefront path', async () => {
        const { service } = setup({ orderStatus: 'DELIVERED' })
        await expect(
            service.createForCustomer('cust-1', 'so-1', {
                lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
            }),
        ).resolves.toBeTruthy()
    })

    it('allows COMPLETED orders as well', async () => {
        const { service } = setup({ orderStatus: 'COMPLETED' })
        await expect(
            service.createForCustomer('cust-1', 'so-1', {
                lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
            }),
        ).resolves.toBeTruthy()
    })

    it.each(['CONFIRMED', 'CANCELLED', 'DRAFT'])(
        'rejects %s orders (pending/picking/cancelled are not returnable)',
        async (status) => {
            const { service } = setup({ orderStatus: status })
            await expect(
                service.createForCustomer('cust-1', 'so-1', {
                    lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
                }),
            ).rejects.toThrow(BadRequestException)
        },
    )

    it('allows SHIPPED orders (on-spot POD reject during delivery)', async () => {
        const { service } = setup({ orderStatus: 'SHIPPED' })
        await expect(
            service.createForCustomer('cust-1', 'so-1', {
                lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
            }),
        ).resolves.toBeTruthy()
    })

    it('rejects a request when the order does not belong to the customer', async () => {
        const { service } = setup({ orderOwner: 'other-customer' })
        await expect(
            service.createForCustomer('cust-1', 'so-1', {
                lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
            }),
        ).rejects.toThrow(NotFoundException)
    })

    it('rejects a quantity that exceeds the delivered quantity', async () => {
        const { service } = setup({ orderStatus: 'DELIVERED' })
        await expect(
            service.create({
                ...baseInput,
                lines: [{ salesOrderLineId: 'ol-1', quantity: 6 }],
            }),
        ).rejects.toThrow(ConflictException)
    })

    it('rejects a request when nothing was delivered for the line', async () => {
        const order = { ...ORDER, lines: [{ ...ORDER.lines[0], issuedQuantity: new Decimal('0') }] }
        const prisma = {
            $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
            $queryRaw: async () => [{ id: 'locked' }],
            sdSalesOrder: { findUnique: async () => order },
            wmPackage: { findMany: async () => [] },
            sdReturnRequest: {
                findFirst: async () => null,
                findUnique: async () => null,
                count: async () => 0,
                create: async () => ({}),
            },
            sdReturnRequestLine: { groupBy: async () => [] },
        }
        const service = new ReturnRequestService(
            prisma as unknown as PrismaService,
            {} as unknown as CustomerReturnService,
        )
        await expect(
            service.create({
                ...baseInput,
                lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
            }),
        ).rejects.toThrow(
            expect.objectContaining({ message: expect.stringContaining('no delivered quantity') }),
        )
    })

    it('prevents duplicate over-returning by subtracting prior non-terminal requests', async () => {
        const { service } = setup({
            orderStatus: 'DELIVERED',
            priorReturns: [{ salesOrderLineId: 'ol-1', quantity: new Decimal('4') }],
        })
        await expect(
            service.create({
                ...baseInput,
                lines: [{ salesOrderLineId: 'ol-1', quantity: 2 }],
            }),
        ).rejects.toThrow(ConflictException)
    })

    it('allows a request that stays within the remaining returnable quantity', async () => {
        const { service } = setup({
            orderStatus: 'DELIVERED',
            priorReturns: [{ salesOrderLineId: 'ol-1', quantity: new Decimal('3') }],
        })
        await expect(
            service.create({
                ...baseInput,
                lines: [{ salesOrderLineId: 'ol-1', quantity: 2 }],
            }),
        ).resolves.toBeTruthy()
    })

    it('includes dispatched package quantities in the delivered total', async () => {
        // issuedQuantity is 0 on the mirror (package-sourced GI), so the
        // delivered total must come from the package projection.
        const prisma = {
            $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
            $queryRaw: async () => [{ id: 'locked' }],
            sdSalesOrder: {
                findUnique: async () => ({
                    ...ORDER,
                    lines: [{ ...ORDER.lines[0], issuedQuantity: new Decimal('0') }],
                }),
            },
            wmPackage: {
                findMany: async () => [
                    { items: [{ materialId: 'm-1', expectedQty: new Decimal('5') }] },
                ],
            },
            sdReturnRequest: {
                findFirst: async () => null,
                findUnique: async () => null,
                count: async () => 0,
                create: async () => ({}),
            },
            sdReturnRequestLine: { groupBy: async () => [] },
        }
        const service = new ReturnRequestService(
            prisma as unknown as PrismaService,
            {} as unknown as CustomerReturnService,
        )
        await expect(
            service.create({
                ...baseInput,
                lines: [{ salesOrderLineId: 'ol-1', quantity: 2 }],
            }),
        ).resolves.toBeTruthy()
    })

    it('persists the Phase 3 record fields on creation', async () => {
        const { service, created } = setup({ orderStatus: 'DELIVERED' })
        await service.create({
            ...baseInput,
            preferredResolution: 'STORE_CREDIT',
            lines: [{ salesOrderLineId: 'ol-1', quantity: 2, reason: 'DAMAGED_ITEM' }],
        })
        expect(created[0]).toMatchObject({
            branchId: 'BR_AWIC_MNL',
            warehouseId: 'wh-1',
            invoiceNumber: 'INV-20261013-0001',
            preferredResolution: 'STORE_CREDIT',
            refundStatus: 'NONE',
        })
        expect(created[0].lines[0]).toMatchObject({ disposition: 'QUALITY_HOLD' })
    })

    it('seeds dispositions by reason: missing → refund-only, wrong item → restock', async () => {
        const { service, created } = setup({ orderStatus: 'DELIVERED' })
        await service.create({
            ...baseInput,
            reason: 'MISSING_ITEM',
            lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
        })
        expect(created[0].lines[0]).toMatchObject({ disposition: 'REFUND_ONLY' })

        const { service: svc2, created: created2 } = setup({ orderStatus: 'DELIVERED' })
        await svc2.create({
            ...baseInput,
            reason: 'WRONG_ITEM',
            lines: [{ salesOrderLineId: 'ol-1', quantity: 1 }],
        })
        expect(created2[0].lines[0]).toMatchObject({ disposition: 'RESTOCK' })
    })

    it('rejects an unknown preferred resolution', async () => {
        const { service } = setup({ orderStatus: 'DELIVERED' })
        await expect(
            service.create({ ...baseInput, preferredResolution: 'DISCOUNT' }),
        ).rejects.toThrow(BadRequestException)
    })
})

describe('ReturnRequestService — Phase 4 admin actions', () => {
    type Phase4Row = {
        id: string
        companyId: string
        salesOrderId: string
        requestNumber: string
        status: string
        reason: string | null
        preferredResolution: string | null
        refundStatus: string
        mmCustomerReturnId: string | null
        rejectReason?: string | null
        approvedAt?: Date | null
        refundAmount?: Decimal | null
        closedAt?: Date | null
        lines: Array<{
                id: string
                salesOrderLineId: string
                materialId: string
                quantity: Decimal
                disposition: string | null
            }>
        salesOrder: {
            id: string
            orderNumber: string
            totalAmount: Decimal
            status: string
            currency: string
            isDemoPayment: boolean
            invoices: Array<{ id: string; invoiceNumber: string }>
            payments: Array<{
                id: string
                status: string
                amount: Decimal
                paymentMethod: string
            }>
            lines: Array<{
                id: string
                quantity: Decimal
                unitPrice: Decimal | null
                lineTotal: Decimal | null
            }>
        }
    }

    const makeRow = (overrides: Partial<Phase4Row> = {}): Phase4Row => {
        const row: Phase4Row = {
            id: 'rr-1',
            companyId: 'comp-1',
            salesOrderId: 'so-1',
            requestNumber: 'RET-20261013-0001',
            status: 'REQUESTED',
            reason: 'DAMAGED_ITEM',
            preferredResolution: 'REFUND',
            refundStatus: 'NONE',
            mmCustomerReturnId: 'mm-1',
            lines: [
                {
                    id: 'rrl-1',
                    salesOrderLineId: 'ol-1',
                    materialId: 'm-1',
                    quantity: new Decimal('2'),
                    disposition: 'QUALITY_HOLD',
                },
            ],
            salesOrder: {
                id: 'so-1',
                orderNumber: 'SO-100',
                totalAmount: new Decimal('500'),
                status: 'DELIVERED',
                currency: 'PHP',
                isDemoPayment: true,
                invoices: [{ id: 'inv-1', invoiceNumber: 'INV-1' }],
                payments: [
                    {
                        id: 'pay-1',
                        status: 'Paid',
                        amount: new Decimal('500'),
                        paymentMethod: 'COD',
                    },
                ],
                lines: [
                    {
                        id: 'ol-1',
                        quantity: new Decimal('5'),
                        unitPrice: new Decimal('100'),
                        lineTotal: new Decimal('500'),
                    },
                ],
            },
            ...overrides,
        }
        return row
    }

    function phase4Setup(overrides: Partial<Phase4Row> = {}) {
        const row = makeRow(overrides)
        const paymentCas: Array<{ status: string }> = []
        const mmCalls: Array<{ disposition?: string }> = []
        const refunds = {
            rows: [] as Array<Record<string, unknown>>,
        }
        const memos = {
            rows: [] as Array<Record<string, unknown>>,
        }
        const mm = {
            findOne: async () => ({
                lines: [
                    {
                        id: 'mm-line-1',
                        materialId: 'm-1',
                        quantity: new Decimal('2'),
                        disposition: 'PENDING',
                        dispositionStatus: 'PENDING',
                    },
                ],
            }),
            startIntake: async () => {
                mmCalls.push({})
            },
            inspect: async () => {
                mmCalls.push({})
            },
            setDisposition: async (_lineId: string, dto: { disposition: string }) => {
                mmCalls.push({ disposition: dto.disposition })
            },
            submit: async () => ({ status: 'APPROVED' }),
            complete: async () => ({}),
        }
        const prisma = {
            $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
            sdReturnRequest: {
                findFirst: async () => row,
                findUnique: async () => row,
                update: async ({ data }: { data: Record<string, unknown> }) =>
                    Object.assign(row, data),
                updateMany: async ({
                    where,
                    data,
                }: {
                    where: {
                        id: string
                        status?: { in?: string[] } | string
                    }
                    data: Record<string, unknown>
                }) => {
                    if (where.id !== row.id) return { count: 0 }
                    const current = row.status as string
                    const allowed = Array.isArray(where.status)
                        ? where.status
                        : (where.status as { in?: string[] } | undefined)?.in ?? []
                    if (allowed.length && !allowed.includes(current)) {
                        return { count: 0 }
                    }
                    Object.assign(row, data)
                    return { count: 1 }
                },
            },
            sdSalesOrderPayment: {
                updateMany: async ({
                    where,
                    data,
                }: {
                    where: { id: string; status?: string }
                    data: { status: string }
                }) => {
                    const pay = row.salesOrder.payments.find(
                        (p) => p.id === where.id,
                    )
                    if (!pay || (where.status && pay.status !== where.status)) {
                        return { count: 0 }
                    }
                    pay.status = data.status
                    paymentCas.push({ status: data.status })
                    return { count: 1 }
                },
            },
            sdSalesOrder: {
                update: async () => ({}),
                findUnique: async () => ({ warehouseId: 'wh-1' }),
            },
            sdSalesInvoice: { updateMany: async () => ({ count: 1 }) },
            sdRefund: {
                findUnique: async () => refunds.rows[0] ?? null,
                count: async () => 0,
                create: async ({ data }: { data: Record<string, unknown> }) => {
                    const record = {
                        id: 'ref-1',
                        status: 'PENDING_REFUND',
                        ...data,
                    }
                    refunds.rows.push(record)
                    return record
                },
                update: async ({
                    data,
                }: {
                    data: Record<string, unknown>
                }) => Object.assign(refunds.rows[0], data),
                updateMany: async ({
                    where,
                    data,
                }: {
                    where: { id: string; status?: string }
                    data: Record<string, unknown>
                }) => {
                    const record = refunds.rows[0]
                    if (
                        !record ||
                        (where.status && record.status !== where.status)
                    ) {
                        return { count: 0 }
                    }
                    Object.assign(record, data)
                    return { count: 1 }
                },
            },
            sdCreditMemo: {
                findUnique: async () => memos.rows[0] ?? null,
                count: async () => 0,
                create: async ({
                    data,
                }: {
                    data: Record<string, unknown>
                }) => {
                    const memo = { id: 'cm-1', ...data }
                    memos.rows.push(memo)
                    return memo
                },
            },
            mmCustomerReturn: { create: async () => ({ id: 'mm-2' }) },
            mmMaterial: {
                findUnique: async () => ({ baseUomId: 'uom-1' }),
            },
        }
        const service = new ReturnRequestService(
            prisma as unknown as PrismaService,
            mm as unknown as CustomerReturnService,
        )
        return { service, row, paymentCas, mmCalls, refunds, memos }
    }

    it('approve moves REQUESTED → AWAITING_RETURN and creates the MM intake', async () => {
        const { service, row } = phase4Setup({ mmCustomerReturnId: null })
        const updated = await service.approve('rr-1', 'comp-1', 'user-1')
        expect(updated.status).toBe('AWAITING_RETURN')
        expect(updated.approvedAt).toBeTruthy()
        expect(row.mmCustomerReturnId).toBe('mm-2')
    })

    it('reject moves REQUESTED → REJECTED with a reason', async () => {
        const { service, row } = phase4Setup()
        const updated = await service.reject('rr-1', 'comp-1', {
            reason: 'Undocumented damage',
        })
        expect(updated.status).toBe('REJECTED')
        expect(row.rejectReason).toBe('Undocumented damage')
    })

    it('receive stamps RECEIVED and opens the MM intake', async () => {
        const { service, mmCalls } = phase4Setup({ status: 'AWAITING_RETURN' })
        const updated = await service.receive('rr-1', 'comp-1', 'wh-user')
        expect(updated.status).toBe('RECEIVED')
        expect(mmCalls.length).toBe(1)
    })

    it('mark RESTOCK drives MM disposition → submit → complete and lands RESTOCKED', async () => {
        const { service, mmCalls } = phase4Setup({
            status: 'UNDER_INSPECTION',
        })
        const updated = await service.mark('rr-1', 'comp-1', 'RESTOCK', 'inspector')
        expect(updated.status).toBe('RESTOCKED')
        expect(mmCalls).toEqual([{ disposition: 'RESTOCK' }])
    })

    it('mark BLOCK lands MARKED_DAMAGED (never auto-restock)', async () => {
        const { service } = phase4Setup({ status: 'UNDER_INSPECTION' })
        const updated = await service.mark('rr-1', 'comp-1', 'BLOCK', 'inspector')
        expect(updated.status).toBe('MARKED_DAMAGED')
    })

    it('refund requires a Paid payment (COD unpaid → no refund payable)', async () => {
        const { service } = phase4Setup({
            status: 'MARKED_DAMAGED',
            salesOrder: {
                ...makeRow().salesOrder,
                payments: [
                    {
                        id: 'pay-1',
                        status: 'Pending Collection',
                        amount: new Decimal('500'),
                        paymentMethod: 'COD',
                    },
                ],
            },
        })
        await expect(
            service.createRefund('rr-1', 'comp-1', {}),
        ).rejects.toThrow(BadRequestException)
    })

    it('COD unpaid → mark not required (no refund record created)', async () => {
        const { service, refunds, paymentCas } = phase4Setup({
            status: 'MARKED_DAMAGED',
            salesOrder: {
                ...makeRow().salesOrder,
                payments: [
                    {
                        id: 'pay-1',
                        status: 'Pending Collection',
                        amount: new Decimal('500'),
                        paymentMethod: 'COD',
                    },
                ],
            },
        })
        const updated = await service.markRefundNotRequired(
            'rr-1',
            'comp-1',
            'cashier',
        )
        expect(updated.refundStatus).toBe('NOT_REQUIRED')
        expect(refunds.rows).toHaveLength(0)
        expect(paymentCas.length).toBe(0)
    })

    it('Phase 7: create refund → approve → pay (DEMO ONLY) with credit memo', async () => {
        const { service, row, paymentCas, refunds, memos } = phase4Setup({
            status: 'MARKED_DAMAGED',
        })
        const created = await service.createRefund('rr-1', 'comp-1', {
            refundMethod: 'BANK_TRANSFER',
        })
        expect(created.refundStatus).toBe('PENDING_REFUND')
        expect(Number(created.refundAmount)).toBe(200) // 2 × ₱100
        expect(refunds.rows[0]).toMatchObject({
            status: 'PENDING_REFUND',
            refundMethod: 'BANK_TRANSFER',
            amount: new Decimal('200'),
            isDemo: false, // COD paid → demo false, refund method still chosen
        })
        expect(paymentCas).toHaveLength(0) // no payment flip at create

        const approved = await service.approveRefund('rr-1', 'comp-1', 'mgmt')
        expect(approved.refundStatus).toBe('APPROVED')
        expect(refunds.rows[0].status).toBe('APPROVED')
        expect(memos.rows[0]).toMatchObject({
            salesInvoiceId: 'inv-1',
            amount: new Decimal('200'),
            status: 'ISSUED',
        })

        const paid = await service.payRefund('rr-1', 'comp-1', 'cashier')
        expect(paid.status).toBe('REFUNDED')
        expect(paid.refundStatus).toBe('PAID')
        expect(paid.refundAmount).toEqual(new Decimal('200'))
        expect(paymentCas).toEqual([{ status: 'Refunded' }])
        expect(row.salesOrder.payments[0].status).toBe('Refunded')
    })

    it('refund cannot be processed twice (idempotent create, paid once)', async () => {
        const { service, paymentCas } = phase4Setup({
            status: 'MARKED_DAMAGED',
        })
        await service.createRefund('rr-1', 'comp-1', {})
        await service.createRefund('rr-1', 'comp-1', {}) // idempotent
        await service.approveRefund('rr-1', 'comp-1', 'mgmt')
        await service.payRefund('rr-1', 'comp-1', 'cashier')
        await expect(
            service.payRefund('rr-1', 'comp-1', 'cashier'),
        ).rejects.toThrow(ConflictException)
        expect(paymentCas).toEqual([{ status: 'Refunded' }])
    })

    it('close requires the refund decision for REFUND resolution (Phase 10)', async () => {
        const { service } = phase4Setup({ status: 'RESTOCKED' })
        await expect(service.close('rr-1', 'comp-1')).rejects.toThrow(
            ConflictException,
        )
        const { service: svc2 } = phase4Setup({
            status: 'REFUNDED',
            refundStatus: 'PAID',
        })
        const closed = await svc2.close('rr-1', 'comp-1', 'user-1')
        expect(closed.status).toBe('CLOSED')
    })

    it('Phase 11 — test case 1: damaged item full flow → damaged stock + refund paid', async () => {
        const { service, row, paymentCas, mmCalls, memos } = phase4Setup({
            status: 'UNDER_INSPECTION',
        })
        // inspection decision: damaged (BLOCK)
        const marked = await service.mark('rr-1', 'comp-1', 'BLOCK', 'inspector')
        expect(marked.status).toBe('MARKED_DAMAGED')
        expect(mmCalls.some((c) => c.disposition === 'BLOCK')).toBe(true)
        // refund
        await service.createRefund('rr-1', 'comp-1', { refundMethod: 'CASH_REFUND' })
        await service.approveRefund('rr-1', 'comp-1', 'mgmt')
        await service.payRefund('rr-1', 'comp-1', 'cashier')
        expect(row.refundStatus).toBe('PAID')
        expect(paymentCas).toEqual([{ status: 'Refunded' }])
        expect(memos.rows[0].amount).toEqual(new Decimal('200'))
    })

    it('Phase 11 — test case 4: good condition → restock (available stock path)', async () => {
        const { service, mmCalls } = phase4Setup({
            status: 'UNDER_INSPECTION',
        })
        const marked = await service.mark('rr-1', 'comp-1', 'RESTOCK', 'inspector')
        expect(marked.status).toBe('RESTOCKED')
        expect(mmCalls.some((c) => c.disposition === 'RESTOCK')).toBe(true)
    })
})