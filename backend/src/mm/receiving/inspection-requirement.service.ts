import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class InspectionRequirementService {
    constructor(private prisma: PrismaService) {}

    /** OR logic: material, supplier, warehouse, or supplier-material triggers inspection. */
    async isInspectionRequired(params: {
        materialId: string
        supplierId?: string | null
        warehouseId: string
    }): Promise<boolean> {
        const [material, warehouse, supplier, supplierMaterial] = await Promise.all([
            this.prisma.mmMaterial.findUnique({
                where: { id: params.materialId },
                select: { qualityInspectionRequired: true },
            }),
            this.prisma.warehouse.findUnique({
                where: { id: params.warehouseId },
                select: { qualityInspectionRequired: true },
            }),
            params.supplierId
                ? this.prisma.mmSupplier.findUnique({
                      where: { id: params.supplierId },
                      select: { qualityInspectionRequired: true },
                  })
                : Promise.resolve(null),
            params.supplierId
                ? this.prisma.mmSupplierMaterial.findFirst({
                      where: {
                          supplierId: params.supplierId,
                          materialId: params.materialId,
                          status: 'ACTIVE',
                      },
                      select: { inspectionRequired: true },
                  })
                : Promise.resolve(null),
        ])

        return (
            material?.qualityInspectionRequired === true ||
            warehouse?.qualityInspectionRequired === true ||
            supplier?.qualityInspectionRequired === true ||
            supplierMaterial?.inspectionRequired === true
        )
    }
}
