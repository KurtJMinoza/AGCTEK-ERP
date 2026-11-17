import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_AUDIT_ACTIONS,
    FICO_MAX_SPECIAL_PERIODS,
    FICO_NORMAL_PERIOD_COUNTS,
    FICO_PHILIPPINES_DEFAULTS,
    FICO_YEAR_ASSIGNMENTS,
    type FicoYearAssignment,
    ficoFiscalPeriodType,
} from './fico.constants'

export type FiscalVariantInput = {
    code: string
    name: string
    description?: string
    startMonth: number
    startDay: number
    normalPeriodCount?: number
    specialPeriodCount?: number
    /** Ignored: derived from the start date (January 1 = calendar year). */
    calendarYearBased?: boolean
    yearAssignment?: string
}

export type FiscalYearPreviewInput = {
    fiscalYear: number
    fiscalYearVariantId?: string
    startMonth?: number
    startDay?: number
    normalPeriodCount?: number
    specialPeriodCount?: number
    yearAssignment?: string
}

export type FiscalVariantUpdate = Partial<Omit<FiscalVariantInput, 'code'>> & {
    status?: string
}

export type PostingVariantInput = {
    code: string
    name: string
    description?: string
    allowSpecialPeriods?: boolean
    closeChecklist?: Record<string, unknown> | null
}

export type PostingVariantUpdate = Partial<Omit<PostingVariantInput, 'code'>> & {
    status?: string
}

export type GenerateFiscalYearInput = {
    companyId: string
    fiscalYearVariantId: string
    postingPeriodVariantId?: string
    fiscalYear: number
    specialPeriodCount?: number
}

type GeneratedPeriod = {
    fiscalYear: number
    periodNumber: number
    name: string
    periodType: 'NORMAL' | 'SPECIAL'
    startDate: Date
    endDate: Date
    isYearEndAdjustment: boolean
}

function dateOnly(year: number, month: number, day: number) {
    return new Date(Date.UTC(year, month - 1, day))
}

function daysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays(date: Date, days: number) {
    const next = new Date(date)
    next.setUTCDate(next.getUTCDate() + days)
    return next
}

/** Adds months keeping the original day-of-month, clamped to the target month. */
function addMonthsClamped(date: Date, months: number, preferredDay: number) {
    const target = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
    )
    const year = target.getUTCFullYear()
    const month = target.getUTCMonth() + 1
    return dateOnly(year, month, Math.min(preferredDay, daysInMonth(year, month)))
}

function sameDay(a: Date, b: Date) {
    return (
        a.getUTCFullYear() === b.getUTCFullYear() &&
        a.getUTCMonth() === b.getUTCMonth() &&
        a.getUTCDate() === b.getUTCDate()
    )
}

function normalizeCode(value: string) {
    return value.trim().toUpperCase()
}

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

function isCalendarYear(startMonth: number, startDay: number) {
    return startMonth === 1 && startDay === 1
}

/** The fiscal year ends the day before the next one starts (non-leap reference year). */
export function fiscalYearEndDay(startMonth: number, startDay: number) {
    const end = addDays(dateOnly(2026, startMonth, startDay), -1)
    return { endMonth: end.getUTCMonth() + 1, endDay: end.getUTCDate() }
}

/** Calendar year in which fiscal year `fiscalYear` begins. */
export function fiscalYearStartYear(
    fiscalYear: number,
    startMonth: number,
    startDay: number,
    yearAssignment: string,
) {
    return yearAssignment === 'YEAR_END' && !isCalendarYear(startMonth, startDay)
        ? fiscalYear - 1
        : fiscalYear
}

function normalizeYearAssignment(value: string | undefined): FicoYearAssignment {
    const next = value ?? 'YEAR_START'
    if (!(FICO_YEAR_ASSIGNMENTS as readonly string[]).includes(next)) {
        throw new BadRequestException(
            `Year assignment must be one of ${FICO_YEAR_ASSIGNMENTS.join(', ')}.`,
        )
    }
    return next as FicoYearAssignment
}

function assertPeriodConfig(normalPeriodCount: number, specialPeriodCount: number) {
    if (!(FICO_NORMAL_PERIOD_COUNTS as readonly number[]).includes(normalPeriodCount)) {
        throw new BadRequestException(
            `Regular periods must be ${FICO_NORMAL_PERIOD_COUNTS.join(', ')} so that every period covers whole months.`,
        )
    }
    if (
        !Number.isInteger(specialPeriodCount) ||
        specialPeriodCount < 0 ||
        specialPeriodCount > FICO_MAX_SPECIAL_PERIODS
    ) {
        throw new BadRequestException(
            `Special periods must be between 0 and ${FICO_MAX_SPECIAL_PERIODS}.`,
        )
    }
}

type FiscalVariantShape = {
    startMonth: number
    startDay: number
    normalPeriodCount: number
    yearAssignment: string
}

function withDerivedFields<T extends FiscalVariantShape>(variant: T) {
    return {
        ...variant,
        ...fiscalYearEndDay(variant.startMonth, variant.startDay),
        periodType: ficoFiscalPeriodType(variant.normalPeriodCount),
    }
}

@Injectable()
export class FicoFiscalCalendarService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
    ) {}

    async listFiscalVariants() {
        const variants = await this.prisma.ficoFiscalYearVariant.findMany({
            orderBy: [{ status: 'asc' }, { code: 'asc' }],
            include: { _count: { select: { periods: true, settings: true } } },
        })
        return variants.map(withDerivedFields)
    }

    async listPostingVariants() {
        return this.prisma.ficoPostingPeriodVariant.findMany({
            orderBy: [{ status: 'asc' }, { code: 'asc' }],
            include: { _count: { select: { settings: true } } },
        })
    }

    async createFiscalVariant(input: FiscalVariantInput, user: AuthRequestUser) {
        const code = normalizeCode(input.code)
        this.assertStartDate(input.startMonth, input.startDay)
        const normalPeriodCount =
            input.normalPeriodCount ?? FICO_PHILIPPINES_DEFAULTS.normalPeriodCount
        const specialPeriodCount =
            input.specialPeriodCount ?? FICO_PHILIPPINES_DEFAULTS.specialPeriodCount
        assertPeriodConfig(normalPeriodCount, specialPeriodCount)
        const yearAssignment = normalizeYearAssignment(input.yearAssignment)
        const duplicate = await this.prisma.ficoFiscalYearVariant.findUnique({
            where: { code },
            select: { id: true },
        })
        if (duplicate) {
            throw new ConflictException('A fiscal year variant with this code already exists.')
        }
        const created = await this.prisma.ficoFiscalYearVariant.create({
            data: {
                code,
                name: input.name.trim(),
                description: input.description?.trim() ?? '',
                startMonth: input.startMonth,
                startDay: input.startDay,
                normalPeriodCount,
                specialPeriodCount,
                calendarYearBased: isCalendarYear(input.startMonth, input.startDay),
                yearAssignment,
                status: 'ACTIVE',
                createdBy: user.id,
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.FISCAL_VARIANT_CREATE,
            entityType: 'FicoFiscalYearVariant',
            entityId: created.id,
            newValues: created as unknown as Record<string, unknown>,
        })
        return withDerivedFields(created)
    }

    async duplicateFiscalVariant(
        id: string,
        input: { code: string; name: string; description?: string },
        user: AuthRequestUser,
    ) {
        const source = await this.prisma.ficoFiscalYearVariant.findUnique({
            where: { id },
        })
        if (!source) throw new NotFoundException('Fiscal year variant not found')
        const created = await this.createFiscalVariant(
            {
                code: input.code,
                name: input.name,
                description:
                    input.description ??
                    (source.description ? `${source.description} (copy)` : 'Copy'),
                startMonth: source.startMonth,
                startDay: source.startDay,
                normalPeriodCount: source.normalPeriodCount,
                specialPeriodCount: source.specialPeriodCount,
                yearAssignment: source.yearAssignment,
            },
            user,
        )
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.FISCAL_VARIANT_DUPLICATE,
            entityType: 'FicoFiscalYearVariant',
            entityId: created.id,
            previousValues: { sourceVariantId: id, sourceCode: source.code },
            newValues: created as unknown as Record<string, unknown>,
        })
        return created
    }

    /** Read-only calendar preview; nothing is persisted. */
    async previewFiscalYear(input: FiscalYearPreviewInput) {
        const variant = input.fiscalYearVariantId
            ? await this.prisma.ficoFiscalYearVariant.findUnique({
                  where: { id: input.fiscalYearVariantId },
              })
            : null
        if (input.fiscalYearVariantId && !variant) {
            throw new NotFoundException('Fiscal year variant not found')
        }
        const startMonth = input.startMonth ?? variant?.startMonth
        const startDay = input.startDay ?? variant?.startDay
        if (startMonth === undefined || startDay === undefined) {
            throw new BadRequestException(
                'Choose a fiscal year variant or provide a start month and day.',
            )
        }
        const normalPeriodCount =
            input.normalPeriodCount ??
            variant?.normalPeriodCount ??
            FICO_PHILIPPINES_DEFAULTS.normalPeriodCount
        const specialPeriodCount =
            input.specialPeriodCount ?? variant?.specialPeriodCount ?? 0
        const yearAssignment = normalizeYearAssignment(
            input.yearAssignment ?? variant?.yearAssignment,
        )
        const periods = this.buildPeriods(
            input.fiscalYear,
            startMonth,
            startDay,
            normalPeriodCount,
            specialPeriodCount,
            yearAssignment,
        )
        const regular = periods.filter((period) => period.periodType === 'NORMAL')
        return {
            fiscalYear: input.fiscalYear,
            fiscalYearVariantId: variant?.id ?? null,
            yearAssignment,
            periodType: ficoFiscalPeriodType(normalPeriodCount),
            normalPeriodCount,
            specialPeriodCount,
            startDate: regular[0].startDate,
            endDate: regular[regular.length - 1].endDate,
            periods,
        }
    }

    async updateFiscalVariant(
        id: string,
        input: FiscalVariantUpdate,
        user: AuthRequestUser,
    ) {
        const current = await this.prisma.ficoFiscalYearVariant.findUnique({
            where: { id },
        })
        if (!current) throw new NotFoundException('Fiscal year variant not found')
        const startMonth = input.startMonth ?? current.startMonth
        const startDay = input.startDay ?? current.startDay
        this.assertStartDate(startMonth, startDay)
        const normalPeriodCount = input.normalPeriodCount ?? current.normalPeriodCount
        const specialPeriodCount =
            input.specialPeriodCount ?? current.specialPeriodCount
        assertPeriodConfig(normalPeriodCount, specialPeriodCount)
        const yearAssignment = normalizeYearAssignment(
            input.yearAssignment ?? current.yearAssignment,
        )
        const structural =
            startMonth !== current.startMonth ||
            startDay !== current.startDay ||
            normalPeriodCount !== current.normalPeriodCount ||
            specialPeriodCount !== current.specialPeriodCount ||
            yearAssignment !== current.yearAssignment
        if (structural) {
            const used = await this.prisma.ficoFinancialPeriod.count({
                where: { fiscalYearVariantId: id },
            })
            if (used > 0) {
                throw new BadRequestException(
                    'The fiscal calendar structure cannot change after periods have been generated.',
                )
            }
        }
        if (input.status === 'INACTIVE' && current.status === 'ACTIVE') {
            await this.assertFiscalVariantCanDeactivate(id)
        }
        const updated = await this.prisma.ficoFiscalYearVariant.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined
                    ? { description: input.description.trim() }
                    : {}),
                ...(input.startMonth !== undefined
                    ? { startMonth: input.startMonth }
                    : {}),
                ...(input.startDay !== undefined
                    ? { startDay: input.startDay }
                    : {}),
                ...(input.normalPeriodCount !== undefined
                    ? { normalPeriodCount: input.normalPeriodCount }
                    : {}),
                ...(input.specialPeriodCount !== undefined
                    ? { specialPeriodCount: input.specialPeriodCount }
                    : {}),
                calendarYearBased: isCalendarYear(startMonth, startDay),
                yearAssignment,
                ...(input.status !== undefined ? { status: input.status } : {}),
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.FISCAL_VARIANT_UPDATE,
            entityType: 'FicoFiscalYearVariant',
            entityId: id,
            previousValues: current as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
        })
        return withDerivedFields(updated)
    }

    async createPostingVariant(
        input: PostingVariantInput,
        user: AuthRequestUser,
    ) {
        const code = normalizeCode(input.code)
        const duplicate = await this.prisma.ficoPostingPeriodVariant.findUnique({
            where: { code },
            select: { id: true },
        })
        if (duplicate) {
            throw new ConflictException('A posting period variant with this code already exists.')
        }
        const created = await this.prisma.ficoPostingPeriodVariant.create({
            data: {
                code,
                name: input.name.trim(),
                description: input.description?.trim() ?? '',
                allowSpecialPeriods: input.allowSpecialPeriods ?? true,
                closeChecklist: (input.closeChecklist ?? null) as never,
                status: 'ACTIVE',
                createdBy: user.id,
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.POSTING_VARIANT_CREATE,
            entityType: 'FicoPostingPeriodVariant',
            entityId: created.id,
            newValues: created as unknown as Record<string, unknown>,
        })
        return created
    }

    async updatePostingVariant(
        id: string,
        input: PostingVariantUpdate,
        user: AuthRequestUser,
    ) {
        const current = await this.prisma.ficoPostingPeriodVariant.findUnique({
            where: { id },
        })
        if (!current) throw new NotFoundException('Posting period variant not found')
        if (input.status === 'INACTIVE' && current.status === 'ACTIVE') {
            const active = await this.prisma.ficoCompanyAccountingSettings.count({
                where: { postingPeriodVariantId: id, status: 'ACTIVE' },
            })
            if (active > 0) {
                throw new BadRequestException(
                    'The variant is used by an active company configuration and cannot be deactivated.',
                )
            }
        }
        const updated = await this.prisma.ficoPostingPeriodVariant.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined
                    ? { description: input.description.trim() }
                    : {}),
                ...(input.allowSpecialPeriods !== undefined
                    ? { allowSpecialPeriods: input.allowSpecialPeriods }
                    : {}),
                ...(input.closeChecklist !== undefined
                    ? { closeChecklist: input.closeChecklist as never }
                    : {}),
                ...(input.status !== undefined ? { status: input.status } : {}),
                updatedBy: user.id,
            },
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_AUDIT_ACTIONS.POSTING_VARIANT_UPDATE,
            entityType: 'FicoPostingPeriodVariant',
            entityId: id,
            previousValues: current as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
        })
        return updated
    }

    async listFiscalYears(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const periods = await this.prisma.ficoFinancialPeriod.findMany({
            where: { companyId },
            orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'asc' }],
        })
        const grouped = new Map<
            number,
            {
                fiscalYear: number
                periodCount: number
                normalCount: number
                specialCount: number
                statuses: Record<string, number>
                firstStartDate: Date
                lastEndDate: Date
                periods: typeof periods
            }
        >()
        for (const period of periods) {
            const row = grouped.get(period.fiscalYear) ?? {
                fiscalYear: period.fiscalYear,
                periodCount: 0,
                normalCount: 0,
                specialCount: 0,
                statuses: {},
                firstStartDate: period.startDate,
                lastEndDate: period.endDate,
                periods: [],
            }
            row.periodCount += 1
            row.normalCount += period.periodType === 'NORMAL' ? 1 : 0
            row.specialCount += period.periodType === 'SPECIAL' ? 1 : 0
            row.statuses[period.status] = (row.statuses[period.status] ?? 0) + 1
            if (period.startDate < row.firstStartDate) row.firstStartDate = period.startDate
            if (period.endDate > row.lastEndDate) row.lastEndDate = period.endDate
            row.periods.push(period)
            grouped.set(period.fiscalYear, row)
        }
        return [...grouped.values()]
    }

    async generateFiscalYear(
        input: GenerateFiscalYearInput,
        user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, input.companyId)
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: input.companyId },
            select: {
                fiscalYearVariantId: true,
                postingPeriodVariantId: true,
            },
        })
        if (!settings?.fiscalYearVariantId || !settings.postingPeriodVariantId) {
            throw new BadRequestException(
                'Assign fiscal year and posting period variants in company accounting settings before generating a fiscal year.',
            )
        }
        if (
            settings.fiscalYearVariantId !== input.fiscalYearVariantId ||
            settings.postingPeriodVariantId !== input.postingPeriodVariantId
        ) {
            throw new BadRequestException(
                'Fiscal year generation must use the fiscal and posting period variants assigned to the company.',
            )
        }
        const variant = await this.prisma.ficoFiscalYearVariant.findUnique({
            where: { id: input.fiscalYearVariantId },
        })
        if (!variant) throw new NotFoundException('Fiscal year variant not found')
        if (variant.status !== 'ACTIVE') {
            throw new BadRequestException('The fiscal year variant is inactive.')
        }
        if (input.postingPeriodVariantId) {
            const postingVariant =
                await this.prisma.ficoPostingPeriodVariant.findUnique({
                    where: { id: input.postingPeriodVariantId },
                })
            if (!postingVariant) {
                throw new NotFoundException('Posting period variant not found')
            }
            if (postingVariant.status !== 'ACTIVE') {
                throw new BadRequestException('The posting period variant is inactive.')
            }
            if (
                !postingVariant.allowSpecialPeriods &&
                (input.specialPeriodCount ?? variant.specialPeriodCount) > 0
            ) {
                throw new BadRequestException(
                    'The selected posting period variant does not allow special periods.',
                )
            }
        }
        const specialCount = Math.min(
            4,
            Math.max(
                0,
                input.specialPeriodCount ?? variant.specialPeriodCount,
            ),
        )
        const generated = this.buildPeriods(
            input.fiscalYear,
            variant.startMonth,
            variant.startDay,
            variant.normalPeriodCount,
            specialCount,
            variant.yearAssignment,
        )

        const result = await this.prisma.$transaction(async (tx) => {
            // Serialize all calendar generation for a company. This protects
            // both duplicate requests and overlapping non-calendar years.
            await tx.$executeRaw`
                SELECT pg_advisory_xact_lock(hashtext(${input.companyId}))
            `
            const existing = await tx.ficoFinancialPeriod.findMany({
                where: {
                    companyId: input.companyId,
                    fiscalYear: input.fiscalYear,
                },
                orderBy: { periodNumber: 'asc' },
            })
            if (existing.length > 0) {
                const matches =
                    existing.length === generated.length &&
                    generated.every((period, index) => {
                        const row = existing[index]
                        return (
                            row.periodNumber === period.periodNumber &&
                            row.periodType === period.periodType &&
                            sameDay(row.startDate, period.startDate) &&
                            sameDay(row.endDate, period.endDate)
                        )
                    })
                if (!matches) {
                    throw new ConflictException(
                        'The fiscal year already exists with a different calendar. Review the generated periods before replacing them.',
                    )
                }
                return { created: false, existing: true, periods: existing }
            }

            const overlap = await tx.ficoFinancialPeriod.findFirst({
                where: {
                    companyId: input.companyId,
                    startDate: { lte: generated[generated.length - 1].endDate },
                    endDate: { gte: generated[0].startDate },
                },
                select: { fiscalYear: true, periodNumber: true },
            })
            if (overlap) {
                throw new ConflictException(
                    `The generated calendar overlaps fiscal year ${overlap.fiscalYear} period ${overlap.periodNumber}.`,
                )
            }
            await tx.ficoFinancialPeriod.createMany({
                data: generated.map((period) => ({
                    companyId: input.companyId,
                    fiscalYear: input.fiscalYear,
                    periodNumber: period.periodNumber,
                    name: period.name,
                    periodType: period.periodType,
                    startDate: period.startDate,
                    endDate: period.endDate,
                    status: 'FUTURE',
                    fiscalYearVariantId: input.fiscalYearVariantId,
                    isYearEndAdjustment: period.isYearEndAdjustment,
                    createdBy: user.id,
                    updatedBy: user.id,
                })),
            })
            const periods = await tx.ficoFinancialPeriod.findMany({
                where: {
                    companyId: input.companyId,
                    fiscalYear: input.fiscalYear,
                },
                orderBy: { periodNumber: 'asc' },
            })
            return { created: true, existing: false, periods }
        })

        if (result.created) {
            await this.audit.log({
                companyId: input.companyId,
                actorId: user.id,
                action: FICO_AUDIT_ACTIONS.FISCAL_YEAR_GENERATE,
                entityType: 'FicoFinancialPeriod',
                entityId: `${input.companyId}:${input.fiscalYear}`,
                newValues: {
                    fiscalYear: input.fiscalYear,
                    fiscalYearVariantId: input.fiscalYearVariantId,
                    postingPeriodVariantId: input.postingPeriodVariantId ?? null,
                    periodCount: result.periods.length,
                },
            })
        }
        return {
            companyId: input.companyId,
            fiscalYear: input.fiscalYear,
            ...result,
        }
    }

    private buildPeriods(
        fiscalYear: number,
        startMonth: number,
        startDay: number,
        normalPeriodCount: number,
        specialPeriodCount: number,
        yearAssignment: string = 'YEAR_START',
    ): GeneratedPeriod[] {
        this.assertStartDate(startMonth, startDay)
        assertPeriodConfig(normalPeriodCount, specialPeriodCount)
        const startYear = fiscalYearStartYear(
            fiscalYear,
            startMonth,
            startDay,
            yearAssignment,
        )
        const start = dateOnly(
            startYear,
            startMonth,
            Math.min(startDay, daysInMonth(startYear, startMonth)),
        )
        const nextStart = addMonthsClamped(
            dateOnly(
                startYear + 1,
                startMonth,
                Math.min(startDay, daysInMonth(startYear + 1, startMonth)),
            ),
            0,
            startDay,
        )
        const monthsPerPeriod = 12 / normalPeriodCount
        const monthNamed = monthsPerPeriod === 1 && startDay === 1
        const periods: GeneratedPeriod[] = []
        for (let index = 1; index <= normalPeriodCount; index += 1) {
            const periodStart = addMonthsClamped(
                start,
                (index - 1) * monthsPerPeriod,
                startDay,
            )
            const boundary =
                index === normalPeriodCount
                    ? nextStart
                    : addMonthsClamped(start, index * monthsPerPeriod, startDay)
            const periodEnd = addDays(boundary, -1)
            if (periodEnd < periodStart) {
                throw new BadRequestException(
                    'The fiscal year variant produces an invalid period range.',
                )
            }
            periods.push({
                fiscalYear,
                periodNumber: index,
                name: monthNamed
                    ? MONTH_NAMES[periodStart.getUTCMonth()]
                    : `Period ${String(index).padStart(2, '0')}`,
                periodType: 'NORMAL',
                startDate: periodStart,
                endDate: periodEnd,
                isYearEndAdjustment: false,
            })
        }
        if (specialPeriodCount > 0) {
            const last = periods[periods.length - 1]
            for (let index = 1; index <= specialPeriodCount; index += 1) {
                periods.push({
                    fiscalYear,
                    periodNumber: normalPeriodCount + index,
                    name: `Special Period ${String(index).padStart(2, '0')}`,
                    periodType: 'SPECIAL',
                    startDate: last.startDate,
                    endDate: last.endDate,
                    isYearEndAdjustment: true,
                })
            }
        }
        return periods
    }

    private assertStartDate(month: number, day: number) {
        if (month < 1 || month > 12) {
            throw new BadRequestException('Fiscal year start month must be between 1 and 12.')
        }
        if (day < 1 || day > 31) {
            throw new BadRequestException('Fiscal year start day must be between 1 and 31.')
        }
        if (day > daysInMonth(2024, month)) {
            throw new BadRequestException(
                'The fiscal year start day is not valid for the selected month.',
            )
        }
    }

    private async assertFiscalVariantCanDeactivate(id: string) {
        const active = await this.prisma.ficoCompanyAccountingSettings.count({
            where: { fiscalYearVariantId: id, status: 'ACTIVE' },
        })
        if (active > 0) {
            throw new BadRequestException(
                'The variant is used by an active company configuration and cannot be deactivated.',
            )
        }
    }
}
