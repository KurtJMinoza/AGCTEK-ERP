const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const key = process.argv[2]
p.mmAccountingEvent
    .findUnique({ where: { idempotencyKey: key } })
    .then((e) => console.log(JSON.stringify(e, null, 2)))
    .finally(() => p.$disconnect())