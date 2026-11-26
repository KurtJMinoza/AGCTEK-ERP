/**
 * Seed SD sales orders from Monthly Sales / SALES REPORT Excel workbooks.
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-monthly-sales-report.ts --force --file=path1.xlsx --file=path2.xlsx
 *
 * Dates on each month sheet that fall outside that month are aligned to the
 * sheet month (day preserved). One COMPLETED order is created per receipt
 * group (date + receipt + customer + channel).
 */
import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import {
    parseMonthlySalesWorkbook,
    type ParsedSalesLine,
} from './lib/parse-monthly-sales-xlsx'
import { manilaParts } from './lib/xlsx-sheet-date'

export const ORDER_PREFIX = 'SR-2026-XLSX'
export const WALK_CUSTOMER = 'WALK-SR-SAMPLE'
export const SEED_TAG = 'seed-sr-xlsx'

const args = process.argv.slice(2)
const force = args.includes('--force')
const files = args
    .filter((a) => a.startsWith('--file='))
    .map((a) => a.slice('--file='.length))

type Group = {
    key: string
    lines: ParsedSalesLine[]
}

function groupLines(lines: ParsedSalesLine[]): Group[] {
    const map = new Map<string, ParsedSalesLine[]>()
    for (const line of lines) {
        const parts = manilaParts(line.saleDate)
        const day = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
        const receipt = line.serviceReceipt ?? `L${map.size + 1}`
        const key = [
            day,
            receipt,
            line.customerName.toUpperCase(),
            line.channel,
            line.paymentKind,
        ].join('|')
        const bucket = map.get(key)
        if (bucket) bucket.push(line)
        else map.set(key, [line])
    }
    return [...map.entries()].map(([key, grouped]) => ({ key, lines: grouped }))
}

async function removeExisting(prisma: PrismaClient) {
    const orders = await prisma.sdSalesOrder.findMany({
        where: { orderNumber: { startsWith: ORDER_PREFIX } },
        select: { id: true },
    })
    if (!orders.length) return 0
    console.log(`Removing ${orders.length} existing ${ORDER_PREFIX} order(s)…`)
    await prisma.sdSalesOrder.deleteMany({
        where: { id: { in: orders.map((o) => o.id) } },
    })
    return orders.length
}

async function main() {
    if (!files.length) {
        console.error(
            'Pass one or more workbooks: --file=path/to/sales.xlsx [--file=…]',
        )
        process.exit(1)
    }
    for (const f of files) {
        if (!fs.existsSync(f)) throw new Error(`Workbook not found: ${f}`)
    }

    const allLines: ParsedSalesLine[] = []
    let dateFixedTotal = 0
    for (const f of files) {
        const { lines, dateFixedCount } = parseMonthlySalesWorkbook(f)
        console.log(
            `Parsed ${lines.length} sales line(s) from ${path.basename(f)}` +
                (dateFixedCount
                    ? ` (aligned ${dateFixedCount} date(s) to sheet month)`
                    : ''),
        )
        allLines.push(...lines)
        dateFixedTotal += dateFixedCount
    }
    if (!allLines.length) {
        throw new Error('No sales rows parsed — check workbook format.')
    }

    const groups = groupLines(allLines)
    console.log(
        `Grouped into ${groups.length} order(s); date fixes total=${dateFixedTotal}`,
    )

    const prisma = new PrismaClient()
    try {
        const existing = await prisma.sdSalesOrder.count({
            where: { orderNumber: { startsWith: ORDER_PREFIX } },
        })
        if (existing > 0 && !force) {
            console.log(
                `${existing} ${ORDER_PREFIX} order(s) already present. Use --force to replace.`,
            )
            return
        }
        if (force && existing > 0) {
            await removeExisting(prisma)
        }

        const company = await prisma.company.findFirstOrThrow({
            where: { code: 'AGCTEK' },
        })
        const branch = await prisma.branch.findFirst({
            where: { companyId: company.id },
        })
        const admin = await prisma.user.findFirstOrThrow({
            where: { role: 'super_admin' },
            orderBy: { createdAt: 'asc' },
        })

        let walkIn = await prisma.sdCustomer.findFirst({
            where: { customerNumber: WALK_CUSTOMER },
        })
        if (!walkIn) {
            walkIn = await prisma.sdCustomer.create({
                data: {
                    customerNumber: WALK_CUSTOMER,
                    companyName: 'Walk-in customer (sales report seed)',
                    contactName: 'Walk-in',
                    phone: '',
                    status: 'ACTIVE',
                    createdBy: SEED_TAG,
                },
            })
        }

        let seq = 1
        for (let g = 0; g < groups.length; g++) {
            const group = groups[g]
            const head = group.lines[0]
            const orderNumber = `${ORDER_PREFIX}-${String(seq).padStart(5, '0')}`
            seq += 1

            const parts = manilaParts(head.saleDate)
            const yyyymm = `${parts.year}${String(parts.month).padStart(2, '0')}`
            // Always unique per company — original Excel receipt kept in notes.
            const receiptNumber = `SRX-${yyyymm}-${String(seq).padStart(5, '0')}`

            const gross = group.lines.reduce((s, l) => s + l.srp * l.qty, 0)
            const discount = group.lines.reduce((s, l) => s + l.discount, 0)
            const total = group.lines.reduce((s, l) => s + l.totalSales, 0)
            const isCharge = head.paymentKind === 'CHARGE'
            const noteParts = [
                head.serviceReceipt ? `sr:${head.serviceReceipt}` : null,
                head.remarks,
                head.accountTitle ? `acct:${head.accountTitle}` : null,
                head.invoiceType,
                head.invoiceNumber ? `inv:${head.invoiceNumber}` : null,
                `src:${head.sheetName}`,
            ].filter(Boolean)

            await prisma.sdSalesOrder.create({
                data: {
                    orderNumber,
                    companyId: company.id,
                    branchId: branch?.id ?? null,
                    customerId: walkIn.id,
                    customerName: head.customerName,
                    channel: head.channel,
                    source: 'ERP',
                    currency: 'PHP',
                    status: 'COMPLETED',
                    paymentStatus: isCharge ? 'Unpaid' : 'Paid',
                    paymentMethod: isCharge ? 'CHARGE' : 'CASH',
                    receiptNumber,
                    subtotal: new Decimal(gross),
                    discountAmount: new Decimal(discount),
                    totalAmount: new Decimal(total),
                    outstandingBalance: new Decimal(isCharge ? total : 0),
                    notes: noteParts.join(' | ').slice(0, 1900) || null,
                    correlationId: randomUUID(),
                    createdBy: SEED_TAG,
                    createdAt: head.saleDate,
                    updatedAt: head.saleDate,
                    lines: {
                        create: group.lines.map((line, index) => ({
                            lineNumber: index + 1,
                            sku: line.barcode || 'SR-LINE',
                            description: line.particular,
                            productNameSnapshot: line.particular,
                            productSkuSnapshot: line.barcode,
                            variantBarcode: line.barcode,
                            quantity: new Decimal(line.qty),
                            unitPrice: new Decimal(line.srp),
                            lineTotal: new Decimal(line.totalSales),
                            integrationStatus: 'FULFILLED',
                        })),
                    },
                    ...(isCharge
                        ? {}
                        : {
                              payments: {
                                  create: {
                                      companyId: company.id,
                                      customerId: walkIn.id,
                                      paymentMethod: 'CASH',
                                      amount: new Decimal(total),
                                      tenderAmount: new Decimal(total),
                                      status: 'Paid',
                                      verificationStatus: 'VERIFIED',
                                      paidAt: head.saleDate,
                                      isDemo: false,
                                      createdBy: SEED_TAG,
                                      createdAt: head.saleDate,
                                      updatedAt: head.saleDate,
                                  },
                              },
                          }),
                },
            })

            if ((g + 1) % 100 === 0 || g === groups.length - 1) {
                console.log(`  … ${g + 1} / ${groups.length} orders`)
            }
        }

        console.log(
            `Created ${groups.length} order(s) (${allLines.length} line(s)) with prefix ${ORDER_PREFIX}.`,
        )
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
