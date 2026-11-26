import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import {
    FicoTreasuryAccountQueryDto,
    UpsertFicoTreasuryAccountDto,
} from './dto/fico-treasury.dto'
import { FicoCompanyAccessService } from './fico-company-access.service'

type Actor = AuthRequestUser | undefined

@Injectable()
export class FicoTreasuryAccountService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async listAccounts(query: FicoTreasuryAccountQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        return this.prisma.ficoTreasuryAccount.findMany({
            where: {
                companyId: query.companyId,
                ...(query.accountKind ? { accountKind: query.accountKind } : {}),
                ...(query.branchId ? { branchId: query.branchId } : {}),
                ...(query.paymentMethodCode
                    ? {
                          paymentMethodCode: query.paymentMethodCode.trim().toUpperCase(),
                      }
                    : {}),
            },
            include: {
                glAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                branch: { select: { id: true, code: true, name: true } },
            },
            orderBy: [{ accountKind: 'asc' }, { accountCode: 'asc' }],
        })
    }

    async upsertAccount(
        accountId: string | null,
        dto: UpsertFicoTreasuryAccountDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const currencyCode = (dto.currencyCode ?? 'PHP').trim().toUpperCase()
        const gl = await this.prisma.ficoGlAccount.findUnique({
            where: { id: dto.glAccountId },
            select: { id: true, status: true, isPostingAccount: true },
        })
        if (!gl?.isPostingAccount || gl.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Treasury account must link to an active posting G/L account.',
            )
        }

        const data = {
            companyId: dto.companyId,
            accountCode: dto.accountCode.trim(),
            accountName: dto.accountName.trim(),
            accountKind: dto.accountKind,
            glAccountId: dto.glAccountId,
            currencyCode,
            branchId: dto.branchId ?? null,
            paymentMethodCode: dto.paymentMethodCode?.trim().toUpperCase() ?? null,
            providerCode: dto.providerCode?.trim().toUpperCase() ?? null,
            bankName: dto.bankName?.trim() ?? null,
            accountNumberMask: dto.accountNumberMask?.trim() ?? null,
            status: dto.status ?? 'ACTIVE',
            postingBlocked: dto.postingBlocked === true,
            updatedBy: user?.id ?? null,
        }

        if (accountId) {
            const existing = await this.prisma.ficoTreasuryAccount.findFirst({
                where: { id: accountId, companyId: dto.companyId },
            })
            if (!existing) {
                throw new NotFoundException('Treasury account not found.')
            }
            return this.prisma.ficoTreasuryAccount.update({
                where: { id: accountId },
                data,
                include: {
                    glAccount: {
                        select: { id: true, accountCode: true, accountName: true },
                    },
                },
            })
        }

        return this.prisma.ficoTreasuryAccount.create({
            data: {
                ...data,
                createdBy: user?.id ?? null,
            },
            include: {
                glAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
            },
        })
    }
}