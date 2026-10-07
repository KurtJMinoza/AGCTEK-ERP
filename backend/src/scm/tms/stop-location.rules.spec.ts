import {
    inferLocationKind,
    planTripStops,
    resolveStopSource,
    validateStopCoordinates,
    type ResolvableShipmentLine,
    type ResolvableWarehouse,
} from './stop-location.rules'

const WH: ResolvableWarehouse = {
    id: 'wh-1',
    code: 'WH1',
    name: 'Main',
    address: '1 Main St',
    status: 'ACTIVE',
    deletedAt: null,
    lat: 14.6,
    lng: 120.98,
    geocodeConfirmed: true,
}

function line(over: Partial<ResolvableShipmentLine> = {}, id = '1'): ResolvableShipmentLine {
    return {
        id: `sl-${id}`,
        shipmentId: `shp-${id}`,
        shipFromWarehouseId: 'wh-1',
        shipFromAddress: 'line copy',
        shipFromLat: 1,
        shipFromLng: 1,
        shipToAddress: `Customer ${id} St`,
        shipToLat: 14.55,
        shipToLng: 121.02,
        returnWarehouseId: null,
        returnAddress: null,
        returnLat: null,
        returnLng: null,
        shipFromWarehouse: WH,
        returnWarehouse: null,
        ...over,
        shipment: {
            reference: `SHP-${id}`,
            customerName: `Customer ${id}`,
            movementType: 'DELIVERY',
            earliestDeliveryAt: null,
            latestDeliveryAt: null,
            ...over.shipment,
        },
    }
}

const stop = (over: Record<string, unknown> = {}) => ({
    sequence: 1,
    stopType: 'SHIP' as const,
    locationKind: 'WAREHOUSE' as const,
    warehouseId: 'wh-1',
    name: 'Load · Main',
    address: '1 Main St',
    lat: 14.6,
    lng: 120.98,
    ...over,
})

describe('resolveStopSource', () => {
    it('DELIVERY ship-from uses MM warehouse master address + coords, never line copies', () => {
        const r = resolveStopSource('lpl-1', line())
        expect(r.errors).toEqual([])
        expect(r.line.ship).toMatchObject({
            kind: 'WAREHOUSE',
            warehouseId: 'wh-1',
            address: '1 Main St',
            lat: 14.6,
            lng: 120.98,
        })
        expect(r.line.to).toMatchObject({ kind: 'ADDRESS', lat: 14.55, lng: 121.02 })
    })

    it('unconfirmed / coordinate-less warehouse yields null coords — never invented', () => {
        const r = resolveStopSource(
            'lpl-1',
            line({ shipFromWarehouse: { ...WH, lat: null, lng: null, geocodeConfirmed: false } }),
        )
        expect(r.line.ship).toMatchObject({ lat: null, lng: null })
    })

    it('DELIVERY line without a ship-from warehouse is a structural error (legacy null)', () => {
        const r = resolveStopSource('lpl-1', line({ shipFromWarehouseId: null, shipFromWarehouse: null }))
        expect(r.line.ship).toBeNull()
        expect(r.errors[0]).toMatch(/assign an MM ship-from warehouse/)
    })

    it('customer PICKUP ships from the shipment address + coords', () => {
        const r = resolveStopSource(
            'lpl-1',
            line({
                shipFromWarehouseId: null,
                shipFromWarehouse: null,
                shipFromAddress: 'Customer yard',
                shipFromLat: 14.7,
                shipFromLng: 121.1,
                shipment: { movementType: 'PICKUP' } as never,
            }),
        )
        expect(r.errors).toEqual([])
        expect(r.line.ship).toMatchObject({ kind: 'ADDRESS', address: 'Customer yard', lat: 14.7 })
    })

    it('RETURN uses the MM return warehouse; free-text return on DELIVERY is rejected', () => {
        const ok = resolveStopSource(
            'lpl-1',
            line({ returnWarehouseId: 'wh-2', returnWarehouse: { ...WH, id: 'wh-2', lat: 15, lng: 121 } }),
        )
        expect(ok.line.ret).toMatchObject({ kind: 'WAREHOUSE', warehouseId: 'wh-2', lat: 15 })

        const bad = resolveStopSource('lpl-1', line({ returnAddress: 'Somewhere', returnLat: 1, returnLng: 1 }))
        expect(bad.errors[0]).toMatch(/assign an MM return warehouse/)
    })
})

describe('validateStopCoordinates', () => {
    it('confirmed active warehouse with valid coords passes', () => {
        expect(validateStopCoordinates(stop(), WH)).toBeNull()
    })

    it.each([
        ['missing warehouse', null, 'WAREHOUSE_MISSING'],
        ['deleted warehouse', { ...WH, deletedAt: new Date() }, 'WAREHOUSE_DELETED'],
        ['inactive warehouse', { ...WH, status: 'INACTIVE' }, 'WAREHOUSE_INACTIVE'],
        ['unconfirmed warehouse', { ...WH, geocodeConfirmed: false }, 'WAREHOUSE_UNCONFIRMED'],
        ['confirmed but invalid master coords', { ...WH, lat: 200 }, 'INVALID_COORDS'],
    ])('%s → %s', (_l, warehouse, code) => {
        expect(validateStopCoordinates(stop(), warehouse as never)?.code).toBe(code)
    })

    it('warehouse stop with null warehouseId (legacy) → WAREHOUSE_REQUIRED, not a crash', () => {
        expect(validateStopCoordinates(stop({ warehouseId: null }), undefined)?.code).toBe(
            'WAREHOUSE_REQUIRED',
        )
    })

    it.each([
        ['null coords', { lat: null, lng: null }, 'MISSING_COORDS'],
        ['lat > 90', { lat: 91, lng: 120 }, 'INVALID_COORDS'],
        ['lat < -90', { lat: -91, lng: 120 }, 'INVALID_COORDS'],
        ['lng > 180', { lat: 10, lng: 181 }, 'INVALID_COORDS'],
        ['lng < -180', { lat: 10, lng: -181 }, 'INVALID_COORDS'],
        ['NaN', { lat: Number.NaN, lng: 120 }, 'INVALID_COORDS'],
        ['0,0', { lat: 0, lng: 0 }, 'INVALID_COORDS'],
    ])('address stop with %s → %s', (_l, coords, code) => {
        const s = stop({ stopType: 'TO', locationKind: 'ADDRESS', warehouseId: null, ...coords })
        expect(validateStopCoordinates(s, null)?.code).toBe(code)
    })

    it('boundary coordinates are valid', () => {
        const s = stop({ stopType: 'TO', locationKind: 'ADDRESS', warehouseId: null, lat: -90, lng: 180 })
        expect(validateStopCoordinates(s, null)).toBeNull()
    })
})

describe('inferLocationKind (legacy stops)', () => {
    const base = {
        locationKind: null,
        warehouseId: null,
        locationKey: null,
        stopType: 'SHIP' as const,
        shipmentMovementTypes: [] as Array<'DELIVERY' | 'PICKUP'>,
    }
    it('uses the snapshot when present', () => {
        expect(inferLocationKind({ ...base, locationKind: 'ADDRESS', warehouseId: 'wh-1' })).toBe('ADDRESS')
    })
    it('WH: key whose warehouse was hard-deleted (id nulled) is still a warehouse stop', () => {
        expect(inferLocationKind({ ...base, locationKey: 'WH:gone' })).toBe('WAREHOUSE')
    })
    it('SHIP for DELIVERY shipments must be warehouse-backed', () => {
        expect(inferLocationKind({ ...base, shipmentMovementTypes: ['DELIVERY'] })).toBe('WAREHOUSE')
    })
    it('customer PICKUP SHIP without warehouse is an address stop', () => {
        expect(inferLocationKind({ ...base, shipmentMovementTypes: ['PICKUP'] })).toBe('ADDRESS')
    })
})

describe('planTripStops', () => {
    it('routable plan: SHIP (warehouse) → TO → RETURN home, no issues', () => {
        const r = planTripStops([{ id: 'lpl-1', shipmentLine: line() }])
        expect(r.errors).toEqual([])
        expect(r.issues).toEqual([])
        expect(r.stops.map((s) => [s.stopType, s.locationKind])).toEqual([
            ['SHIP', 'WAREHOUSE'],
            ['TO', 'ADDRESS'],
            ['RETURN', 'WAREHOUSE'],
        ])
        expect(r.stops[2]).toMatchObject({ lat: 14.6, lng: 120.98 })
    })

    it('unconfirmed warehouse flags both pickup and home return', () => {
        const r = planTripStops([
            { id: 'lpl-1', shipmentLine: line({ shipFromWarehouse: { ...WH, geocodeConfirmed: false } }) },
        ])
        expect(r.issues.map((i) => [i.sequence, i.code])).toEqual([
            [1, 'WAREHOUSE_UNCONFIRMED'],
            [3, 'WAREHOUSE_UNCONFIRMED'],
        ])
    })

    it('deleted warehouse (include returned null) is reported, not swapped', () => {
        const r = planTripStops([{ id: 'lpl-1', shipmentLine: line({ shipFromWarehouse: null }) }])
        expect(r.issues[0]).toMatchObject({ code: 'WAREHOUSE_MISSING', sequence: 1 })
        expect(r.stops[0]).toMatchObject({ warehouseId: 'wh-1', lat: null, lng: null })
    })

    it('ship-to without coordinates is a MISSING_COORDS issue', () => {
        const r = planTripStops([
            { id: 'lpl-1', shipmentLine: line({ shipToLat: null, shipToLng: null }) },
        ])
        expect(r.issues).toEqual([expect.objectContaining({ code: 'MISSING_COORDS', sequence: 2 })])
    })
})
