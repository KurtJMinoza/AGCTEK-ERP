/**
 * BOMProvider — integration boundary for multi-level BOM explosion.
 *
 * Production owns the BOM master. MM Planning must NOT create a duplicate
 * Production BOM. Wire a real provider when the Production module is available.
 */
export type BomHeader = {
    bomId: string
    parentMaterialId: string
    plantId?: string | null
    status: 'ACTIVE' | 'INACTIVE'
    effectiveFrom?: Date | null
    effectiveTo?: Date | null
    yieldFactor?: number
    baseQuantity?: number
}

export type BomComponentLine = {
    lineId: string
    componentMaterialId: string
    quantityPer: number
    uomId: string
    scrapFactor?: number
    validFrom?: Date | null
    validTo?: Date | null
    status?: 'ACTIVE' | 'INACTIVE'
}

export type BomLookupRequest = {
    companyId: string
    plantId?: string | null
    materialId: string
    asOf?: Date
}

export interface BomProvider {
    getBomHeader(req: BomLookupRequest): Promise<BomHeader | null>
    listComponents(req: BomLookupRequest): Promise<BomComponentLine[]>
}

/**
 * Default stub — returns no BOM. Safe when Production module is unavailable.
 */
export class NullBomProvider implements BomProvider {
    async getBomHeader(_req: BomLookupRequest): Promise<BomHeader | null> {
        return null
    }

    async listComponents(_req: BomLookupRequest): Promise<BomComponentLine[]> {
        return []
    }
}

export const BOM_PROVIDER = Symbol('BOM_PROVIDER')
