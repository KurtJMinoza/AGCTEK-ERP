import type { Prisma } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'

/**
 * Storefront orders carry the shop account id in `customerId`; other orders carry the Customer
 * Master id. Returns the Customer Master (`SdCustomer`) id either way, or null when the shop
 * account is not linked to a customer yet.
 */
export async function findCustomerMasterId(
    client: PrismaService | Prisma.TransactionClient,
    orderCustomerId: string,
): Promise<string | null> {
    const customer = await client.sdCustomer.findFirst({
        where: { OR: [{ id: orderCustomerId }, { retailClientId: orderCustomerId }] },
        select: { id: true },
    })
    return customer?.id ?? null
}
