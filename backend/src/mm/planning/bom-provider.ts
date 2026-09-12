/**
 * BOMProvider — integration boundary for multi-level BOM explosion.
 *
 * Production owns the BOM master. MM Planning must NOT create a duplicate
 * Production BOM. Wire a real provider when the Production module is available.
 */
export type BomComponent = {
    materialId: string
    quantityPer: number
    scrapFactor?: number
    level: number
}

export type BomExplosionRequest = {
    companyId: string
    plantId?: string | null
    materialId: string
    quantity: number
    asOf?: Date
}

export type BomExplosionResult = {
    parentMaterialId: string
    components: BomComponent[]
    source: 'NONE' | 'PRODUCTION' | 'EXTERNAL'
}

export interface BomProvider {
    explode(request: BomExplosionRequest): Promise<BomExplosionResult>
}

/**
 * Default stub — returns no components. Safe for Phase 10 (no Production module).
 */
export class NullBomProvider implements BomProvider {
    async explode(request: BomExplosionRequest): Promise<BomExplosionResult> {
        return {
            parentMaterialId: request.materialId,
            components: [],
            source: 'NONE',
        }
    }
}

export const BOM_PROVIDER = Symbol('BOM_PROVIDER')
