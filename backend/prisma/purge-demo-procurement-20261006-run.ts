import { PrismaClient } from '@prisma/client'
import {
    deletePurchaseOrderByNumber,
    deletePurchaseRequisitionByNumber,
} from './delete-procurement-documents'
import { purgePostedGoodsReceiptAndDelete } from './delete-goods-receipts'
import {
    hardDeleteBatchByNumber,
    hardDeleteSerialByNumber,
} from './delete-tracking-records'

const prisma = new PrismaClient()

async function main() {
    console.log('Purging demo procurement + tracking rows (2026-10-06) …\n')

    await purgePostedGoodsReceiptAndDelete(prisma, 'GR-20261006-00013')

    await deletePurchaseOrderByNumber(prisma, 'PO-20261006-00002')
    await deletePurchaseOrderByNumber(prisma, 'PO-20261006-00001')

    await deletePurchaseRequisitionByNumber(prisma, 'REQ-20261006-00002')
    await deletePurchaseRequisitionByNumber(prisma, 'REQ-20261006-00001')

    await hardDeleteBatchByNumber(prisma, 'SKU-LUBE-1L', 'TEST-00001')
    await hardDeleteSerialByNumber(prisma, 'SKU-HELMET-001', '1')

    console.log('\nDone.')
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
