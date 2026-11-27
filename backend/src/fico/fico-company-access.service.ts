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
 * Companies are the same org master MM uses (`Company` / Organization).
 * `super_admin` and `admin` see and configure all org companies (same surface as
 * MM Organization → Companies). Every other role needs an explicit
 * `user_companies` row; the server never trusts a company id from the browser.
 */
@Injectable()
export class FicoCompanyAccessService {
    constructor(private readonly prisma: PrismaService) {}

    /** Org-wide FICO configuration access (matches MM company master visibility). */
    private hasOrgWideCompanyAccess(user: AuthRequestUser): boolean {
        return (
            user.role === USER_ROLES.SUPER_ADMIN ||
            user.role === USER_ROLES.ADMIN
        )
    }

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
        if (this.hasOrgWideCompanyAccess(user)) return

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
        if (this.hasOrgWideCompanyAccess(user)) return null
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
            select: {
                id: true,
                code: true,
                name: true,
                tin: true,
                // Same logo master as MM Organization → Companies.
                logoUrl: true,
            },
        })
    }
}
