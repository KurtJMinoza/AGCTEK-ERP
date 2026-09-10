import { BadRequestException, NotFoundException } from '@nestjs/common'
import { assertMaterialUsable } from './material-usability'

type PurchasableMaterialRow = {
    id: string
    status: string
    deletedAt: Date | null
    purchasable: boolean
    inventoryManaged: boolean
    materialCode: string
}

/** Validate materials are ACTIVE + purchasable for procurement document lines. */
export async function assertPurchasableMaterials(
    prisma: { mmMaterial: { findMany: Function } },
    materialIds: string[],
) {
    const ids = [...new Set(materialIds.filter(Boolean))]
    if (ids.length === 0) return
    const materials = (await prisma.mmMaterial.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: {
            id: true,
            status: true,
            deletedAt: true,
            purchasable: true,
            inventoryManaged: true,
            materialCode: true,
        },
    })) as PurchasableMaterialRow[]
    const byId = new Map(materials.map((m) => [m.id, m]))
    for (const id of ids) {
        const m = byId.get(id)
        if (!m) throw new NotFoundException(`Material not found: ${id}`)
        try {
            assertMaterialUsable(m, { forPurchase: true })
        } catch (e: any) {
            throw new BadRequestException(`${e.message} (${m.materialCode || id})`)
        }
    }
}
