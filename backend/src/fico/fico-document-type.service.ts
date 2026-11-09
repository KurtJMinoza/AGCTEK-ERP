import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import {
    FICO_DOCUMENT_ACCOUNT_TYPES,
    FICO_DOCUMENT_ACCOUNT_TYPE_LABELS,
    FICO_DOCUMENT_CATEGORIES,
    FICO_DOCUMENT_CATEGORY_LABELS,
    FICO_DOCUMENT_NUMBER_ASSIGNMENTS,
    FICO_DOCUMENT_TYPE_AUDIT_ACTIONS,
    FICO_DOCUMENT_TYPE_STATUSES,
    isFicoDocumentAccountType,
    isFicoDocumentCategory,
    isFicoDocumentNumberAssignment,
    isFicoDocumentNumberRangeCompatible,
    isFicoDocumentTypeStatus,
} from './fico.constants'

export type DocumentTypeListQuery = {
    companyId: string
    search?: string
    status?: string
    documentCategory?: string
    reversalAllowed?: string
    numberRangeId?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
}

export type DocumentTypeCreateInput = {
    companyId: string
    code: string
    name: string
    description?: string | null
    documentCategory: string
    numberRangeId?: string | null
    numberAssignment?: string
    externalNumberAllowed?: boolean
    numberRangeRequired?: boolean
    allowedAccountTypes: string[]
    debitPostingAllowed?: boolean
    creditPostingAllowed?: boolean
    negativePostingAllowed?: boolean
    reversalAllowed?: boolean
    reversalDocumentTypeId?: string | null
    originalDocumentReferenceRequired?: boolean
    reversalReasonRequired?: boolean
    referenceRequired?: boolean
    headerTextRequired?: boolean
    lineTextRequired?: boolean
    status?: string
    remarks?: string | null
}

export type DocumentTypeUpdateInput = Partial<
    Omit<DocumentTypeCreateInput, 'companyId' | 'code'>
>

export type DocumentTypeStatusInput = {
    reason?: string | null
}

const DOCUMENT_TYPE_INCLUDE = {
    company: { select: { id: true, code: true, name: true } },
    numberRange: {
        select: {
            id: true,
            rangeCode: true,
            rangeName: true,
            documentCategory: true,
            numberingMethod: true,
            allowExternalAssignment: true,
            validFrom: true,
            validTo: true,
            status: true,
        },
    },
    reversalDocumentType: {
        select: { id: true, code: true, name: true, status: true },
    },
} satisfies Prisma.FicoDocumentTypeInclude

type DocumentTypeRecord = Prisma.FicoDocumentTypeGetPayload<{
    include: typeof DOCUMENT_TYPE_INCLUDE
}>

const SORT_FIELDS = new Set([
    'code',
    'name',
    'documentCategory',
    'status',
    'updatedAt',
    'createdAt',
])

function normalizeCode(value: string) {
    return value.trim().toUpperCase()
}

function asDate(value: Date | null | undefined) {
    return value ? new Date(value) : null
}

function isWithinValidity(
    validFrom: Date | null,
    validTo: Date | null,
    date = new Date(),
) {
    if (validFrom && date < validFrom) return false
    if (validTo && date > validTo) return false
    return true
}

@Injectable()
export class FicoDocumentTypeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async list(query: DocumentTypeListQuery, user: AuthRequestUser) {
        await this.access.assertAccess(user, query.companyId)
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(500, Math.max(1, query.pageSize ?? 50))
        const sortBy =
            query.sortBy && SORT_FIELDS.has(query.sortBy)
                ? query.sortBy
                : 'code'
        const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc'

        const where: Prisma.FicoDocumentTypeWhereInput = {
            companyId: query.companyId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.documentCategory
                ? { documentCategory: query.documentCategory }
                : {}),
            ...(query.numberRangeId
                ? { numberRangeId: query.numberRangeId }
                : {}),
            ...(query.reversalAllowed === 'true'
                ? { reversalAllowed: true }
                : query.reversalAllowed === 'false'
                  ? { reversalAllowed: false }
                  : {}),
            ...(query.search
                ? {
                      OR: [
                          {
                              code: {
                                  contains: query.search,
                                  mode: 'insensitive',
                              },
                          },
                          {
                              name: {
                                  contains: query.search,
                                  mode: 'insensitive',
                              },
                          },
                          {
                              description: {
                                  contains: query.search,
                                  mode: 'insensitive',
                              },
                          },
                      ],
                  }
                : {}),
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoDocumentType.findMany({
                where,
                include: DOCUMENT_TYPE_INCLUDE,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoDocumentType.count({ where }),
        ])

        return { items, total, page, pageSize }
    }

    async summary(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        const [total, active, inactive, categoryGroups, reversalAllowed] =
            await Promise.all([
                this.prisma.ficoDocumentType.count({ where: { companyId } }),
                this.prisma.ficoDocumentType.count({
                    where: { companyId, status: 'ACTIVE' },
                }),
                this.prisma.ficoDocumentType.count({
                    where: { companyId, status: 'INACTIVE' },
                }),
                this.prisma.ficoDocumentType.groupBy({
                    by: ['documentCategory'],
                    where: { companyId },
                }),
                this.prisma.ficoDocumentType.count({
                    where: { companyId, reversalAllowed: true },
                }),
            ])

        return {
            total,
            active,
            inactive,
            categories: categoryGroups.length,
            reversalAllowed,
            generatedAt: new Date().toISOString(),
        }
    }

    referenceData() {
        return {
            categories: FICO_DOCUMENT_CATEGORIES.map((value) => ({
                value,
                label: FICO_DOCUMENT_CATEGORY_LABELS[value],
            })),
            accountTypes: FICO_DOCUMENT_ACCOUNT_TYPES.map((value) => ({
                value,
                label: FICO_DOCUMENT_ACCOUNT_TYPE_LABELS[value],
            })),
            numberAssignments: FICO_DOCUMENT_NUMBER_ASSIGNMENTS.map(
                (value) => ({ value, label: value }),
            ),
            statuses: FICO_DOCUMENT_TYPE_STATUSES.map((value) => ({
                value,
                label: value,
            })),
        }
    }

    async get(id: string, user: AuthRequestUser) {
        const documentType = await this.prisma.ficoDocumentType.findUnique({
            where: { id },
            include: DOCUMENT_TYPE_INCLUDE,
        })
        if (!documentType) {
            throw new NotFoundException('Document type not found.')
        }
        await this.access.assertAccess(user, documentType.companyId)
        return {
            ...documentType,
            usage: await this.usage(documentType),
        }
    }

    async create(input: DocumentTypeCreateInput, user: AuthRequestUser) {
        await this.access.assertAccess(user, input.companyId)
        await this.assertCompanyReady(input.companyId)
        const code = normalizeCode(input.code)

        const existing = await this.prisma.ficoDocumentType.findUnique({
            where: {
                companyId_code: { companyId: input.companyId, code },
            },
            select: { id: true },
        })
        if (existing) {
            throw new ConflictException(
                `Document type code "${code}" already exists for this company.`,
            )
        }

        const values = await this.validateAndNormalize(
            {
                ...input,
                code,
                status: input.status ?? 'INACTIVE',
            },
            user,
        )

        return this.prisma.$transaction(async (tx) => {
            const created = await tx.ficoDocumentType.create({
                data: {
                    ...values,
                    createdBy: user.id,
                    updatedBy: user.id,
                },
                include: DOCUMENT_TYPE_INCLUDE,
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: created.companyId,
                    actorId: user.id,
                    action:
                        FICO_DOCUMENT_TYPE_AUDIT_ACTIONS.DOCUMENT_TYPE_CREATE,
                    entityType: 'FicoDocumentType',
                    entityId: created.id,
                    newValues: this.auditSnapshot(created),
                },
            })
            return created
        })
    }

    async update(
        id: string,
        input: DocumentTypeUpdateInput,
        user: AuthRequestUser,
    ) {
        const existing = await this.prisma.ficoDocumentType.findUnique({
            where: { id },
        })
        if (!existing) {
            throw new NotFoundException('Document type not found.')
        }
        await this.access.assertAccess(user, existing.companyId)

        const usage = await this.usage(existing)
        if (usage.journalEntries > 0) {
            const locked = {
                documentCategory:
                    input.documentCategory !== undefined &&
                    input.documentCategory !== existing.documentCategory,
                numberRangeId:
                    input.numberRangeId !== undefined &&
                    (input.numberRangeId ?? null) !== existing.numberRangeId,
                numberAssignment:
                    input.numberAssignment !== undefined &&
                    input.numberAssignment !== existing.numberAssignment,
                externalNumberAllowed:
                    input.externalNumberAllowed !== undefined &&
                    input.externalNumberAllowed !==
                        existing.externalNumberAllowed,
                reversalDocumentTypeId:
                    input.reversalDocumentTypeId !== undefined &&
                    (input.reversalDocumentTypeId ?? null) !==
                        existing.reversalDocumentTypeId,
            }
            const changed = Object.entries(locked)
                .filter(([, value]) => value)
                .map(([field]) => field)
            if (changed.length) {
                throw new BadRequestException(
                    `Document type is referenced by posted transactions. These fields are locked: ${changed.join(', ')}.`,
                )
            }
        }

        const merged = {
            name: input.name ?? existing.name,
            description:
                input.description !== undefined
                    ? input.description
                    : existing.description,
            documentCategory:
                input.documentCategory ?? existing.documentCategory,
            numberRangeId:
                input.numberRangeId !== undefined
                    ? input.numberRangeId
                    : existing.numberRangeId,
            numberAssignment:
                input.numberAssignment ?? existing.numberAssignment,
            externalNumberAllowed:
                input.externalNumberAllowed ?? existing.externalNumberAllowed,
            numberRangeRequired:
                input.numberRangeRequired ?? existing.numberRangeRequired,
            allowedAccountTypes:
                input.allowedAccountTypes ?? existing.allowedAccountTypes,
            debitPostingAllowed:
                input.debitPostingAllowed ?? existing.debitPostingAllowed,
            creditPostingAllowed:
                input.creditPostingAllowed ?? existing.creditPostingAllowed,
            negativePostingAllowed:
                input.negativePostingAllowed ?? existing.negativePostingAllowed,
            reversalAllowed: input.reversalAllowed ?? existing.reversalAllowed,
            reversalDocumentTypeId:
                input.reversalDocumentTypeId !== undefined
                    ? input.reversalDocumentTypeId
                    : existing.reversalDocumentTypeId,
            originalDocumentReferenceRequired:
                input.originalDocumentReferenceRequired ??
                existing.originalDocumentReferenceRequired,
            reversalReasonRequired:
                input.reversalReasonRequired ?? existing.reversalReasonRequired,
            referenceRequired:
                input.referenceRequired ?? existing.referenceRequired,
            headerTextRequired:
                input.headerTextRequired ?? existing.headerTextRequired,
            lineTextRequired:
                input.lineTextRequired ?? existing.lineTextRequired,
            status: input.status ?? existing.status,
            remarks:
                input.remarks !== undefined ? input.remarks : existing.remarks,
        }

        const values = await this.validateAndNormalize(
            { ...merged, companyId: existing.companyId, code: existing.code },
            user,
            id,
        )

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.ficoDocumentType.update({
                where: { id },
                data: { ...values, updatedBy: user.id },
                include: DOCUMENT_TYPE_INCLUDE,
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: existing.companyId,
                    actorId: user.id,
                    action:
                        FICO_DOCUMENT_TYPE_AUDIT_ACTIONS.DOCUMENT_TYPE_UPDATE,
                    entityType: 'FicoDocumentType',
                    entityId: id,
                    previousValues: this.auditSnapshot(existing),
                    newValues: this.auditSnapshot(updated),
                },
            })
            return updated
        })
    }

    async activate(
        id: string,
        input: DocumentTypeStatusInput,
        user: AuthRequestUser,
    ) {
        const existing = await this.prisma.ficoDocumentType.findUnique({
            where: { id },
            include: DOCUMENT_TYPE_INCLUDE,
        })
        if (!existing) {
            throw new NotFoundException('Document type not found.')
        }
        await this.access.assertAccess(user, existing.companyId)
        await this.assertCompanyReady(existing.companyId)
        await this.assertActivatable(existing)

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.ficoDocumentType.update({
                where: { id },
                data: { status: 'ACTIVE', updatedBy: user.id },
                include: DOCUMENT_TYPE_INCLUDE,
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: existing.companyId,
                    actorId: user.id,
                    action:
                        FICO_DOCUMENT_TYPE_AUDIT_ACTIONS.DOCUMENT_TYPE_ACTIVATE,
                    entityType: 'FicoDocumentType',
                    entityId: id,
                    previousValues: { status: existing.status },
                    newValues: { status: updated.status },
                    reason: input.reason ?? null,
                },
            })
            return updated
        })
    }

    async deactivate(
        id: string,
        input: DocumentTypeStatusInput,
        user: AuthRequestUser,
    ) {
        const existing = await this.prisma.ficoDocumentType.findUnique({
            where: { id },
        })
        if (!existing) {
            throw new NotFoundException('Document type not found.')
        }
        await this.access.assertAccess(user, existing.companyId)

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.ficoDocumentType.update({
                where: { id },
                data: { status: 'INACTIVE', updatedBy: user.id },
                include: DOCUMENT_TYPE_INCLUDE,
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: existing.companyId,
                    actorId: user.id,
                    action:
                        FICO_DOCUMENT_TYPE_AUDIT_ACTIONS.DOCUMENT_TYPE_DEACTIVATE,
                    entityType: 'FicoDocumentType',
                    entityId: id,
                    previousValues: { status: existing.status },
                    newValues: { status: updated.status },
                    reason: input.reason ?? null,
                },
            })
            return updated
        })
    }

    async remove(id: string, user: AuthRequestUser) {
        const existing = await this.prisma.ficoDocumentType.findUnique({
            where: { id },
        })
        if (!existing) {
            throw new NotFoundException('Document type not found.')
        }
        await this.access.assertAccess(user, existing.companyId)

        const usage = await this.usage(existing)
        if (!usage.canDelete) {
            throw new BadRequestException(
                'This document type has dependent configuration or transaction references and cannot be deleted. Deactivate it instead.',
            )
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.ficoDocumentType.delete({ where: { id } })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: existing.companyId,
                    actorId: user.id,
                    action:
                        FICO_DOCUMENT_TYPE_AUDIT_ACTIONS.DOCUMENT_TYPE_DELETE,
                    entityType: 'FicoDocumentType',
                    entityId: id,
                    previousValues: this.auditSnapshot(existing),
                },
            })
            return { deleted: true }
        })
    }

    async history(
        id: string,
        query: { page?: number; pageSize?: number },
        user: AuthRequestUser,
    ) {
        const existing = await this.prisma.ficoDocumentType.findUnique({
            where: { id },
            select: { id: true, companyId: true },
        })
        if (!existing) {
            throw new NotFoundException('Document type not found.')
        }
        await this.access.assertAccess(user, existing.companyId)

        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50))
        const where = {
            companyId: existing.companyId,
            entityType: 'FicoDocumentType',
            entityId: id,
        }
        const [items, total] = await Promise.all([
            this.prisma.ficoAccountingAuditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoAccountingAuditLog.count({ where }),
        ])

        const actorIds = [
            ...new Set(items.map((item) => item.actorId).filter(Boolean)),
        ] as string[]
        const actors = actorIds.length
            ? await this.prisma.user.findMany({
                  where: { id: { in: actorIds } },
                  select: {
                      id: true,
                      email: true,
                      userName: true,
                      firstName: true,
                      lastName: true,
                  },
              })
            : []
        const actorById = new Map(actors.map((actor) => [actor.id, actor]))

        return {
            items: items.map((item) => ({
                ...item,
                performer: item.actorId
                    ? (actorById.get(item.actorId) ?? null)
                    : null,
            })),
            total,
            page,
            pageSize,
        }
    }

    // ---------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------

    private async validateAndNormalize(
        input: DocumentTypeCreateInput,
        user: AuthRequestUser,
        currentId?: string,
    ): Promise<Prisma.FicoDocumentTypeUncheckedCreateInput> {
        if (!isFicoDocumentCategory(input.documentCategory)) {
            throw new BadRequestException(
                `Invalid document category: ${input.documentCategory}.`,
            )
        }
        if (!isFicoDocumentTypeStatus(input.status ?? 'INACTIVE')) {
            throw new BadRequestException(
                `Invalid document type status: ${input.status}.`,
            )
        }
        const numberAssignment = input.numberAssignment ?? 'INTERNAL'
        if (!isFicoDocumentNumberAssignment(numberAssignment)) {
            throw new BadRequestException(
                `Invalid number assignment: ${numberAssignment}.`,
            )
        }

        const accountTypes = [
            ...new Set((input.allowedAccountTypes ?? []).map((value) => value)),
        ]
        if (!accountTypes.length) {
            throw new BadRequestException(
                'Select at least one allowed account type.',
            )
        }
        const invalidAccountType = accountTypes.find(
            (value) => !isFicoDocumentAccountType(value),
        )
        if (invalidAccountType) {
            throw new BadRequestException(
                `Invalid account type: ${invalidAccountType}.`,
            )
        }

        const debitPostingAllowed = input.debitPostingAllowed ?? true
        const creditPostingAllowed = input.creditPostingAllowed ?? true
        if (!debitPostingAllowed && !creditPostingAllowed) {
            throw new BadRequestException(
                'At least one of debit posting or credit posting must be allowed.',
            )
        }

        const numberRangeRequired = input.numberRangeRequired ?? true
        if (numberRangeRequired && !input.numberRangeId) {
            throw new BadRequestException(
                'A number range is required for this document type.',
            )
        }

        if (input.numberRangeId) {
            const range = await this.prisma.ficoNumberRange.findUnique({
                where: { id: input.numberRangeId },
            })
            if (!range) {
                throw new BadRequestException('Number range not found.')
            }
            if (range.companyId !== input.companyId) {
                throw new BadRequestException(
                    'The selected number range belongs to another company.',
                )
            }
            if (range.status !== 'ACTIVE') {
                throw new BadRequestException(
                    'The selected number range must be active.',
                )
            }
            if (
                !isFicoDocumentNumberRangeCompatible(
                    input.documentCategory,
                    range.documentCategory,
                )
            ) {
                throw new BadRequestException(
                    `Number range "${range.rangeCode}" is configured for ${range.documentCategory} and is not compatible with ${input.documentCategory}.`,
                )
            }
            if (
                input.externalNumberAllowed &&
                !range.allowExternalAssignment
            ) {
                throw new BadRequestException(
                    'The selected number range does not allow external number assignment.',
                )
            }
            if (
                numberAssignment === 'EXTERNAL' &&
                !range.allowExternalAssignment
            ) {
                throw new BadRequestException(
                    'External number assignment is not allowed by the selected number range.',
                )
            }
            if (
                (input.status ?? 'INACTIVE') === 'ACTIVE' &&
                !isWithinValidity(asDate(range.validFrom), asDate(range.validTo))
            ) {
                throw new BadRequestException(
                    'The selected number range is not valid on the current date.',
                )
            }
        }

        const reversalAllowed = input.reversalAllowed ?? true
        let reversalDocumentTypeId = input.reversalDocumentTypeId ?? null
        let originalDocumentReferenceRequired =
            input.originalDocumentReferenceRequired ?? false
        let reversalReasonRequired = input.reversalReasonRequired ?? false

        if (!reversalAllowed) {
            reversalDocumentTypeId = null
            originalDocumentReferenceRequired = false
            reversalReasonRequired = false
        } else if (reversalDocumentTypeId) {
            if (currentId && reversalDocumentTypeId === currentId) {
                throw new BadRequestException(
                    'A document type cannot reference itself as its reversal document type.',
                )
            }
            const target = await this.prisma.ficoDocumentType.findUnique({
                where: { id: reversalDocumentTypeId },
                select: {
                    id: true,
                    companyId: true,
                    status: true,
                    reversalDocumentTypeId: true,
                },
            })
            if (!target) {
                throw new BadRequestException(
                    'The selected reversal document type was not found.',
                )
            }
            if (target.companyId !== input.companyId) {
                throw new BadRequestException(
                    'The selected reversal document type belongs to another company.',
                )
            }
            if ((input.status ?? 'INACTIVE') === 'ACTIVE' && target.status !== 'ACTIVE') {
                throw new BadRequestException(
                    'The selected reversal document type must be active.',
                )
            }
            await this.assertNoReversalCycle(
                reversalDocumentTypeId,
                currentId ?? null,
            )
        }

        return {
            companyId: input.companyId,
            code: normalizeCode(input.code),
            name: input.name.trim(),
            description: input.description?.trim() || null,
            documentCategory: input.documentCategory,
            numberRangeId: input.numberRangeId ?? null,
            numberAssignment,
            externalNumberAllowed: input.externalNumberAllowed ?? false,
            numberRangeRequired,
            allowedAccountTypes: accountTypes,
            debitPostingAllowed,
            creditPostingAllowed,
            negativePostingAllowed: input.negativePostingAllowed ?? false,
            reversalAllowed,
            reversalDocumentTypeId,
            originalDocumentReferenceRequired,
            reversalReasonRequired,
            referenceRequired: input.referenceRequired ?? false,
            headerTextRequired: input.headerTextRequired ?? false,
            lineTextRequired: input.lineTextRequired ?? false,
            status: input.status ?? 'INACTIVE',
            remarks: input.remarks?.trim() || null,
        }
    }

    private async assertCompanyReady(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true },
        })
        if (!company) {
            throw new BadRequestException('Company not found.')
        }
        const settings =
            await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                select: { status: true },
            })
        if (!settings) {
            throw new BadRequestException(
                'Company accounting settings must be configured before document types can be created.',
            )
        }
        if (settings.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Company accounting settings must be active before document types can be created or activated.',
            )
        }
    }

    private async assertActivatable(
        record: DocumentTypeRecord & { numberRangeId: string | null },
    ) {
        if (!isFicoDocumentCategory(record.documentCategory)) {
            throw new BadRequestException(
                'The configured document category is no longer valid.',
            )
        }
        if (!record.allowedAccountTypes.length) {
            throw new BadRequestException(
                'At least one allowed account type is required before activation.',
            )
        }
        if (!record.debitPostingAllowed && !record.creditPostingAllowed) {
            throw new BadRequestException(
                'At least one of debit posting or credit posting must be allowed before activation.',
            )
        }
        if (record.numberRangeRequired && !record.numberRangeId) {
            throw new BadRequestException(
                'A number range is required before activation.',
            )
        }
        if (record.numberRangeId) {
            const range = await this.prisma.ficoNumberRange.findUnique({
                where: { id: record.numberRangeId },
            })
            if (!range || range.companyId !== record.companyId) {
                throw new BadRequestException(
                    'The assigned number range is not available for this company.',
                )
            }
            if (range.status !== 'ACTIVE') {
                throw new BadRequestException(
                    'The assigned number range must be active before activation.',
                )
            }
            if (!isWithinValidity(asDate(range.validFrom), asDate(range.validTo))) {
                throw new BadRequestException(
                    'The assigned number range is not valid on the current date.',
                )
            }
            if (
                !isFicoDocumentNumberRangeCompatible(
                    record.documentCategory,
                    range.documentCategory,
                )
            ) {
                throw new BadRequestException(
                    'The assigned number range is not compatible with the document category.',
                )
            }
            if (
                (record.externalNumberAllowed ||
                    record.numberAssignment === 'EXTERNAL') &&
                !range.allowExternalAssignment
            ) {
                throw new BadRequestException(
                    'The assigned number range does not allow external numbering.',
                )
            }
        }
        if (record.reversalAllowed && record.reversalDocumentTypeId) {
            const target = await this.prisma.ficoDocumentType.findUnique({
                where: { id: record.reversalDocumentTypeId },
                select: { companyId: true, status: true },
            })
            if (
                !target ||
                target.companyId !== record.companyId ||
                target.status !== 'ACTIVE'
            ) {
                throw new BadRequestException(
                    'The assigned reversal document type must be active and belong to the same company.',
                )
            }
        }
    }

    private async assertNoReversalCycle(startId: string, currentId: string | null) {
        let cursor: string | null = startId
        const seen = new Set<string>()
        for (let depth = 0; cursor && depth < 25; depth += 1) {
            if (currentId && cursor === currentId) {
                throw new BadRequestException(
                    'The reversal document type relationship would create a cycle.',
                )
            }
            if (seen.has(cursor)) {
                throw new BadRequestException(
                    'The reversal document type relationship already contains a cycle.',
                )
            }
            seen.add(cursor)
            const next: { reversalDocumentTypeId: string | null } | null =
                await this.prisma.ficoDocumentType.findUnique({
                    where: { id: cursor },
                    select: { reversalDocumentTypeId: true },
                })
            cursor = next?.reversalDocumentTypeId ?? null
        }
        if (cursor) {
            throw new BadRequestException(
                'The reversal document type chain is too deep or circular.',
            )
        }
    }

    private async usage(record: {
        id: string
        companyId: string
        code: string
    }) {
        const [journalEntries, documentSequences, reversalReferences] =
            await Promise.all([
                this.prisma.ficoJournalEntry.count({
                    where: {
                        companyId: record.companyId,
                        documentType: record.code,
                    },
                }),
                this.prisma.ficoDocumentSequence.count({
                    where: {
                        companyId: record.companyId,
                        documentType: record.code,
                    },
                }),
                this.prisma.ficoDocumentType.count({
                    where: { reversalDocumentTypeId: record.id },
                }),
            ])
        return {
            journalEntries,
            documentSequences,
            reversalReferences,
            canDelete:
                journalEntries === 0 &&
                documentSequences === 0 &&
                reversalReferences === 0,
        }
    }

    private auditSnapshot(record: {
        id: string
        code: string
        name: string
        description: string | null
        documentCategory: string
        numberRangeId: string | null
        numberAssignment: string
        externalNumberAllowed: boolean
        numberRangeRequired: boolean
        allowedAccountTypes: string[]
        debitPostingAllowed: boolean
        creditPostingAllowed: boolean
        negativePostingAllowed: boolean
        reversalAllowed: boolean
        reversalDocumentTypeId: string | null
        originalDocumentReferenceRequired: boolean
        reversalReasonRequired: boolean
        referenceRequired: boolean
        headerTextRequired: boolean
        lineTextRequired: boolean
        status: string
        remarks: string | null
    }) {
        return {
            id: record.id,
            code: record.code,
            name: record.name,
            description: record.description,
            documentCategory: record.documentCategory,
            numberRangeId: record.numberRangeId,
            numberAssignment: record.numberAssignment,
            externalNumberAllowed: record.externalNumberAllowed,
            numberRangeRequired: record.numberRangeRequired,
            allowedAccountTypes: record.allowedAccountTypes,
            debitPostingAllowed: record.debitPostingAllowed,
            creditPostingAllowed: record.creditPostingAllowed,
            negativePostingAllowed: record.negativePostingAllowed,
            reversalAllowed: record.reversalAllowed,
            reversalDocumentTypeId: record.reversalDocumentTypeId,
            originalDocumentReferenceRequired:
                record.originalDocumentReferenceRequired,
            reversalReasonRequired: record.reversalReasonRequired,
            referenceRequired: record.referenceRequired,
            headerTextRequired: record.headerTextRequired,
            lineTextRequired: record.lineTextRequired,
            status: record.status,
            remarks: record.remarks,
        }
    }
}
