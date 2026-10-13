import { randomUUID } from 'crypto'

/**
 * Shared SD customer-number generator. Used by the Customer Master service
 * and by Shop sign-up when a new customer record is auto-created, so the
 * numbering rule stays in ONE place.
 */

const CUSTOMER_NUMBER_PREFIX = 'CUST'
export const MAX_CUSTOMER_NUMBER_ATTEMPTS = 3

type ClientWithCustomerCount = {
    sdCustomer: { count: () => Promise<number> }
}

export async function nextCustomerNumber(
    attempt: number,
    client: ClientWithCustomerCount,
): Promise<string> {
    const count = await client.sdCustomer.count()
    const number = `${CUSTOMER_NUMBER_PREFIX}-${String(count + 1).padStart(6, '0')}`
    return attempt === 0
        ? number
        : `${number}-${randomUUID().slice(0, 4).toUpperCase()}`
}