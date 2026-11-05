import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthRequestUser } from '../../auth/auth.decorator'
import { CreateJournalEntryDto, ListJournalEntriesQueryDto } from '../dto/journal-entry.dto'
import { FicoAuditService } from '../fico-audit.service'
import { FicoCompanyAccessService } from '../fico-company-access.service'
import { FicoPostingValidationService } from '../fico-posting-validation.service'
import { FICO_AUDIT_ACTIONS } from '../fico.constants'

const includeJournal = {
    documentTypeRef: true,
    fiscalPeriod: {
        select: {
            id: true,
            fiscalYear: true,
            periodNumber: true,
            status: true,
            startDate: true,
            endDate: true,
        },
    },
    reversalOf: { select: { id: true, documentNumber: true } },
    reversedBy: { select: { id: true, documentNumber: true } },
    lines: {
        include: {
            glAccount: {
                select: {
                    id: true,
                    accountCode: true,
                    accountName: true,
                    status: true,
                    isPostingAccount: true,
                    allowManualPosting: true,
                },
            },
        },
        orderBy: { lineNumber: 'asc' as const },
    },
} satisfies Prisma.FicoJournalEntryInclude

@Injectable()
export class JournalEntryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly postingValidation: FicoPostingValidationService,
        private readonly audit: FicoAuditService,
    ) {}

    async list(query: ListJournalEntriesQueryDto, user: AuthRequestUser) {
        if (query.companyId) await this.access.assertAccess(user, query.companyId)
        const accessible = query.companyId
            ? null
            : await this.access.accessibleCompanyIds(user)
        const page = query.page ?? 1
        const pageSize = Math.min(query.pageSize ?? 20, 100)
        const search = query.search?.trim()
        const where: Prisma.FicoJournalEntryWhereInput = {
            status: query.status ? query.status : { not: 'LEGACY' },
            ...(query.companyId
                ? { companyId: query.companyId }
                : accessible === null
                  ? {}
                  : { companyId: { in: accessible } }),
            ...(query.documentTypeId ? { documentTypeId: query.documentTypeId } : {}),
            ...(search
                ? {
                      OR: [
                          { documentNumber: { contains: search, mode: 'insensitive' } },
                          { reference: { contains: search, mode: 'insensitive' } },
                          { headerText: { contains: search, mode: 'insensitive' } },
                          { description: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.ficoJournalEntry.findMany({
                where,
                include: includeJournal,
                orderBy: [{ postingDate: 'desc' }, { createdAt: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.ficoJournalEntry.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async get(id: string, user: AuthRequestUser) {
        const row = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: includeJournal,
        })
        if (!row) throw new NotFoundException('Journal entry not found')
        await this.access.assertAccess(user, row.companyId)
        return row
    }

    async create(dto: CreateJournalEntryDto, user: AuthRequestUser) {
        await this.access.assertAccess(user, dto.companyId)
        const entry = await this.createDraft(dto, user.id)
        if (dto.status !== 'POSTED') return entry
        try {
            return await this.post(entry.id, user)
        } catch (error) {
            await this.prisma.ficoJournalEntry
                .delete({ where: { id: entry.id } })
                .catch(() => undefined)
            throw error
        }
    }

    private async createDraft(dto: CreateJournalEntryDto, createdBy?: string, system = false) {
        this.validateLines(dto.lines)
        const postingDate = new Date(dto.postingDate)
        const fiscalYear = postingDate.getUTCFullYear()
        return this.prisma.$transaction(
            async (tx) => {
                const documentType = await tx.fiDocumentType.findUnique({
                    where: { id: dto.documentTypeId },
                })
                if (!documentType || !documentType.isActive) {
                    throw new BadRequestException('Document type is inactive or missing')
                }
                if (!system && !documentType.allowsManualEntry) {
                    throw new BadRequestException('Document type does not allow manual entry')
                }
                if (documentType.nextNumber > documentType.numberRangeTo) {
                    throw new ConflictException('Document number range is exhausted')
                }
                const company = await tx.company.findUnique({ where: { id: dto.companyId } })
                if (!company) throw new BadRequestException('Company is required')
                const number = documentType.nextNumber
                const prefix = documentType.prefix || documentType.code
                const width = Math.max(4, String(documentType.numberRangeTo).length)
                await tx.fiDocumentType.update({
                    where: { id: documentType.id },
                    data: { nextNumber: { increment: 1 } },
                })
                const debitTotal = dto.lines.reduce(
                    (sum, line) => sum.plus(line.debit),
                    new Decimal(0),
                )
                return tx.ficoJournalEntry.create({
                    data: {
                        idempotencyKey: `MANUAL:${randomUUID()}`,
                        companyId: company.id,
                        documentTypeId: documentType.id,
                        documentNumber: `${prefix}-${fiscalYear}-${String(number).padStart(width, '0')}`,
                        documentType: system ? 'REVERSAL' : 'MANUAL',
                        postingDate,
                        documentDate: new Date(dto.documentDate),
                        reference: dto.reference || null,
                        headerText: dto.headerText || null,
                        fiscalYear,
                        totalAmount: debitTotal,
                        currencyCode: dto.currencyCode.toUpperCase(),
                        status: 'DRAFT',
                        createdBy: createdBy || null,
                        lines: {
                            create: dto.lines.map((line, index) => ({
                                lineNumber: index + 1,
                                glAccountId: line.glAccountId,
                                companyId: company.id,
                                debitAmount: line.debit,
                                creditAmount: line.credit,
                                currency: dto.currencyCode.toUpperCase(),
                                description: line.text || null,
                            })),
                        },
                    },
                    include: includeJournal,
                })
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
    }

    async post(id: string, user: AuthRequestUser, source: 'MANUAL' | 'AUTOMATIC' = 'MANUAL') {
        const entry = await this.get(id, user)
        if (entry.status !== 'DRAFT') {
            throw new ConflictException('Only draft journal entries can be posted')
        }
        this.validateLines(
            entry.lines.map((line) => ({
                debit: Number(line.debitAmount),
                credit: Number(line.creditAmount),
            })),
        )
        const validation = await this.postingValidation.validate({
            companyId: entry.companyId,
            postingDate: entry.postingDate,
            source,
            currencyCode: entry.currencyCode,
            lines: entry.lines.map((line) => ({
                glAccountId: line.glAccountId,
                debitAmount: Number(line.debitAmount),
                creditAmount: Number(line.creditAmount),
                currency: line.currency,
            })),
        })
        const period = validation.period
        const posted = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id FROM fico_financial_periods
                WHERE id = ${period.id}
                FOR SHARE
            `
            const lockedPeriod = await tx.ficoFinancialPeriod.findUnique({
                where: { id: period.id },
                select: { status: true },
            })
            if (!lockedPeriod || lockedPeriod.status !== 'OPEN') {
                throw new ConflictException(
                    'Posting date is not in an open fiscal period any more.',
                )
            }
            const updated = await tx.ficoJournalEntry.update({
                where: { id },
                data: {
                    status: 'POSTED',
                    fiscalPeriodId: period.id,
                    fiscalYear: period.fiscalYear,
                    postedAt: new Date(),
                    postedBy: user.id || null,
                },
                include: includeJournal,
            })
            await this.audit.log(
                {
                    companyId: updated.companyId,
                    actorId: user.id || null,
                    action: FICO_AUDIT_ACTIONS.JOURNAL_POST,
                    entityType: 'FicoJournalEntry',
                    entityId: updated.id,
                    newValues: {
                        documentNumber: updated.documentNumber,
                        documentTypeId: updated.documentTypeId,
                        totalAmount: updated.totalAmount.toString(),
                        currencyCode: updated.currencyCode,
                    },
                    metadata: { source },
                },
                tx,
            )
            return updated
        })
        return posted
    }

    async reverse(id: string, user: AuthRequestUser, postingDate?: string) {
        const original = await this.get(id, user)
        if (original.status !== 'POSTED' || original.reversedBy) {
            throw new ConflictException('Journal entry is not available for reversal')
        }
        if (!original.documentTypeId) {
            throw new BadRequestException('Legacy journal cannot be reversed here')
        }
        const date = postingDate ?? new Date().toISOString().slice(0, 10)
        const reversal = await this.createDraft(
            {
                documentTypeId: original.documentTypeId,
                companyId: original.companyId,
                postingDate: date,
                documentDate: date,
                reference: `Reversal of ${original.documentNumber}`,
                headerText: original.headerText ?? undefined,
                currencyCode: original.currencyCode,
                status: 'DRAFT',
                lines: original.lines.map((line) => ({
                    glAccountId: line.glAccountId,
                    debit: Number(line.creditAmount),
                    credit: Number(line.debitAmount),
                    text: line.description ?? undefined,
                })),
            },
            user.id,
            true,
        )
        await this.prisma.ficoJournalEntry.update({
            where: { id: reversal.id },
            data: { reversalOfId: original.id },
        })
        const posted = await this.post(reversal.id, user, 'AUTOMATIC')
        await this.prisma.ficoJournalEntry.update({
            where: { id: original.id },
            data: { status: 'REVERSED' },
        })
        await this.audit.log({
            companyId: original.companyId,
            actorId: user.id || null,
            action: FICO_AUDIT_ACTIONS.JOURNAL_REVERSE,
            entityType: 'FicoJournalEntry',
            entityId: original.id,
            previousValues: { status: original.status },
            newValues: {
                status: 'REVERSED',
                reversalId: posted.id,
                reversalDocumentNumber: posted.documentNumber,
            },
        })
        return this.get(posted.id, user)
    }

    private validateLines(lines: Array<{ debit: number | Decimal; credit: number | Decimal }>) {
        if (lines.length < 2) throw new BadRequestException('At least two journal lines are required')
        let debit = new Decimal(0)
        let credit = new Decimal(0)
        for (const line of lines) {
            const d = new Decimal(line.debit)
            const c = new Decimal(line.credit)
            if (d.isNegative() || c.isNegative() || d.gt(0) === c.gt(0)) {
                throw new BadRequestException('Each line must contain either a debit or a credit')
            }
            debit = debit.plus(d)
            credit = credit.plus(c)
        }
        if (debit.lte(0) || !debit.equals(credit)) {
            throw new BadRequestException('Journal entry debits and credits must balance')
        }
    }
}
