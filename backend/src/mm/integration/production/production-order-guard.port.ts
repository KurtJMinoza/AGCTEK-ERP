export const PRODUCTION_ORDER_GUARD_PORT = Symbol('PRODUCTION_ORDER_GUARD_PORT')

export interface ProductionOrderGuardPort {
    isOrderActive(productionOrderId: string): Promise<boolean>
}
