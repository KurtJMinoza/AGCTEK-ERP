import {
    applyStopOrder,
    buildTripStops,
    stopKey,
    canTransitionLoadPlan,
    checkLoadCapacity,
    locationKey,
    validateStopReorder,
    type StopSourceLine,
} from './tms.rules'

const WH_MAIN = { warehouseId: 'wh-main', warehouseName: 'Main Warehouse', address: 'Main St' }

function line(
    id: string,
    to: string,
    extra: Partial<StopSourceLine> = {},
): StopSourceLine {
    return {
        loadPlanLineId: `lpl-${id}`,
        shipmentLineId: `sl-${id}`,
        shipmentId: `shp-${id}`,
        customerName: `Customer ${id}`,
        ship: WH_MAIN,
        to: { address: to, lat: 14.5, lng: 121 },
        ...extra,
    }
}

describe('checkLoadCapacity', () => {
    it('accepts load at exactly capacity', () => {
        const r = checkLoadCapacity({ capacityQty: 10 }, [{ qty: 4 }, { qty: 6 }])
        expect(r.ok).toBe(true)
        expect(r.totalQty).toBe(10)
        expect(r.remainingQty).toBe(0)
    })

    it('rejects qty over capacity', () => {
        const r = checkLoadCapacity({ capacityQty: 10 }, [{ qty: 11 }])
        expect(r.ok).toBe(false)
        expect(r.message).toContain('11 / 10')
    })

    it('rejects when vehicle has no qty capacity', () => {
        expect(checkLoadCapacity({ capacityQty: 0 }, [{ qty: 1 }]).ok).toBe(false)
    })

    it('checks weight only when the vehicle has a weight limit', () => {
        const lines = [{ qty: 1, weightKg: 500 }]
        expect(checkLoadCapacity({ capacityQty: 5, capacityWeightKg: 0 }, lines).ok).toBe(true)
        const r = checkLoadCapacity({ capacityQty: 5, capacityWeightKg: 400 }, lines)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('weight')
    })

    it('checks volume when the vehicle has a volume limit', () => {
        const r = checkLoadCapacity(
            { capacityQty: 5, capacityVolumeM3: 1 },
            [{ qty: 1, volumeM3: 2 }],
        )
        expect(r.ok).toBe(false)
        expect(r.message).toContain('volume')
    })
})

describe('locationKey', () => {
    it('prefers warehouse id over address', () => {
        expect(locationKey({ warehouseId: 'w1', address: 'X' })).toBe('WH:w1')
    })
    it('normalises addresses', () => {
        expect(locationKey({ address: '  12  Rizal   Ave ' })).toBe('ADDR:12 rizal ave')
    })
    it('returns null without a location', () => {
        expect(locationKey({})).toBeNull()
        expect(locationKey(null)).toBeNull()
    })
})

describe('applyStopOrder', () => {
    const { stops } = buildTripStops([line('1', 'A St'), line('2', 'B St')])
    const [ship, a, b, home] = stops.map(stopKey)

    it('returns stops unchanged without an order', () => {
        expect(applyStopOrder(stops, undefined).stops).toBe(stops)
    })

    it('moves TO stops and renumbers sequence', () => {
        const r = applyStopOrder(stops, [ship, b, a, home])
        expect(r.error).toBeNull()
        expect(r.stops.map(stopKey)).toEqual([ship, b, a, home])
        expect(r.stops.map((s) => s.sequence)).toEqual([1, 2, 3, 4])
    })

    it('rejects moving a TO stop before the pickup', () => {
        expect(applyStopOrder(stops, [a, ship, b, home]).error).toMatch(/SHIP → TO → RETURN/)
    })

    it('rejects moving a TO stop after the return', () => {
        expect(applyStopOrder(stops, [ship, a, home, b]).error).toMatch(/SHIP → TO → RETURN/)
    })

    it('rejects unknown or missing keys', () => {
        expect(applyStopOrder(stops, [ship, a, b]).error).toBeTruthy()
        expect(applyStopOrder(stops, [ship, a, 'TO|ADDR:nowhere', home]).error).toBeTruthy()
    })
})

describe('buildTripStops', () => {
    it('dedupes SHIP by warehouse and TO by address, ordered SHIP → TO → back to origin', () => {
        const { stops, errors } = buildTripStops([
            line('1', 'Makati Ave 1'),
            line('2', 'makati  ave 1'),
            line('3', 'Quezon Blvd 9'),
        ])
        expect(errors).toEqual([])
        expect(stops.map((s) => s.stopType)).toEqual(['SHIP', 'TO', 'TO', 'RETURN'])
        expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3, 4])
        expect(stops[0].warehouseId).toBe('wh-main')
        expect(stops[0].lines).toHaveLength(3)
        expect(stops[1].lines.map((l) => l.shipmentLineId)).toEqual(['sl-1', 'sl-2'])
        expect(stops[1].name).toBe('Deliver · 2 customers')
        expect(stops[2].name).toBe('Deliver · Customer 3')
        expect(stops[3].warehouseId).toBe('wh-main')
        expect(stops[3].lines).toEqual([])
    })

    it('merges line returns to the origin into the final return stop', () => {
        const { stops } = buildTripStops([
            line('1', 'A St', { ret: WH_MAIN }),
            line('2', 'B St'),
        ])
        expect(stops.map((s) => s.stopType)).toEqual(['SHIP', 'TO', 'TO', 'RETURN'])
        expect(stops[3].lines.map((l) => l.shipmentLineId)).toEqual(['sl-1'])
    })

    it('ends with the origin warehouse after returns to other locations', () => {
        const OTHER = { warehouseId: 'wh-2', warehouseName: 'Depot 2', address: 'Depot Rd' }
        const { stops } = buildTripStops([line('1', 'A St', { ret: OTHER })])
        expect(stops.map((s) => `${s.stopType}:${s.warehouseId ?? ''}`)).toEqual([
            'SHIP:wh-main',
            'TO:',
            'RETURN:wh-2',
            'RETURN:wh-main',
        ])
    })

    it('orders TO stops by earliest delivery window', () => {
        const { stops } = buildTripStops([
            line('1', 'Late St', { earliestDeliveryAt: new Date('2026-10-01T15:00:00Z') }),
            line('2', 'Early St', { earliestDeliveryAt: new Date('2026-10-01T08:00:00Z') }),
        ])
        expect(stops.filter((s) => s.stopType === 'TO').map((s) => s.address)).toEqual([
            'Early St',
            'Late St',
        ])
    })

    it('reports lines missing ship-from / ship-to and creates no orphan stops', () => {
        const { stops, errors } = buildTripStops([
            line('1', 'A St', { ship: null }),
            line('2', '', {}),
        ])
        expect(errors).toHaveLength(2)
        expect(
            stops.filter((s) => s.stopType !== 'RETURN').every((s) => s.lines.length > 0),
        ).toBe(true)
    })
})

describe('validateStopReorder', () => {
    const current = [
        { id: 's1', stopType: 'SHIP' as const },
        { id: 't1', stopType: 'TO' as const },
        { id: 't2', stopType: 'TO' as const },
        { id: 'r1', stopType: 'RETURN' as const },
    ]

    it('allows swapping TO stops', () => {
        expect(validateStopReorder(current, ['s1', 't2', 't1', 'r1'])).toBeNull()
    })

    it('rejects moving a TO before SHIP', () => {
        expect(validateStopReorder(current, ['t1', 's1', 't2', 'r1'])).toContain('order')
    })

    it('rejects missing or foreign stops', () => {
        expect(validateStopReorder(current, ['s1', 't1', 'r1'])).not.toBeNull()
        expect(validateStopReorder(current, ['s1', 't1', 't2', 'x'])).not.toBeNull()
    })

    it('rejects reordering SHIP stops', () => {
        const two = [
            { id: 's1', stopType: 'SHIP' as const },
            { id: 's2', stopType: 'SHIP' as const },
            { id: 't1', stopType: 'TO' as const },
        ]
        expect(validateStopReorder(two, ['s2', 's1', 't1'])).toContain('SHIP')
    })
})

describe('load plan transitions', () => {
    it('READY only from VALIDATED', () => {
        expect(canTransitionLoadPlan('VALIDATED', 'READY')).toBe(true)
        expect(canTransitionLoadPlan('DRAFT', 'READY')).toBe(false)
    })
    it('terminal states do not move', () => {
        expect(canTransitionLoadPlan('COMPLETED', 'DRAFT')).toBe(false)
        expect(canTransitionLoadPlan('CANCELLED', 'DRAFT')).toBe(false)
    })
})
