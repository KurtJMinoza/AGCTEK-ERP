import { PrismaClient } from '@prisma/client'
import { hardDeleteGoodsReceiptsByNumbers } from './delete-goods-receipts'

const NUMBERS = process.argv.slice(2).length
    ? process.argv.slice(2)
    : Array.from({ length: 12 }, (_, i) =>
          `GR-20261006-${String(i + 1).padStart(5, '0')}`,
      )

const prisma = new PrismaClient()

hardDeleteGoodsReceiptsByNumbers(prisma, NUMBERS)
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
