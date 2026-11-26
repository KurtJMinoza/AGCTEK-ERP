import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const order = await prisma.sdSalesOrder.findFirst({
        where: { orderNumber: 'POS-000001' },
        select: {
            id: true,
            orderNumber: true,
            receiptNumber: true,
            companyId: true,
            customerId: true,
            totalAmount: true,
            paymentStatus: true,
            status: true,
        },
    })
    console.log('order', order)
    if (!order) return
    const events = await prisma.mmAccountingEvent.findMany({
        where: {
            OR: [
                { documentId: order.id },
                { idempotencyKey: { contains: order.id } },
                { idempotencyKey: `pos-revenue:${order.id}` },
            ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
    })
    for (const e of events) {
        console.log({
            id: e.id,
            eventType: e.eventType,
            status: e.status,
            lastError: e.lastError,
            lastErrorCode: e.lastErrorCode,
            attemptCount: e.attemptCount,
            idempotencyKey: e.idempotencyKey,
            payload: e.payload,
        })
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())