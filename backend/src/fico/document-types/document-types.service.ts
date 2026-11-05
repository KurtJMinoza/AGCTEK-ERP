import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateFiDocumentTypeDto, UpdateFiDocumentTypeDto } from '../dto/document-type.dto'

@Injectable()
export class DocumentTypesService {
    constructor(private prisma: PrismaService) {}
    list() { return this.prisma.fiDocumentType.findMany({ orderBy: { code: 'asc' } }) }
    async get(id: string) { const row = await this.prisma.fiDocumentType.findUnique({ where: { id } }); if (!row) throw new NotFoundException('FI document type not found'); return row }
    async create(dto: CreateFiDocumentTypeDto) {
        if (dto.numberRangeTo < dto.numberRangeFrom) throw new BadRequestException('Number range end must be greater than or equal to start')
        try { return await this.prisma.fiDocumentType.create({ data: { ...dto, code: dto.code.toUpperCase(), prefix: dto.prefix?.toUpperCase(), nextNumber: dto.nextNumber ?? dto.numberRangeFrom } }) }
        catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Document type code already exists'); throw error }
    }
    async update(id: string, dto: UpdateFiDocumentTypeDto) {
        const current = await this.get(id); const from = dto.numberRangeFrom ?? current.numberRangeFrom; const to = dto.numberRangeTo ?? current.numberRangeTo; const next = dto.nextNumber ?? current.nextNumber
        if (to < from || next < from || next > to + 1) throw new BadRequestException('Invalid document number range')
        return this.prisma.fiDocumentType.update({ where: { id }, data: { ...dto, code: dto.code?.toUpperCase(), prefix: dto.prefix?.toUpperCase() } })
    }
    async deactivate(id: string) { await this.get(id); return this.prisma.fiDocumentType.update({ where: { id }, data: { isActive: false } }) }
}
