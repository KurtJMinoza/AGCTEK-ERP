import { PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client'

/**
 * One-off cleanup: remove listed POS test orders + walk-in / test customers
 * and Restrict-linked commercial references.
 *
 * Does NOT reverse MM inventory postings (ledger stays). Stock already
 * issued for completed POS sales is left as-is.
 *
 * Run from backend/:
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/cleanup-pos-test-data.ts --dry-run
 *   npx ts-node --project prisma/tsconfig.seed.json prisma/cleanup-pos-test-data.ts
 */
const ORDER_NUMBERS = [
    'POS-000001',
    'POS-000002',
    'POS-000003',
    'POS-000004',
    'POS-000007',
    'PGDBG-1792829699578-8gi4ec',
    'SO-000001',
    'SO-000002',
]

/** Explicit customer numbers; order-linked customers are also collected at runtime. */
const CUSTOMER_NUMBERS = [
    'WALK-000001',
    'WALK-000010',
]

const log = (msg: string) => console.log(msg)

async function deleteOrders(
    prisma: PrismaClientType,
    orderIds: string[],
    dryRun: boolean,
) {
    if (!orderIds.length) return

    const lineIds = (
        await prisma.sdSalesOrderLine.findMany({
            where: { salesOrderId: { in: orderIds } },
            select: { id: true },
        })
    ).map((l) => l.id)

    const returnRequests = await prisma.sdReturnRequest.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const returnRequestIds = returnRequests.map((r) => r.id)

    const salesReturns = await prisma.sdSalesReturn.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const salesReturnIds = salesReturns.map((r) => r.id)

    const invoices = await prisma.sdSalesInvoice.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
    })
    const invoiceIds = invoices.map((i) => i.id)

    const refunds = returnRequestIds.length
        ? await prisma.sdRefund.findMany({
              where: { returnRequestId: { in: returnRequestIds } },
              select: { id: true },
          })
        : []
    const refundIds = refunds.map((r) => r.id)

    const mmReturns = salesReturnIds.length
        ? await prisma.mmCustomerReturn.findMany({
              where: { sdSalesReturnId: { in: salesReturnIds } },
              select: { id: true },
          })
        : []
    const mmReturnIds = mmReturns.map((r) => r.id)

    const reservationCount = await prisma.mmInventoryReservationHeader.count({
        where: { sourceDocumentId: { in: orderIds } },
    })

    log(
        `  related: lines=${lineIds.length} invoices=${invoiceIds.length} ` +
            `returns=${salesReturnIds.length} returnReqs=${returnRequestIds.length} ` +
            `refunds=${refundIds.length} mmReturns=${mmReturnIds.length} ` +
            `reservations=${reservationCount} (left intact; GI history)`,
    )

    if (dryRun) return

    await prisma.$transaction(async (tx) => {
        if (refundIds.length) {
            await tx.sdCreditMemo.deleteMany({ where: { refundId: { in: refundIds } } })
            await tx.sdRefund.deleteMany({ where: { id: { in: refundIds } } })
        }

        if (returnRequestIds.length) {
            // CRM tickets Restrict on return request — detach first
            await tx.crmTicket.updateMany({
                where: { sdReturnRequestId: { in: returnRequestIds } },
                data: { sdReturnRequestId: null },
            })
            await tx.sdReturnRequestLine.deleteMany({
                where: { returnRequestId: { in: returnRequestIds } },
            })
            await tx.sdReturnRequest.deleteMany({
                where: { id: { in: returnRequestIds } },
            })
        }

        if (mmReturnIds.length) {
            await tx.mmCustomerReturnAudit.deleteMany({
                where: { returnId: { in: mmReturnIds } },
            })
            await tx.mmCustomerReturnLine.deleteMany({
                where: { returnId: { in: mmReturnIds } },
            })
            // intake / inspection / disposition cascade from MmCustomerReturn
            await tx.mmCustomerReturn.deleteMany({
                where: { id: { in: mmReturnIds } },
            })
        }

        if (salesReturnIds.length) {
            await tx.sdSalesReturnAudit.deleteMany({
                where: { salesReturnId: { in: salesReturnIds } },
            })
            await tx.sdSalesReturnLine.deleteMany({
                where: { salesReturnId: { in: salesReturnIds } },
            })
            await tx.sdSalesReturn.deleteMany({
                where: { id: { in: salesReturnIds } },
            })
        }

        if (invoiceIds.length) {
            await tx.sdSalesInvoiceLine.deleteMany({
                where: { invoiceId: { in: invoiceIds } },
            })
            await tx.sdSalesInvoice.deleteMany({
                where: { id: { in: invoiceIds } },
            })
        }

        await tx.sdShipment.deleteMany({ where: { salesOrderId: { in: orderIds } } })

        // WM links are SetNull on order delete; clear packages/items for cleanliness
        await tx.wmPackageItem.deleteMany({
            where: { package: { salesOrderId: { in: orderIds } } },
        })
        await tx.wmPackageScanLog.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.wmPackage.deleteMany({ where: { salesOrderId: { in: orderIds } } })
        await tx.wmPackingSession.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })
        await tx.wmPickingTask.updateMany({
            where: { salesOrderId: { in: orderIds } },
            data: { salesOrderId: null },
        })

        await tx.productReview.deleteMany({
            where: { salesOrderId: { in: orderIds } },
        })

        // Cascade: payments, lines, fulfillments, void, receivable, collections, loans
        await tx.sdSalesOrder.deleteMany({ where: { id: { in: orderIds } } })
    })
}

export async function cleanupPosTestData(
    prisma: PrismaClientType,
    dryRun = false,
) {
    log(dryRun ? '=== DRY RUN ===' : '=== DELETE ===')

    const orders = await prisma.sdSalesOrder.findMany({
        where: { orderNumber: { in: ORDER_NUMBERS } },
        select: {
            id: true,
            orderNumber: true,
            customerId: true,
            customerName: true,
            status: true,
            totalAmount: true,
        },
        orderBy: { orderNumber: 'asc' },
    })
    const foundOrders = new Set(orders.map((o) => o.orderNumber))
    for (const n of ORDER_NUMBERS) {
        if (!foundOrders.has(n)) log(`  skip order ${n}: not found`)
    }
    for (const o of orders) {
        log(
            `  order ${o.orderNumber} ${o.status} ${o.customerName ?? o.customerId} ` +
                `${o.totalAmount ?? 0}`,
        )
    }

    const orderCustomerIds = [
        ...new Set(
            orders
                .map((o) => o.customerId)
                .filter((id): id is string => Boolean(id)),
        ),
    ]

    const customers = await prisma.sdCustomer.findMany({
        where: {
            OR: [
                { customerNumber: { in: CUSTOMER_NUMBERS } },
                ...(orderCustomerIds.length
                    ? [{ id: { in: orderCustomerIds } }]
                    : []),
            ],
        },
        select: {
            id: true,
            customerNumber: true,
            companyName: true,
            email: true,
        },
        orderBy: { customerNumber: 'asc' },
    })
    const foundCustomers = new Set(customers.map((c) => c.customerNumber))
    for (const n of CUSTOMER_NUMBERS) {
        if (!foundCustomers.has(n)) log(`  skip customer ${n}: not found`)
    }
    for (const c of customers) {
        log(`  customer ${c.customerNumber} ${c.companyName} ${c.email ?? ''}`)
    }

    // Any other orders still pointing at these customers (beyond the listed set)?
    const customerIds = customers.map((c) => c.id)
    const otherOrders = customerIds.length
        ? await prisma.sdSalesOrder.findMany({
              where: {
                  customerId: { in: customerIds },
                  orderNumber: { notIn: ORDER_NUMBERS },
              },
              select: { id: true, orderNumber: true, customerId: true },
          })
        : []
    if (otherOrders.length) {
        log(
            `  also removing ${otherOrders.length} other order(s) tied to these customers`,
        )
        for (const o of otherOrders) log(`    ${o.orderNumber}`)
    }

    const allOrderIds = [
        ...new Set([...orders.map((o) => o.id), ...otherOrders.map((o) => o.id)]),
    ]

    if (!allOrderIds.length && !customers.length) {
        log('Nothing to clean.')
        return
    }

    log(`Deleting ${allOrderIds.length} order(s)…`)
    await deleteOrders(prisma, allOrderIds, dryRun)
    if (!dryRun) log(`  deleted ${allOrderIds.length} order(s)`)

    // Remaining blockers on customers (CRM / quotations / ext-platform)
    for (const customer of customers) {
        const blockers = {
            sdQuotation: await prisma.sdQuotation.count({
                where: { customerId: customer.id },
            }),
            sdSalesReturn: await prisma.sdSalesReturn.count({
                where: { customerId: customer.id },
            }),
            crmProfile: await prisma.crmProfile.count({
                where: { customerId: customer.id },
            }),
            crmOpportunity: await prisma.crmOpportunity.count({
                where: { customerId: customer.id },
            }),
            crmTicket: await prisma.crmTicket.count({
                where: { customerId: customer.id },
            }),
            crmLoyaltyAccount: await prisma.crmLoyaltyAccount.count({
                where: { customerId: customer.id },
            }),
            sdExtPlatformTransaction: await prisma.sdExtPlatformTransaction.count({
                where: { customerId: customer.id },
            }),
            sdSalesOrder: await prisma.sdSalesOrder.count({
                where: { customerId: customer.id },
            }),
        }
        const active = Object.entries(blockers).filter(([, n]) => n > 0)
        if (active.length) {
            log(
                `  clear refs for ${customer.customerNumber}: ` +
                    active.map(([k, n]) => `${k}=${n}`).join(', '),
            )
            if (!dryRun) {
                await prisma.$transaction(async (tx) => {
                    // Ext-platform lines then headers
                    const txs = await tx.sdExtPlatformTransaction.findMany({
                        where: { customerId: customer.id },
                        select: { id: true },
                    })
                    const txIds = txs.map((t) => t.id)
                    if (txIds.length) {
                        await tx.sdExtPlatformTransactionLine.deleteMany({
                            where: { transactionId: { in: txIds } },
                        })
                        await tx.sdExtPlatformTransaction.deleteMany({
                            where: { id: { in: txIds } },
                        })
                    }

                    const quotes = await tx.sdQuotation.findMany({
                        where: { customerId: customer.id },
                        select: { id: true },
                    })
                    const quoteIds = quotes.map((q) => q.id)
                    if (quoteIds.length) {
                        await tx.sdQuotationLine.deleteMany({
                            where: { quotationId: { in: quoteIds } },
                        })
                        await tx.sdQuotation.deleteMany({
                            where: { id: { in: quoteIds } },
                        })
                    }

                    await tx.crmLoyaltyAccount.deleteMany({
                        where: { customerId: customer.id },
                    })
                    await tx.crmTicket.deleteMany({
                        where: { customerId: customer.id },
                    })
                    await tx.crmOpportunity.deleteMany({
                        where: { customerId: customer.id },
                    })
                    await tx.crmLead.deleteMany({
                        where: { customerId: customer.id },
                    })
                    await tx.crmProfile.deleteMany({
                        where: { customerId: customer.id },
                    })
                    await tx.crmEmailMessage.deleteMany({
                        where: { customerId: customer.id },
                    })
                })
            }
        }
    }

    if (dryRun) {
        log(
            `Dry run: would delete ${allOrderIds.length} order(s) and ${customers.length} customer(s).`,
        )
        return
    }

    const deleted = await prisma.sdCustomer.deleteMany({
        where: { id: { in: customers.map((c) => c.id) } },
    })
    log(`Deleted ${deleted.count} customer(s).`)
}

if (require.main === module) {
    const prisma = new PrismaClient()
    cleanupPosTestData(prisma, process.argv.includes('--dry-run'))
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
