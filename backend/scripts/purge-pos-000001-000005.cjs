const { PrismaClient } = require('@prisma/client')

const ORDER_NUMBERS = [
  'POS-000001',
  'POS-000002',
  'POS-000003',
  'POS-000004',
  'POS-000005',
]

async function main() {
  const prisma = new PrismaClient()
  try {
    const orders = await prisma.sdSalesOrder.findMany({
      where: { orderNumber: { in: ORDER_NUMBERS } },
      select: {
        id: true,
        orderNumber: true,
        receiptNumber: true,
        status: true,
        lines: { select: { id: true, reservationHeaderId: true } },
        voidTransaction: { select: { id: true, voidNumber: true } },
      },
      orderBy: { orderNumber: 'asc' },
    })

    if (orders.length === 0) {
      console.log('No matching orders found.')
      return
    }

    const orderIds = orders.map((o) => o.id)
    const lineIds = orders.flatMap((o) => o.lines.map((l) => l.id))
    const reservationHeaderIds = [
      ...new Set(
        orders
          .flatMap((o) => o.lines.map((l) => l.reservationHeaderId))
          .filter(Boolean),
      ),
    ]

    console.log(
      'Deleting:',
      orders.map((o) => ({
        orderNumber: o.orderNumber,
        receiptNumber: o.receiptNumber,
        voidNumber: o.voidTransaction?.voidNumber ?? null,
      })),
    )

    const result = await prisma.$transaction(async (tx) => {
      // Clear optional FK refs that may block line/order delete
      if (lineIds.length) {
        await tx.sdSalesOrderLine.updateMany({
          where: { id: { in: lineIds } },
          data: { reservationHeaderId: null },
        })
      }

      // Restrict children (none expected, but safe)
      const deletedInvoices = await tx.sdSalesInvoice.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedShipments = await tx.sdShipment.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedReturns = await tx.sdSalesReturn.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedReturnRequests = await tx.sdReturnRequest.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })

      // Explicit cascade-ish children for clarity / audit counts
      const deletedVoids = await tx.sdPosVoidTransaction.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedCollections = await tx.sdPosCollection.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedReceivables = await tx.sdPosReceivable.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedLoans = await tx.sdEmployeeLoanItem.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedPayments = await tx.sdSalesOrderPayment.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedReviews = await tx.productReview.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })

      // Fulfillment lines → fulfillments cascade with order, but delete explicitly
      const fulfillments = await tx.sdFulfillment.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true },
      })
      const fulfillmentIds = fulfillments.map((f) => f.id)
      const deletedFulfillmentLines = fulfillmentIds.length
        ? await tx.sdFulfillmentLine.deleteMany({
            where: { fulfillmentId: { in: fulfillmentIds } },
          })
        : { count: 0 }
      const deletedFulfillments = await tx.sdFulfillment.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })

      const deletedLines = await tx.sdSalesOrderLine.deleteMany({
        where: { salesOrderId: { in: orderIds } },
      })
      const deletedOrders = await tx.sdSalesOrder.deleteMany({
        where: { id: { in: orderIds } },
      })

      // Orphan reservation headers created for these sales (if any)
      let deletedReservationLines = { count: 0 }
      let deletedReservationHeaders = { count: 0 }
      if (reservationHeaderIds.length) {
        deletedReservationLines = await tx.mmInventoryReservationLine.deleteMany({
          where: { headerId: { in: reservationHeaderIds } },
        })
        deletedReservationHeaders = await tx.mmInventoryReservationHeader.deleteMany({
          where: { id: { in: reservationHeaderIds } },
        })
      }

      return {
        deletedInvoices: deletedInvoices.count,
        deletedShipments: deletedShipments.count,
        deletedReturns: deletedReturns.count,
        deletedReturnRequests: deletedReturnRequests.count,
        deletedVoids: deletedVoids.count,
        deletedCollections: deletedCollections.count,
        deletedReceivables: deletedReceivables.count,
        deletedLoans: deletedLoans.count,
        deletedPayments: deletedPayments.count,
        deletedReviews: deletedReviews.count,
        deletedFulfillmentLines: deletedFulfillmentLines.count,
        deletedFulfillments: deletedFulfillments.count,
        deletedLines: deletedLines.count,
        deletedOrders: deletedOrders.count,
        deletedReservationLines: deletedReservationLines.count,
        deletedReservationHeaders: deletedReservationHeaders.count,
      }
    })

    const remaining = await prisma.sdSalesOrder.findMany({
      where: {
        OR: [
          { orderNumber: { in: ORDER_NUMBERS } },
          {
            receiptNumber: {
              in: [
                'RCP-000002',
                'RCP-000003',
                'RCP-000004',
                'RCP-000005',
                'RCP-000006',
              ],
            },
          },
        ],
      },
      select: { orderNumber: true, receiptNumber: true },
    })
    const remainingVoids = await prisma.sdPosVoidTransaction.findMany({
      where: {
        voidNumber: {
          in: [
            'V-RCP-000002',
            'V-RCP-000003',
            'V-RCP-000004',
            'V-RCP-000005',
            'V-RCP-000006',
          ],
        },
      },
      select: { voidNumber: true },
    })

    console.log('Purge result:', result)
    console.log('Remaining orders:', remaining)
    console.log('Remaining voids:', remainingVoids)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
