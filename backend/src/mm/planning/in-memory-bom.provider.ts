/**
 * Test-only in-memory BOM provider. NOT registered in mm.module.ts.
 */
import type {
    BomComponentLine,
    BomHeader,
    BomLookupRequest,
    BomProvider,
} from './bom-provider'

export type InMemoryBomEntry = {
    header: BomHeader
    components: BomComponentLine[]
}

export class InMemoryBomProvider implements BomProvider {
    constructor(private readonly boms: Map<string, InMemoryBomEntry>) {}

    static fromEntries(entries: InMemoryBomEntry[]): InMemoryBomProvider {
        const map = new Map<string, InMemoryBomEntry>()
        for (const entry of entries) {
            map.set(entry.header.parentMaterialId, entry)
        }
        return new InMemoryBomProvider(map)
    }

    async getBomHeader(req: BomLookupRequest): Promise<BomHeader | null> {
        const entry = this.boms.get(req.materialId)
        return entry?.header ?? null
    }

    async listComponents(req: BomLookupRequest): Promise<BomComponentLine[]> {
        const entry = this.boms.get(req.materialId)
        return entry?.components ?? []
    }
}
