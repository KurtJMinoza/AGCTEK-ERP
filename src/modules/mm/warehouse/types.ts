export interface Warehouse {
    id: string
    code: string
    name: string
    companyId: string
    company?: { id: string; code: string; name: string }
    plantId?: string
    plant?: { id: string; code: string; name: string }
    branchId?: string
    branch?: { id: string; code: string; name: string }
    managerId?: string
    address?: string
    timezone: string
    warehouseType?: string
    status: string
    defaultReceivingArea?: string
    defaultShippingArea?: string
    createdAt: string
    updatedAt: string
    deletedAt?: string
    storageTypes?: StorageType[]
    audits?: WarehouseAudit[]
}

export interface StorageType {
    id: string
    code: string
    name: string
    warehouseId: string
    warehouse?: Warehouse
    temperatureControlled: boolean
    hazardous: boolean
    qualityControlled?: boolean
    description?: string
    receivingAllowed: boolean
    shippingAllowed: boolean
    pickingAllowed: boolean
    putawayAllowed: boolean
    status: string
    createdAt: string
    updatedAt: string
    sections?: StorageSection[]
}

export interface StorageSection {
    id: string
    code: string
    name: string
    description?: string
    storageTypeId: string
    storageType?: StorageType
    status: string
    createdAt: string
    updatedAt: string
    bins?: StorageBin[]
}

export interface StorageBin {
    id: string
    code: string
    storageSectionId: string
    /** Derived from storageSection.storageType.warehouseId */
    warehouseId?: string | null
    /** Derived from storageSection.storageTypeId */
    storageTypeId?: string | null
    storageSection?: StorageSection & {
        storageType?: StorageType & { warehouse?: Warehouse }
    }
    barcode?: string
    capacityQuantity: number
    capacityWeight: number
    capacityVolume: number
    weightUom?: string
    volumeUom?: string
    pickingAllowed: boolean
    putawayAllowed: boolean
    status: string
    currentQuantity?: number
    remainingQuantity?: number
    utilizationPct?: number
    createdAt: string
    updatedAt: string
}

export interface WarehouseAudit {
    id: string
    warehouseId: string
    entityType: string
    entityId: string
    action: string
    changes?: Record<string, any>
    performedBy?: string
    performedAt: string
}

export interface WarehouseListResponse {
    data: Warehouse[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface StorageTypeListResponse {
    data: StorageType[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface StorageSectionListResponse {
    data: StorageSection[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface StorageBinListResponse {
    data: StorageBin[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface WarehouseQueryParams {
    page?: number
    limit?: number
    search?: string
    companyId?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface StorageTypeQueryParams {
    page?: number
    limit?: number
    search?: string
    warehouseId?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface StorageSectionQueryParams {
    page?: number
    limit?: number
    search?: string
    storageTypeId?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface StorageBinQueryParams {
    page?: number
    limit?: number
    search?: string
    storageSectionId?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface CreateWarehousePayload {
    name: string
    companyId: string
    plantId?: string
    branchId?: string
    managerId?: string
    address?: string
    timezone?: string
    status?: string
    defaultReceivingArea?: string
    defaultShippingArea?: string
    warehouseType?: string
}

export type UpdateWarehousePayload = Partial<CreateWarehousePayload>

export interface CreateStorageTypePayload {
    code: string
    name: string
    warehouseId: string
    temperatureControlled?: boolean
    hazardous?: boolean
    qualityControlled?: boolean
    description?: string
    receivingAllowed?: boolean
    shippingAllowed?: boolean
    pickingAllowed?: boolean
    putawayAllowed?: boolean
}

export type UpdateStorageTypePayload = Partial<CreateStorageTypePayload>

export interface CreateStorageSectionPayload {
    code: string
    name: string
    storageTypeId: string
    description?: string
}

export type UpdateStorageSectionPayload = Partial<CreateStorageSectionPayload>

export interface CreateStorageBinPayload {
    code: string
    storageSectionId: string
    barcode?: string
    capacityQuantity?: number
    capacityWeight?: number
    capacityVolume?: number
    weightUom?: string
    volumeUom?: string
    pickingAllowed?: boolean
    putawayAllowed?: boolean
}

export type UpdateStorageBinPayload = Partial<CreateStorageBinPayload>

export interface BinCapacitySummary {
    totalBins: number
    activeBins: number
    totalCapacityQty: number
    totalCapacityQuantity?: number
    totalCapacityWeight: number
    totalCapacityVolume: number
    totalOccupiedQuantity?: number
    utilizationPct?: number
}

// Inventory Balance
export interface WmInventoryBalance {
    id: string
    binId: string
    bin?: StorageBin
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    batchId?: string
    serialId?: string
    quantity: number
    reservedQuantity: number
    availableQuantity: number
    createdAt: string
    updatedAt: string
}

// Putaway
export interface PutawayTask {
    id: string
    taskNumber: string
    warehouseId: string
    warehouse?: Warehouse
    sourceDocument?: string
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    quantity: number
    batchId?: string
    serialId?: string
    sourceLocation?: string
    recommendedBinId?: string
    recommendedBin?: StorageBin
    actualBinId?: string
    actualBin?: StorageBin
    assignedWorker?: string
    priority: number
    status: string
    completedAt?: string
    createdAt: string
    updatedAt: string
}

export interface PutawayTaskListResponse {
    data: PutawayTask[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface PutawayQueryParams {
    page?: number
    limit?: number
    search?: string
    warehouseId?: string
    status?: string
    assignedWorker?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface CreatePutawayPayload {
    warehouseId: string
    materialId: string
    quantity: number
    sourceDocument?: string
    batchId?: string
    serialId?: string
    sourceLocation?: string
    priority?: number
}

// Picking
export interface PickWave {
    id: string
    waveNumber: string
    warehouseId: string
    warehouse?: Warehouse
    strategy: string
    status: string
    taskCount: number
    completedCount: number
    createdAt: string
    updatedAt: string
    tasks?: PickingTask[]
}

export interface PickWaveListResponse {
    data: PickWave[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface PickingTask {
    id: string
    taskNumber: string
    waveId?: string
    wave?: PickWave
    warehouseId: string
    warehouse?: Warehouse
    sourceBinId: string
    sourceBin?: StorageBin
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    batchId?: string
    serialId?: string
    requiredQty: number
    pickedQty: number
    assignedUser?: string
    priority: number
    status: string
    completedAt?: string
    createdAt: string
    updatedAt: string
}

export interface PickingTaskListResponse {
    data: PickingTask[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface PickingQueryParams {
    page?: number
    limit?: number
    search?: string
    warehouseId?: string
    waveId?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface CreatePickingTaskPayload {
    warehouseId: string
    sourceBinId: string
    materialId: string
    requiredQty: number
    batchId?: string
    serialId?: string
    priority?: number
}

export interface CreatePickWavePayload {
    warehouseId: string
    strategy?: string
    taskIds: string[]
}

// Packing
export interface WmPackage {
    id: string
    packageNumber: string
    orderNumber?: string
    warehouseId: string
    warehouse?: Warehouse
    packageType?: string
    weight?: number
    length?: number
    width?: number
    height?: number
    carrier?: string
    trackingNumber?: string
    shipToName?: string | null
    shipToAddress?: string | null
    shipToLat?: number | null
    shipToLng?: number | null
    status: string
    createdAt: string
    updatedAt: string
    items?: WmPackageItem[]
    /** Present on ready-for-dispatch / retry responses */
    scmShipment?: { id: string; reference: string; status: string } | null
    scmReleaseError?: string | null
}

export interface WmPackageItem {
    id: string
    packageId: string
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    expectedQty: number
    scannedQty: number
    batchId?: string
    serialId?: string
    status: string
    createdAt: string
    updatedAt: string
}

export interface PackageListResponse {
    data: WmPackage[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface PackageQueryParams {
    page?: number
    limit?: number
    search?: string
    warehouseId?: string
    status?: string
    orderNumber?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface CreatePackagePayload {
    warehouseId: string
    orderNumber?: string
    packageType?: string
    items: {
        materialId: string
        expectedQty: number
        batchId?: string
        serialId?: string
    }[]
}

// Warehouse Transfers
export interface WarehouseTransfer {
    id: string
    transferNumber: string
    sourceWarehouseId: string
    sourceWarehouse?: Warehouse
    destinationWarehouseId: string
    destinationWarehouse?: Warehouse
    requestedBy?: string
    approvedBy?: string
    status: string
    notes?: string
    createdAt: string
    updatedAt: string
    lines?: WarehouseTransferLine[]
}

export interface WarehouseTransferLine {
    id: string
    transferId: string
    materialId: string
    material?: { id: string; materialCode: string; materialName: string }
    quantity: number
    batchId?: string
    serialId?: string
    sourceBinId?: string
    sourceBin?: StorageBin
    destinationBinId?: string
    destinationBin?: StorageBin
    pickedQty: number
    receivedQty: number
    status: string
    createdAt: string
    updatedAt: string
}

export interface TransferListResponse {
    data: WarehouseTransfer[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface TransferQueryParams {
    page?: number
    limit?: number
    search?: string
    sourceWarehouseId?: string
    destinationWarehouseId?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export interface CreateTransferPayload {
    sourceWarehouseId: string
    destinationWarehouseId: string
    notes?: string
    requestedBy?: string
    lines: {
        materialId: string
        quantity: number
        batchId?: string
        serialId?: string
        sourceBinId?: string
    }[]
}
