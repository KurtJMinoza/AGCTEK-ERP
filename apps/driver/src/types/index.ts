export type TripStatus =
    | 'DRAFT'
    | 'PLANNED'
    | 'ASSIGNED'
    | 'IN_TRANSIT'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'READY'
    | 'DISPATCHED'

export type StopStatus =
    | 'PENDING'
    | 'ARRIVED'
    | 'COMPLETED'
    | 'SKIPPED'
    | 'FAILED'

export type AuthUser = {
    id: string
    email: string
    userName: string
    avatar?: string
    role: string
}

export type Driver = {
    id: string
    userId: string
    employeeCode: string | null
    firstName: string
    lastName: string
    phone: string
    status: string
    licenseNumber: string
}

export type Vehicle = {
    id: string
    code: string
    plateNumber: string
    make: string
    model: string
    telematicsDeviceId: string | null
}

export type Shipment = {
    id: string
    reference: string
    customerName: string | null
    destAddress: string
    quantity: number
    materialCode: string | null
    description: string | null
    movementType: string
    /** DRAFT | READY | ASSIGNED | IN_TRANSIT | DELIVERED | CANCELLED | EXCEPTION_HOLD */
    status: string
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
    status: StopStatus
    arrivedAt: string | null
    completedAt: string | null
    notes: string | null
    podSignatureUrl: string | null
    podPhotoUrl: string | null
    podNotes: string | null
    /** Free-text failure note */
    failureReason: string | null
    failureCode: DeliveryFailureReason | null
    failedAt: string | null
    shipments?: TripStopShipment[]
}

export type DeliveryFailureReason =
    | 'CUSTOMER_UNAVAILABLE'
    | 'CUSTOMER_REFUSED'
    | 'WRONG_ADDRESS'
    | 'DAMAGED_GOODS'
    | 'VEHICLE_ISSUE'
    | 'PAYMENT_ISSUE'
    | 'OTHER'

/** Optional best-effort metadata sent with arrive / deliver / fail. */
export type StopExecutionMeta = {
    latitude?: number
    longitude?: number
    accuracy?: number
    deviceId?: string
    clientOccurredAt?: string
    clientActionId?: string
}

export type Trip = {
    id: string
    code: string
    status: TripStatus
    totalQty: number | null
    plannedStartAt: string | null
    startedAt: string | null
    /** Dispatcher override — stops may be done out of sequence */
    allowOutOfOrder: boolean
    notes: string | null
    vehicleId: string | null
    driverId: string | null
    vehicle?: Vehicle | null
    driver?: Driver | null
    stops?: TripStop[]
}

export type Session = {
    user: AuthUser
    driver: Driver
}
