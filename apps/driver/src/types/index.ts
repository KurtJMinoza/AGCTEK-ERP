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

export type ShipmentLine = {
    id: string
    lineNo: number
    materialCode: string | null
    description: string | null
    quantity: number
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
    lines?: ShipmentLine[]
}

export type TripStopShipment = {
    id: string
    action: string
    shipmentId: string
    shipment?: Shipment
}

/** SHIP = load at warehouse · TO = deliver to customer · RETURN = back to hub. Null on legacy stops. */
export type TripStopType = 'SHIP' | 'TO' | 'RETURN'

export type TripStop = {
    id: string
    tripId: string
    sequence: number
    stopType: TripStopType | null
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
    /** Cash on Delivery for the orders dropped here; null when nothing is COD. */
    collection?: CodCollection | null
    /** Ship-to contacts — only on open deliver stops (empty once the stop is done). */
    contacts?: StopContact[]
}

export type StopContact = {
    orderNumber: string
    name: string | null
    phone: string
}

/** PENDING = cash still to collect · COLLECTED = all Paid · NOT_COLLECTIBLE = cancelled/refunded etc. */
export type CodCollectionStatus = 'PENDING' | 'COLLECTED' | 'NOT_COLLECTIBLE'

/** Server-computed COD state (SD payment records are authoritative). */
export type CodCollection = {
    paymentMethod: 'COD'
    status: CodCollectionStatus
    currency: string
    /** Outstanding cash; null when the amount is missing on the order. */
    amountDue: number | null
    amountCollected: number
    collectedAt: string | null
    orders: Array<{
        salesOrderId: string
        orderNumber: string
        paymentStatus: string | null
        amount: number | null
    }>
}

export type CashReceivedResult = {
    trip: Trip
    collection: CodCollection & {
        amountReceived: number | null
        change: number | null
        collectedOrderIds: string[]
    }
}

export type DeliveryFailureReason =
    | 'CUSTOMER_UNAVAILABLE'
    | 'CUSTOMER_REFUSED'
    | 'WRONG_ADDRESS'
    | 'DAMAGED_GOODS'
    | 'VEHICLE_ISSUE'
    | 'PAYMENT_ISSUE'
    | 'OTHER'

export type DamageShipmentLine = {
    id: string
    lineNo: number
    materialCode: string | null
    description: string | null
    quantity: number
}

export type DamageReportSummary = {
    id: string
    reference: string
    shipmentId: string
    shipmentLineId: string | null
    damagedQuantity: number
    description: string
    status: 'SUBMITTED' | 'CANCELLED' | 'RETURN_CREATED'
    reportedAt: string
    photoUrls: string[] | null
}

/** What the driver may report on a delivered stop, and what already was. */
export type StopDamageContext = {
    canReport: boolean
    blockedReason: string | null
    shipments: Array<{
        id: string
        reference: string
        customerName: string | null
        lines: DamageShipmentLine[]
    }>
    reports: DamageReportSummary[]
}

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
