import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type SerialTrackingPolicy =
    | 'NOT_SERIALIZED'
    | 'SERIALIZED_AT_RECEIPT'
    | 'SERIALIZED_AT_ISSUE'
    | 'SERIALIZED_AT_BOTH'

export type SerialStatus =
    | 'AVAILABLE'
    | 'ALLOCATED'
    | 'SOLD'
    | 'SCRAPPED'
    | 'BLOCKED'
    | 'DAMAGED'
    | 'RETURNED'

/**
 * Unified barcode and serial number service for MM Material Master.
 *
 * Single source of truth for:
 *   - Material barcode registration (primary + alternative)
   - Serial number tracking configuration
   - Individual serial number records and lifecycle
 *
 * All connected modules (SD, POS, Procurement, Warehouse, SCM, Returns)
 * consume this service for barcode lookup and serial number operations.
 */
@Injectable()
export class MmBarcodeSerialService {
    constructor(private prisma: PrismaService) {}

    // ════════════════════════════════════════════════════════════════════════════
    // BARCODE MANAGEMENT
    // ════════════════════════════════════════════════════════════════════════════

    async listBarcodes(materialId?: string, companyId?: string) {
        const where: any = { deletedAt: null }
        if (materialId) where.materialId = materialId
        if (companyId) where.companyId = companyId
        return this.prisma.mmBarcode.findMany({
            where,
            include: {
                material: {
                    select: { id: true, materialCode: true, materialName: true, sku: true },
                },
            },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        })
    }

    async getBarcode(id: string) {
        const barcode = await this.prisma.mmBarcode.findFirst({
            where: { id, deletedAt: null },
            include: {
                material: {
                    select: { id: true, materialCode: true, materialName: true, sku: true },
                },
            },
        })
        if (!barcode) throw new NotFoundException('Barcode not found')
        return barcode
    }

    async createBarcode(data: {
        materialId: string
        barcodeType: string
        barcodeValue: string
        isPrimary?: boolean
        companyId?: string
    }) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: data.materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')
        if (!material.companyId) {
            throw new BadRequestException('Material must belong to a company')
        }
        const companyId = data.companyId ?? material.companyId

        // Prevent duplicate active barcodes across the company
        const exists = await this.prisma.mmBarcode.findFirst({
            where: {
                companyId,
                barcodeValue: data.barcodeValue.trim(),
                deletedAt: null,
                status: 'ACTIVE',
            },
        })
        if (exists) {
            throw new ConflictException(
                `Barcode ${data.barcodeValue} is already registered to material ${exists.materialId}`,
            )
        }

        const isPrimary = Boolean(data.isPrimary)
        if (isPrimary) {
            // Demote any existing primary barcode on this material
            await this.prisma.mmBarcode.updateMany({
                where: {
                    materialId: data.materialId,
                    deletedAt: null,
                    isPrimary: true,
                    status: 'ACTIVE',
                },
                data: { isPrimary: false },
            })
        }

        return this.prisma.mmBarcode.create({
            data: {
                companyId,
                materialId: data.materialId,
                entityType: 'MATERIAL',
                entityId: data.materialId,
                barcodeType: data.barcodeType,
                barcodeValue: data.barcodeValue.trim(),
                isPrimary,
                status: 'ACTIVE',
            },
            include: {
                material: {
                    select: { id: true, materialCode: true, materialName: true, sku: true },
                },
            },
        })
    }

    async updateBarcode(
        id: string,
        data: {
            barcodeValue?: string
            barcodeType?: string
            isPrimary?: boolean
            status?: 'ACTIVE' | 'ARCHIVED'
        },
    ) {
        const existing = await this.getBarcode(id)

        if (data.barcodeValue && data.barcodeValue !== existing.barcodeValue) {
            const dup = await this.prisma.mmBarcode.findFirst({
                where: {
                    companyId: existing.companyId,
                    barcodeValue: data.barcodeValue.trim(),
                    deletedAt: null,
                    status: 'ACTIVE',
                    id: { not: id },
                },
            })
            if (dup) {
                throw new ConflictException(
                    `Barcode ${data.barcodeValue} is already registered`,
                )
            }
        }

        const updateData: any = {}
        if (data.barcodeValue) updateData.barcodeValue = data.barcodeValue.trim()
        if (data.barcodeType) updateData.barcodeType = data.barcodeType
        if (data.status) {
            updateData.status = data.status
            if (data.status === 'ARCHIVED') {
                updateData.archivedAt = new Date()
                updateData.isPrimary = false
            }
        }
        if (data.isPrimary !== undefined && data.isPrimary) {
            await this.prisma.mmBarcode.updateMany({
                where: {
                    materialId: existing.materialId,
                    deletedAt: null,
                    isPrimary: true,
                    status: 'ACTIVE',
                    id: { not: id },
                },
                data: { isPrimary: false },
            })
            updateData.isPrimary = true
        }

        return this.prisma.mmBarcode.update({
            where: { id },
            data: updateData,
            include: {
                material: {
                    select: { id: true, materialCode: true, materialName: true, sku: true },
                },
            },
        })
    }

    async deactivateBarcode(id: string) {
        return this.updateBarcode(id, { status: 'ARCHIVED' })
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SERIAL NUMBER MANAGEMENT
    // ════════════════════════════════════════════════════════════════════════════

    async listSerialNumbers(materialId?: string, status?: SerialStatus) {
        const where: any = { deletedAt: null }
        if (materialId) where.materialId = materialId
        if (status) where.status = status
        return this.prisma.mmSerialNumber.findMany({
            where,
            include: {
                material: {
                    select: {
                        id: true,
                        materialCode: true,
                        materialName: true,
                        sku: true,
                        serialManaged: true,
                        serialTrackingPolicy: true,
                    },
                },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async getSerialNumber(id: string) {
        const sn = await this.prisma.mmSerialNumber.findFirst({
            where: { id, deletedAt: null },
            include: {
                material: true,
                batch: { select: { id: true, batchNumber: true } },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
        if (!sn) throw new NotFoundException('Serial number not found')
        return sn
    }

    async createSerialNumber(data: {
        materialId: string
        serialNumber?: string // If not provided, auto-generate
        batchId?: string
        currentWarehouseId?: string
        currentBinId?: string
        status?: SerialStatus
    }) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: data.materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')

        const policy = material.serialTrackingPolicy ?? 'NOT_SERIALIZED'
        if (
            policy === 'NOT_SERIALIZED' ||
            (!material.serialManaged && policy !== 'SERIALIZED_AT_BOTH')
        ) {
            throw new BadRequestException(
                'Material is not configured for serial number tracking',
            )
        }

        let serialNumber = data.serialNumber
        if (!serialNumber) {
            // Auto-generate: MAT-{materialCode}-{seq}
            const last = await this.prisma.mmSerialNumber.findFirst({
                where: { materialId: data.materialId, deletedAt: null },
                orderBy: { createdAt: 'desc' },
                select: { serialNumber: true },
            })
            const seq = last ? Number(last.serialNumber.split('-').pop() ?? '0') + 1 : 1
            serialNumber = `${material.materialCode}-${String(seq).padStart(4, '0')}`
        }

        const exists = await this.prisma.mmSerialNumber.findFirst({
            where: {
                materialId: data.materialId,
                serialNumber,
                deletedAt: null,
            },
        })
        if (exists) {
            throw new ConflictException(
                `Serial number ${serialNumber} already exists for material ${data.materialId}`,
            )
        }

        return this.prisma.mmSerialNumber.create({
            data: {
                materialId: data.materialId,
                serialNumber,
                batchId: data.batchId ?? null,
                currentWarehouseId: data.currentWarehouseId ?? null,
                currentBinId: data.currentBinId ?? null,
                status: data.status ?? 'AVAILABLE',
            },
            include: {
                material: {
                    select: {
                        id: true,
                        materialCode: true,
                        materialName: true,
                        sku: true,
                    },
                },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
    }

    async updateSerialNumber(
        id: string,
        data: {
            serialNumber?: string
            currentWarehouseId?: string | null
            currentBinId?: string | null
            status?: SerialStatus
        },
    ) {
        const sn = await this.getSerialNumber(id)

        if (data.serialNumber && data.serialNumber !== sn.serialNumber) {
            const dup = await this.prisma.mmSerialNumber.findFirst({
                where: {
                    materialId: sn.materialId,
                    serialNumber: data.serialNumber,
                    deletedAt: null,
                    id: { not: id },
                },
            })
            if (dup) {
                throw new ConflictException(
                    `Serial number ${data.serialNumber} already exists for this material`,
                )
            }
        }

        return this.prisma.mmSerialNumber.update({
            where: { id },
            data: {
                ...(data.serialNumber && { serialNumber: data.serialNumber }),
                ...(data.currentWarehouseId !== undefined && {
                    currentWarehouseId: data.currentWarehouseId,
                }),
                ...(data.currentBinId !== undefined && {
                    currentBinId: data.currentBinId,
                }),
                ...(data.status && { status: data.status }),
            },
            include: {
                material: {
                    select: {
                        id: true,
                        materialCode: true,
                        materialName: true,
                        sku: true,
                    },
                },
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
    }

    async deactivateSerialNumber(id: string) {
        return this.updateSerialNumber(id, { status: 'BLOCKED' })
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SERIAL TRACKING POLICY ON MATERIAL
    // ════════════════════════════════════════════════════════════════════════════

    async setSerialTrackingPolicy(
        materialId: string,
        policy: SerialTrackingPolicy,
    ) {
        const validPolicies: SerialTrackingPolicy[] = [
            'NOT_SERIALIZED',
            'SERIALIZED_AT_RECEIPT',
            'SERIALIZED_AT_ISSUE',
            'SERIALIZED_AT_BOTH',
        ]
        if (!validPolicies.includes(policy)) {
            throw new BadRequestException(
                `Invalid serial tracking policy: ${policy}`,
            )
        }

        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')

        return this.prisma.mmMaterial.update({
            where: { id: materialId },
            data: {
                serialTrackingPolicy: policy,
                serialManaged:
                    policy !== 'NOT_SERIALIZED',
            },
            select: {
                id: true,
                materialCode: true,
                materialName: true,
                serialManaged: true,
                serialTrackingPolicy: true,
            },
        })
    }

    // ════════════════════════════════════════════════════════════════════════════
    // BARCODE LOOKUP (delegates to BarcodeResolveService for canonical lookup)
    // ════════════════════════════════════════════════════════════════════════════

    async lookupBarcode(barcode: string, companyId?: string) {
        // Use Prisma directly for the material barcode portion
        // Full document/warehouse/bin/serial resolution is handled by BarcodeResolveService
        const hit = await this.prisma.mmBarcode.findFirst({
            where: {
                barcodeValue: barcode.trim(),
                deletedAt: null,
                status: 'ACTIVE',
                ...(companyId ? { companyId } : {}),
            },
            include: {
                material: {
                    select: {
                        id: true,
                        materialCode: true,
                        materialName: true,
                        sku: true,
                        serialManaged: true,
                        serialTrackingPolicy: true,
                        baseUomId: true,
                        standardCost: true,
                        status: true,
                        sellable: true,
                    },
                },
            },
        })

        if (!hit) {
            return { found: false, barcode, message: 'Barcode not found' }
        }

        // Get inventory availability
        const balance = await this.prisma.mmInventoryBalance.findFirst({
            where: { materialId: hit.materialId },
            select: { quantity: true, availableQuantity: true, reservedQuantity: true },
        })

        return {
            found: true,
            barcode: hit.barcodeValue,
            source: 'MM',
            material: {
                id: hit.material.id,
                materialCode: hit.material.materialCode,
                sku: hit.material.sku,
                name: hit.material.materialName,
                description: hit.material.materialName,
                brand: null,
                category: null,
                uom: hit.material.baseUomId,
                unitCost: hit.material.standardCost,
                status: hit.material.status,
                sellable: hit.material.sellable,
                companyId: hit.companyId,
                serialManaged: hit.material.serialManaged,
                serialTrackingPolicy: hit.material.serialTrackingPolicy,
            },
            listing: null, // Populated by calling module (SD) via product assignment
            availability: balance
                ? {
                      onHandQty: Number(balance.quantity),
                      availableQty: Number(balance.availableQuantity),
                      reservedQty: Number(balance.reservedQuantity),
                  }
                : null,
            action: 'MATERIAL_FOUND',
            isPrimary: hit.isPrimary,
        }
    }
}
