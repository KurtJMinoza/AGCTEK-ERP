import { findCustomerMasterId, resolveCommercialCustomerIds } from './customer-master'

function client(master: Record<string, unknown> | null, unlinked: Record<string, unknown> | null = null) {
    return {
        sdCustomer: {
            findUnique: jest.fn().mockResolvedValue(master),
            findFirst: jest.fn().mockResolvedValue(master ? { id: master.id } : null),
        },
        retailClient: { findFirst: jest.fn().mockResolvedValue(unlinked) },
    }
}

describe('resolveCommercialCustomerIds', () => {
    it('returns the master id plus its linked shop account as order identities', async () => {
        const db = client({ id: 'cust-9', email: 'jd@example.com', retailClientId: 'shop-1' })

        await expect(resolveCommercialCustomerIds(db as never, 'cust-9')).resolves.toEqual({
            masterId: 'cust-9',
            retailClientIds: ['shop-1'],
            orderCustomerIds: ['cust-9', 'shop-1'],
            unlinkedShopAccounts: [],
        })
        expect(db.retailClient.findFirst).toHaveBeenCalledWith({
            where: { email: { equals: 'jd@example.com', mode: 'insensitive' }, sdCustomer: null },
            select: { id: true, email: true },
        })
    })

    it('reports a same-email shop account that is linked to no master, without including its orders', async () => {
        const db = client(
            { id: 'cust-9', email: 'jd@example.com', retailClientId: null },
            { id: 'shop-2', email: 'JD@example.com' },
        )

        await expect(resolveCommercialCustomerIds(db as never, 'cust-9')).resolves.toEqual({
            masterId: 'cust-9',
            retailClientIds: [],
            orderCustomerIds: ['cust-9'],
            unlinkedShopAccounts: [{ id: 'shop-2', email: 'JD@example.com' }],
        })
    })

    it('returns null for an unknown master', async () => {
        await expect(resolveCommercialCustomerIds(client(null) as never, 'missing')).resolves.toBeNull()
    })
})

describe('findCustomerMasterId', () => {
    it('matches the master id or its linked shop account', async () => {
        const db = client({ id: 'cust-9' })
        await expect(findCustomerMasterId(db as never, 'shop-1')).resolves.toBe('cust-9')
        expect(db.sdCustomer.findFirst).toHaveBeenCalledWith({
            where: { OR: [{ id: 'shop-1' }, { retailClientId: 'shop-1' }] },
            select: { id: true },
        })
    })
})
