import 'reflect-metadata'
import { PrismaClient } from '@prisma/client'
import { CrmReturnCasesService } from '../src/crm/tickets/return-cases.service'
import { ReturnRequestService } from '../src/sd/return-request.service'

/**
 * Opens the CRM case for storefront returns requested before the RMA hand-off existed (or whose
 * hand-off failed): REQUESTED returns on ECOMMERCE orders, not from damage reports, without a
 * ticket. Uses the same idempotent `CrmReturnCasesService.openForReturn` as the live hand-off.
 *
 * Run: npm run prisma:repair-crm-return-cases
 */
export async function repairCrmReturnCases(prisma: PrismaClient) {
    const pending = await prisma.sdReturnRequest.findMany({
        where: {
            status: 'REQUESTED',
            damageReportId: null,
            crmTicket: null,
            salesOrder: { channel: 'ECOMMERCE' },
        },
        select: { id: true, requestNumber: true },
        orderBy: { createdAt: 'asc' },
    })
    const returnRequests = new ReturnRequestService(prisma as never, {} as never)
    const cases = new CrmReturnCasesService(prisma as never, returnRequests)
    let opened = 0
    const failed: string[] = []
    for (const request of pending) {
        try {
            const { ticket, created } = await cases.openForReturn(request.id, null)
            if (created) opened++
            console.log(`  ${request.requestNumber} → ticket ${ticket.id}${created ? '' : ' (existing)'}`)
        } catch (err) {
            failed.push(request.requestNumber)
            console.log(`  ${request.requestNumber} → skipped: ${err instanceof Error ? err.message : String(err)}`)
        }
    }
    console.log(`Opened ${opened} CRM case(s); ${failed.length} skipped of ${pending.length} pending return(s).`)
    return { pending: pending.length, opened, failed }
}

if (require.main === module) {
    const prisma = new PrismaClient()
    repairCrmReturnCases(prisma)
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
