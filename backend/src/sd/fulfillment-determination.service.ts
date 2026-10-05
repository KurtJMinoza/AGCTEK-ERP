import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'

export type FulfillmentDeterminationInput = {
    companyId: string
    channel: string
    branchId?: string | null
    divisionId?: string | null
    explicitWarehouseId?: string | null
    materialId?: string
}

@Injectable()
export class FulfillmentDeterminationService {
    constructor(private prisma: PrismaService) {}

    async determineWarehouse(input: FulfillmentDeterminationInput): Promise<{
        companyId: string
        warehouseId: string
    }> {
        if (input.explicitWarehouseId) {
            const wh = await this.prisma.warehouse.findFirst({
                where: {
                    id: input.explicitWarehouseId,
                    companyId: input.companyId,
                    status: 'ACTIVE',
                    deletedAt: null,
                },
            })
            if (!wh) {
                throw new SdMmIntegrationException(
                    SD_MM_ERROR.FULFILLMENT_WAREHOUSE_UNRESOLVED,
                    'Explicit warehouse is invalid for company',
                )
            }
            return { companyId: input.companyId, warehouseId: wh.id }
        }

        if (input.branchId) {
            const branchMap = await this.prisma.sdBranchFulfillment.findFirst({
                where: {
                    branchCode: input.branchId,
                    companyId: input.companyId,
                    isActive: true,
                },
            })
            if (branchMap) {
                return {
                    companyId: input.companyId,
                    warehouseId: branchMap.warehouseId,
                }
            }
        }

        if (input.materialId) {
            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: input.materialId },
                select: { defaultWarehouseId: true, companyId: true },
            })
            if (
                material?.defaultWarehouseId &&
                material.companyId === input.companyId
            ) {
                return {
                    companyId: input.companyId,
                    warehouseId: material.defaultWarehouseId,
                }
            }
        }

        const fallback = await this.prisma.warehouse.findFirst({
            where: {
                companyId: input.companyId,
                status: 'ACTIVE',
                deletedAt: null,
            },
            orderBy: { code: 'asc' },
        })
        if (!fallback) {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.FULFILLMENT_WAREHOUSE_UNRESOLVED,
                'No fulfillment warehouse could be determined',
            )
        }
        return { companyId: input.companyId, warehouseId: fallback.id }
    }

    /** Default company for retail when not yet on order header. */
    async defaultCompanyId(): Promise<string> {
        const company = await this.prisma.company.findFirst({
            where: { code: 'AGCTEK' },
            select: { id: true },
        })
        if (!company) {
            throw new SdMmIntegrationException(
                SD_MM_ERROR.FULFILLMENT_WAREHOUSE_UNRESOLVED,
                'Default company AGCTEK not found',
            )
        }
        return company.id
    }
}
