import {
    deriveDeliveryStage,
    toDeliveryNumber,
    type DeliverySignals,
} from './delivery-monitor.service'

const signals = (overrides: Partial<DeliverySignals> = {}): DeliverySignals => ({
    orderStatus: 'CONFIRMED',
    shippedAt: null,
    pickingTasks: [],
    packingSessions: [],
    packages: [],
    goodsIssues: [],
    ...overrides,
})

const task = (requiredQty: number, pickedQty: number, status = 'OPEN') => ({
    status,
    requiredQty,
    pickedQty,
})

describe('deriveDeliveryStage', () => {
    it('is pending and needs a warehouse release before MM has picking work', () => {
        expect(deriveDeliveryStage(signals())).toMatchObject({
            stage: 'PENDING_PICK',
            nextAction: 'RELEASE_TO_WAREHOUSE',
        })
    })

    it('is pending pick while tasks exist but nothing is picked', () => {
        expect(
            deriveDeliveryStage(signals({ pickingTasks: [task(5, 0, 'ASSIGNED')] })),
        ).toMatchObject({ stage: 'PENDING_PICK', nextAction: 'PICK', requiredQty: 5 })
    })

    it('is picking once quantity is picked, and points to packing when complete', () => {
        expect(
            deriveDeliveryStage(signals({ pickingTasks: [task(5, 2), task(3, 0)] })),
        ).toMatchObject({ stage: 'PICKING', nextAction: 'PICK', pickedQty: 2 })
        expect(
            deriveDeliveryStage(signals({ pickingTasks: [task(5, 5, 'COMPLETED')] })),
        ).toMatchObject({ stage: 'PICKING', nextAction: 'PACK' })
    })

    it('is packed when packing completes or a package is sealed', () => {
        const picked = [task(1, 1, 'COMPLETED')]
        expect(
            deriveDeliveryStage(
                signals({ pickingTasks: picked, packingSessions: [{ status: 'COMPLETED' }] }),
            ),
        ).toMatchObject({ stage: 'PACKED', nextAction: 'POST_GOODS_ISSUE' })
        expect(
            deriveDeliveryStage(
                signals({ pickingTasks: picked, packages: [{ status: 'READY_FOR_DISPATCH' }] }),
            ).stage,
        ).toBe('PACKED')
    })

    it('does not count an open package as packed', () => {
        expect(
            deriveDeliveryStage(
                signals({
                    pickingTasks: [task(1, 1, 'COMPLETED')],
                    packingSessions: [{ status: 'OPEN' }],
                    packages: [{ status: 'OPEN' }],
                }),
            ),
        ).toMatchObject({ stage: 'PICKING', nextAction: 'PACK' })
    })

    it.each([
        ['a posted goods issue', { goodsIssues: [{ status: 'POSTED' }] }],
        ['a SHIPPED order', { orderStatus: 'SHIPPED' }],
        ['a DELIVERED order', { orderStatus: 'DELIVERED' }],
        ['a shipped date', { shippedAt: new Date() }],
    ])('is shipped with %s', (_label, overrides) => {
        expect(deriveDeliveryStage(signals(overrides))).toMatchObject({
            stage: 'SHIPPED',
            nextAction: null,
        })
    })

    it('ignores a draft goods issue', () => {
        expect(
            deriveDeliveryStage(
                signals({
                    packages: [{ status: 'SEALED' }],
                    goodsIssues: [{ status: 'DRAFT' }],
                }),
            ).stage,
        ).toBe('PACKED')
    })
})

describe('toDeliveryNumber', () => {
    it('reuses the sales order sequence', () => {
        expect(toDeliveryNumber('SO-000123')).toBe('DLV-000123')
        expect(toDeliveryNumber('ECOM-7')).toBe('DLV-ECOM-7')
    })
})
