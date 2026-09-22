export interface SdOrderGuardPort {
    isOrderActive(salesOrderId: string): Promise<boolean>
}

export const SD_ORDER_GUARD_PORT = Symbol('SD_ORDER_GUARD_PORT')
