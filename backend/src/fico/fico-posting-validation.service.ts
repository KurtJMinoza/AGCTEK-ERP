import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FicoPostingPeriodService } from './fico-posting-period.service'
import { formatFicoPeriodKey } from './fico.constants'
import { assertPostingCurrencyPolicy } from './fico-currency-policy'
import {
    assertDocumentTypeControl,
    assertPostingPrecision,
    assertRequiredDimensions,
    type Phase01DimensionLine,
} from './fico-phase01-policy'

export type PostingValidationLine = Phase01DimensionLine & {
    glAccountId: string
    debitAmount?: number
    creditAmount?: number
    currency?: string
    description?: string | null
}

export type ValidatePostingInput = {
    companyId: string
    postingDate: Date | string
    source?: 'MANUAL' | 'AUTOMATIC'
    currencyCode?: string
    lines?: PostingValidationLine[]
    /** User attempting a manual posting; used for restricted-period permissions. */
    actor?: { id?: string; name?: string | null; role?: string }
    documentType?: string
    sourceDocumentId?: string | null
    description?: string | null
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
                fiscalYearVariant: { select: { id: true, status: true } },
                postingPeriodVariant: { select: { id: true, status: true } },
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
        if (
            !settings.fiscalYearVariant ||
            settings.fiscalYearVariant.status !== 'ACTIVE'
        ) {
            throw new BadRequestException(
                'Accounting postings are blocked because no active fiscal calendar is assigned to the company.',
            )
        }
        if (
            !settings.postingPeriodVariant ||
            settings.postingPeriodVariant.status !== 'ACTIVE'
        ) {
            throw new BadRequestException(
                'Accounting postings are blocked because no active posting period control is assigned to the company.',
            )
        }
        assertPostingPrecision(
            (input.lines ?? []).flatMap((line) => [
                line.debitAmount ?? 0,
                line.creditAmount ?? 0,
            ]),
            settings.postingPrecision,
        )

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

        const allowRestrictedManual =
            source === 'MANUAL' &&
            Boolean(input.actor) &&
            (await this.canPostInRestrictedPeriod(input.actor?.role))
        const period = await this.periods.assertPostingAllowed(
            input.companyId,
            postingDate,
            source,
            { allowRestrictedManual },
        )

        const currency = (
            input.currencyCode ||
            input.lines?.find((line) => line.currency)?.currency ||
            settings.baseCurrency
        )
            .trim()
            .toUpperCase()

        assertPostingCurrencyPolicy({
            companyCurrency: settings.baseCurrency,
            documentCurrency: currency,
            lineCurrencies: (input.lines ?? [])
                .map((line) => line.currency)
                .filter((c): c is string => Boolean(c)),
        })

        const lines = input.lines ?? []
        const totalDebit = lines.reduce(
            (sum, line) => sum + (line.debitAmount ?? 0),
            0,
        )
        const totalCredit = lines.reduce(
            (sum, line) => sum + (line.creditAmount ?? 0),
            0,
        )
        if (Math.abs(totalDebit - totalCredit) > 0.0001) {
            throw new BadRequestException(
                'Journal entry is unbalanced: total debits must equal total credits.',
            )
        }

        const accounts: Array<{
            glAccountId: string
            accountCode: string
            accountName: string
            accountType: string
        }> = []
        for (const line of lines) {
            const account = await this.assertAccountPostable(
                input.companyId,
                line.glAccountId,
                source,
                line.currency?.toUpperCase() || currency,
                settings.chartOfAccountsId,
                postingDate,
                line,
            )
            accounts.push(account)
        }

        if (input.documentType?.trim()) {
            const documentType = input.documentType.trim()
            const row = await this.prisma.ficoDocumentType.findUnique({
                where: {
                    companyId_code: {
                        companyId: input.companyId,
                        code: documentType,
                    },
                },
            })
            // Legacy journals use JOURNAL without a configured document type.
            if (row || documentType !== 'JOURNAL') {
                assertDocumentTypeControl({
                    documentType,
                    companyLabel: settings.company?.name ?? input.companyId,
                    documentTypeRow: row,
                    accountTypes: accounts.map((account) => account.accountType),
                    lines,
                    sourceDocumentId: input.sourceDocumentId,
                    description: input.description,
                })
            }
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
        dimensions?: Phase01DimensionLine,
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
        if (dimensions) {
            assertRequiredDimensions(
                dimensions,
                account,
                `${account.accountCode} (${account.accountName})`,
            )
        }
        return {
            glAccountId: account.id,
            accountCode: account.accountCode,
            accountName: account.accountName,
            accountType: account.accountType,
        }
    }

    /** Restricted periods accept manual postings only from authorized roles. */
    private async canPostInRestrictedPeriod(role?: string) {
        if (!role) return false
        const row = await this.prisma.role.findUnique({
            where: { code: role },
            select: {
                permissions: {
                    where: {
                        canUpdate: true,
                        resource: { code: 'fico.period-reopen' },
                    },
                    select: { id: true },
                },
            },
        })
        return (row?.permissions.length ?? 0) > 0
    }
}
