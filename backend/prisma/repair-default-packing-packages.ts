import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

type RepairOptions = {
    apply?: boolean
    orderNumber?: string
}

type PickedItem = {
    materialId: string
    expectedQty: number
    batchId: string | null
    serialId: string | null
}

const ACTIVE_PICKING_STATUSES = ['PARTIALLY_PICKED', 'COMPLETED']
const DUPLICATE_CANDIDATE_STATUSES = ['OPEN', 'PACKING']

const itemKey = (item: {
    materialId: string
    batchId: string | null
    serialId: string | null
}) => `${item.materialId}:${item.batchId ?? ''}:${item.serialId ?? ''}`

function aggregatePickedItems(
    tasks: Array<{
        materialId: string
        pickedQty: Decimal
        batchId: string | null
        serialId: string | null
    }>,
): PickedItem[] {
    const items = new Map<string, PickedItem>()
    for (const task of tasks) {
        const key = itemKey(task)
        const current = items.get(key)
        const quantity = Number(task.pickedQty)
        if (current) current.expectedQty += quantity
        else {
            items.set(key, {
                materialId: task.materialId,
                expectedQty: quantity,
                batchId: task.batchId,
                serialId: task.serialId,
            })
        }
    }
    return [...items.values()]
}

/**
 * Safely repairs the historical package-per-pick bug.
 *
 * Only unscanned, OPEN/PACKING packages that exactly mirror their source
 * packing-session picking task are treated as automatic duplicates. The script
 * never deletes packages. It preserves a shipped/dispatched package and cancels
 * its unshipped duplicates; otherwise it merges all picked quantities into the
 * earliest/default package and cancels only the redundant records.
 *
 * Default mode is a dry run. Apply with:
 *   npm run prisma:repair-default-packing-packages -- --apply
 * Optional narrow scope:
 *   npm run prisma:repair-default-packing-packages -- --apply --order=SO-000008
 */
export async function repairDefaultPackingPackages(
    prisma: PrismaClient,
    options: RepairOptions = {},
) {
    const packages = await prisma.wmPackage.findMany({
        where: {
            ...(options.orderNumber
                ? { orderNumber: options.orderNumber }
                : {}),
            status: { not: 'CANCELLED' },
        },
        include: {
            items: true,
            shipment: { select: { id: true, reference: true } },
            salesOrder: {
                select: { id: true, orderNumber: true, companyId: true },
            },
            pickingTask: { select: { salesOrderId: true } },
            packingSession: {
                select: { id: true, pickingTaskId: true, status: true },
            },
        },
        orderBy: { createdAt: 'asc' },
    })

    const groups = new Map<string, typeof packages>()
    for (const pkg of packages) {
        const salesOrderId = pkg.salesOrderId ?? pkg.pickingTask?.salesOrderId
        if (!salesOrderId) continue
        // A physical package cannot span warehouses. This preserves the one
        // default package invariant for the usual single-warehouse order while
        // allowing legitimate multi-warehouse fulfillment.
        const key = `${salesOrderId}:${pkg.warehouseId}`
        groups.set(key, [...(groups.get(key) ?? []), pkg])
    }

    let mergedOrders = 0
    let cancelledPackages = 0
    let skippedOrders = 0

    for (const group of groups.values()) {
        if (group.length < 2) continue
        const first = group[0]
        const salesOrderId =
            first.salesOrderId ?? first.pickingTask?.salesOrderId
        if (!salesOrderId) continue

        const candidates = group.filter((pkg) => {
            const isLegacyAutoPackage =
                !!pkg.packingSessionId &&
                pkg.packingSession?.pickingTaskId === pkg.pickingTaskId
            return (
                DUPLICATE_CANDIDATE_STATUSES.includes(pkg.status) &&
                !pkg.shipment &&
                pkg.items.every((item) =>
                    new Decimal(item.scannedQty).isZero(),
                ) &&
                pkg.packageRole !== 'SPLIT' &&
                (pkg.packageRole === 'DEFAULT' || isLegacyAutoPackage)
            )
        })
        if (!candidates.length) continue

        const protectedPackage = group.find(
            (pkg) => pkg.status === 'DISPATCHED' || !!pkg.shipment,
        )
        if (protectedPackage) {
            console.log(
                `${options.apply ? 'Cancelling' : 'Would cancel'} ${candidates.length} unshipped duplicate(s) for ` +
                    `${first.orderNumber ?? salesOrderId}; preserving ${protectedPackage.packageNumber}`,
            )
            if (options.apply) {
                await prisma.$transaction(async (tx) => {
                    const duplicateIds = candidates.map((pkg) => pkg.id)
                    const sessionIds = candidates
                        .map((pkg) => pkg.packingSessionId)
                        .filter((id): id is string => Boolean(id))
                    await tx.wmPackage.updateMany({
                        where: {
                            id: { in: duplicateIds },
                            status: { in: DUPLICATE_CANDIDATE_STATUSES },
                        },
                        data: { status: 'CANCELLED' },
                    })
                    if (sessionIds.length) {
                        await tx.wmPackingSession.updateMany({
                            where: { id: { in: sessionIds }, status: 'OPEN' },
                            data: { status: 'CANCELLED' },
                        })
                    }
                })
            }
            cancelledPackages += candidates.length
            continue
        }

        if (candidates.length < 2) continue
        const canonical =
            candidates.find((pkg) => pkg.packageRole === 'DEFAULT') ??
            candidates[0]
        const duplicates = candidates.filter((pkg) => pkg.id !== canonical.id)
        const order =
            canonical.salesOrder ??
            (await prisma.sdSalesOrder.findUnique({
                where: { id: salesOrderId },
                select: { id: true, orderNumber: true, companyId: true },
            }))
        if (!order || !canonical.packingSessionId) {
            console.log(
                `Skip ${canonical.orderNumber ?? salesOrderId}: cannot establish a canonical sales order/session safely.`,
            )
            skippedOrders += 1
            continue
        }

        const pickedTasks = await prisma.wmPickingTask.findMany({
            where: {
                salesOrderId,
                warehouseId: canonical.warehouseId,
                pickedQty: { gt: 0 },
                status: { in: ACTIVE_PICKING_STATUSES },
            },
            select: {
                materialId: true,
                pickedQty: true,
                batchId: true,
                serialId: true,
            },
        })
        if (!pickedTasks.length) {
            console.log(
                `Skip ${order.orderNumber}: no picked tasks found to rebuild the default package.`,
            )
            skippedOrders += 1
            continue
        }
        const expectedItems = aggregatePickedItems(pickedTasks)
        console.log(
            `${options.apply ? 'Merging' : 'Would merge'} ${duplicates.length} duplicate(s) into ` +
                `${canonical.packageNumber} for ${order.orderNumber} (${expectedItems.reduce((sum, item) => sum + item.expectedQty, 0)} item(s)).`,
        )

        if (options.apply) {
            await prisma.$transaction(async (tx) => {
                const duplicateSessionIds = duplicates
                    .map((pkg) => pkg.packingSessionId)
                    .filter((id): id is string => Boolean(id))
                // Cancel extra sessions before assigning the order link, so the
                // partial unique index cannot see two active workspaces.
                if (duplicateSessionIds.length) {
                    await tx.wmPackingSession.updateMany({
                        where: {
                            id: { in: duplicateSessionIds },
                            status: 'OPEN',
                        },
                        data: { status: 'CANCELLED' },
                    })
                }
                if (duplicates.length) {
                    await tx.wmPackage.updateMany({
                        where: { id: { in: duplicates.map((pkg) => pkg.id) } },
                        data: { status: 'CANCELLED' },
                    })
                }

                await tx.wmPackingSession.update({
                    where: { id: canonical.packingSessionId! },
                    data: {
                        salesOrderId: order.id,
                        companyId: order.companyId,
                    },
                })
                await tx.wmPackage.update({
                    where: { id: canonical.id },
                    data: {
                        salesOrderId: order.id,
                        orderNumber: order.orderNumber,
                        companyId: order.companyId,
                        packageRole: 'DEFAULT',
                    },
                })

                const existing = await tx.wmPackageItem.findMany({
                    where: { packageId: canonical.id },
                })
                const byKey = new Map(
                    existing.map((item) => [itemKey(item), item]),
                )
                for (const expected of expectedItems) {
                    const item = byKey.get(itemKey(expected))
                    if (!item) {
                        await tx.wmPackageItem.create({
                            data: {
                                ...expected,
                                packageId: canonical.id,
                                status: 'PENDING',
                            },
                        })
                    } else if (
                        !new Decimal(item.expectedQty).eq(expected.expectedQty)
                    ) {
                        await tx.wmPackageItem.update({
                            where: { id: item.id },
                            data: { expectedQty: expected.expectedQty },
                        })
                    }
                }
            })
        }
        mergedOrders += 1
        cancelledPackages += duplicates.length
    }

    console.log(
        `${options.apply ? 'Applied' : 'Dry run'} complete: ${mergedOrders} merged order(s), ` +
            `${cancelledPackages} cancelled duplicate package(s), ${skippedOrders} skipped order(s).`,
    )
    return { mergedOrders, cancelledPackages, skippedOrders }
}

if (require.main === module) {
    const options: RepairOptions = {
        apply: process.argv.includes('--apply'),
        orderNumber: process.argv
            .find((arg) => arg.startsWith('--order='))
            ?.slice('--order='.length),
    }
    const prisma = new PrismaClient()
    repairDefaultPackingPackages(prisma, options)
        .catch((error: unknown) => {
            console.error(error)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
