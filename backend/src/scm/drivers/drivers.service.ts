import {
    BadRequestException,
    Injectable,
} from '@nestjs/common'
import { DriverStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalDate,
    optionalString,
    parsePagination,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'

type CreateDriverBody = {
    userId?: string
    employeeCode?: string | null
    firstName?: string
    lastName?: string
    licenseNumber?: string
    licenseExpiry?: string | Date
    phone?: string
    status?: DriverStatus
}

const DRIVER_STATUSES = new Set(Object.values(DriverStatus))

const driverInclude = {
    user: {
        select: {
            id: true,
            email: true,
            userName: true,
            role: true,
        },
    },
} satisfies Prisma.DriverInclude

@Injectable()
export class DriversService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(query: ListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.DriverWhereInput = {}

        if (query.status) {
            if (!DRIVER_STATUSES.has(query.status as DriverStatus)) {
                throw new BadRequestException('Invalid driver status')
            }
            where.status = query.status as DriverStatus
        }

        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { licenseNumber: { contains: q, mode: 'insensitive' } },
                { employeeCode: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
            ]
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.driver.findMany({
                where,
                include: driverInclude,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.driver.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        return assertFound(
            await this.prisma.driver.findUnique({
                where: { id },
                include: driverInclude,
            }),
            'Driver not found',
        )
    }

    async create(body: CreateDriverBody) {
        const userId = requireString(body.userId, 'userId')
        assertFound(
            await this.prisma.user.findUnique({ where: { id: userId } }),
            'User not found',
        )

        const status = body.status ?? DriverStatus.AVAILABLE
        if (!DRIVER_STATUSES.has(status)) {
            throw new BadRequestException('Invalid driver status')
        }

        const licenseExpiry = optionalDate(body.licenseExpiry)
        if (!licenseExpiry) {
            throw new BadRequestException('licenseExpiry is required')
        }

        return this.prisma.driver.create({
            data: {
                userId,
                employeeCode: optionalString(body.employeeCode) ?? null,
                firstName: requireString(body.firstName, 'firstName'),
                lastName: requireString(body.lastName, 'lastName'),
                licenseNumber: requireString(body.licenseNumber, 'licenseNumber'),
                licenseExpiry,
                phone: requireString(body.phone, 'phone'),
                status,
            },
            include: driverInclude,
        })
    }

    async update(id: string, body: CreateDriverBody) {
        await this.findOne(id)
        const data: Prisma.DriverUpdateInput = {}

        if (body.employeeCode !== undefined) {
            data.employeeCode = optionalString(body.employeeCode) ?? null
        }
        if (body.firstName !== undefined) {
            data.firstName = requireString(body.firstName, 'firstName')
        }
        if (body.lastName !== undefined) {
            data.lastName = requireString(body.lastName, 'lastName')
        }
        if (body.licenseNumber !== undefined) {
            data.licenseNumber = requireString(
                body.licenseNumber,
                'licenseNumber',
            )
        }
        if (body.licenseExpiry !== undefined) {
            const licenseExpiry = optionalDate(body.licenseExpiry)
            if (!licenseExpiry) {
                throw new BadRequestException('licenseExpiry is required')
            }
            data.licenseExpiry = licenseExpiry
        }
        if (body.phone !== undefined) {
            data.phone = requireString(body.phone, 'phone')
        }
        if (body.status !== undefined) {
            if (!DRIVER_STATUSES.has(body.status)) {
                throw new BadRequestException('Invalid driver status')
            }
            data.status = body.status
        }

        return this.prisma.driver.update({
            where: { id },
            data,
            include: driverInclude,
        })
    }

    async remove(id: string) {
        await this.findOne(id)
        await this.prisma.driver.delete({ where: { id } })
        return { ok: true }
    }
}
