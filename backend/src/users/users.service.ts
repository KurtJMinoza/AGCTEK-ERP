import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { USER_ROLES } from '../auth/auth.constants'
import { UserCompaniesService } from './user-companies.service'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'
import type {
    CreateUserDto,
    UpdateUserDto,
    UserQueryDto,
} from './dto/users.dto'

const USER_LIST_SELECT = {
    id: true,
    email: true,
    userName: true,
    firstName: true,
    lastName: true,
    jobPosition: true,
    role: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.UserSelect

const USER_LIST_WITH_COMPANY_SELECT = {
    ...USER_LIST_SELECT,
    roleRef: { select: { name: true } },
    companies: {
        where: { isDefault: true },
        select: { company: { select: { id: true, code: true, name: true } } },
        take: 1,
    },
    _count: { select: { companies: true } },
} satisfies Prisma.UserSelect

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly userCompanies: UserCompaniesService,
        private readonly settings: SystemSettingsService,
    ) {}

    private companyRequired() {
        return this.settings.getBoolean(SETTING_KEYS.REQUIRE_DEFAULT_COMPANY_ON_USER)
    }

    async list(query: UserQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 10
        const search = query.search?.trim()

        const where: Prisma.UserWhereInput = {
            ...(query.role ? { role: query.role } : {}),
            ...(query.status ? { isActive: query.status === 'active' } : {}),
            ...(search
                ? {
                      OR: [
                          { userName: { contains: search, mode: 'insensitive' } },
                          { email: { contains: search, mode: 'insensitive' } },
                          { firstName: { contains: search, mode: 'insensitive' } },
                          { lastName: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }

        const [rows, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: USER_LIST_WITH_COMPANY_SELECT,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.user.count({ where }),
        ])

        const data = rows.map(({ companies, _count, roleRef, ...user }) => ({
            ...user,
            roleName: roleRef.name,
            defaultCompany: companies[0]?.company ?? null,
            companyCount: _count.companies,
        }))

        return { data, total, page, pageSize }
    }

    async create(input: CreateUserDto) {
        await this.assertAssignableRole(input.role)
        if (
            !input.companyId &&
            input.role !== USER_ROLES.SUPER_ADMIN &&
            (await this.companyRequired())
        ) {
            throw new BadRequestException(
                'Users other than Super Admin must be assigned to a company.',
            )
        }

        await this.assertUnique(input.email, input.userName)
        if (input.companyId) {
            await this.userCompanies.findCompanyOrThrow(input.companyId)
        }

        const passwordHash = await bcrypt.hash(input.password, 10)

        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: input.email,
                    userName: input.userName,
                    firstName: input.firstName?.trim() ?? '',
                    lastName: input.lastName?.trim() ?? '',
                    jobPosition: input.jobPosition?.trim() ?? '',
                    passwordHash,
                    role: input.role,
                },
                select: USER_LIST_SELECT,
            })

            if (input.companyId) {
                await this.userCompanies.assignInitial(tx, user.id, input.companyId)
            }

            return user
        })
    }

    async update(id: string, input: UpdateUserDto, actorId: string) {
        const user = await this.findOrThrow(id)

        if (input.role && input.role !== user.role) {
            if (id === actorId) {
                throw new BadRequestException('You cannot change your own role.')
            }
            await this.assertAssignableRole(input.role)
            if (user.role === USER_ROLES.SUPER_ADMIN) {
                await this.assertNotLastActiveSuperAdmin(id)
            }
            if (input.role !== USER_ROLES.SUPER_ADMIN && (await this.companyRequired())) {
                const companyCount = await this.prisma.userCompany.count({
                    where: { userId: id },
                })
                if (companyCount === 0) {
                    throw new BadRequestException(
                        'Assign at least one company before changing this user to a role other than Super Admin.',
                    )
                }
            }
        }

        await this.assertUnique(
            input.email !== user.email ? input.email : undefined,
            input.userName !== user.userName ? input.userName : undefined,
        )

        return this.prisma.user.update({
            where: { id },
            data: {
                ...(input.email ? { email: input.email } : {}),
                ...(input.userName ? { userName: input.userName } : {}),
                ...(input.firstName !== undefined
                    ? { firstName: input.firstName.trim() }
                    : {}),
                ...(input.lastName !== undefined
                    ? { lastName: input.lastName.trim() }
                    : {}),
                ...(input.jobPosition !== undefined
                    ? { jobPosition: input.jobPosition.trim() }
                    : {}),
                ...(input.role ? { role: input.role } : {}),
            },
            select: USER_LIST_SELECT,
        })
    }

    async setStatus(id: string, isActive: boolean, actorId: string) {
        const user = await this.findOrThrow(id)

        if (!isActive) {
            if (id === actorId) {
                throw new BadRequestException('You cannot deactivate your own account.')
            }
            if (user.role === USER_ROLES.SUPER_ADMIN) {
                await this.assertNotLastActiveSuperAdmin(id)
            }
        }

        return this.prisma.user.update({
            where: { id },
            data: { isActive },
            select: USER_LIST_SELECT,
        })
    }

    private async findOrThrow(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: USER_LIST_SELECT,
        })

        if (!user) {
            throw new NotFoundException('User not found.')
        }

        return user
    }

    private async assertUnique(email?: string, userName?: string) {
        if (email) {
            const taken = await this.prisma.user.findUnique({ where: { email } })
            if (taken) {
                throw new ConflictException('An account with this email already exists.')
            }
        }

        if (userName) {
            const taken = await this.prisma.user.findUnique({ where: { userName } })
            if (taken) {
                throw new ConflictException('An account with this username already exists.')
            }
        }
    }

    private async assertAssignableRole(code: string) {
        const role = await this.prisma.role.findUnique({
            where: { code },
            select: { isActive: true },
        })
        if (!role) {
            throw new BadRequestException(`Role "${code}" does not exist.`)
        }
        if (!role.isActive) {
            throw new BadRequestException(`Role "${code}" is inactive and cannot be assigned.`)
        }
    }

    private async assertNotLastActiveSuperAdmin(excludeId: string) {
        const others = await this.prisma.user.count({
            where: {
                role: USER_ROLES.SUPER_ADMIN,
                isActive: true,
                id: { not: excludeId },
            },
        })

        if (others === 0) {
            throw new BadRequestException(
                'At least one active Super Admin is required.',
            )
        }
    }
}
