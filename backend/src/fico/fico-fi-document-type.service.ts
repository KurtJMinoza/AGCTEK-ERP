import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
    CreateFiDocumentTypeDto,
    UpdateFiDocumentTypeDto,
} from './dto/fico-fi-document-type.dto'

function newFiDocumentTypeId() {
    return `fico_dt_${randomBytes(8).toString('hex')}`
}

/**
 * Compatibility layer for Desktop UI that still calls /fico/fi-document-types.
 * Reads/writes the legacy global `fi_document_types` table (still present in DB).
 * Company-scoped Phase 2 types remain at /fico/document-types.
 */
@Injectable()
export class FicoFiDocumentTypeService {
    constructor(private readonly prisma: PrismaService) {}

    list() {
        return this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM fi_document_types ORDER BY code ASC`,
        )
    }

    async get(id: string) {
        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM fi_document_types WHERE id = $1 LIMIT 1`,
            id,
        )
        const row = rows[0]
        if (!row) throw new NotFoundException('FI document type not found')
        return row
    }

    async create(dto: CreateFiDocumentTypeDto) {
        if (dto.numberRangeTo < dto.numberRangeFrom) {
            throw new BadRequestException(
                'Number range end must be greater than or equal to start',
            )
        }
        const code = dto.code.toUpperCase()
        const prefix = dto.prefix?.toUpperCase() ?? null
        const nextNumber = dto.nextNumber ?? dto.numberRangeFrom
        const allowsManualEntry = dto.allowsManualEntry ?? true
        const isActive = dto.isActive ?? true
        try {
            const rows = await this.prisma.$queryRawUnsafe<
                Record<string, unknown>[]
            >(
                `INSERT INTO fi_document_types
                  (id, code, name, prefix, "numberRangeFrom", "numberRangeTo",
                   "nextNumber", "allowsManualEntry", "isActive", "createdAt", "updatedAt")
                 VALUES
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                 RETURNING *`,
                newFiDocumentTypeId(),
                code,
                dto.name,
                prefix,
                dto.numberRangeFrom,
                dto.numberRangeTo,
                nextNumber,
                allowsManualEntry,
                isActive,
            )
            return rows[0]
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Document type code already exists')
            }
            // Unique violation from raw SQL
            if (
                typeof error === 'object' &&
                error &&
                'code' in error &&
                (error as { code?: string }).code === '23505'
            ) {
                throw new ConflictException('Document type code already exists')
            }
            throw error
        }
    }

    async update(id: string, dto: UpdateFiDocumentTypeDto) {
        const current = await this.get(id)
        const from =
            dto.numberRangeFrom ?? Number(current.numberRangeFrom ?? 1)
        const to = dto.numberRangeTo ?? Number(current.numberRangeTo ?? 1)
        const next = dto.nextNumber ?? Number(current.nextNumber ?? from)
        if (to < from || next < from || next > to + 1) {
            throw new BadRequestException('Invalid document number range')
        }

        const code = dto.code?.toUpperCase()
        const prefix =
            dto.prefix === undefined
                ? undefined
                : dto.prefix
                  ? dto.prefix.toUpperCase()
                  : null

        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `UPDATE fi_document_types SET
                code = COALESCE($2, code),
                name = COALESCE($3, name),
                prefix = CASE WHEN $4::boolean THEN $5 ELSE prefix END,
                "numberRangeFrom" = COALESCE($6, "numberRangeFrom"),
                "numberRangeTo" = COALESCE($7, "numberRangeTo"),
                "nextNumber" = COALESCE($8, "nextNumber"),
                "allowsManualEntry" = COALESCE($9, "allowsManualEntry"),
                "isActive" = COALESCE($10, "isActive"),
                "updatedAt" = NOW()
             WHERE id = $1
             RETURNING *`,
            id,
            code ?? null,
            dto.name ?? null,
            prefix !== undefined,
            prefix ?? null,
            dto.numberRangeFrom ?? null,
            dto.numberRangeTo ?? null,
            dto.nextNumber ?? null,
            dto.allowsManualEntry ?? null,
            dto.isActive ?? null,
        )
        return rows[0]
    }

    async deactivate(id: string) {
        await this.get(id)
        const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `UPDATE fi_document_types
             SET "isActive" = false, "updatedAt" = NOW()
             WHERE id = $1
             RETURNING *`,
            id,
        )
        return rows[0]
    }
}
