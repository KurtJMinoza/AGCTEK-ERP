import type { Prisma } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'

type Client = PrismaService | Prisma.TransactionClient

/**
 * Storefront orders carry the shop account id in `customerId`; other orders carry the Customer
 * Master id. Returns the Customer Master (`SdCustomer`) id either way, or null when the shop
 * account is not linked to a customer yet.
 */
export async function findCustomerMasterId(
    client: Client,
    orderCustomerId: string,
): Promise<string | null> {
    const customer = await client.sdCustomer.findFirst({
        where: { OR: [{ id: orderCustomerId }, { retailClientId: orderCustomerId }] },
        select: { id: true },
    })
    return customer?.id ?? null
}

export type CommercialCustomerIds = {
    masterId: string
    /** Shop (storefront) accounts linked to the master through `SdCustomer.retailClientId`. */
    retailClientIds: string[]
    /** Every `SdSalesOrder.customerId` that belongs to the master: its own id + linked shop accounts. */
    orderCustomerIds: string[]
    /**
     * A shop account with the master's email that is linked to no Customer Master. Its orders are
     * NOT included (email is not an identity link); link it in Customer Master to include them.
     */
    unlinkedShopAccounts: { id: string; email: string }[]
}

/**
 * The inverse of `findCustomerMasterId`: all order identities of one Customer Master, resolved
 * through the FK link only. Returns null when the master does not exist.
 */
export async function resolveCommercialCustomerIds(
    client: Client,
    masterCustomerId: string,
): Promise<CommercialCustomerIds | null> {
    const master = await client.sdCustomer.findUnique({
        where: { id: masterCustomerId },
        select: { id: true, email: true, retailClientId: true },
    })
    if (!master) return null
    const retailClientIds = master.retailClientId ? [master.retailClientId] : []
    const sameEmail = master.email
        ? await client.retailClient.findFirst({
              where: {
                  email: { equals: master.email, mode: 'insensitive' },
                  sdCustomer: null,
              },
              select: { id: true, email: true },
          })
        : null
    return {
        masterId: master.id,
        retailClientIds,
        orderCustomerIds: [master.id, ...retailClientIds],
        unlinkedShopAccounts: sameEmail ? [sameEmail] : [],
    }
}
