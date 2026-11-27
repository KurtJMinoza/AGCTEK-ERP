/**
 * Creates a minimal non-POS ISSUED sales invoice for AWIC and posts AR.
 *
 *   npx ts-node --transpile-only --project prisma/tsconfig.seed.json prisma/seed-ar-v1-demo.ts
 */
import { NestFactory } from '@nestjs/core'
import { Decimal } from '@prisma/client/runtime/library'
import { AppModule } from '../src/app.module'
import { FicoAccountsReceivableService } from '../src/fico/fico-accounts-receivable.service'
import { PrismaService } from '../src/prisma/prisma.service'

const TAG = 'seed-ar-v1-demo'

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    })
    const prisma = app.get(PrismaService)
    const ar = app.get(FicoAccountsReceivableService)

    const company = await prisma.company.findFirst({
        where: { code: 'AWIC' },
        select: { id: true, code: true },
    })
    if (!company) throw new Error('AWIC company missing')

    const settings = await prisma.ficoCompanyAccountingSettings.findUnique({
        where: { companyId: company.id },
        select: {
            status: true,
            baseCurrency: true,
            defaultReceivableAccountId: true,
            defaultSalesRevenueAccountId: true,
            accountDeterminationProfileId: true,
        },
    })
    console.log('FICO settings', settings)
    if (!settings || settings.status !== 'ACTIVE') {
        throw new Error(
            `AWIC FICO company accounting must be ACTIVE (got ${settings?.status ?? 'missing'}). Activate it in FICO → Company Accounting Settings first.`,
        )
    }

    let customer = await prisma.sdCustomer.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, customerNumber: true, companyName: true },
    })
    if (!customer) {
        customer = await prisma.sdCustomer.create({
            data: {
                customerNumber: `AR-DEMO-${Date.now().toString().slice(-6)}`,
                companyName: 'AR Demo Customer',
                contactName: 'AR Demo',
                email: `ar-demo-${Date.now()}@example.com`,
                status: 'ACTIVE',
                createdBy: TAG,
            },
            select: { id: true, customerNumber: true, companyName: true },
        })
        console.log('Created customer', customer.customerNumber)
    } else {
        console.log(
            'Using customer',
            customer.customerNumber,
            customer.companyName,
        )
    }

    const currency = (settings.baseCurrency || 'PHP').toUpperCase()
    const now = new Date()
    const stamp = Date.now().toString().slice(-8)
    const orderNumber = `AR-SO-${stamp}`
    const invoiceNumber = `AR-INV-${stamp}`
    const unitPrice = new Decimal('1500.00')
    const qty = new Decimal('2')
    const lineTotal = unitPrice.mul(qty)

    const order = await prisma.sdSalesOrder.create({
        data: {
            companyId: company.id,
            orderNumber,
            channel: 'STANDARD',
            source: 'ERP',
            status: 'COMPLETED',
            customerId: customer.id,
            customerName: customer.companyName,
            currency,
            subtotal: lineTotal,
            discountAmount: new Decimal(0),
            shippingAmount: new Decimal(0),
            taxAmount: new Decimal(0),
            totalAmount: lineTotal,
            correlationId: `ar-demo-${stamp}`,
            createdBy: TAG,
            lines: {
                create: [
                    {
                        lineNumber: 1,
                        sku: 'AR-DEMO-SKU',
                        description: 'AR Demo Item',
                        productNameSnapshot: 'AR Demo Item',
                        quantity: qty,
                        unitPrice,
                        lineTotal,
                        taxAmount: new Decimal(0),
                    },
                ],
            },
        },
        include: { lines: true },
    })

    const invoice = await prisma.sdSalesInvoice.create({
        data: {
            companyId: company.id,
            salesOrderId: order.id,
            invoiceNumber,
            status: 'ISSUED',
            currency,
            subtotal: lineTotal,
            discountAmount: new Decimal(0),
            shippingAmount: new Decimal(0),
            totalAmount: lineTotal,
            issuedAt: now,
            createdBy: TAG,
            lines: {
                create: order.lines.map((line) => ({
                    lineNumber: line.lineNumber,
                    salesOrderLineId: line.id,
                    description: line.description ?? 'AR Demo Item',
                    sku: line.sku ?? 'AR-DEMO-SKU',
                    quantity: line.quantity,
                    unitPrice: line.unitPrice ?? unitPrice,
                    lineTotal: line.lineTotal ?? lineTotal,
                })),
            },
        },
    })

    console.log(`Created order ${order.orderNumber} / invoice ${invoice.invoiceNumber}`)

    const result = await ar.postIssuedSalesInvoice({
        schemaVersion: 'v2',
        eventType: 'SalesInvoiceIssued',
        companyId: company.id,
        postingDate: now.toISOString(),
        transactionDate: now.toISOString(),
        currencyCode: currency,
        documentType: 'SALES_INVOICE',
        documentId: invoice.id,
        sourceModule: 'SD',
        accountingEffects: [],
        lines: [],
        financiallyRelevant: true,
        idempotencyKey: `sales-invoice-ar:${invoice.id}`,
        salesInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        salesOrderId: order.id,
        orderNumber: order.orderNumber,
        customerId: customer.id,
        totalAmount: lineTotal.toString(),
        subtotal: lineTotal.toString(),
        discountAmount: '0',
        shippingAmount: '0',
        taxAmount: '0',
        issuedAt: now.toISOString(),
        channel: 'STANDARD',
    })

    console.log('AR post result', result)

    const openItems = await prisma.ficoArOpenItem.findMany({
        where: { companyId: company.id },
        select: {
            id: true,
            openAmount: true,
            status: true,
            dueDate: true,
            document: { select: { referenceNumber: true, status: true } },
        },
    })
    console.log('Open items', JSON.stringify(openItems, null, 2))

    await app.close()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
