import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreatePaymentTermsDto } from './dto/create-payment-terms.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { nextSequentialCode } from '../shared/next-code'

@Injectable()
export class PaymentTermsService {
    constructor(private prisma: PrismaService) {}

    async create(dto: CreatePaymentTermsDto) {
        const code = dto.code?.trim() || (await this.generateNextCode())
        const exists = await this.prisma.mmPaymentTerms.findFirst({
            where: { code, deletedAt: null },
        })
        if (exists) throw new ConflictException('Payment terms code already exists')

        const softDeleted = await this.prisma.mmPaymentTerms.findFirst({
            where: { code, deletedAt: { not: null } },
        })
        if (softDeleted) {
            return this.prisma.mmPaymentTerms.update({
                where: { id: softDeleted.id },
                data: {
                    name: dto.name,
                    description: dto.description ?? null,
                    dueDays: dto.dueDays,
                    discountDays: dto.discountDays ?? null,
                    discountPercent: dto.discountPercent != null ? new Decimal(dto.discountPercent) : null,
                    isActive: true,
                    deletedAt: null,
                },
            })
        }

        return this.prisma.mmPaymentTerms.create({
            data: {
                code,
                name: dto.name,
                description: dto.description ?? null,
                dueDays: dto.dueDays,
                discountDays: dto.discountDays ?? null,
                discountPercent: dto.discountPercent != null ? new Decimal(dto.discountPercent) : null,
            },
        })
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmPaymentTerms.findFirst({
            where: { code: { startsWith: 'PT-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
        })
        return nextSequentialCode(last?.code, 'PT-')
    }

    async update(id: string, dto: Partial<CreatePaymentTermsDto>) {
        const existing = await this.prisma.mmPaymentTerms.findFirst({
            where: { id, deletedAt: null },
        })
        if (!existing) throw new NotFoundException('Payment terms not found')

        const data: any = {}
        if (dto.name !== undefined) data.name = dto.name
        if (dto.description !== undefined) data.description = dto.description
        if (dto.dueDays !== undefined) data.dueDays = dto.dueDays
        if (dto.discountDays !== undefined) data.discountDays = dto.discountDays
        if (dto.discountPercent !== undefined) data.discountPercent = dto.discountPercent != null ? new Decimal(dto.discountPercent) : null
        // code is immutable

        return this.prisma.mmPaymentTerms.update({ where: { id }, data })
    }

    async findAll() {
        return this.prisma.mmPaymentTerms.findMany({
            where: { deletedAt: null },
            orderBy: { code: 'asc' },
        })
    }

    async findOne(id: string) {
        const rec = await this.prisma.mmPaymentTerms.findFirst({ where: { id, deletedAt: null } })
        if (!rec) throw new NotFoundException('Payment terms not found')
        return rec
    }

    async softDelete(id: string) {
        const rec = await this.prisma.mmPaymentTerms.findFirst({ where: { id, deletedAt: null } })
        if (!rec) throw new NotFoundException('Payment terms not found')
        return this.prisma.mmPaymentTerms.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }
}
