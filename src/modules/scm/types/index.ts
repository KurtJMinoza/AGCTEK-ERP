export type Paginated<T> = {
    data: T[]
    total: number
    page: number
    pageSize: number
}

export type ListParams = {
    page?: number
    pageSize?: number
    status?: string
    search?: string
    vehicleId?: string
    movementType?: string
    type?: string
}

export type VehicleStatus =
    | 'AVAILABLE'
    | 'IN_TRANSIT'
    | 'MAINTENANCE'
    | 'OUT_OF_SERVICE'
    | 'INACTIVE'

export type VehicleType = 'TRUCK' | 'VAN' | 'TRAILER' | 'REEFER' | 'OTHER'

export type DriverStatus = 'AVAILABLE' | 'ON_TRIP' | 'OFF_DUTY' | 'INACTIVE'

export type TripStatus =
    | 'DRAFT'
    | 'PLANNED'
    | 'ASSIGNED'
    | 'IN_TRANSIT'
    | 'COMPLETED'
    | 'CANCELLED'
    /** Cargo-first: stops + driver validated */
    | 'READY'
    /** Cargo-first: dispatched, driver may start */
    | 'DISPATCHED'

export type StopStatus =
    | 'PENDING'
    | 'ARRIVED'
    | 'COMPLETED'
    | 'SKIPPED'
    | 'FAILED'

export type ShipmentStatus =
    | 'DRAFT'
    | 'READY'
    | 'ASSIGNED'
    | 'IN_TRANSIT'
    | 'DELIVERED'
    | 'CANCELLED'
    /** Linked trip stop failed — awaiting dispatcher decision */
    | 'EXCEPTION_HOLD'

/** Outbound shipping vs collect-from customer/supplier. */
export type ShipmentMovementType = 'DELIVERY' | 'PICKUP'

export type MaintenanceType =
    | 'PREVENTATIVE'
    | 'CORRECTIVE'
    | 'INSPECTION'
    | 'OTHER'

export type MaintenanceStatus =
    | 'SCHEDULED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'

export type Vehicle = {
    id: string
    code: string
    plateNumber: string
    make: string
    model: string
    year: number | null
    type: VehicleType
    status: VehicleStatus
    capacityQty: number
    capacityWeightKg: number
    capacityVolumeM3: number
    odometerKm: number
    /** Service due when odometer reaches this value (km). */
    maintenanceThresholdKm: number | null
    routingBlocked: boolean
    telematicsDeviceId: string | null
    notes: string | null
    createdAt: string
    updatedAt: string
    /** Derived from OR/CR/insurance — EXPIRING_SOON warns; EXPIRED also sets routingBlocked */
    complianceAlert?: 'EXPIRED' | 'EXPIRING_SOON' | null
}

export type VehicleDocumentKind =
    | 'OR'
    | 'CR'
    | 'INSURANCE_CTPL'
    | 'INSURANCE_COMPREHENSIVE'
    | 'INSURANCE_OTHER'

export type VehicleDocumentStatus =
    | 'VALID'
    | 'EXPIRING_SOON'
    | 'EXPIRED'
    | 'CANCELLED'

export type VehicleDocument = {
    id: string
    vehicleId: string
    kind: VehicleDocumentKind
    documentNo: string
    issuer: string | null
    issuedAt: string | null
    expiresAt: string
    coverageNote: string | null
    fileUrl: string | null
    remindDaysBefore: number
    blocksVehicle: boolean
    status: VehicleDocumentStatus
    notes: string | null
    createdAt: string
    updatedAt: string
    vehicle?: Pick<
        Vehicle,
        'id' | 'code' | 'plateNumber' | 'status' | 'routingBlocked'
    >
}

export type ComplianceSummary = {
    expired: number
    expiring: number
    valid: number
    cancelled: number
}

export type Driver = {
    id: string
    userId: string
    employeeCode: string | null
    firstName: string
    lastName: string
    licenseNumber: string
    licenseExpiry: string
    phone: string
    status: DriverStatus
    createdAt: string
    updatedAt: string
    user?: {
        id: string
        email: string
        userName: string
        role: string
        jobPosition?: string
    }
}

export type Shipment = {
    id: string
    reference: string
    customerName: string | null
    originAddress: string | null
    originLat: number | null
    originLng: number | null
    destAddress: string
    destLat: number | null
    destLng: number | null
    quantity: number
    weightKg: number
    volumeM3: number
    materialCode: string | null
    externalOrderId: string | null
    packageId: string | null
    goodsIssueId: string | null
    description: string | null
    isFragile: boolean
    requiresColdChain: boolean
    movementType: ShipmentMovementType
    status: ShipmentStatus
    requestedPickupAt: string | null
    requestedDeliveryAt: string | null
    earliestDeliveryAt: string | null
    latestDeliveryAt: string | null
    podSignatureUrl: string | null
    podPhotoUrl: string | null
    deliveredAt: string | null
    notes: string | null
    /** Present on the shipment detail payload (Report Damage line picker). */
    lines?: ShipmentLine[]
    createdAt: string
    updatedAt: string
}

export type TripStopShipment = {
    id: string
    action: string
    shipmentId: string
    shipment?: Shipment
}

export type TripStop = {
    id: string
    tripId: string
    sequence: number
    name: string | null
    address: string
    lat: number | null
    lng: number | null
    windowStart: string | null
    windowEnd: string | null
    status: StopStatus
    arrivedAt: string | null
    completedAt: string | null
    notes: string | null
    /** Hex color for intermediate stop pins (destination always red) */
    pinColor?: string | null
    /** Cargo-first stop role (null on legacy stops) */
    stopType?: TripStopType | null
    locationKey?: string | null
    warehouseId?: string | null
    warehouse?: { id: string; code: string; name: string } | null
    shipments?: TripStopShipment[]
    lines?: TripStopLine[]
}

export type Trip = {
    id: string
    code: string
    vehicleId: string | null
    driverId: string | null
    status: TripStatus
    /** Cargo-first: trip built from this load plan (null = legacy trip) */
    loadPlanId?: string | null
    loadPlan?: Pick<LoadPlan, 'id' | 'code' | 'status' | 'totalQty'> | null
    plannedEndAt?: string | null
    dispatchedAt?: string | null
    plannedStartAt: string | null
    startedAt: string | null
    completedAt: string | null
    totalQty: number | null
    totalWeightKg: number | null
    totalVolumeM3: number | null
    notes: string | null
    createdAt: string
    updatedAt: string
    vehicle?: Vehicle | null
    driver?: Driver | null
    stops?: TripStop[]
}

export type GpsLog = {
    id: string
    vehicleId: string
    tripId: string | null
    latitude: number
    longitude: number
    speedKmh: number
    heading: number | null
    /** Sparse optional device metrics (fuelPct, rpm, …) — not a full OBD dump */
    rawPayload: Record<string, unknown> | null
    recordedAt: string
}

/** Route preview for a READY load plan (stateless; nothing persisted). */
export type RouteStopKind = 'PICKUP' | 'SHIP_TO' | 'RETURN_TO'
export type RouteWindowStatus = 'NO_WINDOW' | 'EARLY' | 'OK' | 'LATE'

export type RoutePreviewStop = {
    /** Stable key `${stopType}|${locationKey}` used for stopOrder */
    key: string
    sequence: number
    type: RouteStopKind
    stopType: TripStopType
    label: string
    address: string
    warehouseId: string | null
    lat: number | null
    lng: number | null
    /** warehouse = MM master pin; shipment = ship-to / customer address. Never geocoded here. */
    coordSource: 'warehouse' | 'shipment' | null
    missingCoords: boolean
    locationKind: 'WAREHOUSE' | 'ADDRESS'
    locationIssue: { code: StopLocationIssueCode; message: string } | null
    shipmentIds: string[]
    lineCount: number
    windowStart: string | null
    windowEnd: string | null
    serviceTimeSec: number
    legDistanceM: number | null
    legDurationSec: number | null
    etaAt: string | null
    waitingTimeSec: number
    serviceStartAt: string | null
    departureAt: string | null
    windowStatus: RouteWindowStatus | null
    lateBySec: number
}

export type StopLocationIssueCode =
    | 'WAREHOUSE_REQUIRED'
    | 'WAREHOUSE_MISSING'
    | 'WAREHOUSE_DELETED'
    | 'WAREHOUSE_INACTIVE'
    | 'WAREHOUSE_UNCONFIRMED'
    | 'INVALID_COORDS'
    | 'MISSING_COORDS'

export type RoutePreviewViolation = {
    code: 'LATE' | 'WINDOW_CONFLICT' | 'MISSING_COORDS' | 'DEPARTURE_IN_PAST'
    issueCode?: StopLocationIssueCode
    message: string
    stopKey?: string
    sequence?: number
    lateBySec?: number
}

/** ON_TIME = latest departure meeting every window; EARLY = arrive as the first window opens. */
export type DepartureMode = 'ON_TIME' | 'EARLY'

export type RoutePreview = {
    loadPlanId: string
    loadPlanCode: string
    vehicle: { id: string; code: string; plateNumber: string }
    pickupCount: number
    serviceTimeMin: number
    departureMode: DepartureMode
    generatedAt: string
    routable: boolean
    router: 'osrm' | 'haversine' | null
    routerFallbackReason: string | null
    origin: {
        key: string
        label: string
        address: string
        lat: number | null
        lng: number | null
        departAtRecommended: string | null
    }
    recommendedDeparture: {
        at: string
        feasible: boolean
        basis:
            | 'LATEST_MEETING_WINDOWS'
            | 'EARLIEST_MEETING_WINDOWS'
            | 'NO_DEADLINES'
            | 'EARLIEST_PRACTICAL'
        reason: string | null
    } | null
    departAt: string | null
    arrivalAt: string | null
    stops: RoutePreviewStop[]
    /** [lat, lng] pairs */
    polyline: Array<[number, number]>
    /** Per-leg values from the same router as `polyline`; length = stops - 1. */
    legDurationsSec: number[]
    legDistancesM: number[]
    totalDistanceM: number | null
    totalDurationSec: number | null
    tripDurationSec: number | null
    feasible: boolean
    violations: RoutePreviewViolation[]
}

export type RoutePreviewRequest = {
    stopOrder?: string[]
    departAt?: string
    serviceTimeMin?: number
    departureMode?: DepartureMode
}

/** One stored GpsLog row as shown in the read-only telematics history. */
export type TelematicsHistoryPoint = {
    id: string
    recordedAt: string
    latitude: number
    longitude: number
    speedKmh: number
    heading: number | null
    tripId: string | null
    tripCode: string | null
    source: string | null
    deviceId: string | null
    ignition: boolean | null
    alarmCode: number | null
    alarmDescription: string | null
    messageRef: string | null
}

export type TelematicsHistoryQuery = {
    page?: number
    pageSize?: number
    from?: string
    to?: string
    search?: string
    source?: string
}

export type TelematicsHistoryResponse = Paginated<TelematicsHistoryPoint> & {
    generatedAt: string
}

export type FleetActiveTripStop = {
    id: string
    sequence: number
    name: string | null
    address: string
    lat: number | null
    lng: number | null
    status: StopStatus
    pinColor: string | null
}

export type FleetActiveTrip = {
    id: string
    code: string
    status: TripStatus
    stops?: FleetActiveTripStop[]
}

export type FleetTrackingItem = {
    vehicle: Vehicle
    latest: GpsLog | null
    activeTrip: FleetActiveTrip | null
}

export type FleetTrackingResponse = {
    data: FleetTrackingItem[]
    total: number
}

export type CreateTripStopShipmentInput = {
    shipmentId: string
    action: 'PICKUP' | 'DROPOFF'
}

export type CreateTripStopInput = {
    sequence?: number
    name?: string
    address: string
    lat?: number | null
    lng?: number | null
    windowStart?: string | null
    windowEnd?: string | null
    notes?: string | null
    pinColor?: string | null
    shipments?: CreateTripStopShipmentInput[]
}

export type CreateTripInput = {
    code?: string
    vehicleId?: string | null
    driverId?: string | null
    status?: TripStatus
    plannedStartAt?: string | null
    notes?: string | null
    stops?: CreateTripStopInput[]
}

/** Stable place suggestion from GET /scm/places/search (Photon-backed). */
export type PlaceSuggestion = {
    id: string
    label: string
    address: string
    lat: number
    lng: number
    city?: string | null
    postalCode?: string | null
    country?: string | null
}

/** Value emitted by LocationSearchField onChange. */
export type LocationValue = {
    address: string
    lat?: number | null
    lng?: number | null
    city?: string | null
    postalCode?: string | null
    raw?: PlaceSuggestion | null
}

/** Shipment row on a vehicle's operational load (not MM stock). */
export type ShipmentCargo = {
    id: string
    reference: string
    materialCode: string | null
    description: string | null
    quantity: number
    weightKg: number
    volumeM3: number
    isFragile: boolean
    requiresColdChain: boolean
    status: string
    shipToName: string | null
    shipToAddress: string
    stopSequence: number | null
    stopId: string | null
    action: string | null
}

export type VehicleCargoStop = {
    stopId: string
    sequence: number
    name: string | null
    address: string
    status: string
    shipments: ShipmentCargo[]
}

export type VehicleCargoSummary = {
    loadedQty: number
    capacityQty: number | null
    pctQty: number | null
    canFit: boolean
    message: string | null
    capacityWeightKg: number
    capacityVolumeM3: number
    loadedWeightKg: number
    loadedVolumeM3: number
    fragileCount: number
    coldChainCount: number
}

export type VehicleCargoResponse = {
    vehicleId: string
    vehicleStatus: string
    loadLabel: 'active' | 'planned' | 'none'
    tripId: string | null
    tripCode: string | null
    tripStatus: string | null
    stops: VehicleCargoStop[]
    shipments: ShipmentCargo[]
    summary: VehicleCargoSummary
}

export type MaintenanceRecord = {
    id: string
    vehicleId: string
    type: MaintenanceType
    status: MaintenanceStatus
    title: string
    description: string | null
    odometerKm: number | null
    cost: number | null
    scheduledAt: string
    completedAt: string | null
    blocksRouting: boolean
    createdAt: string
    updatedAt: string
    vehicle?: Vehicle
}

export type DemandPlanStatus = 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'PUBLISHED'
export type DemandHorizonKind = 'OPERATIONAL' | 'TACTICAL' | 'STRATEGIC'
export type DemandPlanBucket = 'WEEK' | 'MONTH' | 'QUARTER'
export type DemandPlanGranularity = 'SKU' | 'FAMILY'

export type DemandHorizonPreset = {
    kind: DemandHorizonKind
    label: string
    bucket: DemandPlanBucket
    viewLength: number
    granularity: DemandPlanGranularity
    freezeFencePeriods: number
    readOnly: boolean
}

export type DemandPlanVersion = {
    id: string
    code: string
    status: DemandPlanStatus
    horizonKind: DemandHorizonKind
    bucket: DemandPlanBucket
    viewLength: number
    freezeFencePeriods: number
    granularity: DemandPlanGranularity
    notes: string | null
    createdBy: string | null
    createdAt: string
    updatedAt: string
    approvedAt: string | null
    publishedAt: string | null
    lastGeneratedAt?: string | null
    lastGeneratedBy?: string | null
    generationParams?: DemandForecastGeneration | null
    _count?: { lines: number; adjustments?: number }
}

export type DemandPlanAdjustment = {
    id: string
    previousQty: number | null
    newQty: number | null
    reason: string
    adjustedBy: string | null
    createdAt: string
    forecast?: {
        productCode: string
        locationCode: string
        periodStart: string
    }
}

export type DemandPlanDetail = DemandPlanVersion & {
    freezeUntil: string
    readOnly: boolean
    readOnlyReason: string | null
    /** Lines holding a planner override (adjustedQty) or consensus qty. */
    overrideCount: number
    adjustments: DemandPlanAdjustment[]
}

export type DemandPastSalesQuery = {
    versionId?: string
    locationCode?: string
    bucket: DemandPlanBucket
    historyLength: number
}

/** Past sales pivoted server-side to the requested bucket. */
export type DemandPastSales = {
    bucket: DemandPlanBucket
    granularity: DemandPlanGranularity
    locationCode: string | null
    from: string
    to: string
    periods: Array<{ key: string; label: string; start: string }>
    rows: Array<{
        rowKey: string
        productKey: string
        family: string | null
        locationCode: string
        cells: Record<string, number>
        total: number
    }>
    totals: Record<string, number>
    grandTotal: number
    /** Warehouse name by location code (MM warehouse master). */
    locationNames: Record<string, string>
}

export type DemandMovingAverageWindow = 4 | 12

export type GenerateDemandForecastInput = {
    method: 'MOVING_AVERAGE'
    window: DemandMovingAverageWindow
    historyLength?: number
    overwriteAdjustments?: boolean
    horizonKind?: DemandHorizonKind
    locationCode?: string
    compareVersionId?: string
    chartDensity?: DemandChartDensity
}

export type DemandForecastGeneration = {
    method: 'MOVING_AVERAGE'
    window: number
    bucket: DemandPlanBucket
    horizonKind: DemandHorizonKind
    locationCode: string | null
    historyLength: number
    historyFrom: string
    historyTo: string
    overwriteAdjustments: boolean
    periodsGenerated: number
    frozenPeriodsSkipped: number
    frozenWeeksSkipped: number
    linesUpdated: number
    linesCreated: number
    preservedOverrides: number
    clearedOverrides: number
    productsWithoutHistory: string[]
}

export type GenerateDemandForecastResult = {
    generation: DemandForecastGeneration
    detail: DemandPlanDetail
    grid: DemandPlanGrid
}

export type DemandPlanGridCell = {
    qty: number
    systemQty: number
    adjusted: boolean
    /** Only set at base grain (SKU × week) — the editable line. */
    lineId: string | null
    compareQty?: number | null
}

export type DemandPlanGridRow = {
    rowKey: string
    productKey: string
    family: string | null
    locationCode: string
    cells: Record<string, DemandPlanGridCell>
    total: number
    systemTotal: number
    /** Past sales over the prior window (from DemandSalesActual). */
    historyQty: number | null
    historyWeeks?: number
}

export type DemandPlanGridPeriod = {
    key: string
    label: string
    start: string
    end: string
    frozen: boolean
}

export type DemandPlanGrid = {
    version: Pick<DemandPlanVersion, 'id' | 'code' | 'status' | 'horizonKind'>
    scope: {
        horizonKind: DemandHorizonKind
        bucket: DemandPlanBucket
        viewLength: number
        granularity: DemandPlanGranularity
        locationCode: string | null
        rangeStart: string
        rangeEnd: string
        freezeUntil: string
        editable: boolean
        readOnlyReason: string | null
        compareVersionId: string | null
    }
    periods: DemandPlanGridPeriod[]
    rows: DemandPlanGridRow[]
    totals: Record<string, number>
    grandTotal: number
    locations: string[]
    /** Warehouse name by location code (MM warehouse master). */
    locationNames: Record<string, string>
    chart: DemandPlanChart
}

export type DemandChartDensity = 'AUTO' | 'FAMILY'
export type DemandChartDensityMode = 'FULL' | 'TOP5_OTHER' | 'FAMILY'

export type DemandPlanChartSeries = {
    key: string
    label: string
    productKey: string | null
    family: string | null
    values: Array<number | null>
    compareValues: Array<number | null> | null
    adjusted: boolean[]
    total: number
    baseTotal: number | null
    varianceAbs: number | null
    variancePct: number | null
    memberCount: number
}

/** Server-built from the same aggregated rows as the grid. */
export type DemandPlanChart = {
    densityMode: DemandChartDensityMode
    requestedDensity: DemandChartDensity
    seriesCount: number
    periodKeys: string[]
    freezePeriodIndexes: number[]
    series: DemandPlanChartSeries[]
    systemTotals: number[]
    finalTotals: number[]
    /** Past sales totals for the periods right before the forecast window. */
    history: Array<{ key: string; label: string; qty: number | null }>
    kpis: {
        forecastTotal: number
        systemTotal: number
        /** Actuals run-rate scaled to the forecast window. */
        historyTotal: number | null
        historyWeeks: number
        compareTotal: number | null
        varianceBasis: 'COMPARE' | 'HISTORY' | 'SYSTEM'
        varianceAbs: number
        variancePct: number | null
        overrideCells: number
    }
    meta: {
        horizonKind: DemandHorizonKind
        bucket: DemandPlanBucket
        granularity: DemandPlanGranularity
        hasCompare: boolean
    }
}

export type DemandPlanGridQuery = {
    horizonKind?: DemandHorizonKind
    locationCode?: string
    compareVersionId?: string
    chartDensity?: DemandChartDensity
}

export type DemandCellAdjustment = {
    lineId: string
    adjustedQty: number | null
    reason: string
}

export type ScmDashboardSummary = {
    generatedAt: string
    shipments: {
        byStatus: Record<ShipmentStatus, number>
        openCount: number
        deliveredOnTime: number
        deliveredLate: number
        onTimeNote: string
    }
    trips: {
        byStatus: Record<TripStatus, number>
        activeCount: number
        inTransitCount: number
        completedCount: number
        avgDurationHours: number | null
        stopsCompletedToday: number
    }
    fleet: {
        byStatus: Record<VehicleStatus, number>
        total: number
        available: number
        inTransit: number
        routingBlocked: number
        withRecentGps: number
        utilizationPct: number
    }
    maintenance: {
        byStatus: Record<MaintenanceStatus, number>
        openCount: number
        blockingRouting: number
    }
    recentIssues: Array<{
        id: string
        kind: 'STOP_FAILED' | 'LATE_DELIVERY'
        label: string
        at: string
    }>
}

// ─── Cargo-first TMS (/scm/tms) ─────────────────────────────────────────────

export type LoadPlanStatus =
    | 'DRAFT'
    | 'VALIDATED'
    | 'READY'
    | 'ASSIGNED'
    | 'DISPATCHED'
    | 'COMPLETED'
    | 'CANCELLED'

export type TripStopType = 'SHIP' | 'TO' | 'RETURN'

type WarehouseRef = {
    id: string
    code: string
    name: string
    address: string | null
}

export type ShipmentLine = {
    id: string
    shipmentId: string
    lineNo: number
    materialCode: string | null
    description: string | null
    quantity: number
    weightKg: number
    volumeM3: number
    shipFromWarehouseId: string | null
    shipFromAddress: string | null
    shipToAddress: string
    shipToLat: number | null
    shipToLng: number | null
    returnWarehouseId: string | null
    returnAddress: string | null
    shipment: Pick<
        Shipment,
        | 'id'
        | 'reference'
        | 'customerName'
        | 'status'
        | 'movementType'
        | 'earliestDeliveryAt'
        | 'latestDeliveryAt'
        | 'isFragile'
        | 'requiresColdChain'
    >
    shipFromWarehouse: WarehouseRef | null
    returnWarehouse: WarehouseRef | null
}

/** SCM damage report against a delivered shipment (customer return integration, Phase 2). */
export type DamageReportSalesOrderStatus = 'RESOLVED' | 'UNRESOLVED'

export type DamageReportStatus = 'SUBMITTED' | 'CANCELLED' | 'RETURN_CREATED'

export type DamageReport = {
    id: string
    reference: string
    companyId: string
    shipmentId: string
    shipment: {
        id: string
        reference: string
        customerName: string | null
        status: string
        deliveredAt: string | null
        exceptionCode: string | null
        exceptionNote: string | null
    }
    shipmentLineId: string | null
    shipmentLine: {
        id: string
        lineNo: number
        materialCode: string | null
        description: string | null
        quantity: number
    } | null
    /** Original SD sales order id when the verifiable chain resolved one. */
    salesOrderId: string | null
    salesOrderStatus: DamageReportSalesOrderStatus
    reportedBy: string
    reportedAt: string
    damagedQuantity: number
    description: string
    /** Evidence photo URLs (URL strings; there is no file-upload endpoint yet). */
    photoUrls: string[] | null
    status: DamageReportStatus
    /** SD Sales Return created from this report (Phase 3 traceability back-reference). */
    sdSalesReturnId: string | null
    /** MM Customer Return Intake opened from this report (set from Phase 4). */
    customerReturnId: string | null
    createdAt: string
    updatedAt: string
    audits: {
        id: string
        action: string
        performedBy: string | null
        performedAt: string
    }[]
}

export type InitiateSalesReturnResult = {
    created: boolean
    salesReturn: { id: string; returnNumber: string; status: string }
    damageReport: DamageReport
}

export type CreateDamageReportInput = {
    /** Omit to report the whole shipment. */
    shipmentLineId?: string | null
    damagedQuantity: number
    description: string
    photoUrls?: string[]
    /** Optional client key so a double submit never creates two reports. */
    idempotencyKey?: string
}

export type LoadPlanLine = {
    id: string
    loadPlanId: string
    shipmentLineId: string
    assignedQty: number
    weightKg: number | null
    volumeM3: number | null
    shipmentLine: ShipmentLine
}

export type LoadCapacity = {
    totalQty: number
    totalWeightKg: number
    totalVolumeM3: number
    capacityQty: number
    capacityWeightKg: number | null
    capacityVolumeM3: number | null
    remainingQty: number
    ok: boolean
    message: string | null
}

export type LoadPlan = {
    id: string
    code: string
    vehicleId: string
    status: LoadPlanStatus
    totalQty: number
    totalWeightKg: number | null
    totalVolumeM3: number | null
    notes: string | null
    validatedAt: string | null
    readyAt: string | null
    createdAt: string
    updatedAt: string
    vehicle: Vehicle
    lines: LoadPlanLine[]
    trips: Array<{ id: string; code: string; status: TripStatus }>
    lineCount: number
    capacity: LoadCapacity
}

export type TripStopLine = {
    id: string
    tripStopId: string
    loadPlanLineId: string
    shipmentLineId: string
    shipmentLine?: {
        id: string
        lineNo: number
        materialCode: string | null
        description: string | null
        quantity: number
        shipment: { id: string; reference: string; customerName: string | null }
    }
}

export type TripCandidate = {
    loadPlanId: string
    code: string
    status: LoadPlanStatus
    readyAt: string | null
    vehicle: {
        id: string
        code: string
        plateNumber: string
        type: VehicleType
        status: VehicleStatus
        capacityQty: number
        routingBlocked: boolean
    }
    totalQty: number
    totalWeightKg: number | null
    totalVolumeM3: number | null
    lineCount: number
    shipmentCount: number
    stopPreview: { ship: number; to: number; ret: number }
    /** Server-side location problems; Confirm is blocked until fixed */
    locationErrors: string[]
}
