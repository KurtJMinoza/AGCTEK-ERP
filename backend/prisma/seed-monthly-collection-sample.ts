/**
 * Seed Monthly Collection report data from Monthly Collection 2026.xlsx.
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-monthly-collection-sample.ts
 *   npx ts-node ... seed-monthly-collection-sample.ts --force
 *   npx ts-node ... seed-monthly-collection-sample.ts --file path/to/workbook.xlsx
 */
import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { parseMonthlyCollectionWorkbook } from './lib/parse-monthly-collection-xlsx'

const ORDER_PREFIX = 'MC-2026-XLSX'
const LEGACY_PREFIX = 'MC-SAMPLE-2026'

const DEFAULT_XLSX = path.join(
    __dirname,
    'fixtures',
    'monthly-collection-2026.xlsx',
)

/** Default workbook removed from repo — pass --file= explicitly to import. */

const args = process.argv.slice(2)
const force = args.includes('--force')
const fileArg = args.find((a) => a.startsWith('--file='))
const xlsxPath = fileArg
    ? fileArg.slice('--file='.length)
    : DEFAULT_XLSX

async function removeExisting(prisma: PrismaClient) {
    const orders = await prisma.sdSalesOrder.findMany({
        where: {
            OR: [
                { orderNumber: { startsWith: ORDER_PREFIX } },
                { orderNumber: { startsWith: LEGACY_PREFIX } },
            ],
        },
        select: { id: true, orderNumber: true },
    })
    if (!orders.length) return 0
    console.log(`Removing ${orders.length} existing seed order(s)…`)
    await prisma.sdSalesOrder.deleteMany({
        where: { id: { in: orders.map((o) => o.id) } },
    })
    return orders.length
}

async function main() {
    if (!fileArg && !fs.existsSync(DEFAULT_XLSX)) {
        console.error(
            'No default Monthly Collection workbook in prisma/fixtures. ' +
                'Use --file=path/to/Monthly Collection 2026.xlsx or restore the fixture.',
        )
        process.exit(1)
    }
    if (!fs.existsSync(xlsxPath)) {
        throw new Error(`Workbook not found: ${xlsxPath}`)
    }

    const lines = parseMonthlyCollectionWorkbook(xlsxPath)
    console.log(`Parsed ${lines.length} collection line(s) from ${path.basename(xlsxPath)}`)
    if (!lines.length) {
        throw new Error('No collection rows parsed — check workbook format.')
    }

    const prisma = new PrismaClient()
    try {
        const existing = await prisma.sdSalesOrder.count({
            where: { orderNumber: { startsWith: ORDER_PREFIX } },
        })
        const legacy = await prisma.sdSalesOrder.count({
            where: { orderNumber: { startsWith: LEGACY_PREFIX } },
        })
        if ((existing > 0 || legacy > 0) && !force) {
            console.log(
                `Seed orders already present (xlsx=${existing}, legacy=${legacy}). Use --force to replace.`,
            )
            return
        }
        if (force) {
            await removeExisting(prisma)
        } else if (legacy > 0) {
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
            where: { customerNumber: 'WALK-MC-SAMPLE' },
        })
        if (!walkIn) {
            walkIn = await prisma.sdCustomer.create({
                data: {
                    customerNumber: 'WALK-MC-SAMPLE',
                    companyName: 'Walk-in customer',
                    contactName: 'Walk-in',
                    phone: '',
                    status: 'ACTIVE',
                    createdBy: admin.id,
                },
            })
        }

        let seq = 1
        const batchSize = 50
        for (let i = 0; i < lines.length; i++) {
            const row = lines[i]
            const orderNumber = `${ORDER_PREFIX}-${String(seq).padStart(5, '0')}`
            seq += 1

            const paidAt = row.collectionDate
            const amount = row.total

            await prisma.sdSalesOrder.create({
                data: {
                    orderNumber,
                    companyId: company.id,
                    branchId: branch?.id ?? null,
                    customerId: walkIn.id,
                    customerName: row.customerName,
                    channel: 'POS',
                    currency: 'PHP',
                    status: 'COMPLETED',
                    paymentStatus: 'PAID',
                    paymentMethod: row.paymentMethod,
                    subtotal: new Decimal(amount),
                    totalAmount: new Decimal(amount),
                    outstandingBalance: new Decimal(0),
                    correlationId: randomUUID(),
                    createdBy: admin.id,
                    lines: {
                        create: [
                            {
                                lineNumber: 1,
                                sku: 'MC-LINE',
                                description: row.particular,
                                quantity: new Decimal(1),
                                unitPrice: new Decimal(amount),
                                lineTotal: new Decimal(amount),
                            },
                        ],
                    },
                    payments: {
                        create: {
                            companyId: company.id,
                            customerId: walkIn.id,
                            paymentMethod: row.paymentMethod,
                            amount: new Decimal(amount),
                            tenderAmount: new Decimal(amount),
                            status: 'Paid',
                            verificationStatus: 'VERIFIED',
                            paidAt,
                            isDemo: false,
                            createdBy: admin.id,
                        },
                    },
                },
            })

            if (seq % batchSize === 0 || i === lines.length - 1) {
                console.log(`  … ${i + 1} / ${lines.length}`)
            }
        }

        console.log(`Created ${lines.length} order(s) with prefix ${ORDER_PREFIX}.`)
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})