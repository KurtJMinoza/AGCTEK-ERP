import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateDefectCodeDto, QualityQueryDto } from './dto/quality.dto'

const SEED_CODES = [
    { code: 'DAMAGED_PACKAGING', description: 'Damaged packaging', category: 'VISUAL', severityDefault: 'MEDIUM' },
    { code: 'WRONG_MATERIAL', description: 'Wrong material received', category: 'IDENTITY', severityDefault: 'HIGH' },
    { code: 'WRONG_BATCH', description: 'Wrong batch number', category: 'IDENTITY', severityDefault: 'HIGH' },
    { code: 'CONTAMINATION', description: 'Contamination detected', category: 'SAFETY', severityDefault: 'CRITICAL' },
    { code: 'DIMENSION_OUT_OF_TOLERANCE', description: 'Dimension out of tolerance', category: 'MEASUREMENT', severityDefault: 'MEDIUM' },
    { code: 'QUANTITY_VARIANCE', description: 'Quantity variance', category: 'QUANTITY', severityDefault: 'LOW' },
    { code: 'VISUAL_DEFECT', description: 'Visual defect', category: 'VISUAL', severityDefault: 'LOW' },
    { code: 'EXPIRED', description: 'Expired product', category: 'SAFETY', severityDefault: 'HIGH' },
    { code: 'OTHER', description: 'Other defect', category: 'OTHER', severityDefault: 'LOW' },
]

@Injectable()
export class DefectCodeService {
    constructor(private prisma: PrismaService) {}

    async findAll(query: QualityQueryDto) {
        const where: any = { active: true }
        if (query.companyId) where.companyId = query.companyId
        if (query.search) {
            where.OR = [
                { code: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ]
        }
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50
        const [data, total] = await Promise.all([
            this.prisma.mmDefectCode.findMany({
                where,
                orderBy: { code: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmDefectCode.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async create(dto: CreateDefectCodeDto) {
        const existing = await this.prisma.mmDefectCode.findFirst({
            where: { companyId: dto.companyId, code: dto.code },
        })
        if (existing) throw new BadRequestException('Defect code already exists')
        return this.prisma.mmDefectCode.create({
            data: {
                companyId: dto.companyId,
                code: dto.code.toUpperCase(),
                description: dto.description,
                category: dto.category ?? null,
                severityDefault: dto.severityDefault ?? null,
                active: dto.active ?? true,
            },
        })
    }

    async seedDefaults(companyId: string) {
        for (const seed of SEED_CODES) {
            const exists = await this.prisma.mmDefectCode.findFirst({
                where: { companyId, code: seed.code },
            })
            if (!exists) {
                await this.prisma.mmDefectCode.create({
                    data: { companyId, ...seed },
                })
            }
        }
    }

    async resolveCode(companyId: string, code: string) {
        const upper = code.toUpperCase()
        let defect = await this.prisma.mmDefectCode.findFirst({
            where: { companyId, code: upper, active: true },
        })
        if (!defect) {
            defect = await this.prisma.mmDefectCode.create({
                data: {
                    companyId,
                    code: upper,
                    description: code,
                    category: 'OTHER',
                    severityDefault: 'LOW',
                },
            })
        }
        return defect
    }

    async findOne(id: string) {
        const row = await this.prisma.mmDefectCode.findUnique({ where: { id } })
        if (!row) throw new NotFoundException('Defect code not found')
        return row
    }
}
