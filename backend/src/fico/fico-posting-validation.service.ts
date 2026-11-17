import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FicoPostingPeriodService } from './fico-posting-period.service'
import { formatFicoPeriodKey } from './fico.constants'

export type PostingValidationLine = {
    glAccountId: string
    debitAmount?: number
    creditAmount?: number
    currency?: string
}

export type ValidatePostingInput = {
    companyId: string
    postingDate: Date | string
    source?: 'MANUAL' | 'AUTOMATIC'
    currencyCode?: string
    lines?: PostingValidationLine[]
}

@Injectable()
export class FicoPostingValidationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly periods: FicoPostingPeriodService,
    ) {}

    async validate(input: ValidatePostingInput) {
        const postingDate =
            typeof input.postingDate === 'string'
                ? new Date(input.postingDate)
                : input.postingDate
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid posting date is required.')
        }
        const source = input.source ?? 'MANUAL'
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: input.companyId },
            include: {
                chartOfAccounts: { select: { id: true, status: true, code: true } },
                company: { select: { id: true, name: true } },
            },
        })
        if (!settings) {
            throw new BadRequestException(
                'Accounting is not configured for this company. Configure and activate company accounting settings first.',
            )
        }
        if (settings.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Accounting postings are blocked because the company accounting configuration is ${settings.status}. Activate it before posting.`,
            )
        }
        if (!settings.chartOfAccountsId || !settings.chartOfAccounts) {
            throw new BadRequestException(
                'Accounting postings are blocked because no chart of accounts is assigned to the company.',
            )
        }
        if (settings.chartOfAccounts.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Accounting postings are blocked because the assigned chart of accounts is inactive.',
            )
        }

        const postingDay = new Date(
            Date.UTC(
                postingDate.getUTCFullYear(),
                postingDate.getUTCMonth(),
                postingDate.getUTCDate(),
            ),
        )
        const today = new Date()
        const todayDay = new Date(
            Date.UTC(
                today.getUTCFullYear(),
                today.getUTCMonth(),
                today.getUTCDate(),
            ),
        )
        if (!settings.backdatedPostingAllowed && postingDay < todayDay) {
            throw new BadRequestException(
                'Backdated accounting postings are not allowed for this company.',
            )
        }
        if (settings.maxBackdatedPostingDays !== null) {
            const earliest = new Date(todayDay)
            earliest.setUTCDate(
                earliest.getUTCDate() - settings.maxBackdatedPostingDays,
            )
            if (postingDay < earliest) {
                throw new BadRequestException(
                    `The posting date is more than ${settings.maxBackdatedPostingDays} day(s) before today. Backdated postings are restricted for this company.`,
                )
            }
        }

        if (!settings.allowNegativePostings) {
            const negative = (input.lines ?? []).find(
                (line) =>
                    (line.debitAmount ?? 0) < 0 ||
                    (line.creditAmount ?? 0) < 0,
            )
            if (negative) {
                throw new BadRequestException(
                    'Negative posting amounts are not allowed for this company.',
                )
            }
        }

        const period = await this.periods.assertPostingAllowed(
            input.companyId,
            postingDate,
            source,
        )

        const currency = (
            input.currencyCode ||
            input.lines?.find((line) => line.currency)?.currency ||
            settings.baseCurrency
        )
            .trim()
            .toUpperCase()
        const accounts: Array<{
            glAccountId: string
            accountCode: string
            accountName: string
            accountType: string
        }> = []
        for (const line of input.lines ?? []) {
            const account = await this.assertAccountPostable(
                input.companyId,
                line.glAccountId,
                source,
                line.currency?.toUpperCase() || currency,
                settings.chartOfAccountsId,
                postingDate,
            )
            accounts.push(account)
        }

        return {
            valid: true,
            companyId: input.companyId,
            postingDate: postingDate.toISOString().slice(0, 10),
            currency,
            settingsStatus: settings.status,
            period,
            periodKey: formatFicoPeriodKey(
                period.fiscalYear,
                period.periodNumber,
            ),
            accounts,
        }
    }

    async assertAccountPostable(
        companyId: string,
        glAccountId: string,
        source: 'MANUAL' | 'AUTOMATIC',
        currency: string,
        chartOfAccountsId?: string,
        postingDate = new Date(),
    ) {
        const account = await this.prisma.ficoGlAccount.findUnique({
            where: { id: glAccountId },
            include: {
                companyAssignments: {
                    where: { companyId },
                },
            },
        })
        if (!account) throw new NotFoundException('G/L account not found')
        if (
            chartOfAccountsId &&
            account.chartOfAccountsId !== chartOfAccountsId
        ) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} does not belong to the company chart of accounts.`,
            )
        }
        if (account.status !== 'ACTIVE') {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is inactive and cannot be posted to.`,
            )
        }
        if (!account.isPostingAccount) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is not a posting account.`,
            )
        }
        if (source === 'MANUAL' && !account.allowManualPosting) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} does not allow manual postings.`,
            )
        }
        if (source === 'AUTOMATIC' && !account.allowAutomaticPosting) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} does not allow automatic postings.`,
            )
        }
        if (
            account.currencyRestriction &&
            account.currencyRestriction !== currency
        ) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is restricted to ${account.currencyRestriction} and cannot be posted in ${currency}.`,
            )
        }
        const assignment = account.companyAssignments[0]
        if (!assignment) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is not assigned to this company.`,
            )
        }
        if (!assignment.postingEnabled) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is not enabled for posting in this company.`,
            )
        }
        if (source === 'MANUAL' && assignment.manualPostingBlocked) {
            throw new BadRequestException(
                `Manual postings to G/L account ${account.accountCode} are blocked for this company.`,
            )
        }
        const day = new Date(
            Date.UTC(
                postingDate.getUTCFullYear(),
                postingDate.getUTCMonth(),
                postingDate.getUTCDate(),
            ),
        )
        if (assignment.effectiveFrom && assignment.effectiveFrom > day) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is not effective for this company yet.`,
            )
        }
        if (assignment.effectiveTo && assignment.effectiveTo < day) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} is no longer effective for this company.`,
            )
        }
        return {
            glAccountId: account.id,
            accountCode: account.accountCode,
            accountName: account.accountName,
            accountType: account.accountType,
        }
    }
}
