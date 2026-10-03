import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { USER_ROLES } from '../auth/auth.constants'
import { SystemSettingsService } from '../system-settings/system-settings.service'
import { SETTING_KEYS } from '../system-settings/system-settings.catalog'

const MEMBERSHIP_SELECT = {
    id: true,
    companyId: true,
    isDefault: true,
    createdAt: true,
    company: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserCompanySelect

type Tx = Prisma.TransactionClient

/**
 * Default-company rules:
 * - The first company assigned to a user becomes the default.
 * - Setting a default clears the flag on the user's other memberships.
 * - Removing the default promotes the oldest remaining membership.
 * - Admin and employee users must keep at least one company while the
 *   `require_default_company_on_user` setting is on; super_admin may have none.
 */
@Injectable()
export class UserCompaniesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SystemSettingsService,
    ) {}

    listCompanyOptions() {
        return this.prisma.company.findMany({
            select: { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
        })
    }

    async listForUser(userId: string) {
        await this.findUserOrThrow(userId)
        return this.listMemberships(this.prisma, userId)
    }

    async assign(userId: string, companyId: string) {
        await this.findUserOrThrow(userId)
        await this.findCompanyOrThrow(companyId)

        return this.prisma.$transaction(async (tx) => {
            await this.lockUser(tx, userId)
            const existing = await tx.userCompany.findUnique({
                where: { userId_companyId: { userId, companyId } },
            })
            if (existing) {
                throw new ConflictException('User is already assigned to this company.')
            }

            const hasDefault = await tx.userCompany.count({
                where: { userId, isDefault: true },
            })

            await tx.userCompany.create({
                data: { userId, companyId, isDefault: hasDefault === 0 },
            })

            return this.listMemberships(tx, userId)
        })
    }

    async remove(userId: string, companyId: string) {
        const user = await this.findUserOrThrow(userId)
        const companyRequired = await this.settings.getBoolean(
            SETTING_KEYS.REQUIRE_DEFAULT_COMPANY_ON_USER,
        )

        return this.prisma.$transaction(async (tx) => {
            await this.lockUser(tx, userId)
            const membership = await tx.userCompany.findUnique({
                where: { userId_companyId: { userId, companyId } },
            })
            if (!membership) {
                throw new NotFoundException('User is not assigned to this company.')
            }

            const total = await tx.userCompany.count({ where: { userId } })
            if (total === 1 && companyRequired && user.role !== USER_ROLES.SUPER_ADMIN) {
                throw new BadRequestException(
                    'Admin and Employee users must belong to at least one company.',
                )
            }

            await tx.userCompany.delete({ where: { id: membership.id } })

            if (membership.isDefault) {
                const next = await tx.userCompany.findFirst({
                    where: { userId },
                    orderBy: { createdAt: 'asc' },
                })
                if (next) {
                    await tx.userCompany.update({
                        where: { id: next.id },
                        data: { isDefault: true },
                    })
                }
            }

            return this.listMemberships(tx, userId)
        })
    }

    async setDefault(userId: string, companyId: string) {
        await this.findUserOrThrow(userId)

        return this.prisma.$transaction(async (tx) => {
            await this.lockUser(tx, userId)
            const membership = await tx.userCompany.findUnique({
                where: { userId_companyId: { userId, companyId } },
            })
            if (!membership) {
                throw new NotFoundException('User is not assigned to this company.')
            }

            await tx.userCompany.updateMany({
                where: { userId, isDefault: true, NOT: { id: membership.id } },
                data: { isDefault: false },
            })
            if (!membership.isDefault) {
                await tx.userCompany.update({
                    where: { id: membership.id },
                    data: { isDefault: true },
                })
            }

            return this.listMemberships(tx, userId)
        })
    }

    /** Used when creating a user so the first membership is written atomically with the user. */
    async assignInitial(tx: Tx, userId: string, companyId: string) {
        await tx.userCompany.create({
            data: { userId, companyId, isDefault: true },
        })
    }

    async findCompanyOrThrow(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true },
        })
        if (!company) {
            throw new NotFoundException('Company not found.')
        }
        return company
    }

    /** Serializes membership changes per user so the single-default rule holds under concurrency. */
    private async lockUser(tx: Tx, userId: string) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    }

    private listMemberships(client: Tx | PrismaService, userId: string) {
        return client.userCompany.findMany({
            where: { userId },
            select: MEMBERSHIP_SELECT,
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        })
    }

    private async findUserOrThrow(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true },
        })
        if (!user) {
            throw new NotFoundException('User not found.')
        }
        return user
    }
}
