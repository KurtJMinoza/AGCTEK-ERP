import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
    BomComponentLine,
    BomHeader,
    BomLookupRequest,
    BomProvider,
} from '../mm/planning/bom-provider'

@Injectable()
export class ProductionBomProvider implements BomProvider {
    constructor(private prisma: PrismaService) {}

    async getBomHeader(req: BomLookupRequest): Promise<BomHeader | null> {
        const bom = await this.prisma.ppBillOfMaterial.findFirst({
            where: {
                companyId: req.companyId,
                parentMaterialId: req.materialId,
                status: 'ACTIVE',
                ...(req.plantId ? { plantId: req.plantId } : {}),
            },
            orderBy: { createdAt: 'desc' },
        })
        if (!bom) return null
        return {
            bomId: bom.id,
            parentMaterialId: bom.parentMaterialId,
            plantId: bom.plantId,
            status: bom.status as 'ACTIVE' | 'INACTIVE',
            effectiveFrom: bom.effectiveFrom,
            effectiveTo: bom.effectiveTo,
            yieldFactor: Number(bom.yieldFactor),
            baseQuantity: Number(bom.baseQuantity),
        }
    }

    async listComponents(req: BomLookupRequest): Promise<BomComponentLine[]> {
        const header = await this.getBomHeader(req)
        if (!header) return []
        const components = await this.prisma.ppBomComponent.findMany({
            where: { bomId: header.bomId, status: 'ACTIVE' },
            orderBy: { lineNumber: 'asc' },
        })
        return components.map((c) => ({
            lineId: c.id,
            componentMaterialId: c.componentMaterialId,
            quantityPer: Number(c.quantityPer),
            uomId: c.uomId,
            scrapFactor: Number(c.scrapFactor),
            validFrom: c.validFrom,
            validTo: c.validTo,
            status: c.status as 'ACTIVE' | 'INACTIVE',
        }))
    }
}
