import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class OrgService {
    constructor(private prisma: PrismaService) {}

    findAllCompanies() {
        return this.prisma.company.findMany({ orderBy: { name: 'asc' } })
    }

    findAllWarehouses(companyId?: string) {
        const where = companyId ? { companyId } : {}
        return this.prisma.warehouse.findMany({
            where,
            include: { plant: true, branch: true },
            orderBy: { name: 'asc' },
        })
    }

    findAllPlants(companyId?: string) {
        const where: any = { status: 'ACTIVE' }
        if (companyId) where.companyId = companyId
        return this.prisma.plant.findMany({ where, orderBy: { name: 'asc' } })
    }

    findAllBranches(companyId?: string, plantId?: string) {
        const where: any = { status: 'ACTIVE' }
        if (companyId) where.companyId = companyId
        if (plantId) where.plantId = plantId
        return this.prisma.branch.findMany({
            where,
            include: { plant: true },
            orderBy: { name: 'asc' },
        })
    }

    findAllValuationClasses() {
        return this.prisma.mmValuationClass.findMany({ orderBy: { name: 'asc' } })
    }

    findAllCurrencies() {
        return this.prisma.mmCurrency.findMany({ orderBy: { code: 'asc' } })
    }
}
