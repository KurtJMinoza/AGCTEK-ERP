import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { USER_ROLES } from '../auth/auth.constants'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Company scope for every FICO company-owned resource.
 *
 * `super_admin` bypasses the membership check. Every other role must have an
 * explicit `user_companies` row; the server never trusts a company id supplied
 * by the browser.
 */
@Injectable()
export class FicoCompanyAccessService {
    constructor(private readonly prisma: PrismaService) {}

    async assertAccess(
        user: AuthRequestUser | undefined,
        companyId: string,
    ): Promise<void> {
        if (!user?.id) {
            throw new ForbiddenException('Authenticated user is required')
        }
        if (!companyId) {
            throw new ForbiddenException('A company is required for this action')
        }
        if (user.role === USER_ROLES.SUPER_ADMIN) return

        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true },
        })
        if (!company) throw new NotFoundException('Company not found')

        const membership = await this.prisma.userCompany.findUnique({
            where: {
                userId_companyId: { userId: user.id, companyId },
            },
            select: { id: true },
        })
        if (!membership) {
            throw new ForbiddenException(
                'You do not have access to this company.',
            )
        }
    }

    async accessibleCompanyIds(
        user: AuthRequestUser | undefined,
    ): Promise<string[] | null> {
        if (!user?.id) return []
        if (user.role === USER_ROLES.SUPER_ADMIN) return null
        const rows = await this.prisma.userCompany.findMany({
            where: { userId: user.id },
            select: { companyId: true },
        })
        return rows.map((row) => row.companyId)
    }

    async listAccessibleCompanies(user: AuthRequestUser | undefined) {
        const ids = await this.accessibleCompanyIds(user)
        return this.prisma.company.findMany({
            where: ids === null ? {} : { id: { in: ids } },
            orderBy: { name: 'asc' },
            select: { id: true, code: true, name: true, tin: true },
        })
    }
}
