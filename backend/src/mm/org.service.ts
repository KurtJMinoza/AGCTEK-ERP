import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class OrgService {
    constructor(private prisma: PrismaService) {}

    findAllCompanies() {
        return this.prisma.company.findMany({
            select: { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
            take: 200,
        })
    }

    async findCompany(id: string) {
        const company = await this.prisma.company.findUnique({ where: { id } })
        if (!company) throw new NotFoundException('Company not found')
        return company
    }

    async createCompany(data: { code?: string; name?: string }) {
        const rawCode = data.code?.trim()
        const rawName = data.name?.trim()
        if (!rawCode) throw new BadRequestException('Company code is required')
        if (!rawName) throw new BadRequestException('Company name is required')
        const code = rawCode.toUpperCase()
        const exists = await this.prisma.company.findUnique({ where: { code } })
        if (exists) throw new ConflictException('Company code already exists')
        return this.prisma.company.create({
            data: { code, name: rawName },
        })
    }

    async updateCompany(id: string, data: Partial<{ code: string; name: string }>) {
        await this.findCompany(id)
        const payload: { code?: string; name?: string } = {}
        if (data.name != null) payload.name = data.name.trim()
        if (data.code != null) {
            const code = data.code.trim().toUpperCase()
            const exists = await this.prisma.company.findFirst({
                where: { code, NOT: { id } },
            })
            if (exists) throw new ConflictException('Company code already exists')
            payload.code = code
        }
        return this.prisma.company.update({ where: { id }, data: payload })
    }

    async deleteCompany(id: string) {
        await this.findCompany(id)
        const refs = await this.prisma.warehouse.count({ where: { companyId: id } })
        if (refs > 0) {
            throw new ConflictException('Company has warehouses and cannot be deleted')
        }
        const materials = await this.prisma.mmMaterial.count({ where: { companyId: id } })
        if (materials > 0) {
            throw new ConflictException('Company has materials and cannot be deleted')
        }
        return this.prisma.company.delete({ where: { id } })
    }

    findAllWarehouses(companyId?: string) {
        const where: { companyId?: string; deletedAt: null; status?: string } = {
            deletedAt: null,
            status: 'ACTIVE',
        }
        if (companyId) where.companyId = companyId
        return this.prisma.warehouse.findMany({
            where,
            select: {
                id: true,
                code: true,
                name: true,
                companyId: true,
                plantId: true,
                branchId: true,
                status: true,
                warehouseType: true,
            },
            orderBy: { name: 'asc' },
            take: 500,
        })
    }

    findAllPlants(companyId?: string, activeOnly?: boolean) {
        const where: { companyId?: string; status?: string; deletedAt: null } = {
            deletedAt: null,
        }
        if (companyId) where.companyId = companyId
        if (activeOnly) where.status = 'ACTIVE'
        return this.prisma.plant.findMany({
            where,
            select: {
                id: true,
                code: true,
                name: true,
                companyId: true,
                status: true,
                company: { select: { id: true, code: true, name: true } },
            },
            orderBy: { name: 'asc' },
            take: 500,
        })
    }

    async findPlant(id: string) {
        const plant = await this.prisma.plant.findFirst({
            where: { id, deletedAt: null },
            include: { company: { select: { id: true, code: true, name: true } } },
        })
        if (!plant) throw new NotFoundException('Plant not found')
        return plant
    }

    async createPlant(data: {
        code: string
        name: string
        companyId: string
        status?: string
    }) {
        await this.findCompany(data.companyId)
        const code = data.code.trim().toUpperCase()
        const exists = await this.prisma.plant.findFirst({
            where: { companyId: data.companyId, code, deletedAt: null },
        })
        if (exists) throw new ConflictException('Plant code already exists for this company')
        return this.prisma.plant.create({
            data: {
                code,
                name: data.name.trim(),
                companyId: data.companyId,
                status: data.status ?? 'ACTIVE',
            },
            include: { company: { select: { id: true, code: true, name: true } } },
        })
    }

    async updatePlant(
        id: string,
        data: Partial<{ code: string; name: string; companyId: string; status: string }>,
    ) {
        const plant = await this.findPlant(id)
        if (data.companyId && data.companyId !== plant.companyId) {
            await this.findCompany(data.companyId)
        }
        const companyId = data.companyId ?? plant.companyId
        const payload: {
            code?: string
            name?: string
            companyId?: string
            status?: string
        } = {}
        if (data.name != null) payload.name = data.name.trim()
        if (data.status != null) payload.status = data.status
        if (data.companyId != null) payload.companyId = data.companyId
        if (data.code != null) {
            const code = data.code.trim().toUpperCase()
            const exists = await this.prisma.plant.findFirst({
                where: { companyId, code, deletedAt: null, NOT: { id } },
            })
            if (exists) throw new ConflictException('Plant code already exists for this company')
            payload.code = code
        }
        return this.prisma.plant.update({
            where: { id },
            data: payload,
            include: { company: { select: { id: true, code: true, name: true } } },
        })
    }

    async deletePlant(id: string) {
        await this.findPlant(id)
        const refs = await this.prisma.warehouse.count({ where: { plantId: id } })
        if (refs > 0) {
            throw new ConflictException('Plant has warehouses and cannot be deleted')
        }
        return this.prisma.plant.update({
            where: { id },
            data: { deletedAt: new Date(), status: 'INACTIVE' },
        })
    }

    findAllBranches(companyId?: string, plantId?: string, activeOnly?: boolean) {
        const where: {
            companyId?: string
            plantId?: string
            status?: string
            deletedAt: null
        } = { deletedAt: null }
        if (companyId) where.companyId = companyId
        if (plantId) where.plantId = plantId
        if (activeOnly) where.status = 'ACTIVE'
        return this.prisma.branch.findMany({
            where,
            select: {
                id: true,
                code: true,
                name: true,
                companyId: true,
                plantId: true,
                status: true,
                company: { select: { id: true, code: true, name: true } },
                plant: { select: { id: true, code: true, name: true } },
            },
            orderBy: { name: 'asc' },
            take: 500,
        })
    }

    async findBranch(id: string) {
        const branch = await this.prisma.branch.findFirst({
            where: { id, deletedAt: null },
            include: {
                company: { select: { id: true, code: true, name: true } },
                plant: { select: { id: true, code: true, name: true } },
            },
        })
        if (!branch) throw new NotFoundException('Branch not found')
        return branch
    }

    async createBranch(data: {
        code: string
        name: string
        companyId: string
        plantId?: string
        status?: string
    }) {
        await this.findCompany(data.companyId)
        if (data.plantId) {
            const plant = await this.findPlant(data.plantId)
            if (plant.companyId !== data.companyId) {
                throw new ConflictException('Plant does not belong to the selected company')
            }
        }
        const code = data.code.trim().toUpperCase()
        const exists = await this.prisma.branch.findFirst({
            where: { companyId: data.companyId, code, deletedAt: null },
        })
        if (exists) throw new ConflictException('Branch code already exists for this company')
        return this.prisma.branch.create({
            data: {
                code,
                name: data.name.trim(),
                companyId: data.companyId,
                plantId: data.plantId || null,
                status: data.status ?? 'ACTIVE',
            },
            include: {
                company: { select: { id: true, code: true, name: true } },
                plant: { select: { id: true, code: true, name: true } },
            },
        })
    }

    async updateBranch(
        id: string,
        data: Partial<{
            code: string
            name: string
            companyId: string
            plantId: string | null
            status: string
        }>,
    ) {
        const branch = await this.findBranch(id)
        const companyId = data.companyId ?? branch.companyId
        if (data.companyId) await this.findCompany(data.companyId)
        const plantId = data.plantId === '' ? null : (data.plantId ?? branch.plantId)
        if (plantId) {
            const plant = await this.findPlant(plantId)
            if (plant.companyId !== companyId) {
                throw new ConflictException('Plant does not belong to the selected company')
            }
        }
        const payload: {
            code?: string
            name?: string
            companyId?: string
            plantId?: string | null
            status?: string
        } = {}
        if (data.name != null) payload.name = data.name.trim()
        if (data.status != null) payload.status = data.status
        if (data.companyId != null) payload.companyId = data.companyId
        if (data.plantId !== undefined) payload.plantId = plantId
        if (data.code != null) {
            const code = data.code.trim().toUpperCase()
            const exists = await this.prisma.branch.findFirst({
                where: { companyId, code, deletedAt: null, NOT: { id } },
            })
            if (exists) throw new ConflictException('Branch code already exists for this company')
            payload.code = code
        }
        return this.prisma.branch.update({
            where: { id },
            data: payload,
            include: {
                company: { select: { id: true, code: true, name: true } },
                plant: { select: { id: true, code: true, name: true } },
            },
        })
    }

    async deleteBranch(id: string) {
        await this.findBranch(id)
        const refs = await this.prisma.warehouse.count({ where: { branchId: id } })
        if (refs > 0) {
            throw new ConflictException('Branch has warehouses and cannot be deleted')
        }
        return this.prisma.branch.update({
            where: { id },
            data: { deletedAt: new Date(), status: 'INACTIVE' },
        })
    }

    findAllValuationClasses() {
        return this.prisma.mmValuationClass.findMany({ orderBy: { name: 'asc' } })
    }

    findAllCurrencies() {
        return this.prisma.mmCurrency.findMany({ orderBy: { code: 'asc' } })
    }
}
