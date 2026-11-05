import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import {
    FICO_DETERMINATION_DIMENSIONS,
    FICO_DETERMINATION_SOURCE_MODULES,
    FICO_DETERMINATION_TRANSACTION_TYPE_CODES,
    ficoDeterminationTypesForModule,
    type FicoDeterminationDimension,
    type FicoDeterminationSourceModule,
} from './fico-account-determination.constants'

/**
 * Input needed to resolve accounts for one transaction. MM/SD supply the source
 * module, transaction type and whatever dimension context they actually have;
 * the resolver only ever matches on dimensions the caller provides.
 */
export type AccountResolutionRequest = {
    companyId: string
    sourceModule: FicoDeterminationSourceModule | string
    transactionType: string
    postingDate: Date | string
    currencyCode?: string | null
    transactionKeyCode?: string | null
    valuationClassId?: string | null
    materialTypeCode?: string | null
    movementType?: string | null
    customerAccountGroup?: string | null
    salesOrganization?: string | null
    distributionChannel?: string | null
}

export type ResolvedAccountLine = {
    lineNumber: number
    side: 'DEBIT' | 'CREDIT'
    glAccountId: string
    accountCode: string
    accountName: string
    accountType: string
    description: string | null
}

export type AccountResolutionResult = {
    companyId: string
    sourceModule: string
    transactionType: string
    postingDate: string
    currency: string
    rule: {
        id: string
        determinationCode: string
        name: string
        priority: number
        effectiveFrom: string | null
        effectiveTo: string | null
        matchedDimensions: FicoDeterminationDimension[]
        specificity: number
    }
    lines: ResolvedAccountLine[]
    debitLines: ResolvedAccountLine[]
    creditLines: ResolvedAccountLine[]
}

type CandidateRule = {
    id: string
    determinationCode: string
    name: string
    priority: number
    effectiveFrom: Date | null
    effectiveTo: Date | null
    createdAt: Date
    valuationClassId: string | null
    materialTypeCode: string | null
    movementType: string | null
    customerAccountGroup: string | null
    salesOrganization: string | null
    distributionChannel: string | null
    lines: Array<{
        lineNumber: number
        side: string
        glAccountId: string
        description: string | null
        glAccount: {
            accountCode: string
            accountName: string
            accountType: string
        }
    }>
}

const LINE_ACCOUNT_SELECT = {
    accountCode: true,
    accountName: true,
    accountType: true,
} as const

function normalise(value: string | null | undefined) {
    const text = value?.trim()
    return text ? text.toUpperCase() : null
}

function dayStart(value: Date) {
    return new Date(
        Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
        ),
    )
}

/**
 * The single resolution engine for centralized account determination.
 *
 * Matching contract:
 *  - company, source module, transaction type and status ACTIVE are mandatory;
 *  - the posting date must fall inside the effective window;
 *  - every dimension a rule constrains must be supplied by the caller and match
 *    (a rule with a null dimension is a wildcard);
 *  - the most specific rule (most matched dimensions) wins, then the lowest
 *    priority number, then the latest effective-from, then the newest rule;
 *  - two rules that tie on all of those are a configuration conflict and the
 *    resolver refuses to guess;
 *  - every resolved account must be postable for the company on that date.
 */
@Injectable()
export class FicoAccountResolutionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly postingValidation: FicoPostingValidationService,
    ) {}

    async resolve(
        request: AccountResolutionRequest,
    ): Promise<AccountResolutionResult> {
        const sourceModule = normalise(request.sourceModule)
        if (
            !sourceModule ||
            !(FICO_DETERMINATION_SOURCE_MODULES as readonly string[]).includes(
                sourceModule,
            )
        ) {
            throw new BadRequestException(
                `Account determination is only configured for ${FICO_DETERMINATION_SOURCE_MODULES.join(
                    ' and ',
                )} source modules.`,
            )
        }
        const transactionType = normalise(request.transactionType)
        if (
            !transactionType ||
            !(FICO_DETERMINATION_TRANSACTION_TYPE_CODES as readonly string[]).includes(
                transactionType,
            )
        ) {
            throw new BadRequestException(
                `${request.transactionType} is not a supported account determination transaction type.`,
            )
        }
        const allowedTypes = ficoDeterminationTypesForModule(sourceModule).map(
            (entry) => entry.code,
        )
        if (!allowedTypes.includes(transactionType)) {
            throw new BadRequestException(
                `${transactionType} is not an ${sourceModule} transaction type.`,
            )
        }
        if (!request.companyId) {
            throw new BadRequestException('A company is required for account determination.')
        }
        const postingDate = dayStart(
            typeof request.postingDate === 'string'
                ? new Date(request.postingDate)
                : request.postingDate,
        )
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid posting date is required.')
        }

        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: request.companyId },
            include: {
                chartOfAccounts: { select: { id: true, status: true } },
            },
        })
        if (!settings) {
            throw new BadRequestException(
                'Accounting is not configured for this company. Configure and activate company accounting settings first.',
            )
        }
        if (settings.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Account determination is blocked because the company accounting configuration is ${settings.status}.`,
            )
        }
        if (
            !settings.chartOfAccountsId ||
            !settings.chartOfAccounts ||
            settings.chartOfAccounts.status !== 'ACTIVE'
        ) {
            throw new BadRequestException(
                'Account determination is blocked because the assigned chart of accounts is missing or inactive.',
            )
        }

        const where: Prisma.FicoAccountDeterminationRuleWhereInput = {
            companyId: request.companyId,
            sourceModule,
            transactionType,
            status: 'ACTIVE',
            AND: [
                {
                    OR: [
                        { effectiveFrom: null },
                        { effectiveFrom: { lte: postingDate } },
                    ],
                },
                {
                    OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gte: postingDate } },
                    ],
                },
            ],
        }
        const key = normalise(request.transactionKeyCode)
        if (key) {
            where.AND = [
                ...(where.AND as Prisma.FicoAccountDeterminationRuleWhereInput[]),
                { OR: [{ transactionKeyCode: null }, { transactionKeyCode: key }] },
            ]
        }

        const candidates = (await this.prisma.ficoAccountDeterminationRule.findMany({
            where,
            include: {
                lines: {
                    orderBy: { lineNumber: 'asc' },
                    include: { glAccount: { select: LINE_ACCOUNT_SELECT } },
                },
            },
        })) as unknown as CandidateRule[]

        const scored = candidates
            .map((rule) => {
                const matchedDimensions = this.matchedDimensions(rule, request)
                return matchedDimensions
                    ? { rule, matchedDimensions, specificity: matchedDimensions.length }
                    : null
            })
            .filter(
                (
                    entry,
                ): entry is {
                    rule: CandidateRule
                    matchedDimensions: FicoDeterminationDimension[]
                    specificity: number
                } => entry !== null,
            )
            .sort(
                (left, right) =>
                    right.specificity - left.specificity ||
                    left.rule.priority - right.rule.priority ||
                    this.effectiveFromRank(right.rule) -
                        this.effectiveFromRank(left.rule) ||
                    right.rule.createdAt.getTime() - left.rule.createdAt.getTime(),
            )

        if (!scored.length) {
            throw new BadRequestException(
                `No approved, active and effective ${sourceModule} account determination rule matches ${transactionType} on ${postingDate.toISOString().slice(0, 10)}.`,
            )
        }

        const winner = scored[0]
        const rival = scored[1]
        if (
            rival &&
            rival.specificity === winner.specificity &&
            rival.rule.priority === winner.rule.priority &&
            this.effectiveFromRank(rival.rule) ===
                this.effectiveFromRank(winner.rule)
        ) {
            throw new ConflictException(
                `Conflicting account determination rules match ${transactionType}: ${winner.rule.determinationCode} and ${rival.rule.determinationCode}. Narrow their dimensions or change their priorities.`,
            )
        }

        const lines = winner.rule.lines
        if (!lines.length) {
            throw new BadRequestException(
                `Account determination rule ${winner.rule.determinationCode} has no debit or credit lines configured.`,
            )
        }
        const debitLines = lines.filter((line) => line.side === 'DEBIT')
        const creditLines = lines.filter((line) => line.side === 'CREDIT')
        if (!debitLines.length || !creditLines.length) {
            throw new BadRequestException(
                `Account determination rule ${winner.rule.determinationCode} must contain at least one debit and one credit line.`,
            )
        }

        const currency = (
            request.currencyCode?.trim() ||
            settings.baseCurrency ||
            'PHP'
        ).toUpperCase()

        const resolved: ResolvedAccountLine[] = []
        for (const line of lines) {
            const account = await this.postingValidation.assertAccountPostable(
                request.companyId,
                line.glAccountId,
                'AUTOMATIC',
                currency,
                settings.chartOfAccountsId,
                postingDate,
            )
            resolved.push({
                lineNumber: line.lineNumber,
                side: line.side === 'DEBIT' ? 'DEBIT' : 'CREDIT',
                glAccountId: account.glAccountId,
                accountCode: account.accountCode,
                accountName: account.accountName,
                accountType: account.accountType,
                description: line.description,
            })
        }

        return {
            companyId: request.companyId,
            sourceModule,
            transactionType,
            postingDate: postingDate.toISOString().slice(0, 10),
            currency,
            rule: {
                id: winner.rule.id,
                determinationCode: winner.rule.determinationCode,
                name: winner.rule.name,
                priority: winner.rule.priority,
                effectiveFrom: winner.rule.effectiveFrom
                    ? winner.rule.effectiveFrom.toISOString().slice(0, 10)
                    : null,
                effectiveTo: winner.rule.effectiveTo
                    ? winner.rule.effectiveTo.toISOString().slice(0, 10)
                    : null,
                matchedDimensions: winner.matchedDimensions,
                specificity: winner.specificity,
            },
            lines: resolved,
            debitLines: resolved.filter((line) => line.side === 'DEBIT'),
            creditLines: resolved.filter((line) => line.side === 'CREDIT'),
        }
    }

    /**
     * Returns the dimensions this rule actually constrained and matched, or
     * null when the rule cannot apply to the request.
     */
    private matchedDimensions(
        rule: CandidateRule,
        request: AccountResolutionRequest,
    ): FicoDeterminationDimension[] | null {
        const dimensions = new Set<FicoDeterminationDimension>()

        for (const dimension of FICO_DETERMINATION_DIMENSIONS) {
            const configured = rule[dimension]
            if (configured === null || configured === undefined) continue
            const supplied = request[dimension]
            if (!supplied) return null
            const equal =
                dimension === 'valuationClassId'
                    ? configured === supplied
                    : normalise(configured) === normalise(supplied)
            if (!equal) return null
            dimensions.add(dimension)
        }

        return [...dimensions]
    }

    private effectiveFromRank(rule: CandidateRule) {
        return rule.effectiveFrom ? rule.effectiveFrom.getTime() : 0
    }
}
