import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type PaymentMethodRecord = {
    id: string
    code: string
    name: string
    description: string | null
    icon: string | null
    origin: string
    isActive: boolean
    sortOrder: number
    allowChange: boolean
    requiresReference: boolean
    requiresBank: boolean
    requiresDate: boolean
    requiresEmployee: boolean
    settlementType: string
    glAccountCode: string | null
}

@Injectable()
export class PosPaymentMethodService {
    constructor(private readonly prisma: PrismaService) {}

    async list(activeOnly = false): Promise<PaymentMethodRecord[]> {
        return this.prisma.sdPaymentMethod.findMany({
            where: activeOnly ? { isActive: true } : undefined,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
    }

    async findByCode(code: string): Promise<PaymentMethodRecord | null> {
        return this.prisma.sdPaymentMethod.findUnique({ where: { code } })
    }

    async create(input: {
        code: string
        name: string
        description?: string
        icon?: string
        allowChange?: boolean
        requiresReference?: boolean
        requiresBank?: boolean
        requiresDate?: boolean
        requiresEmployee?: boolean
        settlementType?: string
        glAccountCode?: string
    }) {
        const code = input.code.toUpperCase().replace(/\s+/g, '_')
        const existing = await this.prisma.sdPaymentMethod.findUnique({
            where: { code },
        })
        if (existing) {
            throw new ConflictException(
                `Payment method code "${code}" already exists.`,
            )
        }
        return this.prisma.sdPaymentMethod.create({
            data: {
                code,
                name: input.name.trim(),
                description: input.description?.trim() || null,
                icon: input.icon?.trim() || null,
                allowChange: input.allowChange ?? false,
                requiresReference: input.requiresReference ?? false,
                requiresBank: input.requiresBank ?? false,
                requiresDate: input.requiresDate ?? false,
                requiresEmployee: input.requiresEmployee ?? false,
                settlementType: input.settlementType ?? 'IMMEDIATE',
                glAccountCode: input.glAccountCode?.trim() || null,
            },
        })
    }

    async update(
        id: string,
        input: Partial<{
            name: string
            description: string
            icon: string
            isActive: boolean
            sortOrder: number
            allowChange: boolean
            requiresReference: boolean
            requiresBank: boolean
            requiresDate: boolean
            requiresEmployee: boolean
            settlementType: string
            glAccountCode: string
        }>,
    ) {
        const method = await this.prisma.sdPaymentMethod.findUnique({
            where: { id },
        })
        if (!method) throw new NotFoundException('Payment method not found.')
        return this.prisma.sdPaymentMethod.update({
            where: { id },
            data: {
                name: input.name?.trim(),
                description: input.description?.trim(),
                icon: input.icon?.trim(),
                isActive: input.isActive,
                sortOrder: input.sortOrder,
                allowChange: input.allowChange,
                requiresReference: input.requiresReference,
                requiresBank: input.requiresBank,
                requiresDate: input.requiresDate,
                requiresEmployee: input.requiresEmployee,
                settlementType: input.settlementType,
                glAccountCode: input.glAccountCode?.trim(),
            },
        })
    }

    async delete(id: string) {
        const method = await this.prisma.sdPaymentMethod.findUnique({
            where: { id },
        })
        if (!method) throw new NotFoundException('Payment method not found.')
        if (method.origin === 'SYSTEM') {
            throw new BadRequestException(
                'System payment methods cannot be deleted. Deactivate them instead.',
            )
        }
        const used = await this.prisma.sdSalesOrderPayment.count({
            where: { paymentMethod: method.code },
        })
        if (used > 0) {
            throw new ConflictException(
                'Cannot delete a payment method that has been used in transactions. Deactivate it instead.',
            )
        }
        return this.prisma.sdPaymentMethod.delete({ where: { id } })
    }

    /** Map of method code → G/L account code, for the revenue posting listener. */
    async glAccountMap(): Promise<Record<string, string>> {
        const methods = await this.prisma.sdPaymentMethod.findMany({
            where: { isActive: true, glAccountCode: { not: null } },
            select: { code: true, glAccountCode: true },
        })
        return Object.fromEntries(
            methods
                .filter((m) => m.glAccountCode)
                .map((m) => [m.code, m.glAccountCode!]),
        )
    }
}
