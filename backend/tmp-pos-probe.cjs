const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
    const balances = await p.mmInventoryBalance.findMany({
        where: { materialId: 'cmwcu4df300lrossk5y5eu0kb' },
        select: {
            id: true,
            storageBinId: true,
            warehouseId: true,
            quantity: true,
            reservedQuantity: true,
            availableQuantity: true,
            stockStatus: true,
        },
    })
    console.log('balances', JSON.stringify(balances, null, 1))
    const txns = await p.mmInventoryTransaction.findMany({
        where: { materialId: 'cmwcu4df300lrossk5y5eu0kb' },
        select: {
            id: true,
            transactionNumber: true,
            movementType: true,
            quantity: true,
            signedQuantity: true,
            baseQuantity: true,
            storageBinId: true,
            sourceDocumentType: true,
            sourceDocumentId: true,
            reversalOfId: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
    })
    console.log('transactions', JSON.stringify(txns, null, 1))
    await p.$disconnect()
})().catch(async (e) => {
    console.error(e.message)
    await p.$disconnect()
})
