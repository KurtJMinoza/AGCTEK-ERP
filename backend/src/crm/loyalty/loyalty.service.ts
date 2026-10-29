import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common'
import { Prisma, type CrmLoyaltyTransaction } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { findCustomerMasterId } from '../../sd/customer-master'
import { SalesOrderService } from '../../sd/sales-order.service'
import type { SdSalesInvoicePaidPayload } from '../../sd/sd-event.types'
import { assertCustomerExists } from '../crm-references'
import type { MockEarnDto } from './dto/mock-earn.dto'

const RECENT_TRANSACTIONS = 50

/** Types `accruePoints` posts; EXPIRE is reserved for a future expiry job. */
export const ACCRUAL_TYPES = ['EARN', 'REDEEM', 'ADJUSTMENT', 'REVERSAL'] as const
export type AccrualType = (typeof ACCRUAL_TYPES)[number]

/** Tier from the current balance, highest first. */
export const LOYALTY_TIERS = [
    { tier: 'PLATINUM', minPoints: 20_000 },
    { tier: 'GOLD', minPoints: 5_000 },
    { tier: 'SILVER', minPoints: 1_000 },
    { tier: 'BRONZE', minPoints: 0 },
] as const

export const tierForBalance = (balance: number) =>
    LOYALTY_TIERS.find((t) => balance >= t.minPoints)?.tier ?? 'BRONZE'

/** Reference types posted by the mock; real earn references the paid SD invoice (SALES_INVOICE). */
export const MOCK_REFERENCE_TYPES = ['MOCK', 'SALES_ORDER'] as const
export const INVOICE_EARN_REFERENCE_TYPE = 'SALES_INVOICE'

const NOT_EARNING_ORDER_STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'CANCELLED'])

/** One earn per sales order, whichever source posts it first (mock order earn or paid invoice). */
export const salesOrderEarnKey = (salesOrderId: string) => `SALES_ORDER:${salesOrderId}`

/** Demo / staging only: never on when NODE_ENV is production, whatever LOYALTY_MOCK_ACCRUAL says. */
export const isMockAccrualEnabled = () =>
    process.env.LOYALTY_MOCK_ACCRUAL === 'true' && process.env.NODE_ENV !== 'production'

function pointsPer100Php() {
    const value = Number(process.env.LOYALTY_POINTS_PER_100_PHP ?? 1)
    return Number.isInteger(value) && value > 0 ? value : 1
}

export type LoyaltySummary = {
    accountId: string | null
    customerId: string
    pointsBalance: number
    tier: string | null
    /** Most recent first, capped at RECENT_TRANSACTIONS. */
    transactions: CrmLoyaltyTransaction[]
    /** LOYALTY_MOCK_ACCRUAL is on (demo / staging): the mock-earn API accepts requests. */
    mockAccrual: boolean
}

export type AccruePointsInput = {
    customerId: string
    type: AccrualType
    /** Signed: EARN > 0, REDEEM < 0; ADJUSTMENT / REVERSAL either way. */
    points: number
    referenceType?: string
    referenceId?: string
    /** EARN only: the source that may earn once; defaults to `referenceType:referenceId`. */
    earnKey?: string
    note?: string
    createdBy?: string | null
}

export type AccrualResult = {
    /** False when an EARN with the same earn key was already posted (nothing changed). */
    created: boolean
    transaction: CrmLoyaltyTransaction
    summary: LoyaltySummary
}

function assertAccrualInput(input: AccruePointsInput) {
    if (!(ACCRUAL_TYPES as readonly string[]).includes(input.type)) {
        throw new BadRequestException(`Unknown loyalty transaction type ${input.type}`)
    }
    if (!Number.isSafeInteger(input.points) || input.points === 0) {
        throw new BadRequestException('Points must be a whole number other than zero')
    }
    if (input.type === 'EARN' && input.points < 0) {
        throw new BadRequestException('EARN adds points; use a positive number')
    }
    if (input.type === 'REDEEM' && input.points > 0) {
        throw new BadRequestException('REDEEM deducts points; use a negative number')
    }
    if (input.referenceId && !input.referenceType) {
        throw new BadRequestException('referenceId needs a referenceType')
    }
}

@Injectable()
export class CrmLoyaltyService {
    private readonly logger = new Logger(CrmLoyaltyService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly salesOrders: SalesOrderService,
    ) {}

    async getForCustomer(customerId: string): Promise<LoyaltySummary> {
        await assertCustomerExists(this.prisma, customerId)
        return this.summary(customerId)
    }

    /**
     * Read-only. A customer without a loyalty account gets an empty default instead of a 404.
     * Caller must have confirmed the SdCustomer exists.
     */
    async summary(customerId: string): Promise<LoyaltySummary> {
        const account = await this.prisma.crmLoyaltyAccount.findUnique({
            where: { customerId },
            include: {
                transactions: { orderBy: { createdAt: 'desc' }, take: RECENT_TRANSACTIONS },
            },
        })
        const mockAccrual = isMockAccrualEnabled()
        if (!account) {
            return { accountId: null, customerId, pointsBalance: 0, tier: null, transactions: [], mockAccrual }
        }
        return {
            accountId: account.id,
            customerId,
            pointsBalance: account.pointsBalance,
            tier: account.tier,
            transactions: account.transactions,
            mockAccrual,
        }
    }

    /**
     * The single loyalty write path (paid SD invoices, and the demo mock). Creates the account on
     * first use and appends one ledger row while the balance and tier move in the same transaction,
     * under the account row lock. An EARN with an earn key posts once (unique `earnKey`): a repeat
     * returns the existing row. The balance never goes below zero.
     */
    async accruePoints(input: AccruePointsInput): Promise<AccrualResult> {
        assertAccrualInput(input)
        await assertCustomerExists(this.prisma, input.customerId)
        const run = () => this.prisma.$transaction((tx) => this.accrueIn(tx, input))
        let posted: Omit<AccrualResult, 'summary'>
        try {
            posted = await run()
        } catch (err) {
            // Two first-time earns for one customer race on the account's unique customerId, or two
            // earns for one source race on earnKey; the retry finds the winner.
            if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
            posted = await run()
        }
        return { ...posted, summary: await this.summary(input.customerId) }
    }

    private async accrueIn(tx: Prisma.TransactionClient, input: AccruePointsInput) {
        const { id: accountId } = await tx.crmLoyaltyAccount.upsert({
            where: { customerId: input.customerId },
            create: { customerId: input.customerId },
            update: {},
            select: { id: true },
        })
        await tx.$queryRaw`SELECT "id" FROM "crm_loyalty_accounts" WHERE "id" = ${accountId} FOR UPDATE`
        const account = await tx.crmLoyaltyAccount.findUniqueOrThrow({
            where: { id: accountId },
            select: { pointsBalance: true },
        })

        const earnKey =
            input.type !== 'EARN'
                ? null
                : (input.earnKey ??
                  (input.referenceType && input.referenceId
                      ? `${input.referenceType}:${input.referenceId}`
                      : null))
        if (earnKey) {
            const existing = await tx.crmLoyaltyTransaction.findUnique({ where: { earnKey } })
            if (existing) return { created: false, transaction: existing }
        }

        const balance = account.pointsBalance + input.points
        if (balance < 0) {
            throw new BadRequestException(
                `Not enough points: the balance is ${account.pointsBalance}, this would deduct ${-input.points}`,
            )
        }
        const transaction = await tx.crmLoyaltyTransaction.create({
            data: {
                loyaltyAccountId: accountId,
                type: input.type,
                points: input.points,
                referenceType: input.referenceType ?? null,
                referenceId: input.referenceId ?? null,
                earnKey,
                note: input.note ?? null,
                createdBy: input.createdBy ?? null,
            },
        })
        await tx.crmLoyaltyAccount.update({
            where: { id: accountId },
            data: { pointsBalance: balance, tier: tierForBalance(balance) },
        })
        return { created: true, transaction }
    }

    /**
     * Real earn: a settled SD invoice (`SalesInvoicePaid`) earns floor(total / 100 PHP) ×
     * LOYALTY_POINTS_PER_100_PHP for the order's Customer Master, once per sales order. Returns null
     * when nothing is earned (no Customer Master, not PHP, or under 100 PHP).
     * TODO(crm-integration): switch the source to FICO receivable clearance once FICO publishes it.
     */
    async earnForPaidInvoice(paid: SdSalesInvoicePaidPayload): Promise<AccrualResult | null> {
        const customerId = await findCustomerMasterId(this.prisma, paid.customerId)
        if (!customerId) {
            this.logger.warn(
                `Invoice ${paid.invoiceNumber}: the order's customer has no Customer Master record; no points earned`,
            )
            return null
        }
        if (paid.currency !== 'PHP') return null
        const total = Number(paid.totalAmount)
        const points = Math.floor(total / 100) * pointsPer100Php()
        if (!Number.isFinite(points) || points <= 0) return null
        return this.accruePoints({
            customerId,
            type: 'EARN',
            points,
            referenceType: INVOICE_EARN_REFERENCE_TYPE,
            referenceId: paid.salesInvoiceId,
            earnKey: salesOrderEarnKey(paid.salesOrderId),
            note: `Paid invoice ${paid.invoiceNumber} (${total.toFixed(2)} PHP)`,
            createdBy: null,
        })
    }

    /**
     * Demo / staging earn (LOYALTY_MOCK_ACCRUAL=true, never in production). With a sales order: floor(total / 100 PHP) ×
     * LOYALTY_POINTS_PER_100_PHP, posted once per order. Without: an admin grant of `points`.
     * Not backed by an invoice; an order that already earned from its paid invoice earns nothing more.
     */
    async mockEarn(customerId: string, dto: MockEarnDto, userId: string) {
        if (!isMockAccrualEnabled()) {
            throw new ForbiddenException(
                'Mock loyalty accrual is disabled (LOYALTY_MOCK_ACCRUAL is not true, or this is production)',
            )
        }
        await assertCustomerExists(this.prisma, customerId)
        const note = dto.note?.trim()

        if (dto.salesOrderId) {
            const order = await this.salesOrders.findOne(dto.salesOrderId)
            if ((await findCustomerMasterId(this.prisma, order.customerId)) !== customerId) {
                throw new BadRequestException(`Sales order ${order.orderNumber} belongs to another customer`)
            }
            if (NOT_EARNING_ORDER_STATUSES.has(order.status ?? '')) {
                throw new BadRequestException(
                    `Sales order ${order.orderNumber} is ${order.status}; it does not earn points`,
                )
            }
            if (order.currency && order.currency !== 'PHP') {
                throw new BadRequestException(`Sales order ${order.orderNumber} is in ${order.currency}; points are earned on PHP orders`)
            }
            const total = Number(order.totalAmount ?? 0)
            const points = Math.floor(total / 100) * pointsPer100Php()
            if (points <= 0) {
                throw new BadRequestException(
                    `Sales order ${order.orderNumber} totals ${total.toFixed(2)} PHP; it earns no points`,
                )
            }
            return this.accruePoints({
                customerId,
                type: 'EARN',
                points,
                referenceType: 'SALES_ORDER',
                referenceId: order.id,
                earnKey: salesOrderEarnKey(order.id),
                note: [`Mock accrual · ${order.orderNumber} (${total.toFixed(2)} PHP)`, note].filter(Boolean).join(' · '),
                createdBy: userId,
            })
        }

        if (!dto.points) {
            throw new BadRequestException('Send points or a salesOrderId')
        }
        return this.accruePoints({
            customerId,
            type: 'EARN',
            points: dto.points,
            referenceType: 'MOCK',
            note: ['Mock grant', note].filter(Boolean).join(' · '),
            createdBy: userId,
        })
    }
}
