import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
    deleteCompanyLogoByUrl,
    saveCompanyLogo,
} from './company-logo-storage'
import type { CreateCompanyDto, UpdateCompanyDto } from './org.dto'

@Injectable()
export class OrgService {
    constructor(private prisma: PrismaService) {}

    findAllCompanies() {
        return this.prisma.company.findMany({
            select: {
                id: true,
                code: true,
                name: true,
                logoUrl: true,
                address: true,
                tin: true,
            },
            orderBy: { name: 'asc' },
            take: 200,
        })
    }

    async findCompany(id: string) {
        const company = await this.prisma.company.findUnique({ where: { id } })
        if (!company) throw new NotFoundException('Company not found')
        return company
    }

    async createCompany(data: CreateCompanyDto, logo: Buffer | null) {
        const rawCode = data.code?.trim()
        const rawName = data.name?.trim()
        const address = data.address?.trim()
        const tin = data.tin?.trim()
        if (!rawCode) throw new BadRequestException('Company code is required')
        if (!rawName) throw new BadRequestException('Company name is required')
        if (!address) throw new BadRequestException('Company address is required')
        if (!tin) throw new BadRequestException('Company TIN is required')
        if (!logo?.length) {
            throw new BadRequestException('Company logo is required')
        }
        const code = rawCode.toUpperCase()
        const exists = await this.prisma.company.findUnique({ where: { code } })
        if (exists) throw new ConflictException('Company code already exists')
        let logoUrl: string
        try {
            logoUrl = saveCompanyLogo(logo)
        } catch (err) {
            throw new BadRequestException(
                err instanceof Error ? err.message : 'Invalid logo file',
            )
        }
        return this.prisma.company.create({
            data: { code, name: rawName, address, tin, logoUrl },
        })
    }

    async updateCompany(
        id: string,
        data: UpdateCompanyDto,
        logo: Buffer | null,
    ) {
        const existing = await this.findCompany(id)
        const payload: {
            code?: string
            name?: string
            address?: string
            tin?: string
            logoUrl?: string
        } = {}
        if (data.name != null) payload.name = data.name.trim()
        if (data.address != null) {
            const address = data.address.trim()
            if (!address) throw new BadRequestException('Company address is required')
            payload.address = address
        }
        if (data.tin != null) {
            const tin = data.tin.trim()
            if (!tin) throw new BadRequestException('Company TIN is required')
            payload.tin = tin
        }
        if (data.code != null) {
            const code = data.code.trim().toUpperCase()
            const exists = await this.prisma.company.findFirst({
                where: { code, NOT: { id } },
            })
            if (exists) throw new ConflictException('Company code already exists')
            payload.code = code
        }
        if (logo?.length) {
            try {
                payload.logoUrl = saveCompanyLogo(logo)
            } catch (err) {
                throw new BadRequestException(
                    err instanceof Error ? err.message : 'Invalid logo file',
                )
            }
        }
        const updated = await this.prisma.company.update({
            where: { id },
            data: payload,
        })
        if (payload.logoUrl && existing.logoUrl) {
            deleteCompanyLogoByUrl(existing.logoUrl)
        }
        return updated
    }

    async deleteCompany(id: string) {
        const company = await this.findCompany(id)

        const [warehouses, materials, branches, salesOrders, ficoPeriods] =
            await Promise.all([
                this.prisma.warehouse.count({ where: { companyId: id } }),
                this.prisma.mmMaterial.count({ where: { companyId: id } }),
                this.prisma.branch.count({ where: { companyId: id } }),
                this.prisma.sdSalesOrder.count({ where: { companyId: id } }),
                this.prisma.ficoFinancialPeriod.count({ where: { companyId: id } }),
            ])

        if (warehouses > 0) {
            throw new ConflictException(
                'Company has warehouses. Delete warehouses first, then delete the company.',
            )
        }
        if (materials > 0) {
            throw new ConflictException(
                'Company has materials. Remove materials first, then delete the company.',
            )
        }
        if (salesOrders > 0) {
            throw new ConflictException(
                'Company has sales orders and cannot be deleted.',
            )
        }
        if (ficoPeriods > 0) {
            throw new ConflictException(
                'Company has financial periods. Remove FICO periods first, then delete the company.',
            )
        }

        try {
            const deleted = await this.prisma.$transaction(async (tx) => {
                if (branches > 0) {
                    await tx.branch.deleteMany({ where: { companyId: id } })
                }
                await tx.plant.deleteMany({ where: { companyId: id } })
                return tx.company.delete({ where: { id } })
            })
            deleteCompanyLogoByUrl(company.logoUrl)
            return deleted
        } catch (err) {
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2003'
            ) {
                throw new ConflictException(
                    'Company is still referenced by other records (e.g. production, finance, or logistics). Remove those first, then delete the company.',
                )
            }
            throw err
        }
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
                branchId: true,
                status: true,
                warehouseType: true,
            },
            orderBy: { name: 'asc' },
            take: 500,
        })
    }

    findAllBranches(companyId?: string, activeOnly?: boolean) {
        const where: {
            companyId?: string
            status?: string
            deletedAt: null
        } = { deletedAt: null }
        if (companyId) where.companyId = companyId
        if (activeOnly) where.status = 'ACTIVE'
        return this.prisma.branch.findMany({
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

    async findBranch(id: string) {
        const branch = await this.prisma.branch.findFirst({
            where: { id, deletedAt: null },
            include: {
                company: { select: { id: true, code: true, name: true } },
            },
        })
        if (!branch) throw new NotFoundException('Branch not found')
        return branch
    }

    async createBranch(data: {
        code: string
        name: string
        companyId: string
        status?: string
    }) {
        await this.findCompany(data.companyId)
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
                plantId: null,
                status: data.status ?? 'ACTIVE',
            },
            include: {
                company: { select: { id: true, code: true, name: true } },
            },
        })
    }

    async updateBranch(
        id: string,
        data: Partial<{
            code: string
            name: string
            companyId: string
            status: string
        }>,
    ) {
        const branch = await this.findBranch(id)
        const companyId = data.companyId ?? branch.companyId
        if (data.companyId) await this.findCompany(data.companyId)
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
