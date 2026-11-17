import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAuditService } from './fico-audit.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_NUMBER_RANGE_AUDIT_ACTIONS,
    FICO_NUMBER_RANGE_NUMBERING_METHODS,
    FICO_NUMBER_RANGE_RESET_FREQUENCIES,
    FICO_NUMBER_RANGE_STATUSES,
    formatFicoNumber,
    isFicoNumberRangeResetFrequency,
    isFicoNumberRangeStatus,
} from './fico.constants'

export type NumberRangeListQuery = {
    companyId: string
    search?: string
    status?: string
    documentCategory?: string
    numberingMethod?: string
    resetFrequency?: string
    page?: number
    pageSize?: number
}

export type NumberRangeCreateInput = {
    companyId: string
    rangeCode: string
    rangeName: string
    description?: string | null
    documentCategory: string
    assignmentType?: string | null
    numberingMethod?: string | null
    prefix?: string | null
    suffix?: string | null
    startNumber?: number | null
    endNumber?: number | null
    currentNumber?: number | null
    paddingLength?: number | null
    validFrom?: string | null | Date | null
    validTo?: string | null | Date | null
    fiscalYearId?: string | null
    resetFrequency?: string | null
    allowManualAssignment?: boolean | null
    allowExternalAssignment?: boolean | null
    allowGaps?: boolean | null
    remarks?: string | null
}

export type NumberRangeUpdateInput = {
    rangeName?: string | null
    description?: string | null
    documentCategory?: string | null
    assignmentType?: string | null
    numberingMethod?: string | null
    prefix?: string | null
    suffix?: string | null
    startNumber?: number | null
    endNumber?: number | null
    currentNumber?: number | null
    paddingLength?: number | null
    validFrom?: string | null | Date | null
    validTo?: string | null | Date | null
    fiscalYearId?: string | null | undefined
    resetFrequency?: string | null
    allowManualAssignment?: boolean | null
    allowExternalAssignment?: boolean | null
    allowGaps?: boolean | null
    status?: string | null
    remarks?: string | null
}

export type NumberRangeActivateInput = {
    companyId: string
    rangeCode: string
    reason?: string | null
}

export type NumberRangeDeactivateInput = {
    companyId: string
    rangeCode: string
    reason?: string | null
}

export type NumberRangeNextNumberInput = {
    companyId: string
    rangeCode: string
    documentReference?: string | null
    allowExternal?: boolean | null
    externalNumber?: string | null
}

export type NumberRangeHistoryQuery = {
    numberRangeId: string
    companyId?: string
    assignmentMethod?: string
    fiscalYearId?: string | null
    dateFrom?: string | null
    dateTo?: string | null
    page?: number
    pageSize?: number
}

const NUMBER_RANGE_INCLUDE = {
    company: { select: { id: true, code: true, name: true } },
    fiscalYear: {
        select: { id: true, code: true, name: true, status: true },
    },
} as const

@Injectable()
export class FicoNumberRangeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly audit: FicoAuditService,
    ) {}

    /** List number ranges for a company with optional filtering. */
    async list(query: NumberRangeListQuery, user: AuthRequestUser) {
        await this.access.assertAccess(user, query.companyId)

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))

        const where: Prisma.FicoNumberRangeWhereInput = {
            companyId: query.companyId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.documentCategory
                ? { documentCategory: query.documentCategory }
                : {}),
            ...(query.numberingMethod
                ? { numberingMethod: query.numberingMethod }
                : {}),
            ...(query.resetFrequency
                ? { resetFrequency: query.resetFrequency }
                : {}),
            ...(query.search
                ? {
                      OR: [
                          { rangeCode: { contains: query.search } },
                          { rangeName: { contains: query.search } },
                          { documentCategory: { contains: query.search } },
                      ],
                  }
                : {}),
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoNumberRange.findMany({
                where,
                include: NUMBER_RANGE_INCLUDE,
                orderBy: [{ rangeCode: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoNumberRange.count({ where }),
        ])

        return { items, total, page, pageSize }
    }

    /** Get a single number range by ID. */
    async get(id: string, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: { id },
            include: NUMBER_RANGE_INCLUDE,
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, range.companyId)
        return range
    }

    /** Create a new number range. */
    async create(input: NumberRangeCreateInput, user: AuthRequestUser) {
        await this.access.assertAccess(user, input.companyId)

        // Validate numbering method
        const numberingMethod = (input.numberingMethod ?? 'INTERNAL') as
            | 'INTERNAL'
            | 'EXTERNAL'
        if (!FICO_NUMBER_RANGE_NUMBERING_METHODS.includes(numberingMethod)) {
            throw new BadRequestException(
                `Invalid numbering method: ${numberingMethod}`,
            )
        }

        // Validate reset frequency
        const resetFrequency = input.resetFrequency ?? 'NEVER'
        if (!isFicoNumberRangeResetFrequency(resetFrequency)) {
            throw new BadRequestException(
                `Invalid reset frequency: ${resetFrequency}`,
            )
        }

        // Validate numeric bounds
        const startNumber = input.startNumber ?? 1
        const endNumber = input.endNumber ?? 999999
        const currentNumber = input.currentNumber ?? startNumber
        const paddingLength = input.paddingLength ?? 6

        if (endNumber < startNumber) {
            throw new BadRequestException(
                'Ending number must be greater than or equal to starting number.',
            )
        }
        if (currentNumber < startNumber || currentNumber > endNumber) {
            throw new BadRequestException(
                'Current number must be between starting and ending number.',
            )
        }
        if (paddingLength < 1 || paddingLength > 20) {
            throw new BadRequestException(
                'Padding length must be between 1 and 20.',
            )
        }

        // Check for duplicate range code within company
        const existing = await this.prisma.ficoNumberRange.findUnique({
            where: {
                companyId_rangeCode: {
                    companyId: input.companyId,
                    rangeCode: input.rangeCode,
                },
            },
        })
        if (existing) {
            throw new ConflictException(
                `Number range code "${input.rangeCode}" already exists for this company.`,
            )
        }

        // Per-fiscal-year validation
        if (resetFrequency === 'PER_FISCAL_YEAR' && !input.fiscalYearId) {
            throw new BadRequestException(
                'Fiscal year assignment is required when reset frequency is PER_FISCAL_YEAR.',
            )
        }

        const status = currentNumber >= endNumber ? 'EXHAUSTED' : 'ACTIVE'

        const created = await this.prisma.$transaction(async (tx) => {
            const range = await tx.ficoNumberRange.create({
                data: {
                    companyId: input.companyId,
                    rangeCode: input.rangeCode,
                    rangeName: input.rangeName,
                    description: input.description ?? null,
                    documentCategory: input.documentCategory,
                    assignmentType: (input.assignmentType ?? 'INTERNAL') as 'INTERNAL' | 'EXTERNAL',
                    numberingMethod,
                    prefix: input.prefix ?? '',
                    suffix: input.suffix ?? '',
                    startNumber,
                    endNumber,
                    currentNumber,
                    paddingLength,
                    validFrom: input.validFrom ? new Date(input.validFrom) : null,
                    validTo: input.validTo ? new Date(input.validTo) : null,
                    fiscalYearId: input.fiscalYearId ?? null,
                    resetFrequency,
                    allowManualAssignment: input.allowManualAssignment ?? true,
                    allowExternalAssignment:
                        input.allowExternalAssignment ?? false,
                    allowGaps: input.allowGaps ?? false,
                    status,
                    remarks: input.remarks ?? null,
                    createdBy: user.id,
                },
                include: NUMBER_RANGE_INCLUDE,
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: user.id,
                    action: FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_CREATE,
                    entityType: 'FicoNumberRange',
                    entityId: range.id,
                    previousValues: undefined,
                    newValues: {
                        rangeCode: range.rangeCode,
                        rangeName: range.rangeName,
                        documentCategory: range.documentCategory,
                        numberingMethod: range.numberingMethod,
                        prefix: range.prefix,
                        suffix: range.suffix,
                        startNumber: range.startNumber,
                        endNumber: range.endNumber,
                        paddingLength: range.paddingLength,
                        resetFrequency: range.resetFrequency,
                        status: range.status,
                    },
                },
            })

            return range
        })

        return created
    }

    /** Update a number range. Prevents changes that would invalidate existing assignments. */
    async update(
        id: string,
        input: NumberRangeUpdateInput,
        user: AuthRequestUser,
    ) {
        const existing = await this.prisma.ficoNumberRange.findUnique({
            where: { id },
        })
        if (!existing) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, existing.companyId)

        // Block structural changes on ranges with history
        const logCount = await this.prisma.ficoNumberRangeLog.count({
            where: { numberRangeId: id },
        })
        if (logCount > 0) {
            const structuralFields = [
                'prefix',
                'suffix',
                'startNumber',
                'endNumber',
                'paddingLength',
                'numberingMethod',
                'assignmentType',
            ] as const
            const changedStructural = structuralFields.some(
                (field) =>
                    input[field] !== undefined &&
                    input[field] !== (existing as any)[field],
            )
            if (changedStructural) {
                throw new BadRequestException(
                    'Cannot change numbering structure (prefix, suffix, start/end number, padding, numbering method) on a range that has already issued numbers.',
                )
            }
        }

        // Validate numeric bounds if changing
        const startNumber =
            input.startNumber ?? existing.startNumber
        const endNumber = input.endNumber ?? existing.endNumber
        const currentNumber =
            input.currentNumber ?? existing.currentNumber
        const paddingLength =
            input.paddingLength ?? existing.paddingLength

        if (endNumber < startNumber) {
            throw new BadRequestException(
                'Ending number must be greater than or equal to starting number.',
            )
        }
        if (currentNumber < startNumber || currentNumber > endNumber) {
            throw new BadRequestException(
                'Current number must be between starting and ending number.',
            )
        }
        if (paddingLength < 1 || paddingLength > 20) {
            throw new BadRequestException(
                'Padding length must be between 1 and 20.',
            )
        }

        // Validate reset frequency
        const resetFrequency =
            input.resetFrequency ?? existing.resetFrequency
        if (!isFicoNumberRangeResetFrequency(resetFrequency)) {
            throw new BadRequestException(
                `Invalid reset frequency: ${resetFrequency}`,
            )
        }

        if (resetFrequency === 'PER_FISCAL_YEAR' && !input.fiscalYearId) {
            throw new BadRequestException(
                'Fiscal year assignment is required when reset frequency is PER_FISCAL_YEAR.',
            )
        }

        const status =
            input.status ??
            (currentNumber >= endNumber ? 'EXHAUSTED' : existing.status)

        const updated = await this.prisma.$transaction(async (tx) => {
            const range = await tx.ficoNumberRange.update({
                where: { id },
                data: {
                    rangeName: input.rangeName ?? existing.rangeName,
                    description: input.description ?? existing.description,
                    documentCategory:
                        input.documentCategory ?? existing.documentCategory,
                    assignmentType:
                        input.assignmentType ?? existing.assignmentType,
                    numberingMethod:
                        input.numberingMethod ?? existing.numberingMethod,
                    prefix: input.prefix ?? existing.prefix,
                    suffix: input.suffix ?? existing.suffix,
                    startNumber,
                    endNumber,
                    currentNumber,
                    paddingLength,
                    validFrom: input.validFrom ??
                        (existing.validFrom ? new Date(existing.validFrom) : null),
                    validTo: input.validTo ??
                        (existing.validTo ? new Date(existing.validTo) : null),
                    fiscalYearId: input.fiscalYearId ?? existing.fiscalYearId,
                    resetFrequency,
                    allowManualAssignment:
                        input.allowManualAssignment ??
                        existing.allowManualAssignment,
                    allowExternalAssignment:
                        input.allowExternalAssignment ??
                        existing.allowExternalAssignment,
                    allowGaps: input.allowGaps ?? existing.allowGaps,
                    status,
                    remarks: input.remarks ?? existing.remarks,
                    updatedBy: user.id,
                },
                include: NUMBER_RANGE_INCLUDE,
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: existing.companyId,
                    actorId: user.id,
                    action: FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_UPDATE,
                    entityType: 'FicoNumberRange',
                    entityId: range.id,
                    previousValues: {
                        rangeName: existing.rangeName,
                        documentCategory: existing.documentCategory,
                        numberingMethod: existing.numberingMethod,
                        prefix: existing.prefix,
                        suffix: existing.suffix,
                        startNumber: existing.startNumber,
                        endNumber: existing.endNumber,
                        currentNumber: existing.currentNumber,
                        paddingLength: existing.paddingLength,
                        resetFrequency: existing.resetFrequency,
                        status: existing.status,
                    },
                    newValues: {
                        rangeName: range.rangeName,
                        documentCategory: range.documentCategory,
                        numberingMethod: range.numberingMethod,
                        prefix: range.prefix,
                        suffix: range.suffix,
                        startNumber: range.startNumber,
                        endNumber: range.endNumber,
                        currentNumber: range.currentNumber,
                        paddingLength: range.paddingLength,
                        resetFrequency: range.resetFrequency,
                        status: range.status,
                    },
                },
            })

            return range
        })

        return updated
    }

    /** Activate a number range. */
    async activate(input: NumberRangeActivateInput, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: {
                companyId_rangeCode: {
                    companyId: input.companyId,
                    rangeCode: input.rangeCode,
                },
            },
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, input.companyId)

        const updated = await this.prisma.$transaction(async (tx) => {
            const r = await tx.ficoNumberRange.update({
                where: { id: range.id },
                data: { status: 'ACTIVE', updatedBy: user.id },
                include: NUMBER_RANGE_INCLUDE,
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: user.id,
                    action:
                        FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_ACTIVATE,
                    entityType: 'FicoNumberRange',
                    entityId: range.id,
                    previousValues: { status: range.status },
                    newValues: { status: 'ACTIVE' },
                    reason: input.reason ?? undefined,
                },
            })

            return r
        })

        return updated
    }

    /** Deactivate a number range. */
    async deactivate(input: NumberRangeDeactivateInput, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: {
                companyId_rangeCode: {
                    companyId: input.companyId,
                    rangeCode: input.rangeCode,
                },
            },
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, input.companyId)

        const updated = await this.prisma.$transaction(async (tx) => {
            const r = await tx.ficoNumberRange.update({
                where: { id: range.id },
                data: { status: 'INACTIVE', updatedBy: user.id },
                include: NUMBER_RANGE_INCLUDE,
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: user.id,
                    action:
                        FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_DEACTIVATE,
                    entityType: 'FicoNumberRange',
                    entityId: range.id,
                    previousValues: { status: range.status },
                    newValues: { status: 'INACTIVE' },
                    reason: input.reason ?? undefined,
                },
            })

            return r
        })

        return updated
    }

    /** Delete a number range. Blocks if logs exist. */
    async remove(id: string, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: { id },
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, range.companyId)

        const logCount = await this.prisma.ficoNumberRangeLog.count({
            where: { numberRangeId: id },
        })
        if (logCount > 0) {
            throw new BadRequestException(
                'Cannot delete a number range that has issued numbers. Deactivate it instead.',
            )
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.ficoNumberRange.delete({ where: { id } })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: range.companyId,
                    actorId: user.id,
                    action: FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_DELETE,
                    entityType: 'FicoNumberRange',
                    entityId: range.id,
                    previousValues: {
                        rangeCode: range.rangeCode,
                        rangeName: range.rangeName,
                        documentCategory: range.documentCategory,
                        status: range.status,
                    },
                    newValues: undefined,
                },
            })
        })

        return { deleted: true }
    }

    /**
     * Atomically allocate the next number from a range.
     * Uses a database transaction with row-level locking to prevent concurrent duplicates.
     */
    async nextNumber(input: NumberRangeNextNumberInput, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: {
                companyId_rangeCode: {
                    companyId: input.companyId,
                    rangeCode: input.rangeCode,
                },
            },
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, input.companyId)

        // Validate status
        if (range.status !== 'ACTIVE') {
            throw new BadRequestException(
                `Number range is ${range.status.toLowerCase()} and cannot issue numbers.`,
            )
        }

        // Validate validity dates
        const now = new Date()
        if (range.validFrom && now < new Date(range.validFrom)) {
            throw new BadRequestException('Number range is not yet valid.')
        }
        if (range.validTo && now > new Date(range.validTo)) {
            throw new BadRequestException('Number range has expired.')
        }

        // External assignment: validate the provided number
        if (input.allowExternal && input.externalNumber) {
            if (!range.allowExternalAssignment) {
                throw new BadRequestException(
                    'External number assignment is not allowed for this range.',
                )
            }

            // Check for duplicate
            const existing = await this.prisma.ficoNumberRangeLog.findFirst({
                where: {
                    companyId: input.companyId,
                    generatedNumber: input.externalNumber,
                },
            })
            if (existing) {
                throw new ConflictException(
                    `Document number "${input.externalNumber}" already exists.`,
                )
            }

            // Parse the numeric sequence from the external number
            const numericPrefix = range.prefix
            const numericSuffix = range.suffix
            let numericSequence: number
            try {
                const stripped = input.externalNumber
                    .replace(new RegExp(`^${escapeRegExp(numericPrefix)}`, 'i'), '')
                    .replace(new RegExp(`${escapeRegExp(numericSuffix)}$`, 'i'), '')
                numericSequence = parseInt(stripped, 10)
                if (isNaN(numericSequence)) {
                    throw new BadRequestException(
                        'External number does not match the range prefix/suffix format.',
                    )
                }
            } catch {
                throw new BadRequestException(
                    'External number does not match the range prefix/suffix format.',
                )
            }

            // Validate bounds
            if (numericSequence < range.startNumber || numericSequence > range.endNumber) {
                throw new BadRequestException(
                    'External number is outside the configured range.',
                )
            }

            const generatedNumber = formatFicoNumber(
                range.prefix,
                numericSequence,
                range.paddingLength,
                range.suffix,
            )

            const log = await this.prisma.$transaction(async (tx) => {
                const entry = await tx.ficoNumberRangeLog.create({
                    data: {
                        numberRangeId: range.id,
                        companyId: input.companyId,
                        fiscalYearId: range.fiscalYearId,
                        generatedNumber,
                        numericSequence,
                        assignmentMethod: 'EXTERNAL',
                        documentReference: input.documentReference ?? null,
                        assignedBy: user.id,
                    },
                })

                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: input.companyId,
                        actorId: user.id,
                        action: FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_ALLOCATE,
                        entityType: 'FicoNumberRange',
                        entityId: range.id,
                        previousValues: { currentNumber: range.currentNumber },
                        newValues: { currentNumber: range.currentNumber, generatedNumber },
                    },
                })

                return entry
            })

            return {
                generatedNumber: log.generatedNumber,
                numericSequence: log.numericSequence,
                assignmentMethod: 'EXTERNAL',
                documentReference: log.documentReference,
                assignedAt: log.assignedAt,
            }
        }

        // Internal assignment: atomically increment currentNumber
        if (range.currentNumber >= range.endNumber) {
            // Mark as exhausted
            await this.prisma.ficoNumberRange.update({
                where: { id: range.id },
                data: { status: 'EXHAUSTED' },
            })
            throw new BadRequestException(
                'Number range is exhausted. No more numbers available.',
            )
        }

        const result = await this.prisma.$transaction(async (tx) => {
            // Atomically increment and return the updated range
            const updated = await tx.ficoNumberRange.update({
                where: {
                    companyId_rangeCode: {
                        companyId: input.companyId,
                        rangeCode: input.rangeCode,
                    },
                },
                data: {
                    currentNumber: {
                        increment: 1,
                    },
                    status:
                        range.currentNumber + 1 >= range.endNumber
                            ? 'EXHAUSTED'
                            : range.status,
                },
                include: NUMBER_RANGE_INCLUDE,
            })

            const numericSequence = updated.currentNumber
            const generatedNumber = formatFicoNumber(
                range.prefix,
                numericSequence,
                range.paddingLength,
                range.suffix,
            )

            const log = await tx.ficoNumberRangeLog.create({
                data: {
                    numberRangeId: range.id,
                    companyId: input.companyId,
                    fiscalYearId: range.fiscalYearId,
                    generatedNumber,
                    numericSequence,
                    assignmentMethod: 'INTERNAL',
                    documentReference: input.documentReference ?? null,
                    assignedBy: user.id,
                },
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: input.companyId,
                    actorId: user.id,
                    action: FICO_NUMBER_RANGE_AUDIT_ACTIONS.NUMBER_RANGE_ALLOCATE,
                    entityType: 'FicoNumberRange',
                    entityId: range.id,
                    previousValues: { currentNumber: range.currentNumber },
                    newValues: { currentNumber: numericSequence, generatedNumber },
                },
            })

            return { log, updated }
        })

        return {
            generatedNumber: result.log.generatedNumber,
            numericSequence: result.log.numericSequence,
            assignmentMethod: 'INTERNAL',
            documentReference: result.log.documentReference,
            assignedAt: result.log.assignedAt,
        }
    }

    /** Get assignment history for a number range. */
    async history(query: NumberRangeHistoryQuery, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: { id: query.numberRangeId },
            select: { id: true, companyId: true },
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, range.companyId)

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))

        const where: Prisma.FicoNumberRangeLogWhereInput = {
            numberRangeId: query.numberRangeId,
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(query.assignmentMethod
                ? { assignmentMethod: query.assignmentMethod }
                : {}),
            ...(query.fiscalYearId ? { fiscalYearId: query.fiscalYearId } : {}),
            ...(query.dateFrom || query.dateTo
                ? {
                      assignedAt: {
                          ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                          ...(query.dateTo ? { lte: query.dateTo } : {}),
                      },
                  }
                : {}),
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoNumberRangeLog.findMany({
                where,
                orderBy: { assignedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoNumberRangeLog.count({ where }),
        ])

        return { items, total, page, pageSize }
    }

    /** Get utilization statistics for a number range. */
    async utilization(id: string, user: AuthRequestUser) {
        const range = await this.prisma.ficoNumberRange.findUnique({
            where: { id },
        })
        if (!range) {
            throw new NotFoundException('Number range not found.')
        }
        await this.access.assertAccess(user, range.companyId)

        const totalAllocated = await this.prisma.ficoNumberRangeLog.count({
            where: { numberRangeId: id },
        })
        const remaining = Math.max(0, range.endNumber - range.currentNumber)
        const utilization =
            range.endNumber > range.startNumber
                ? Math.min(
                      100,
                      Math.round(
                          ((range.currentNumber - range.startNumber + 1) /
                              (range.endNumber - range.startNumber + 1)) *
                              100,
                      ),
                  )
                : 0

        return {
            rangeId: range.id,
            rangeCode: range.rangeCode,
            totalAllocated,
            currentSequence: range.currentNumber,
            remaining,
            utilizationPercent: utilization,
            isExhausted: range.status === 'EXHAUSTED',
            startNumber: range.startNumber,
            endNumber: range.endNumber,
        }
    }
}

/** Escape a string for use in a regular expression. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}