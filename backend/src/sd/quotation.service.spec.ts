import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import { QuotationService } from './quotation.service'

type Row = Record<string, any>

const NOW = new Date('2026-10-06T10:00:00Z')

const product = (id: string, overrides: Row = {}) => ({
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    price: new Decimal('1250.50'),
    divisionId: 'DIV_A',
    isActive: true,
    ...overrides,
})

const customer = (overrides: Row = {}) => ({
    id: 'cust-1',
    customerNumber: 'CUST-000001',
    companyName: 'BuildRight',
    currency: 'PHP',
    status: 'ACTIVE',
    ...overrides,
})

const uniqueViolation = (modelName: string, target: string[]) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { modelName, target },
    })

const ACTIVE = ['DRAFT', 'SENT', 'ACCEPTED']

function setup() {
    const rows: Row[] = []
    const state = {
        products: new Map<string, Row>([
            ['p1', product('p1')],
            ['p2', product('p2', { price: new Decimal('99.99') })],
            ['p-off', product('p-off', { isActive: false })],
            ['p-b', product('p-b', { divisionId: 'DIV_B' })],
        ]),
        customer: customer() as Row | null,
        rows,
        /** The most recently created quotation. */
        get quotation(): Row | null {
            return rows[rows.length - 1] ?? null
        },
        byId: (id: string) => rows.find((r) => r.id === id),
        /** Overrides the active-quotation lookup when set. */
        active: null as Row | null,
    }
    let lineSeq = 0
    const toLine = (data: Row) => ({ id: `line-${++lineSeq}`, ...data })
    const copy = (row: Row | undefined) => (row ? { ...row, lines: [...row.lines] } : null)
    const rowOfLine = (lineId: string) => rows.find((r) => r.lines.some((l: Row) => l.id === lineId))!

    const prisma = {
        $transaction: jest.fn((fn: (tx: unknown) => unknown): unknown => fn(prisma)),
        $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join('?')
            if (sql.includes('nextval')) return Promise.resolve([{ value: 42n }])
            if (sql.includes('FOR UPDATE')) {
                return Promise.resolve(state.byId(values[0] as string) ? [{ id: values[0] }] : [])
            }
            throw new Error(`unexpected SQL ${sql}`)
        }),
        sdCustomer: { findUnique: jest.fn(() => Promise.resolve(state.customer)) },
        sdSalesOrder: { findUnique: jest.fn().mockResolvedValue(null) },
        sdProduct: {
            findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
                Promise.resolve(where.id.in.flatMap((id) => (state.products.has(id) ? [state.products.get(id)] : []))),
            ),
        },
        sdQuotation: {
            findUnique: jest.fn(({ where }: { where: Row }) =>
                Promise.resolve(
                    copy(
                        where.id !== undefined
                            ? state.byId(where.id)
                            : rows.find((r) => r.previousRevisionId === where.previousRevisionId),
                    ),
                ),
            ),
            findFirst: jest.fn(({ where }: { where: Row }) =>
                Promise.resolve(
                    state.active ??
                        rows.find((r) => r.crmOpportunityId === where.crmOpportunityId && ACTIVE.includes(r.status)) ??
                        null,
                ),
            ),
            findMany: jest.fn(({ where }: { where: Row }) =>
                Promise.resolve(
                    [...rows]
                        .reverse()
                        .filter((r) => !where.crmOpportunityId || r.crmOpportunityId === where.crmOpportunityId)
                        .filter((r) => !where.status || r.status === where.status),
                ),
            ),
            create: jest.fn(({ data }: { data: Row }) => {
                const { lines, ...rest } = data
                const row = { id: `q-${rows.length + 1}`, validUntil: null, ...rest, lines: lines.create.map(toLine) }
                rows.push(row)
                return Promise.resolve(row)
            }),
            update: jest.fn(({ where, data }: { where: { id: string }; data: Row }) => {
                const row = state.byId(where.id)!
                Object.assign(row, data)
                return Promise.resolve(row)
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        sdQuotationLine: {
            deleteMany: jest.fn(({ where }: { where: { quotationId: string } }) => {
                state.byId(where.quotationId)!.lines = []
                return Promise.resolve({ count: 0 })
            }),
            createMany: jest.fn(({ data }: { data: Row[] }) => {
                const row = state.byId(data[0].quotationId)!
                row.lines = data.map(({ quotationId: _q, ...line }) => toLine(line))
                return Promise.resolve({ count: data.length })
            }),
            update: jest.fn(({ where, data }: { where: { id: string }; data: Row }) => {
                const line = rowOfLine(where.id).lines.find((l: Row) => l.id === where.id)
                Object.assign(line, data)
                return Promise.resolve(line)
            }),
        },
    }
    const service = new QuotationService(prisma as unknown as PrismaService)
    return { prisma, state, service }
}

const input = {
    crmOpportunityId: 'opp-1',
    customerId: 'cust-1',
    lines: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 3 },
    ],
    notes: '  Rush  ',
    createdBy: 'user-1',
}

/** A DRAFT quotation in state, created through the service. */
async function draft(ctx: ReturnType<typeof setup>) {
    await ctx.service.create(input)
    jest.clearAllMocks()
    return ctx.state.quotation!
}

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
})
afterEach(() => jest.useRealTimers())

describe('QuotationService.create', () => {
    it('creates revision 1 as a DRAFT priced from the catalog with a sequence number', async () => {
        const { prisma, service } = setup()

        const quote = await service.create(input)

        expect(prisma.sdQuotation.updateMany).toHaveBeenCalledWith({
            where: { crmOpportunityId: 'opp-1', status: { in: ['SENT', 'ACCEPTED'] }, validUntil: { lt: NOW } },
            data: { status: 'EXPIRED' },
        })
        expect(quote).toMatchObject({
            quotationNumber: 'Q-000042',
            revision: 1,
            status: 'DRAFT',
            effectiveStatus: 'DRAFT',
            crmOpportunityId: 'opp-1',
            customerId: 'cust-1',
            divisionId: 'DIV_A',
            currency: 'PHP',
            notes: 'Rush',
            createdBy: 'user-1',
            validUntil: null,
        })
        expect(quote.subtotal.toFixed(2)).toBe('2800.97')
        expect(quote.totalAmount.toFixed(2)).toBe('2800.97')
        expect(
            quote.lines.map((l: Row) => [l.lineNumber, l.sku, l.quantity.toString(), l.unitPrice.toFixed(2), l.lineTotal.toFixed(2)]),
        ).toEqual([
            [1, 'SKU-p1', '2', '1250.50', '2501.00'],
            [2, 'SKU-p2', '3', '99.99', '299.97'],
        ])
        expect(quote.lines[0]).not.toHaveProperty('inactive')
    })

    it('expires an overdue quotation before checking for an active one', async () => {
        const { prisma, service } = setup()
        const order: string[] = []
        prisma.sdQuotation.updateMany.mockImplementation(() => (order.push('expire'), Promise.resolve({ count: 1 })))
        prisma.sdQuotation.findFirst.mockImplementation(() => (order.push('active?'), Promise.resolve(null)))

        await service.create(input)

        expect(order).toEqual(['expire', 'active?'])
    })

    it('refuses a second active quotation with a readable 409 and takes no number', async () => {
        const { prisma, state, service } = setup()
        state.active = { id: 'q-0', quotationNumber: 'Q-000007', revision: 2, status: 'SENT' }

        const attempt = service.create(input)

        await expect(attempt).rejects.toThrow(ConflictException)
        await expect(attempt).rejects.toMatchObject({
            response: {
                code: 'QUOTATION_ACTIVE_EXISTS',
                quotationId: 'q-0',
                message: expect.stringContaining('Q-000007 rev 2, SENT'),
            },
        })
        expect(prisma.$queryRaw).not.toHaveBeenCalled()
        expect(prisma.sdQuotation.create).not.toHaveBeenCalled()
    })

    it('maps a lost race on the partial unique index to the same 409', async () => {
        const { prisma, state, service } = setup()
        prisma.sdQuotation.create.mockRejectedValueOnce(uniqueViolation('SdQuotation', ['crmOpportunityId']))
        prisma.sdQuotation.findFirst
            .mockResolvedValueOnce(null)
            .mockImplementationOnce(() => Promise.resolve(state.active))
        state.active = { id: 'q-9', quotationNumber: 'Q-000041', revision: 1, status: 'DRAFT' }

        await expect(service.create(input)).rejects.toMatchObject({
            response: { code: 'QUOTATION_ACTIVE_EXISTS', quotationId: 'q-9' },
        })
    })

    it('does not mistake other unique violations for the active-quotation index', async () => {
        const { prisma, service } = setup()
        const other = uniqueViolation('SdQuotation', ['quotationNumber', 'revision'])
        prisma.sdQuotation.create.mockRejectedValueOnce(other)

        await expect(service.create(input)).rejects.toBe(other)
        expect(service.isActiveQuotationConflict(uniqueViolation('SdSalesOrder', ['crmOpportunityId']))).toBe(false)
        expect(
            service.isActiveQuotationConflict(
                uniqueViolation('SdQuotation', ['sd_quotations_one_active_per_opportunity']),
            ),
        ).toBe(true)
    })

    it('validates lines before touching the database', async () => {
        const { prisma, service } = setup()
        const bad = [
            [[], 'At least one line is required'],
            [[{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }], 'Each product may appear on only one line'],
            [[{ productId: 'p1', quantity: 0 }], 'Line quantities must be positive'],
            [[{ productId: 'p1', quantity: 1.2345 }], 'at most 3 decimal places'],
        ] as const
        for (const [lines, message] of bad) {
            await expect(service.create({ ...input, lines: [...lines] })).rejects.toThrow(message)
        }
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects unknown, inactive and cross-division products', async () => {
        const { service } = setup()
        await expect(service.create({ ...input, lines: [{ productId: 'nope', quantity: 1 }] })).rejects.toThrow(
            'Unknown product(s): nope',
        )
        await expect(service.create({ ...input, lines: [{ productId: 'p-off', quantity: 1 }] })).rejects.toThrow(
            'Inactive product(s): SKU-p-off',
        )
        await expect(
            service.create({ ...input, lines: [{ productId: 'p1', quantity: 1 }, { productId: 'p-b', quantity: 1 }] }),
        ).rejects.toThrow('All lines must belong to one sales division')
    })

    it('requires an existing, active customer billed in PHP', async () => {
        const ctx = setup()
        ctx.state.customer = null
        await expect(ctx.service.create(input)).rejects.toThrow(NotFoundException)
        ctx.state.customer = customer({ status: 'BLOCKED' })
        await expect(ctx.service.create(input)).rejects.toThrow('CUST-000001 is BLOCKED')
        ctx.state.customer = customer({ currency: 'USD' })
        await expect(ctx.service.create(input)).rejects.toThrow(/billed in USD.*does not convert/)
    })
})

describe('QuotationService.updateDraft', () => {
    it('re-prices every line from the current catalog even when only notes change', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.products.get('p1')!.price = new Decimal('1300.00')

        const quote = await ctx.service.updateDraft('q-1', { notes: '' }, 'user-2')

        expect(ctx.prisma.$queryRaw).toHaveBeenCalledTimes(1) // FOR UPDATE lock
        expect(quote.notes).toBeNull()
        expect(quote.updatedBy).toBe('user-2')
        expect(quote.lines.map((l: Row) => l.unitPrice.toFixed(2))).toEqual(['1300.00', '99.99'])
        expect(quote.subtotal.toFixed(2)).toBe('2899.97')
        expect(quote.status).toBe('DRAFT')
    })

    it('replaces lines when given', async () => {
        const ctx = setup()
        await draft(ctx)

        const quote = await ctx.service.updateDraft('q-1', { lines: [{ productId: 'p2', quantity: 10 }] }, 'user-1')

        expect(quote.lines).toHaveLength(1)
        expect(quote.lines[0]).toMatchObject({ lineNumber: 1, sku: 'SKU-p2' })
        expect(quote.totalAmount.toFixed(2)).toBe('999.90')
        expect(quote.notes).toBe('Rush')
    })

    it('only edits DRAFT quotations', async () => {
        const ctx = setup()
        const q = await draft(ctx)
        q.status = 'SENT'

        await expect(ctx.service.updateDraft('q-1', { notes: 'x' }, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_INVALID_TRANSITION', message: 'Cannot edit a SENT quotation' },
        })
        expect(ctx.prisma.sdQuotation.update).not.toHaveBeenCalled()
    })

    it('blocks a draft whose product became inactive until the line is replaced', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.products.get('p2')!.isActive = false

        await expect(ctx.service.updateDraft('q-1', { notes: 'x' }, 'user-1')).rejects.toThrow('Inactive product(s): SKU-p2')
        await expect(
            ctx.service.updateDraft('q-1', { lines: [{ productId: 'p1', quantity: 2 }] }, 'user-1'),
        ).resolves.toMatchObject({ status: 'DRAFT' })
    })

    it('404s for unknown quotations', async () => {
        const { service } = setup()
        await expect(service.updateDraft('nope', {}, 'user-1')).rejects.toThrow(NotFoundException)
    })
})

describe('QuotationService.send', () => {
    it('freezes current catalog prices and sends with a 30-day validity by default', async () => {
        const ctx = setup()
        await draft(ctx)

        const quote = await ctx.service.send('q-1', {}, 'user-2')

        expect(quote).toMatchObject({ status: 'SENT', sentBy: 'user-2', sentAt: NOW, updatedBy: 'user-2' })
        expect(quote.validUntil?.toISOString()).toBe('2026-11-05T15:59:59.999Z')
        expect(quote.subtotal.toFixed(2)).toBe('2800.97')
        expect(ctx.prisma.sdQuotationLine.update).not.toHaveBeenCalled()

        // The catalog changing afterwards does not touch the sent quotation.
        ctx.state.products.get('p1')!.price = new Decimal('1.00')
        await expect(ctx.service.findOne('q-1')).resolves.toMatchObject({ status: 'SENT' })
        expect(ctx.state.quotation!.lines[0].unitPrice.toFixed(2)).toBe('1250.50')
    })

    it('saves changed catalog prices on the draft and asks for review instead of sending', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.products.get('p2')!.price = new Decimal('120.00')

        const attempt = ctx.service.send('q-1', {}, 'user-2')

        await expect(attempt).rejects.toThrow(ConflictException)
        await expect(attempt).rejects.toMatchObject({
            response: {
                code: 'QUOTATION_PRICES_CHANGED',
                changedLines: [{ lineNumber: 2, sku: 'SKU-p2', previousUnitPrice: '99.99', unitPrice: '120.00' }],
            },
        })
        const q = ctx.state.quotation!
        expect(q.status).toBe('DRAFT')
        expect(q.sentAt).toBeUndefined()
        expect(q.lines[1].unitPrice.toFixed(2)).toBe('120.00')
        expect(q.lines[1].lineTotal.toFixed(2)).toBe('360.00')
        expect(q.totalAmount.toFixed(2)).toBe('2861.00')

        // Reviewed: the next send goes through at the saved prices.
        await expect(ctx.service.send('q-1', {}, 'user-2')).resolves.toMatchObject({ status: 'SENT' })
    })

    it('refreshes a renamed product snapshot without blocking the send', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.products.get('p1')!.name = 'Product p1 (2026)'

        const quote = await ctx.service.send('q-1', {}, 'user-2')

        expect(quote.status).toBe('SENT')
        expect(quote.lines[0].description).toBe('Product p1 (2026)')
    })

    it('blocks inactive or deleted products and lists the lines to remove', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.products.get('p1')!.isActive = false
        ctx.state.products.delete('p2')

        await expect(ctx.service.send('q-1', {}, 'user-2')).rejects.toMatchObject({
            response: {
                code: 'QUOTATION_UNAVAILABLE_PRODUCTS',
                lines: [
                    { lineNumber: 2, sku: 'SKU-p2', reason: 'NOT_FOUND' },
                    { lineNumber: 1, sku: 'SKU-p1', reason: 'INACTIVE' },
                ],
            },
        })
        expect(ctx.state.quotation!.status).toBe('DRAFT')
    })

    it('re-checks the customer at send time', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.customer = customer({ status: 'BLOCKED' })

        await expect(ctx.service.send('q-1', {}, 'user-2')).rejects.toThrow('CUST-000001 is BLOCKED')
        expect(ctx.state.quotation!.status).toBe('DRAFT')
    })

    it('uses the requested last valid day and rejects past dates before any write', async () => {
        const ctx = setup()
        await draft(ctx)

        await expect(ctx.service.send('q-1', { validUntil: '2026-10-01' }, 'user-2')).rejects.toThrow(BadRequestException)
        expect(ctx.prisma.$transaction).not.toHaveBeenCalled()

        const quote = await ctx.service.send('q-1', { validUntil: '2026-12-15' }, 'user-2')
        expect(quote.validUntil?.toISOString()).toBe('2026-12-15T15:59:59.999Z')
    })

    it('only sends DRAFT quotations', async () => {
        const ctx = setup()
        const q = await draft(ctx)
        q.status = 'SENT'

        await expect(ctx.service.send('q-1', {}, 'user-2')).rejects.toThrow('Cannot send a SENT quotation')
    })
})

describe('QuotationService reads', () => {
    it('shows an overdue SENT quotation as expired without writing', async () => {
        const ctx = setup()
        await draft(ctx)
        await ctx.service.send('q-1', { validUntil: '2026-10-10' }, 'user-2')
        jest.clearAllMocks()
        jest.setSystemTime(new Date('2026-10-10T16:00:00Z')) // Oct 11, 00:00 Manila

        const [listed] = await ctx.service.listForOpportunity('opp-1')
        const one = await ctx.service.findOne('q-1')

        for (const quote of [listed, one]) {
            expect(quote).toMatchObject({ status: 'SENT', effectiveStatus: 'EXPIRED', isExpired: true })
        }
        expect(ctx.prisma.sdQuotation.updateMany).not.toHaveBeenCalled()
        expect(ctx.prisma.sdQuotation.update).not.toHaveBeenCalled()
    })

    it('lists DRAFT line issues for products that became unavailable', async () => {
        const ctx = setup()
        await draft(ctx)
        ctx.state.products.get('p1')!.isActive = false
        ctx.state.products.delete('p2')

        await expect(ctx.service.findOne('q-1')).resolves.toMatchObject({
            lineIssues: [
                { lineNumber: 1, sku: 'SKU-p1', reason: 'INACTIVE' },
                { lineNumber: 2, sku: 'SKU-p2', reason: 'NOT_FOUND' },
            ],
        })
    })
})

/** A SENT quotation (q-1) at the catalog prices of `input`. */
async function sent(ctx: ReturnType<typeof setup>, validUntil?: string) {
    await ctx.service.create(input)
    await ctx.service.send('q-1', { validUntil }, 'user-1')
    jest.clearAllMocks()
    return ctx.state.byId('q-1')!
}

/** Makes `expireOverdue` behave like the real UPDATE on the in-memory rows. */
function realExpiry(ctx: ReturnType<typeof setup>) {
    ctx.prisma.sdQuotation.updateMany.mockImplementation(({ where, data }: { where: Row; data: Row }) => {
        const hits = ctx.state.rows.filter(
            (r) =>
                r.crmOpportunityId === where.crmOpportunityId &&
                where.status.in.includes(r.status) &&
                r.validUntil &&
                r.validUntil < where.validUntil.lt,
        )
        hits.forEach((r) => Object.assign(r, data))
        return Promise.resolve({ count: hits.length })
    })
}

describe('QuotationService.revise', () => {
    it('supersedes a SENT quotation with a re-priced DRAFT revision under the same number', async () => {
        const ctx = setup()
        await sent(ctx)
        ctx.state.products.get('p1')!.price = new Decimal('1400.00')

        const rev2 = await ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST', notes: ' more volume ' }, 'user-3')

        expect(ctx.state.byId('q-1')).toMatchObject({ status: 'SUPERSEDED', updatedBy: 'user-3' })
        expect(ctx.state.byId('q-1')!.lines[0].unitPrice.toFixed(2)).toBe('1250.50')
        expect(rev2).toMatchObject({
            id: 'q-2',
            quotationNumber: 'Q-000042',
            revision: 2,
            previousRevisionId: 'q-1',
            revisionReason: 'CUSTOMER_REQUEST',
            revisionNotes: 'more volume',
            status: 'DRAFT',
            crmOpportunityId: 'opp-1',
            customerId: 'cust-1',
            notes: 'Rush',
            createdBy: 'user-3',
            validUntil: null,
            lineIssues: [],
        })
        expect(rev2.lines.map((l: Row) => [l.lineNumber, l.sku, l.unitPrice.toFixed(2)])).toEqual([
            [1, 'SKU-p1', '1400.00'],
            [2, 'SKU-p2', '99.99'],
        ])
        expect(rev2.totalAmount.toFixed(2)).toBe('3099.97')
        expect(ctx.prisma.$queryRaw).not.toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('nextval')]))
    })

    it('keeps a REJECTED original as REJECTED and refuses a second revision of it', async () => {
        const ctx = setup()
        const q = await sent(ctx)
        q.status = 'REJECTED'

        await expect(ctx.service.revise('q-1', { reason: 'ERROR_CORRECTION' }, 'user-1')).resolves.toMatchObject({
            revision: 2,
            status: 'DRAFT',
        })
        expect(q.status).toBe('REJECTED')

        await expect(ctx.service.revise('q-1', { reason: 'ERROR_CORRECTION' }, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_ALREADY_REVISED', message: expect.stringContaining('(rev 2)') },
        })
        expect(ctx.state.rows).toHaveLength(2)
    })

    it('revises an EXPIRED quotation after persisting the expiry', async () => {
        const ctx = setup()
        await sent(ctx, '2026-10-10')
        realExpiry(ctx)
        jest.setSystemTime(new Date('2026-10-12T00:00:00Z'))

        const rev2 = await ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-1')

        expect(ctx.state.byId('q-1')!.status).toBe('EXPIRED')
        expect(rev2).toMatchObject({ revision: 2, status: 'DRAFT' })
    })

    it('requires notes for OTHER before any write', async () => {
        const ctx = setup()
        await sent(ctx)

        await expect(ctx.service.revise('q-1', { reason: 'OTHER', notes: '  ' }, 'user-1')).rejects.toThrow(
            BadRequestException,
        )
        expect(ctx.prisma.$transaction).not.toHaveBeenCalled()
        await expect(ctx.service.revise('q-1', { reason: 'OTHER', notes: 'scope' }, 'user-1')).resolves.toMatchObject({
            revisionReason: 'OTHER',
            revisionNotes: 'scope',
        })
    })

    it('does not revise DRAFT, SUPERSEDED or CANCELLED quotations', async () => {
        const ctx = setup()
        const q = await draft(ctx)
        for (const status of ['DRAFT', 'SUPERSEDED', 'CANCELLED', 'CONVERTED']) {
            q.status = status
            await expect(ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-1')).rejects.toMatchObject({
                response: { code: 'QUOTATION_INVALID_TRANSITION' },
            })
        }
        expect(ctx.prisma.sdQuotation.create).not.toHaveBeenCalled()
    })

    it('refuses to revise a closed quotation while another one is active', async () => {
        const ctx = setup()
        const q = await sent(ctx)
        q.status = 'REJECTED'
        await ctx.service.create(input)

        await expect(ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_ACTIVE_EXISTS', quotationId: 'q-2' },
        })
    })

    it('copies lines of deleted products with their snapshot and flags them', async () => {
        const ctx = setup()
        await sent(ctx)
        ctx.state.products.delete('p2')

        const rev2 = await ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-1')

        expect(rev2.lines[1]).toMatchObject({ lineNumber: 2, sku: 'SKU-p2', productId: 'p2' })
        expect(rev2.lines[1].unitPrice.toFixed(2)).toBe('99.99')
        expect(rev2.lineIssues).toEqual([{ lineNumber: 2, sku: 'SKU-p2', reason: 'NOT_FOUND' }])
        await expect(ctx.service.send('q-2', {}, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_UNAVAILABLE_PRODUCTS' },
        })
    })

    it('refuses to revise once the opportunity has a sales order', async () => {
        const ctx = setup()
        ;(await sent(ctx)).status = 'REJECTED'
        ctx.prisma.sdSalesOrder.findUnique.mockResolvedValue({ orderNumber: 'SO-000009' })

        await expect(ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_OPPORTUNITY_ORDERED', message: expect.stringContaining('SO-000009') },
        })
        expect(ctx.prisma.sdSalesOrder.findUnique).toHaveBeenCalledWith({
            where: { crmOpportunityId: 'opp-1' },
            select: { orderNumber: true },
        })
        expect(ctx.state.rows).toHaveLength(1)
    })

    it('maps a lost race on the revision unique keys to QUOTATION_ALREADY_REVISED', async () => {
        const ctx = setup()
        await sent(ctx)
        ctx.prisma.sdQuotation.create.mockRejectedValueOnce(uniqueViolation('SdQuotation', ['previousRevisionId']))

        await expect(ctx.service.revise('q-1', { reason: 'CUSTOMER_REQUEST' }, 'user-1')).rejects.toMatchObject({
            response: { code: 'QUOTATION_ALREADY_REVISED' },
        })
    })
})

describe('QuotationService decisions', () => {
    it('accepts a SENT quotation and records who decided', async () => {
        const ctx = setup()
        await sent(ctx)

        await expect(ctx.service.accept('q-1', { note: ' PO to follow ' }, 'user-4')).resolves.toMatchObject({
            status: 'ACCEPTED',
            decidedBy: 'user-4',
            decidedAt: NOW,
            decisionReason: 'PO to follow',
            updatedBy: 'user-4',
        })
        await expect(ctx.service.accept('q-1', {}, 'user-4')).rejects.toThrow('Cannot accept an ACCEPTED quotation')
    })

    it('rejects a SENT quotation with a required reason', async () => {
        const ctx = setup()
        await sent(ctx)

        await expect(ctx.service.reject('q-1', { reason: ' ' }, 'user-4')).rejects.toThrow(BadRequestException)
        expect(ctx.prisma.$transaction).not.toHaveBeenCalled()
        await expect(ctx.service.reject('q-1', { reason: ' Too expensive ' }, 'user-4')).resolves.toMatchObject({
            status: 'REJECTED',
            decisionReason: 'Too expensive',
        })
    })

    it('does not accept or reject a DRAFT and does not reject an ACCEPTED quotation', async () => {
        const ctx = setup()
        const q = await draft(ctx)
        await expect(ctx.service.accept('q-1', {}, 'u')).rejects.toThrow('Cannot accept a DRAFT quotation')
        await expect(ctx.service.reject('q-1', { reason: 'x' }, 'u')).rejects.toThrow('Cannot reject a DRAFT quotation')
        q.status = 'ACCEPTED'
        await expect(ctx.service.reject('q-1', { reason: 'x' }, 'u')).rejects.toThrow('Cannot reject an ACCEPTED quotation')
        expect(ctx.prisma.sdQuotation.update).not.toHaveBeenCalled()
    })

    it('cancels DRAFT, SENT and ACCEPTED quotations but not closed ones', async () => {
        for (const status of ['DRAFT', 'SENT', 'ACCEPTED']) {
            const ctx = setup()
            ;(await draft(ctx)).status = status
            await expect(ctx.service.cancel('q-1', { reason: ' dup ' }, 'user-5')).resolves.toMatchObject({
                status: 'CANCELLED',
                cancelledBy: 'user-5',
                cancelledAt: NOW,
                cancelReason: 'dup',
            })
        }
        const ctx = setup()
        const q = await draft(ctx)
        for (const status of ['CONVERTED', 'SUPERSEDED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
            q.status = status
            await expect(ctx.service.cancel('q-1', {}, 'u')).rejects.toMatchObject({
                response: { code: 'QUOTATION_INVALID_TRANSITION' },
            })
        }
    })

    it('persists the expiry of an overdue quotation and then refuses to accept it', async () => {
        const ctx = setup()
        await sent(ctx, '2026-10-10')
        realExpiry(ctx)
        jest.setSystemTime(new Date('2026-10-10T16:00:00Z'))
        const order: string[] = []
        const expire = ctx.prisma.sdQuotation.updateMany.getMockImplementation()!
        ctx.prisma.sdQuotation.updateMany.mockImplementation((args: never) => (order.push('expire'), expire(args)))
        ctx.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => (order.push('tx'), fn(ctx.prisma)))

        await expect(ctx.service.accept('q-1', {}, 'u')).rejects.toThrow('Cannot accept an EXPIRED quotation')
        expect(order).toEqual(['expire', 'tx'])
        expect(ctx.state.byId('q-1')!.status).toBe('EXPIRED')
    })

    it('404s for unknown quotations', async () => {
        const { service } = setup()
        await expect(service.accept('nope', {}, 'u')).rejects.toThrow(NotFoundException)
    })
})

describe('QuotationService.cancelActiveForOpportunity', () => {
    it('expires overdue quotations, then cancels the active one in the given transaction', async () => {
        const ctx = setup()
        const calls: Row[] = []
        ctx.prisma.sdQuotation.updateMany.mockImplementation((args: Row) => (calls.push(args), Promise.resolve({ count: 1 })))

        await expect(
            ctx.service.cancelActiveForOpportunity(ctx.prisma as never, 'opp-1', {
                cancelledBy: 'user-9',
                reason: 'Opportunity closed as lost (PRICE)',
            }),
        ).resolves.toBe(1)

        expect(calls).toEqual([
            {
                where: { crmOpportunityId: 'opp-1', status: { in: ['SENT', 'ACCEPTED'] }, validUntil: { lt: NOW } },
                data: { status: 'EXPIRED' },
            },
            {
                where: { crmOpportunityId: 'opp-1', status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] } },
                data: {
                    status: 'CANCELLED',
                    cancelledBy: 'user-9',
                    cancelledAt: NOW,
                    cancelReason: 'Opportunity closed as lost (PRICE)',
                    updatedBy: 'user-9',
                },
            },
        ])
        expect(ctx.prisma.$transaction).not.toHaveBeenCalled()
    })
})

describe('QuotationService.claimForConversion', () => {
    const claim = { quotationId: 'q-1', crmOpportunityId: 'opp-1', customerId: 'cust-1', convertedBy: 'user-6' }

    it('marks a SENT or ACCEPTED quotation CONVERTED under the row lock and returns its frozen lines', async () => {
        for (const status of ['SENT', 'ACCEPTED']) {
            const ctx = setup()
            ;(await sent(ctx)).status = status
            ctx.state.products.get('p1')!.price = new Decimal('1.00')

            const result = await ctx.service.claimForConversion(ctx.prisma as never, claim)

            expect(ctx.prisma.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE')
            expect(result.alreadyConverted).toBe(false)
            expect(result.quote.lines[0].unitPrice.toFixed(2)).toBe('1250.50')
            expect(result.quote.totalAmount.toFixed(2)).toBe('2800.97')
            expect(ctx.state.byId('q-1')).toMatchObject({
                status: 'CONVERTED',
                convertedBy: 'user-6',
                convertedAt: NOW,
                updatedBy: 'user-6',
            })
        }
    })

    it('reports a quotation converted by a concurrent win without writing', async () => {
        const ctx = setup()
        ;(await sent(ctx)).status = 'CONVERTED'

        await expect(ctx.service.claimForConversion(ctx.prisma as never, claim)).resolves.toMatchObject({
            alreadyConverted: true,
        })
        expect(ctx.prisma.sdQuotation.update).not.toHaveBeenCalled()
    })

    it('refuses quotations of another opportunity or customer', async () => {
        const ctx = setup()
        await sent(ctx)

        await expect(
            ctx.service.claimForConversion(ctx.prisma as never, { ...claim, crmOpportunityId: 'opp-2' }),
        ).rejects.toMatchObject({ response: { code: 'QUOTATION_OPPORTUNITY_MISMATCH' } })
        await expect(
            ctx.service.claimForConversion(ctx.prisma as never, { ...claim, customerId: 'cust-2' }),
        ).rejects.toMatchObject({ response: { code: 'QUOTATION_CUSTOMER_MISMATCH' } })
        expect(ctx.prisma.sdQuotation.update).not.toHaveBeenCalled()
    })

    it('refuses an overdue quotation with QUOTATION_EXPIRED', async () => {
        const ctx = setup()
        await sent(ctx, '2026-10-10')
        jest.setSystemTime(new Date('2026-10-10T16:00:00Z'))

        await expect(ctx.service.claimForConversion(ctx.prisma as never, claim)).rejects.toMatchObject({
            response: { code: 'QUOTATION_EXPIRED', quotationId: 'q-1', message: expect.stringContaining('2026-10-10') },
        })
        expect(ctx.state.byId('q-1')!.status).toBe('SENT')
    })

    it('refuses DRAFT and closed quotations', async () => {
        const ctx = setup()
        const q = await draft(ctx)
        await expect(ctx.service.claimForConversion(ctx.prisma as never, claim)).rejects.toThrow(
            'Cannot convert a DRAFT quotation',
        )
        for (const status of ['CANCELLED', 'REJECTED', 'EXPIRED', 'SUPERSEDED']) {
            q.status = status
            await expect(ctx.service.claimForConversion(ctx.prisma as never, claim)).rejects.toThrow(ConflictException)
        }
    })

    it('404s for an unknown quotation', async () => {
        const ctx = setup()
        await expect(ctx.service.claimForConversion(ctx.prisma as never, claim)).rejects.toThrow(NotFoundException)
    })
})
