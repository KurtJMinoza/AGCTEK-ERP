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
    | 'IN_PROGRESS'
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
    capacityWeightKg: number
    capacityVolumeM3: number
    odometerKm: number
    maxOdometerKm: number | null
    routingBlocked: boolean
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
    originAddress: string
    destAddress: string
    weightKg: number
    volumeM3: number
    status: ShipmentStatus
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
    recordedAt: string
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
