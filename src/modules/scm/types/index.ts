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
    shipments?: TripStopShipment[]
}

export type Trip = {
    id: string
    code: string
    vehicleId: string | null
    driverId: string | null
    status: TripStatus
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

export type PlanningBucketSize = 'DAY' | 'WEEK'

export type ScmPlanningSettings = {
    id: string
    horizonWeeks: number
    bucketSize: PlanningBucketSize
    frozenZoneDays: number
    createdAt: string
    updatedAt: string
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
