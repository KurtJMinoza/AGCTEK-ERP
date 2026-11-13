import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { UpdatePdfLayoutProfileDto } from './dto/pdf-layout-profile.dto'
import { resolveQuotationPdfLayout, type QuotationPdfLayout } from './quotation-pdf-layout'

export type PdfLayoutProfileView = {
    key: string
    name: string
    isDefault: boolean
    isActive: boolean
    /** Resolved layout (defaults filled in), exactly what the next PDF will use. */
    layout: QuotationPdfLayout
    updatedAt: Date
}

type ProfileRow = Prisma.SdPdfLayoutProfileGetPayload<object>

/**
 * Quotation PDF layout profiles (CRM › Documents › PDF templates). Layout only: quotation data,
 * prices and status stay with QuotationService. The active default profile drives every PDF.
 */
@Injectable()
export class PdfLayoutProfileService {
    constructor(private readonly prisma: PrismaService) {}

    async list(): Promise<PdfLayoutProfileView[]> {
        const rows = await this.prisma.sdPdfLayoutProfile.findMany({
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        })
        return rows.map((row) => this.view(row))
    }

    /** Merges the given layout keys over the stored ones; an empty disclaimer restores the default. */
    async update(key: string, dto: UpdatePdfLayoutProfileDto): Promise<PdfLayoutProfileView> {
        const existing = await this.prisma.sdPdfLayoutProfile.findUnique({ where: { key } })
        if (!existing) throw new NotFoundException('PDF layout profile not found')

        const data: Prisma.SdPdfLayoutProfileUpdateInput = {}
        if (dto.name !== undefined) data.name = dto.name
        if (dto.config !== undefined) {
            const stored = (existing.config ?? {}) as Record<string, unknown>
            const merged: Record<string, unknown> = { ...stored }
            for (const [field, value] of Object.entries(dto.config)) {
                if (value === undefined) continue
                if (field === 'disclaimer' && value === '') delete merged.disclaimer
                else merged[field] = value
            }
            data.config = merged as Prisma.InputJsonObject
        }
        const updated = await this.prisma.sdPdfLayoutProfile.update({ where: { id: existing.id }, data })
        return this.view(updated)
    }

    private view(row: ProfileRow): PdfLayoutProfileView {
        return {
            key: row.key,
            name: row.name,
            isDefault: row.isDefault,
            isActive: row.isActive,
            layout: resolveQuotationPdfLayout(row.config),
            updatedAt: row.updatedAt,
        }
    }
}
