import { BadRequestException } from '@nestjs/common'

export const SD_MM_ERROR = {
    PRODUCT_MATERIAL_MAPPING_MISSING: 'PRODUCT_MATERIAL_MAPPING_MISSING',
    PRODUCT_MATERIAL_MAPPING_INACTIVE: 'PRODUCT_MATERIAL_MAPPING_INACTIVE',
    MATERIAL_INACTIVE: 'MATERIAL_INACTIVE',
    MATERIAL_BLOCKED: 'MATERIAL_BLOCKED',
    INVALID_UOM_MAPPING: 'INVALID_UOM_MAPPING',
    FULFILLMENT_WAREHOUSE_UNRESOLVED: 'FULFILLMENT_WAREHOUSE_UNRESOLVED',
    PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
    NON_INVENTORY_PRODUCT: 'NON_INVENTORY_PRODUCT',
} as const

export type SdMmErrorCode = (typeof SD_MM_ERROR)[keyof typeof SD_MM_ERROR]

export class SdMmIntegrationException extends BadRequestException {
    constructor(
        public readonly code: SdMmErrorCode,
        message: string,
    ) {
        super({ code, message })
    }
}
