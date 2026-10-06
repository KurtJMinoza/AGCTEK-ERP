import type { PrismaClient } from '@prisma/client'

/** Detach org from plants and soft-delete plant master rows. */
export async function removeOrgPlants(prisma: PrismaClient) {
    const nWh = await prisma.warehouse.updateMany({
        data: { plantId: null },
        where: { plantId: { not: null } },
    })
    const nBr = await prisma.branch.updateMany({
        data: { plantId: null },
        where: { plantId: { not: null } },
    })
    const nPl = await prisma.plant.updateMany({
        data: { deletedAt: new Date(), status: 'INACTIVE' },
        where: { deletedAt: null },
    })
    console.log(
        `Org plants removed: ${nPl.count} plant(s) deactivated, ${nBr.count} branch link(s) cleared, ${nWh.count} warehouse link(s) cleared.`,
    )
}
