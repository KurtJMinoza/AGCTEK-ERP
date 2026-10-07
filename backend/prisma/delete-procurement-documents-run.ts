import { PrismaClient } from '@prisma/client'
import {
    deletePurchaseOrderByNumber,
    deletePurchaseRequisitionByNumber,
} from './delete-procurement-documents'

const PO = process.env.PO_NUMBER ?? 'PO-20261005-00001'
const PR = process.env.PR_NUMBER ?? 'REQ-20261005-00001'

const prisma = new PrismaClient()

async function main() {
    console.log('Deleting procurement documents …')
    await deletePurchaseOrderByNumber(prisma, PO)
    await deletePurchaseRequisitionByNumber(prisma, PR)
    console.log('Done.')
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
