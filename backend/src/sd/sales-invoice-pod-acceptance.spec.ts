import {
    isPartialPodAcceptance,
    loadPodAcceptanceForOrder,
    money,
} from './sales-invoice-pod-acceptance'

describe('sales-invoice-pod-acceptance', () => {
    describe('money', () => {
        it('multiplies qty × unit price to 2 dp', () => {
            expect(money.mul(2, 1299).toString()).toBe('2598')
            expect(money.mul(8, 129.9).toString()).toBe('1039.2')
        })
    })

    describe('isPartialPodAcceptance', () => {
        it('is true when any line accepted less than shipped', () => {
            expect(
                isPartialPodAcceptance({
                    codAmountDue: null,
                    lines: [
                        {
                            salesOrderLineId: 'ol-1',
                            acceptedQuantity: 8,
                            shippedQuantity: 10,
                        },
                    ],
                }),
            ).toBe(true)
        })

        it('is true when only codAmountDue is set', () => {
            expect(
                isPartialPodAcceptance({
                    codAmountDue: 1000,
                    lines: [],
                }),
            ).toBe(true)
        })

        it('is false for full accept with no COD override', () => {
            expect(
                isPartialPodAcceptance({
                    codAmountDue: null,
                    lines: [
                        {
                            salesOrderLineId: 'ol-1',
                            acceptedQuantity: 10,
                            shippedQuantity: 10,
                        },
                    ],
                }),
            ).toBe(false)
        })
    })

    describe('loadPodAcceptanceForOrder', () => {
        it('returns null when there are no delivered shipments', async () => {
            const client = {
                shipment: { findMany: jest.fn().mockResolvedValue([]) },
            }
            await expect(
                loadPodAcceptanceForOrder(client as never, 'so-1'),
            ).resolves.toBeNull()
        })

        it('returns null when the stop has no acceptance recorded', async () => {
            const client = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: 'sh-1',
                            lines: [
                                {
                                    id: 'sl-1',
                                    quantity: 10,
                                    packageItemId: 'pi-1',
                                },
                            ],
                        },
                    ]),
                },
                tripStopShipment: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            shipmentId: 'sh-1',
                            tripStop: { codAmountDue: null, lines: [] },
                        },
                    ]),
                },
            }
            await expect(
                loadPodAcceptanceForOrder(client as never, 'so-1'),
            ).resolves.toBeNull()
        })

        it('resolves accepted qty to the sales order line via the reservation chain', async () => {
            const client = {
                shipment: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: 'sh-1',
                            lines: [
                                {
                                    id: 'sl-1',
                                    quantity: 10,
                                    packageItemId: 'pi-1',
                                },
                            ],
                        },
                    ]),
                },
                tripStopShipment: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            shipmentId: 'sh-1',
                            tripStop: {
                                codAmountDue: 1039.2,
                                lines: [
                                    {
                                        shipmentLineId: 'sl-1',
                                        acceptedQuantity: 8,
                                    },
                                ],
                            },
                        },
                    ]),
                },
                wmPackageItem: {
                    findUnique: jest
                        .fn()
                        .mockResolvedValue({ materialId: 'm-1' }),
                },
                mmInventoryReservationHeader: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'rh-1' }),
                },
                mmInventoryReservationLine: {
                    findMany: jest
                        .fn()
                        .mockResolvedValue([
                            { demandReferenceLineId: 'ol-1' },
                        ]),
                },
            }

            const result = await loadPodAcceptanceForOrder(
                client as never,
                'so-1',
            )
            expect(result).toEqual({
                codAmountDue: 1039.2,
                lines: [
                    {
                        salesOrderLineId: 'ol-1',
                        acceptedQuantity: 8,
                        shippedQuantity: 10,
                    },
                ],
            })
        })
    })
})
