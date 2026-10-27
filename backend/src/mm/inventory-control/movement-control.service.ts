import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

const COUNT_ADJUSTMENT_MOVEMENTS = new Set([
    'COUNT_GAIN',
    'COUNT_LOSS',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
])

@Injectable()
export class MovementControlService {
    constructor(private prisma: PrismaService) {}

    /**
     * Hard freeze: block warehouse movements during active count sessions.
     * Count adjustments and explicit adjustment movement types are allowed.
     */
    async assertMovementAllowed(input: {
        companyId: string
        warehouseId: string
        materialId?: string
        storageBinId?: string | null
        movementType: string
        sourceDocumentType?: string | null
    }) {
        if (COUNT_ADJUSTMENT_MOVEMENTS.has(input.movementType)) return
        if (input.sourceDocumentType === 'COUNT_ADJUSTMENT') return

        const sessions = await this.prisma.mmCountSession.findMany({
            where: {
                companyId: input.companyId,
                warehouseId: input.warehouseId,
                status: { in: ['IN_PROGRESS', 'RECOUNT_REQUIRED', 'VARIANCE', 'COUNTED'] },
                movementControlMode: 'HARD',
            },
            select: {
                id: true,
                sessionNumber: true,
                movementControlMode: true,
                startedAt: true,
            },
            take: 5,
        })
        if (!sessions.length) return

        const s = sessions[0]
        throw new BadRequestException(
            `MOVEMENT_FROZEN: Warehouse movement blocked by count session ${s.sessionNumber} (hard freeze since ${s.startedAt?.toISOString() ?? 'start'}). Complete or release the count before posting ${input.movementType}.`,
        )
    }

    async listActiveFreezes(companyId: string, warehouseId?: string) {
        return this.prisma.mmCountSession.findMany({
            where: {
                companyId,
                ...(warehouseId ? { warehouseId } : {}),
                status: { in: ['IN_PROGRESS', 'RECOUNT_REQUIRED', 'VARIANCE'] },
                movementControlMode: 'HARD',
            },
            select: {
                id: true,
                sessionNumber: true,
                warehouseId: true,
                status: true,
                startedAt: true,
                inventorySnapshotAt: true,
            },
        })
    }
}
