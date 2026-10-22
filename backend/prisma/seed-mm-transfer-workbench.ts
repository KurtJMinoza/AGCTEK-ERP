import type { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { seedMmOrgAndWarehouseStructure } from './seed-mm-org-warehouse-structure'

const NOTE = 'Demo seed for warehouse transfer workbench screens'

type LineSeed = {
    materialId: string
    uomId: string
    quantity: number
    sourceBinId?: string
    allocatedQty?: number
    dispatchedQty?: number
    receivedQty?: number
}

async function ensureSecondaryWarehouse(
    prisma: PrismaClient,
    companyId: string,
    branchId: string,
) {
    return prisma.warehouse.upsert({
        where: { code: 'SECONDARY' },
        update: {
            name: 'Secondary Warehouse',
            companyId,
            branchId,
            status: 'ACTIVE',
            deletedAt: null,
        },
        create: {
            code: 'SECONDARY',
            name: 'Secondary Warehouse',
            companyId,
            branchId,
            status: 'ACTIVE',
            warehouseType: 'GENERAL',
        },
    })
}

async function upsertSto(
    prisma: PrismaClient,
    orderNumber: string,
    data: {
        companyId: string
        sourceWarehouseId: string
        destinationWarehouseId: string
        status: string
        transferType?: string
        requestedBy?: string
        lines: LineSeed[]
    },
) {
    const existing = await prisma.mmStockTransferOrder.findUnique({
        where: { orderNumber },
    })
    if (existing) return existing

    return prisma.mmStockTransferOrder.create({
        data: {
            orderNumber,
            companyId: data.companyId,
            transferType: data.transferType ?? 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: data.sourceWarehouseId,
            destinationWarehouseId: data.destinationWarehouseId,
            status: data.status,
            requestedBy: data.requestedBy ?? 'demo.planner',
            notes: NOTE,
            lines: {
                create: data.lines.map((line, index) => ({
                    lineNumber: index + 1,
                    materialId: line.materialId,
                    quantity: new Decimal(line.quantity),
                    uomId: line.uomId,
                    sourceBinId: line.sourceBinId ?? null,
                    allocatedQty: new Decimal(line.allocatedQty ?? 0),
                    dispatchedQty: new Decimal(line.dispatchedQty ?? 0),
                    receivedQty: new Decimal(line.receivedQty ?? 0),
                    status: 'OPEN',
                })),
            },
        },
    })
}

async function upsertWmTransfer(
    prisma: PrismaClient,
    transferNumber: string,
    data: {
        sourceWarehouseId: string
        destinationWarehouseId: string
        status: string
        requestedBy?: string
        lines: Array<{
            materialId: string
            quantity: number
            sourceBinId?: string
            pickedQty?: number
            receivedQty?: number
        }>
    },
) {
    const existing = await prisma.wmWarehouseTransfer.findUnique({
        where: { transferNumber },
    })
    if (existing) return existing

    return prisma.wmWarehouseTransfer.create({
        data: {
            transferNumber,
            sourceWarehouseId: data.sourceWarehouseId,
            destinationWarehouseId: data.destinationWarehouseId,
            status: data.status,
            requestedBy: data.requestedBy ?? 'demo.warehouse',
            notes: NOTE,
            lines: {
                create: data.lines.map((line) => ({
                    materialId: line.materialId,
                    quantity: new Decimal(line.quantity),
                    sourceBinId: line.sourceBinId ?? null,
                    pickedQty: new Decimal(line.pickedQty ?? 0),
                    receivedQty: new Decimal(line.receivedQty ?? 0),
                    status: 'OPEN',
                })),
            },
        },
    })
}

export async function seedMmTransferWorkbench(prisma: PrismaClient) {
    console.log('Seeding transfer workbench demo data (STO + WM transfers + sections)…')

    const org = await seedMmOrgAndWarehouseStructure(prisma)
    const branch = await prisma.branch.findFirst({
        where: { companyId: org.company.id, code: 'BR-HQ' },
    })
    if (!branch) {
        console.warn('Branch BR-HQ missing — skip transfer workbench seed')
        return
    }

    const secondary = await ensureSecondaryWarehouse(
        prisma,
        org.company.id,
        branch.id,
    )

    type MatRef = { id: string; baseUomId: string; materialCode?: string }

    let materialA: MatRef | null = await prisma.mmMaterial.findFirst({
        where: { materialCode: 'MAT-STEEL-001' },
        select: { id: true, baseUomId: true, materialCode: true },
    })
    let materialB: MatRef | null = await prisma.mmMaterial.findFirst({
        where: { materialCode: 'MAT-LAPTOP-001' },
        select: { id: true, baseUomId: true, materialCode: true },
    })
    if (!materialA || !materialB) {
        const fallback = await prisma.mmMaterial.findMany({
            take: 2,
            orderBy: { materialCode: 'asc' },
            select: { id: true, baseUomId: true, materialCode: true },
        })
        if (fallback.length < 2) {
            console.warn('Need at least two materials — run MM material seed first')
            return
        }
        materialA = fallback[0]
        materialB = fallback[1]
        console.log(
            `Using fallback materials ${fallback[0].materialCode}, ${fallback[1].materialCode}`,
        )
    }
    if (!materialA || !materialB) return

    const binA = await prisma.wmStorageBin.findFirst({
        where: { code: 'A01-01-001' },
    })
    const binP = await prisma.wmStorageBin.findFirst({
        where: { code: 'P01-01-001' },
    })

    const bulkType = await prisma.wmStorageType.findFirst({
        where: { warehouseId: org.mainWarehouse.id, code: 'BULK_RACK' },
    })
    if (bulkType) {
        for (const sec of [
            { code: 'DEMO-A1', name: 'Demo aisle A1', description: 'Workbench UI sample aisle' },
            { code: 'DEMO-A2', name: 'Demo aisle A2', description: 'Overflow bulk lane' },
            { code: 'DEMO-B1', name: 'Demo aisle B1', description: 'Fast-moving SKUs' },
        ]) {
            const exists = await prisma.wmStorageSection.findFirst({
                where: { storageTypeId: bulkType.id, code: sec.code },
            })
            if (!exists) {
                await prisma.wmStorageSection.create({
                    data: {
                        ...sec,
                        storageTypeId: bulkType.id,
                        status: 'ACTIVE',
                    },
                })
            }
        }
    }

    const baseLine = (material: MatRef, qty: number, binId?: string): LineSeed => ({
        materialId: material.id,
        uomId: material.baseUomId,
        quantity: qty,
        sourceBinId: binId,
    })

    await upsertSto(prisma, 'DEMO-STO-QUEUE-01', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'APPROVED',
        lines: [baseLine(materialA, 40, binA?.id)],
    })

    await upsertSto(prisma, 'DEMO-STO-QUEUE-02', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'ALLOCATED',
        lines: [
            {
                ...baseLine(materialB, 6, binP?.id),
                allocatedQty: 6,
            },
        ],
    })

    await upsertSto(prisma, 'DEMO-STO-TRANSIT-01', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'IN_TRANSIT',
        lines: [
            {
                ...baseLine(materialA, 25, binA?.id),
                allocatedQty: 25,
                dispatchedQty: 25,
            },
        ],
    })

    await upsertSto(prisma, 'DEMO-STO-RECEIPT-01', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'PARTIALLY_RECEIVED',
        lines: [
            {
                ...baseLine(materialA, 30, binA?.id),
                allocatedQty: 30,
                dispatchedQty: 30,
                receivedQty: 12,
            },
        ],
    })

    await upsertSto(prisma, 'DEMO-STO-HIST-CLOSED', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'CLOSED',
        lines: [
            {
                ...baseLine(materialB, 4, binP?.id),
                allocatedQty: 4,
                dispatchedQty: 4,
                receivedQty: 4,
            },
        ],
    })

    await upsertSto(prisma, 'DEMO-STO-HIST-CANCEL', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'CANCELLED',
        lines: [baseLine(materialA, 10, binA?.id)],
    })

    await upsertSto(prisma, 'DEMO-STO-ORDERS-DRAFT', {
        companyId: org.company.id,
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'DRAFT',
        lines: [
            baseLine(materialA, 15, binA?.id),
            baseLine(materialB, 2, binP?.id),
        ],
    })

    await upsertWmTransfer(prisma, 'DEMO-TO-DRAFT', {
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'DRAFT',
        lines: [
            { materialId: materialA.id, quantity: 20, sourceBinId: binA?.id },
        ],
    })

    await upsertWmTransfer(prisma, 'DEMO-TO-APPROVED', {
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'APPROVED',
        lines: [
            { materialId: materialB.id, quantity: 3, sourceBinId: binP?.id },
        ],
    })

    await upsertWmTransfer(prisma, 'DEMO-TO-IN-TRANSIT', {
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'IN_TRANSIT',
        lines: [
            {
                materialId: materialA.id,
                quantity: 18,
                sourceBinId: binA?.id,
                pickedQty: 18,
            },
        ],
    })

    await upsertWmTransfer(prisma, 'DEMO-TO-COMPLETED', {
        sourceWarehouseId: org.mainWarehouse.id,
        destinationWarehouseId: secondary.id,
        status: 'COMPLETED',
        lines: [
            {
                materialId: materialB.id,
                quantity: 5,
                sourceBinId: binP?.id,
                pickedQty: 5,
                receivedQty: 5,
            },
        ],
    })

    console.log('Transfer workbench demo seed complete.')
}
