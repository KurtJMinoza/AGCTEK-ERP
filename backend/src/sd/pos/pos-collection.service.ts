import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { SdEventEmitterService } from '../sd-event-emitter.service'
import { SD_EVENTS } from '../sd-event.types'
import { PosPaymentMethodService } from './pos-payment-method.service'
import { allocateTenders, setDynamicMethodCodes, type PosTender } from './pos-tender'
import type { PosTenderInput } from './pos-tender'

const Decimal = Prisma.Decimal
const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

export type CollectPaymentInput = {
    salesOrderId: string
    tenders: PosTenderInput[]
    posSessionId?: string
    collectedBy?: string
    idempotencyKey?: string
}

export type CollectionReceipt = {
    collectionNumber: string
    salesOrderId: string
    orderNumber: string
    receiptNumber: string | null
    customerName: string | null
    collectionDate: string
    previousBalance: number
    collectedAmount: number
    remainingBalance: number
    tenders: Array<{
        method: string
        amount: number
        referenceNumber: string | null
        status: string
    }>
    collectedBy: string | null
}

export type ReceivableSummary = {
    totalOutstanding: number
    totalOverdue: number
    totalCustomerReceivables: number
    totalEmployeeLoanBalance: number
    totalPendingVerification: number
    openCount: number
    overdueCount: number
}

/**
 * Subsequent payment collection against POS receivables.
 *
 * A partially-paid sale creates one `SdPosReceivable`; each collection
 * reduces its balance. When the balance reaches zero the receivable and
 * the sales order payment status are settled.
 */
@Injectable()
export class PosCollectionService {
    private readonly logger = new Logger(PosCollectionService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly sdEvents: SdEventEmitterService,
        private readonly paymentMethods: PosPaymentMethodService,
    ) {}

    /** Collect a payment against an outstanding receivable. */
    async collect(input: CollectPaymentInput): Promise<CollectionReceipt> {
        // Idempotency guard
        if (input.idempotencyKey) {
            const existing = await this.prisma.sdPosCollection.findUnique({
                where: { idempotencyKey: input.idempotencyKey },
            })
            if (existing) {
                return this.collectionReceipt(existing.id)
            }
        }

        const receivable = await this.prisma.sdPosReceivable.findUnique({
            where: { salesOrderId: input.salesOrderId },
            include: {
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        receiptNumber: true,
                        customerName: true,
                        companyId: true,
                        customerId: true,
                        branchId: true,
                    },
                },
            },
        })
        if (!receivable) {
            throw new NotFoundException(
                'No outstanding receivable found for this sale.',
            )
        }
        if (receivable.status !== 'OPEN') {
            throw new ConflictException(
                `This receivable is already ${receivable.status}.`,
            )
        }

        const balance = Number(receivable.balance)
        if (balance <= 0) {
            throw new ConflictException('This receivable has no outstanding balance.')
        }

        // Sync dynamic payment method codes
        const methods = await this.paymentMethods.list(true)
        setDynamicMethodCodes(methods.map((m) => m.code))

        // Validate tenders against the balance (not the full order total)
        const totalTendering = round2(
            input.tenders.reduce((sum, t) => sum + (t.amount ?? 0), 0),
        )
        if (totalTendering > balance + 0.005) {
            throw new BadRequestException(
                `The collection total (₱${totalTendering}) exceeds the outstanding balance (₱${balance}).`,
            )
        }

        const { tenders, change } = allocateTenders(totalTendering, input.tenders)
        const collectedAmount = round2(
            tenders.reduce((sum, t) => sum + t.amount, 0),
        )
        const newBalance = round2(balance - collectedAmount)
        const companyId = receivable.salesOrder.companyId ?? receivable.companyId

        // Row-level lock to prevent concurrent overpayment
        const collection = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id FROM sd_pos_receivables
                WHERE id = ${receivable.id}
                FOR UPDATE
            `
            const locked = await tx.sdPosReceivable.findUnique({
                where: { id: receivable.id },
                select: { balance: true, status: true },
            })
            if (!locked || locked.status !== 'OPEN') {
                throw new ConflictException('Receivable was settled concurrently.')
            }
            const currentBalance = Number(locked.balance)
            if (collectedAmount > currentBalance + 0.005) {
                throw new BadRequestException(
                    `Collection exceeds the current balance (₱${currentBalance}).`,
                )
            }

            const actualNewBalance = round2(currentBalance - collectedAmount)
            const settled = actualNewBalance <= 0.005

            const collectionNumber = await this.nextCollectionNumber(companyId, tx)

            const col = await tx.sdPosCollection.create({
                data: {
                    companyId,
                    receivableId: receivable.id,
                    salesOrderId: input.salesOrderId,
                    collectionNumber,
                    totalAmount: collectedAmount,
                    posSessionId: input.posSessionId ?? null,
                    collectedBy: input.collectedBy ?? null,
                    idempotencyKey: input.idempotencyKey ?? null,
                },
            })

            // Record tender rows (linked to the collection)
            for (const [index, tender] of tenders.entries()) {
                const key = input.idempotencyKey
                    ? `${input.idempotencyKey}:col:${index}`
                    : null
                await tx.sdSalesOrderPayment.create({
                    data: {
                        companyId,
                        salesOrderId: input.salesOrderId,
                        customerId: receivable.customerId,
                        paymentMethod: tender.method,
                        paymentProvider: tender.provider,
                        amount: new Decimal(tender.amount),
                        tenderAmount: new Decimal(tender.tenderAmount),
                        changeAmount: new Decimal(tender.changeAmount),
                        currency: 'PHP',
                        status: tender.status,
                        verificationStatus: tender.verificationStatus,
                        referenceNumber: tender.referenceNumber,
                        posSessionId: input.posSessionId ?? null,
                        collectionId: col.id,
                        idempotencyKey: key,
                        bankName: tender.bankName,
                        transactionDate: tender.transactionDate,
                        employeeNumber: tender.employeeNumber,
                        payrollReference: tender.payrollReference,
                        collectedBy: input.collectedBy ?? null,
                        isDemo: false,
                        paidAt: tender.paidAt,
                        createdBy: input.collectedBy ?? null,
                    },
                })
            }

            // Update the receivable
            await tx.sdPosReceivable.update({
                where: { id: receivable.id },
                data: {
                    paidAmount: { increment: new Decimal(collectedAmount) },
                    balance: actualNewBalance,
                    status: settled ? 'SETTLED' : 'OPEN',
                },
            })

            // Update the sales order
            await tx.sdSalesOrder.update({
                where: { id: input.salesOrderId },
                data: {
                    outstandingBalance: actualNewBalance,
                    paymentStatus: settled ? 'Paid' : 'Partially Paid',
                },
            })

            // Update employee loan items if this customer has them
            if (settled) {
                await tx.sdEmployeeLoanItem.updateMany({
                    where: {
                        salesOrderId: input.salesOrderId,
                        status: { in: ['OPEN', 'PARTIAL'] },
                    },
                    data: { status: 'SETTLED', balance: 0, repaidAmount: { increment: 0 } },
                })
            }

            return col
        })

        // Emit event for FICO posting
        await this.sdEvents.emit(SD_EVENTS.POS_COLLECTION_COMPLETED, {
            collectionId: collection.id,
            collectionNumber: collection.collectionNumber,
            salesOrderId: input.salesOrderId,
            orderNumber: receivable.salesOrder.orderNumber,
            receiptNumber: receivable.salesOrder.receiptNumber,
            companyId,
            branchId: receivable.salesOrder.branchId,
            customerId: receivable.customerId,
            currency: 'PHP',
            collectedAmount: collectedAmount.toFixed(2),
            previousBalance: balance.toFixed(2),
            newBalance: newBalance.toFixed(2),
            tenders: tenders.map((t) => ({
                method: t.method,
                amount: t.amount.toFixed(2),
                status: t.status,
                verificationStatus: t.verificationStatus,
                referenceNumber: t.referenceNumber,
            })),
            idempotencyKey: input.idempotencyKey,
        })

        this.logger.log(
            `Collection ${collection.collectionNumber} for ${receivable.salesOrder.orderNumber}: ₱${collectedAmount} (balance ₱${newBalance})`,
        )

        return this.collectionReceipt(collection.id)
    }

    /** List outstanding receivables. */
    async listReceivables(args: {
        companyId: string
        status?: string
        search?: string
        limit?: number
    }) {
        const where: Prisma.SdPosReceivableWhereInput = {
            companyId: args.companyId,
        }
        if (args.status === 'OVERDUE') {
            where.status = 'OPEN'
            where.dueDate = { lt: new Date() }
        } else if (args.status) {
            where.status = args.status
        }
        if (args.search) {
            where.salesOrder = {
                OR: [
                    { orderNumber: { contains: args.search, mode: 'insensitive' } },
                    { receiptNumber: { contains: args.search, mode: 'insensitive' } },
                    { customerName: { contains: args.search, mode: 'insensitive' } },
                ],
            }
        }

        const receivables = await this.prisma.sdPosReceivable.findMany({
            where,
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        receiptNumber: true,
                        customerName: true,
                        totalAmount: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(args.limit ?? 100, 500),
        })

        return receivables.map((r) => ({
            id: r.id,
            salesOrderId: r.salesOrderId,
            orderNumber: r.salesOrder.orderNumber,
            receiptNumber: r.salesOrder.receiptNumber,
            customerName: r.salesOrder.customerName,
            customerId: r.customerId,
            employeeId: r.employeeId,
            originalTotal: Number(r.salesOrder.totalAmount ?? 0),
            originalAmount: Number(r.originalAmount),
            paidAmount: Number(r.paidAmount),
            pendingAmount: Number(r.pendingAmount),
            balance: Number(r.balance),
            status: r.status,
            isOverdue: r.dueDate ? r.dueDate < new Date() && r.status === 'OPEN' : false,
            dueDate: r.dueDate?.toISOString() ?? null,
            saleDate: r.salesOrder.createdAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
        }))
    }

    /** One receivable with its collection history. */
    async getReceivable(receivableId: string) {
        const receivable = await this.prisma.sdPosReceivable.findUnique({
            where: { id: receivableId },
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        receiptNumber: true,
                        customerName: true,
                        totalAmount: true,
                        createdAt: true,
                        payments: {
                            orderBy: { createdAt: 'asc' },
                            select: {
                                id: true,
                                paymentMethod: true,
                                amount: true,
                                status: true,
                                verificationStatus: true,
                                referenceNumber: true,
                                collectionId: true,
                                createdAt: true,
                            },
                        },
                    },
                },
                collections: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        collectionNumber: true,
                        totalAmount: true,
                        collectedBy: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        })
        if (!receivable) throw new NotFoundException('Receivable not found.')
        return {
            ...receivable,
            originalAmount: Number(receivable.originalAmount),
            paidAmount: Number(receivable.paidAmount),
            pendingAmount: Number(receivable.pendingAmount),
            balance: Number(receivable.balance),
        }
    }

    /** Aggregated summary of outstanding receivables. */
    async summary(companyId: string): Promise<ReceivableSummary> {
        const open = await this.prisma.sdPosReceivable.findMany({
            where: { companyId, status: 'OPEN' },
            select: { balance: true, dueDate: true, employeeId: true },
        })
        const now = new Date()
        let totalOutstanding = 0
        let totalOverdue = 0
        let totalEmployeeLoan = 0
        let overdueCount = 0

        for (const r of open) {
            const bal = Number(r.balance)
            totalOutstanding = round2(totalOutstanding + bal)
            if (r.dueDate && r.dueDate < now) {
                totalOverdue = round2(totalOverdue + bal)
                overdueCount++
            }
            if (r.employeeId) {
                totalEmployeeLoan = round2(totalEmployeeLoan + bal)
            }
        }

        // Pending verification from all POS payments
        const pendingPayments = await this.prisma.sdSalesOrderPayment.aggregate({
            where: {
                companyId,
                verificationStatus: 'PENDING',
                status: { notIn: ['Cancelled', 'Refunded', 'Failed'] },
            },
            _sum: { amount: true },
        })

        return {
            totalOutstanding,
            totalOverdue,
            totalCustomerReceivables: round2(totalOutstanding - totalEmployeeLoan),
            totalEmployeeLoanBalance: totalEmployeeLoan,
            totalPendingVerification: Number(pendingPayments._sum.amount ?? 0),
            openCount: open.length,
            overdueCount,
        }
    }

    /** Receipt data for a single collection. */
    async collectionReceipt(collectionId: string): Promise<CollectionReceipt> {
        const col = await this.prisma.sdPosCollection.findUnique({
            where: { id: collectionId },
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        receiptNumber: true,
                        customerName: true,
                    },
                },
                receivable: {
                    select: { originalAmount: true, balance: true },
                },
                tenders: {
                    where: { collectionId: collectionId },
                    select: {
                        paymentMethod: true,
                        amount: true,
                        referenceNumber: true,
                        status: true,
                    },
                },
            },
        })
        if (!col) throw new NotFoundException('Collection not found.')

        const collectedAmount = Number(col.totalAmount)
        const remainingBalance = Number(col.receivable.balance)
        const previousBalance = round2(remainingBalance + collectedAmount)

        return {
            collectionNumber: col.collectionNumber,
            salesOrderId: col.salesOrderId,
            orderNumber: col.salesOrder.orderNumber,
            receiptNumber: col.salesOrder.receiptNumber,
            customerName: col.salesOrder.customerName,
            collectionDate: col.createdAt.toISOString(),
            previousBalance,
            collectedAmount,
            remainingBalance,
            tenders: col.tenders.map((t) => ({
                method: t.paymentMethod,
                amount: Math.abs(Number(t.amount)),
                referenceNumber: t.referenceNumber,
                status: t.status,
            })),
            collectedBy: col.collectedBy,
        }
    }

    private async nextCollectionNumber(
        companyId: string,
        tx: Prisma.TransactionClient,
    ) {
        const count = await tx.sdPosCollection.count({ where: { companyId } })
        return `COL-${String(count + 1).padStart(6, '0')}`
    }
}
