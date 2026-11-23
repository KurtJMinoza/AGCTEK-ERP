import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { MonthlyCollectionQueryDto } from './dto/monthly-collection.dto'
import { MANILA_OFFSET_MS, roundMoney } from './sales-analytics.service'

const COLLECTED_STATUSES = ['Paid', 'Authorized']
const MONTH_LABELS = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
] as const

export type CollectionBucket =
    | 'cash'
    | 'gcash'
    | 'bankTransfer'
    | 'cheque'
    | 'others'

export type CollectionBucketTotals = Record<CollectionBucket, number> & {
    total: number
}

export type MonthlyCollectionRow = CollectionBucketTotals & {
    collectionDate: string
    arNumber: string
    customerName: string
    particular: string
    orderNumber: string
}

export type MonthlyCollectionMonth = {
    month: number
    monthLabel: string
    summary: CollectionBucketTotals
    rows: MonthlyCollectionRow[]
}

export type MonthlyCollectionReport = {
    year: number
    companyName: string
    companyAddress: string
    reportTitle: string
    yearSummary: Array<{
        month: number
        monthLabel: string
        summary: CollectionBucketTotals
    }>
    months: MonthlyCollectionMonth[]
}

const emptyBuckets = (): CollectionBucketTotals => ({
    cash: 0,
    gcash: 0,
    bankTransfer: 0,
    cheque: 0,
    others: 0,
    total: 0,
})

/** Map tender codes to the Excel column buckets. */
export function collectionPaymentBucket(method: string): CollectionBucket {
    const m = (method ?? '').trim().toUpperCase()
    if (m === 'CASH') return 'cash'
    if (
        m === 'GCASH' ||
        m.includes('WALLET') ||
        m === 'QR_DEMO' ||
        m === 'WALLET_DEMO'
    ) {
        return 'gcash'
    }
    if (
        m === 'BANK_TRANSFER' ||
        m === 'BANK_TRANSFER_DEMO' ||
        m.includes('BANK')
    ) {
        return 'bankTransfer'
    }
    if (m === 'CHEQUE' || m === 'CHECK') return 'cheque'
    return 'others'
}

function addToBuckets(
    target: CollectionBucketTotals,
    bucket: CollectionBucket,
    amount: number,
) {
    const value = roundMoney(amount)
    if (value <= 0) return
    target[bucket] = roundMoney(target[bucket] + value)
    target.total = roundMoney(target.total + value)
}

function manilaYearBounds(year: number) {
    const now = new Date()
    const from = new Date(Date.UTC(year, 0, 1) - MANILA_OFFSET_MS)
    const endOfYear = new Date(
        Date.UTC(year + 1, 0, 1) - MANILA_OFFSET_MS - 1,
    )
    const local = new Date(now.getTime() + MANILA_OFFSET_MS)
    const to =
        local.getUTCFullYear() === year && now < endOfYear ? now : endOfYear
    return { from, to }
}

function monthFromManilaDate(value: Date): number {
    const local = new Date(value.getTime() + MANILA_OFFSET_MS)
    return local.getUTCMonth() + 1
}

function buildRow(
    date: Date,
    arNumber: string,
    customerName: string,
    particular: string,
    orderNumber: string,
    bucket: CollectionBucket,
    amount: number,
): MonthlyCollectionRow {
    const row = {
        collectionDate: date.toISOString(),
        arNumber,
        customerName: customerName.trim() || 'Walk-in',
        particular,
        orderNumber,
        ...emptyBuckets(),
    }
    addToBuckets(row, bucket, amount)
    return row
}

@Injectable()
export class MonthlyCollectionService {
    constructor(private readonly prisma: PrismaService) {}

    async report(dto: MonthlyCollectionQueryDto): Promise<MonthlyCollectionReport> {
        const company =
            (await this.prisma.company.findFirst({
                where: { code: 'AGCTEK' },
            })) ?? (await this.prisma.company.findFirstOrThrow())

        const { from: yearFrom, to: yearTo } = manilaYearBounds(dto.year)
        const rowsByMonth = new Map<number, MonthlyCollectionRow[]>()
        for (let m = 1; m <= 12; m++) {
            rowsByMonth.set(m, [])
        }

        const payments = await this.prisma.sdSalesOrderPayment.findMany({
            where: {
                status: { in: COLLECTED_STATUSES },
                verificationStatus: 'VERIFIED',
                amount: { gt: 0 },
                salesOrder: {
                    status: { notIn: ['CANCELLED', 'DRAFT'] },
                },
                OR: [
                    {
                        paidAt: { gte: yearFrom, lte: yearTo },
                    },
                    {
                        paidAt: null,
                        createdAt: { gte: yearFrom, lte: yearTo },
                    },
                ],
            },
            include: {
                collection: { select: { collectionNumber: true } },
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        totalAmount: true,
                        lines: {
                            select: {
                                lineNumber: true,
                                description: true,
                                lineTotal: true,
                                unitPrice: true,
                                quantity: true,
                            },
                            orderBy: { lineNumber: 'asc' },
                        },
                    },
                },
            },
            orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
        })

        for (const payment of payments) {
            const paidAt = payment.paidAt ?? payment.createdAt
            const month = monthFromManilaDate(paidAt)
            if (paidAt < yearFrom || paidAt > yearTo) continue
            if (month < 1 || month > 12) continue

            const order = payment.salesOrder
            const lines = order.lines
            const orderTotal = lines.reduce((sum, line) => {
                const lt = Number(line.lineTotal ?? 0)
                if (lt > 0) return sum + lt
                return (
                    sum +
                    Number(line.unitPrice ?? 0) * Number(line.quantity ?? 0)
                )
            }, 0)
            const tenderAmount = Number(payment.amount)
            const bucket = collectionPaymentBucket(payment.paymentMethod)
            const arNumber =
                payment.collection?.collectionNumber?.trim() ??
                order.orderNumber

            if (!lines.length || orderTotal <= 0) {
                rowsByMonth
                    .get(month)!
                    .push(
                        buildRow(
                            paidAt,
                            arNumber,
                            order.customerName ?? 'Walk-in',
                            order.orderNumber,
                            order.orderNumber,
                            bucket,
                            tenderAmount,
                        ),
                    )
                continue
            }

            for (const line of lines) {
                const lineTotal =
                    Number(line.lineTotal ?? 0) > 0
                        ? Number(line.lineTotal)
                        : Number(line.unitPrice ?? 0) *
                          Number(line.quantity ?? 0)
                const share = orderTotal > 0 ? lineTotal / orderTotal : 0
                const allocated = roundMoney(tenderAmount * share)
                if (allocated <= 0) continue
                rowsByMonth.get(month)!.push(
                    buildRow(
                        paidAt,
                        arNumber,
                        order.customerName ?? 'Walk-in',
                        line.description?.trim() || order.orderNumber,
                        order.orderNumber,
                        bucket,
                        allocated,
                    ),
                )
            }
        }

        const external = await this.prisma.sdExtPlatformTransaction.findMany({
            where: {
                status: { in: ['CONFIRMED', 'APPROVED'] },
                grandTotal: { gt: 0 },
                transactionDate: {
                    gte: new Date(`${dto.year}-01-01`),
                    lte: new Date(`${dto.year}-12-31`),
                },
            },
            include: {
                lines: {
                    select: {
                        description: true,
                        grossAmount: true,
                        lineSubtotal: true,
                    },
                    orderBy: { lineNumber: 'asc' },
                },
            },
            orderBy: { transactionDate: 'asc' },
        })

        for (const txn of external) {
            const paidAt = new Date(txn.transactionDate)
            paidAt.setUTCHours(12, 0, 0, 0)
            const month = monthFromManilaDate(paidAt)
            const bucket = collectionPaymentBucket(txn.paymentMethod ?? 'OTHERS')
            const arNumber =
                txn.externalOrderRef?.trim() || txn.transactionNumber
            const customer = txn.customerName?.trim() || 'External platform'
            const txnTotal = txn.lines.reduce(
                (sum, l) =>
                    sum +
                    Number(
                        l.grossAmount ??
                            l.lineSubtotal ??
                            0,
                    ),
                0,
            )

            for (const line of txn.lines) {
                const lineAmount = Number(
                    line.grossAmount ?? line.lineSubtotal ?? 0,
                )
                if (lineAmount <= 0) continue
                const allocated =
                    txnTotal > 0
                        ? roundMoney(
                              Number(txn.grandTotal) * (lineAmount / txnTotal),
                          )
                        : lineAmount
                rowsByMonth.get(month)!.push(
                    buildRow(
                        paidAt,
                        arNumber,
                        customer,
                        line.description?.trim() || txn.transactionNumber,
                        txn.transactionNumber,
                        bucket,
                        allocated,
                    ),
                )
            }
        }

        const summarize = (rows: MonthlyCollectionRow[]): CollectionBucketTotals => {
            const summary = emptyBuckets()
            for (const row of rows) {
                summary.cash = roundMoney(summary.cash + row.cash)
                summary.gcash = roundMoney(summary.gcash + row.gcash)
                summary.bankTransfer = roundMoney(
                    summary.bankTransfer + row.bankTransfer,
                )
                summary.cheque = roundMoney(summary.cheque + row.cheque)
                summary.others = roundMoney(summary.others + row.others)
            }
            summary.total = roundMoney(
                summary.cash +
                    summary.gcash +
                    summary.bankTransfer +
                    summary.cheque +
                    summary.others,
            )
            return summary
        }

        const months: MonthlyCollectionMonth[] = Array.from(
            { length: 12 },
            (_, index) => {
            const m = index + 1
            const rows = (rowsByMonth.get(m) ?? []).sort(
                (a, b) =>
                    new Date(a.collectionDate).getTime() -
                    new Date(b.collectionDate).getTime(),
            )
            return {
                month: m,
                monthLabel: MONTH_LABELS[index],
                summary: summarize(rows),
                rows,
            }
        },
        )

        const yearSummary = Array.from({ length: 12 }, (_, index) => {
            const m = index + 1
            const rows = rowsByMonth.get(m) ?? []
            return {
                month: m,
                monthLabel: MONTH_LABELS[index],
                summary: summarize(rows),
            }
        })

        return {
            year: dto.year,
            companyName: company.name,
            companyAddress: company.address?.trim() || '',
            reportTitle: 'MONTHLY COLLECTION MONITORING REPORT',
            yearSummary,
            months,
        }
    }
}