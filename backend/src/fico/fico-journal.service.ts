import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import {
    CreateJournalEntryDto,
    ReverseJournalEntryDto,
} from './dto/fico.dto'
import { FicoAccountDeterminationService } from './fico-account-determination.service'
import { FicoFinancialPeriodService } from './financial-period.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import {
    FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS,
    FICO_JOURNAL_APPROVAL_STATUSES,
    isFicoJournalApprovalStatus,
    isValidJournalApprovalTransition,
} from './fico.constants'

export type CreateJournalResult = {
    created: boolean
    duplicate: boolean
    journalEntryId?: string
}

export type ManualJournalEntry = {
    id: string
    documentNumber: string
    postingDate: Date
    fiscalYear: number | null
    fiscalPeriodId: string | null
    totalAmount: Decimal
    currencyCode: string
    status: string
    approvalStatus: string
    description: string | null
    postedAt: Date | null
    lines: {
        id: string
        lineNumber: number
        glAccountId: string
        companyId: string
        debitAmount: Decimal
        creditAmount: Decimal
        currency: string
        description: string | null
    }[]
}

export type JournalEntryListItem = {
    id: string
    documentNumber: string | null
    postingDate: Date
    fiscalYear: number | null
    status: string
    totalAmount: Decimal
    currencyCode: string
    description: string | null
    postedAt: Date | null
    lines: { id: string; lineNumber: number }[]
    fiscalPeriod: {
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
}

export type JournalEntryDetail = {
    id: string
    companyId: string
    documentNumber: string | null
    postingDate: Date
    documentDate: Date | null
    fiscalYear: number | null
    fiscalPeriodId: string | null
    totalAmount: Decimal
    currencyCode: string
    status: string
    description: string | null
    documentType: string
    postedAt: Date | null
    postedBy: string | null
    createdAt: Date
    fiscalPeriod: {
        id: string
        fiscalYear: number
        periodNumber: number
        name: string
        status: string
    } | null
    lines: {
        id: string
        lineNumber: number
        glAccountId: string
        companyId: string
        debitAmount: Decimal
        creditAmount: Decimal
        currency: string
        description: string | null
        glAccount: {
            id: string
            accountCode: string
            accountName: string
            accountType: string
        }
    }[]
}

export type JournalReversalResult = {
    originalId: string
    originalStatus: string
    reversalId: string
    reversalDocumentNumber: string | null
    reversalPostedAt: Date | null
}

@Injectable()
export class FicoJournalService {
    private readonly logger = new Logger(FicoJournalService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly financialPeriods: FicoFinancialPeriodService,
        private readonly validation: FicoPostingValidationService,
        @Optional()
        private readonly accountDetermination?: FicoAccountDeterminationService,
    ) {}

    async createFromAccountingEvent(
        payload: MmAccountingDispatchPayload,
    ): Promise<CreateJournalResult> {
        const idempotencyKey =
            payload.idempotencyKey ??
            `${payload.eventType}:${payload.documentType}:${payload.documentId}`

        const totalAmount = new Decimal(payload.totalValue ?? 0).abs()
        const postingDate = new Date(payload.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid accounting posting date is required.')
        }

        const period = await this.financialPeriods.canPostToPeriod({
            companyId: payload.companyId,
            postingDate,
        })
        if (!period.allowed) {
            throw new BadRequestException(
                period.reason ?? 'Accounting posting is not allowed for this fiscal period.',
            )
        }

        try {
            const resolvedLines = this.accountDetermination
                ? await this.accountDetermination.resolveMmPosting(payload)
                : null
            if (resolvedLines) {
                return await this.createResolvedJournal({
                    payload,
                    idempotencyKey,
                    postingDate,
                    resolvedLines,
                })
            }
            const journal = await this.prisma.ficoJournalEntry.create({
                data: {
                    idempotencyKey,
                    sourceEventId: payload.sourceEventId ?? null,
                    sourceTransactionId:
                        typeof payload.sourceTransactionId === 'string'
                            ? payload.sourceTransactionId
                            : null,
                    mmAccountingEventId: payload.mmAccountingEventId ?? null,
                    companyId: payload.companyId,
                    postingDate,
                    totalAmount,
                    currencyCode: payload.currencyCode ?? 'USD',
                    status: 'POSTED',
                    metadata: {
                        eventType: payload.eventType,
                        accountingEffects: payload.accountingEffects,
                        documentType: payload.documentType,
                        documentId: payload.documentId,
                        lines: payload.lines,
                    },
                },
            })

            if (payload.mmAccountingEventId) {
                await this.prisma.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'CONSUMED',
                        consumedAt: new Date(),
                        journalEntryId: journal.id,
                    },
                })
            }

            return { created: true, duplicate: false, journalEntryId: journal.id }
        } catch (err: unknown) {
            if (this.isUniqueConstraintError(err)) {
                this.logger.debug(`Duplicate journal skipped: ${idempotencyKey}`)
                const existing = await this.prisma.ficoJournalEntry.findUnique({
                    where: { idempotencyKey },
                })
                return {
                    created: false,
                    duplicate: true,
                    journalEntryId: existing?.id,
                }
            }
            if (payload.mmAccountingEventId) {
                await this.prisma.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'FAILED',
                        lastError: this.errorMessage(err).slice(0, 2000),
                    },
                })
            }
            throw err
        }
    }

    private async createResolvedJournal(input: {
        payload: MmAccountingDispatchPayload
        idempotencyKey: string
        postingDate: Date
        resolvedLines: NonNullable<
            Awaited<ReturnType<FicoAccountDeterminationService['resolveMmPosting']>>
        >
    }): Promise<CreateJournalResult> {
        const { payload, idempotencyKey, postingDate, resolvedLines } = input
        const totalAmount = resolvedLines.reduce(
            (total, line) => total.plus(line.amount),
            new Decimal(0),
        )
        const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: payload.companyId,
                periodType: 'NORMAL',
                startDate: { lte: postingDate },
                endDate: { gte: postingDate },
            },
            select: { id: true, fiscalYear: true },
        })

        const journal = await this.prisma.$transaction(async (tx) => {
            // Hold a shared lock while the posting is written.  Closing takes an
            // exclusive lock on the same period, so a close cannot interleave
            // between validation and this journal commit.
            if (fiscalPeriod) {
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${fiscalPeriod.id}
                    FOR SHARE
                `
                const lockedPeriod = await tx.ficoFinancialPeriod.findUnique({
                    where: { id: fiscalPeriod.id },
                    select: { status: true },
                })
                if (
                    !lockedPeriod ||
                    !['OPEN', 'RESTRICTED'].includes(lockedPeriod.status)
                ) {
                    throw new BadRequestException(
                        'Accounting posting is not allowed because the fiscal period changed while the journal was being prepared.',
                    )
                }
                const controls = await tx.ficoPostingPeriodControl.findMany({
                    where: {
                        companyId: payload.companyId,
                        fiscalPeriodId: fiscalPeriod.id,
                        accountTypeScope: 'ALL',
                    },
                    select: { status: true },
                })
                if (controls.some((control) => ['CLOSED', 'LOCKED'].includes(control.status))) {
                    throw new BadRequestException(
                        'Accounting posting is not allowed because the fiscal period control changed while the journal was being prepared.',
                    )
                }
            }
            const created = await tx.ficoJournalEntry.create({
                data: {
                    idempotencyKey,
                    sourceEventId: payload.sourceEventId ?? null,
                    sourceTransactionId:
                        typeof payload.sourceTransactionId === 'string'
                            ? payload.sourceTransactionId
                            : null,
                    mmAccountingEventId: payload.mmAccountingEventId ?? null,
                    companyId: payload.companyId,
                    postingDate,
                    documentDate: postingDate,
                    fiscalYear: fiscalPeriod?.fiscalYear ?? null,
                    fiscalPeriodId: fiscalPeriod?.id ?? null,
                    totalAmount,
                    currencyCode: payload.currencyCode.trim().toUpperCase(),
                    status: 'DRAFT',
                    documentType: this.documentType(payload.eventType),
                    sourceModule: payload.sourceModule,
                    sourceDocumentType: payload.documentType,
                    sourceDocumentId: payload.documentId,
                    sourcePostingKey: idempotencyKey,
                    description: `Automatic ${payload.eventType} posting`,
                    metadata: {
                        eventType: payload.eventType,
                        accountingEffects: payload.accountingEffects,
                        correlationId: payload.correlationId ?? null,
                    },
                },
            })
            await tx.ficoJournalEntryLine.createMany({
                data: resolvedLines.flatMap((line, index) => [
                    {
                        journalEntryId: created.id,
                        lineNumber: index * 2 + 1,
                        glAccountId: line.debitAccountId,
                        companyId: payload.companyId,
                        debitAmount: line.amount,
                        creditAmount: new Decimal(0),
                        currency: payload.currencyCode.trim().toUpperCase(),
                        description: line.transactionKey,
                        materialId: line.materialId,
                        warehouseId: line.warehouseId ?? null,
                    },
                    {
                        journalEntryId: created.id,
                        lineNumber: index * 2 + 2,
                        glAccountId: line.creditAccountId,
                        companyId: payload.companyId,
                        debitAmount: new Decimal(0),
                        creditAmount: line.amount,
                        currency: payload.currencyCode.trim().toUpperCase(),
                        description: line.transactionKey,
                        materialId: line.materialId,
                        warehouseId: line.warehouseId ?? null,
                    },
                ]),
            })
            const posted = await tx.ficoJournalEntry.update({
                where: { id: created.id },
                data: { status: 'POSTED', postedAt: new Date() },
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: payload.companyId,
                    action: 'JOURNAL_POST',
                    entityType: 'FicoJournalEntry',
                    entityId: posted.id,
                    newValues: {
                        documentType: this.documentType(payload.eventType),
                        sourceDocumentType: payload.documentType,
                        sourceDocumentId: payload.documentId,
                        totalAmount: totalAmount.toString(),
                    },
                    metadata: {
                        idempotencyKey,
                        sourceEventId: payload.sourceEventId ?? null,
                    },
                },
            })
            if (payload.mmAccountingEventId) {
                await tx.mmAccountingEvent.update({
                    where: { id: payload.mmAccountingEventId },
                    data: {
                        status: 'CONSUMED',
                        consumedAt: new Date(),
                        journalEntryId: posted.id,
                    },
                })
            }
            return posted
        })
        return { created: true, duplicate: false, journalEntryId: journal.id }
    }

    // -----------------------------------------------------------------------
    // Manual journal entry creation (frontend posting UI)
    // -----------------------------------------------------------------------


    async createEntry(
        dto: CreateJournalEntryDto,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const postingDate = new Date(dto.postingDate)
        if (Number.isNaN(postingDate.getTime())) {
            throw new BadRequestException('A valid posting date is required.')
        }

        if (!dto.lines || dto.lines.length < 2) {
            throw new BadRequestException(
                'At least two journal lines are required.',
            )
        }

        // Validate that debits equal credits.
        const totalDebit = dto.lines.reduce(
            (sum, line) => sum + (Number(line.debitAmount) || 0),
            0,
        )
        const totalCredit = dto.lines.reduce(
            (sum, line) => sum + (Number(line.creditAmount) || 0),
            0,
        )
        if (Math.abs(totalDebit - totalCredit) > 0.0001) {
            throw new BadRequestException(
                'Journal entry is unbalanced: total debits must equal total credits.',
            )
        }

        // No line may carry both a debit and a credit, and zero-value lines are not allowed.
        for (const line of dto.lines) {
            const debit = Number(line.debitAmount) || 0
            const credit = Number(line.creditAmount) || 0
            if (debit < 0 || credit < 0) {
                throw new BadRequestException(
                    'Negative debit or credit amounts are not allowed.',
                )
            }
            if (debit > 0 && credit > 0) {
                throw new BadRequestException(
                    'A journal line cannot have both debit and credit amounts.',
                )
            }
            if (debit === 0 && credit === 0) {
                throw new BadRequestException(
                    'Zero-value journal lines are not allowed.',
                )
            }
        }

        const currencyCode =
            (dto.currencyCode ?? 'PHP').toUpperCase().trim()

        // Validate every account is active, postable, and assigned to the company.
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique(
            {
                where: { companyId: dto.companyId },
                select: { id: true, status: true, chartOfAccountsId: true },
            },
        )
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
        for (const line of dto.lines) {
            await this.validation.assertAccountPostable(
                dto.companyId,
                line.glAccountId,
                'MANUAL',
                currencyCode,
                settings.chartOfAccountsId ?? undefined,
                postingDate,
            )
        }

        // Find the current fiscal period for this posting date.
        const fiscalPeriod = await this.prisma.ficoFinancialPeriod.findFirst({
            where: {
                companyId: dto.companyId,
                periodType: 'NORMAL',
                startDate: { lte: postingDate },
                endDate: { gte: postingDate },
            },
            select: { id: true, fiscalYear: true, status: true },
        })

        if (!fiscalPeriod) {
            throw new BadRequestException(
                'No open financial period covers the posting date. Generate fiscal periods for this fiscal year first.',
            )
        }

        if (fiscalPeriod.status !== 'OPEN' && fiscalPeriod.status !== 'RESTRICTED') {
            throw new BadRequestException(
                `The financial period for ${postingDate.toISOString().slice(0, 10)} is ${fiscalPeriod.status.toLowerCase()}. Open or restrict the period before posting.`,
            )
        }

        const requiresApproval = dto.requiresApproval ?? true
        const autoPost = dto.autoPost ?? false
        const canPostImmediately = autoPost && !requiresApproval

        const idempotencyKey = `MANUAL:${dto.companyId}:${postingDate.toISOString().slice(0, 10)}:${Date.now()}`

        const created = await this.prisma.$transaction(async (tx) => {
            // Lock the period row to prevent a close/restrict interleaving between
            // validation and this commit.
            if (fiscalPeriod) {
                await tx.$queryRaw`
                    SELECT id FROM fico_financial_periods
                    WHERE id = ${fiscalPeriod.id}
                    FOR SHARE
                `
                const locked = await tx.ficoFinancialPeriod.findUnique({
                    where: { id: fiscalPeriod.id },
                    select: { status: true },
                })
                if (
                    !locked ||
                    !['OPEN', 'RESTRICTED'].includes(locked.status)
                ) {
                    throw new BadRequestException(
                        'The fiscal period changed while the journal was being prepared. Please retry.',
                    )
                }
            }

            // Increment the document sequence for this company + fiscal year.
            const prefix =
                (await this.settingsPrefix(dto.companyId)) ??
                'JE'

            const sequence = await tx.ficoDocumentSequence.upsert({
                where: {
                    companyId_documentType_fiscalYear: {
                        companyId: dto.companyId,
                        documentType: 'JOURNAL',
                        fiscalYear: fiscalPeriod.fiscalYear,
                    },
                },
                create: {
                    companyId: dto.companyId,
                    documentType: 'JOURNAL',
                    fiscalYear: fiscalPeriod.fiscalYear,
                    prefix,
                    nextNumber: 1,
                    padding: 6,
                },
                update: {
                    nextNumber: { increment: 1 },
                },
            })

            const documentNumber = `${sequence.prefix}${String(sequence.nextNumber).padStart(sequence.padding, '0')}`

            const now = new Date()
            const isDraft = !canPostImmediately

            const journal = await tx.ficoJournalEntry.create({
                data: {
                    idempotencyKey,
                    companyId: dto.companyId,
                    postingDate,
                    documentDate: postingDate,
                    fiscalYear: fiscalPeriod.fiscalYear,
                    fiscalPeriodId: fiscalPeriod.id,
                    totalAmount: new Decimal(totalDebit),
                    currencyCode,
                    status: canPostImmediately ? 'POSTED' : 'DRAFT',
                    approvalStatus: canPostImmediately
                        ? 'POSTED'
                        : 'DRAFT',
                    requiresApproval,
                    documentType: 'JOURNAL',
                    documentNumber,
                    description: dto.description ?? null,
                    postedAt: canPostImmediately ? now : null,
                    postedBy: canPostImmediately ? user.id ?? null : null,
                    preparedBy: isDraft ? user.id ?? null : null,
                    preparedAt: isDraft ? now : null,
                    createdBy: user.id ?? null,
                    lines: {
                        create: dto.lines.map((line, index) => ({
                            lineNumber: index + 1,
                            glAccountId: line.glAccountId,
                            companyId: dto.companyId,
                            debitAmount: new Decimal(
                                Number(line.debitAmount) || 0,
                            ),
                            creditAmount: new Decimal(
                                Number(line.creditAmount) || 0,
                            ),
                            currency: currencyCode,
                            description: line.description ?? null,
                        })),
                    },
                },
                include: {
                    lines: true,
                },
            })

            if (canPostImmediately) {
                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: dto.companyId,
                        action: 'JOURNAL_POST',
                        entityType: 'FicoJournalEntry',
                        entityId: journal.id,
                        newValues: {
                            documentNumber,
                            documentType: 'JOURNAL',
                            postingDate: postingDate.toISOString().slice(0, 10),
                            totalAmount: totalDebit.toString(),
                            currencyCode,
                            lineCount: dto.lines.length,
                            postedBy: user.id ?? null,
                        },
                        metadata: {
                            idempotencyKey,
                            source: 'MANUAL',
                        },
                    },
                })
            }

            return journal
        })

        return {
            id: created.id,
            documentNumber: created.documentNumber ?? '',
            postingDate: created.postingDate,
            fiscalYear: created.fiscalYear,
            fiscalPeriodId: created.fiscalPeriodId,
            totalAmount: created.totalAmount,
            currencyCode: created.currencyCode,
            status: created.status,
            approvalStatus: created.approvalStatus,
            description: created.description,
            postedAt: created.postedAt,
            lines: created.lines,
        }
    }

    /** Submit a draft journal entry for approval (DRAFT → PENDING_APPROVAL). */
    async submitForApproval(
        id: string,
        user: { id?: string; name?: string | null },
        reason?: string,
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                status: true,
                approvalStatus: true,
                requiresApproval: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isFicoJournalApprovalStatus(journal.approvalStatus)) {
            throw new BadRequestException(
                'Journal entry has an invalid approval status.',
            )
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'PENDING_APPROVAL')) {
            throw new BadRequestException(
                `Cannot submit a journal entry in ${journal.approvalStatus} status for approval.`,
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'PENDING_APPROVAL',
                preparedBy: user.id ?? null,
                preparedAt: new Date(),
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.SUBMIT,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: { approvalStatus: 'PENDING_APPROVAL', reason: reason ?? null },
                metadata: { source: 'MANUAL', submittedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Approve a pending journal entry (PENDING_APPROVAL → APPROVED). */
    async approve(
        id: string,
        user: { id?: string; name?: string | null },
        reason?: string,
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                approvalStatus: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'APPROVED')) {
            throw new BadRequestException(
                `Cannot approve a journal entry in ${journal.approvalStatus} status.`,
            )
        }

        const now = new Date()
        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'APPROVED',
                reviewedBy: user.id ?? null,
                reviewedAt: now,
                approvedBy: user.id ?? null,
                approvedAt: now,
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.APPROVE,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: {
                    approvalStatus: 'APPROVED',
                    approvedBy: user.id ?? null,
                    reason: reason ?? null,
                },
                metadata: { source: 'MANUAL', approvedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Reject a pending journal entry (PENDING_APPROVAL → REJECTED). */
    async reject(
        id: string,
        user: { id?: string; name?: string | null },
        reason: string,
    ): Promise<ManualJournalEntry> {
        if (!reason || reason.trim().length < 3) {
            throw new BadRequestException(
                'A rejection reason of at least 3 characters is required.',
            )
        }

        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                approvalStatus: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'REJECTED')) {
            throw new BadRequestException(
                `Cannot reject a journal entry in ${journal.approvalStatus} status.`,
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'REJECTED',
                reviewedBy: user.id ?? null,
                reviewedAt: new Date(),
                rejectionReason: reason.trim(),
                rejectedAt: new Date(),
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.REJECT,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: {
                    approvalStatus: 'REJECTED',
                    rejectionReason: reason.trim(),
                    rejectedBy: user.id ?? null,
                },
                metadata: { source: 'MANUAL', rejectedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Resubmit a rejected journal entry (REJECTED → PENDING_APPROVAL). */
    async resubmit(
        id: string,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            select: {
                id: true,
                companyId: true,
                approvalStatus: true,
            },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'PENDING_APPROVAL')) {
            throw new BadRequestException(
                `Cannot resubmit a journal entry in ${journal.approvalStatus} status.`,
            )
        }

        const updated = await this.prisma.ficoJournalEntry.update({
            where: { id },
            data: {
                approvalStatus: 'PENDING_APPROVAL',
                rejectionReason: null,
                rejectedAt: null,
                preparedBy: user.id ?? null,
                preparedAt: new Date(),
            },
            include: { lines: true },
        })

        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: journal.companyId,
                action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.RESUBMIT,
                entityType: 'FicoJournalEntry',
                entityId: id,
                previousValues: { approvalStatus: journal.approvalStatus },
                newValues: { approvalStatus: 'PENDING_APPROVAL' },
                metadata: { source: 'MANUAL', resubmittedBy: user.id ?? null },
            },
        })

        return this.toManualJournalEntry(updated)
    }

    /** Post an approved journal entry to the GL (APPROVED → POSTED). */
    async postApproved(
        id: string,
        user: { id?: string; name?: string | null },
    ): Promise<ManualJournalEntry> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: { lines: true },
        })
        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }
        if (!isValidJournalApprovalTransition(journal.approvalStatus, 'POSTED')) {
            throw new BadRequestException(
                `Cannot post a journal entry in ${journal.approvalStatus} status. Approve it first.`,
            )
        }
        if (journal.status === 'POSTED') {
            throw new BadRequestException('This journal entry has already been posted.')
        }

        const now = new Date()
        const updated = await this.prisma.$transaction(async (tx) => {
            const posted = await tx.ficoJournalEntry.update({
                where: { id },
                data: {
                    status: 'POSTED',
                    approvalStatus: 'POSTED',
                    postedAt: now,
                    postedBy: user.id ?? null,
                },
                include: { lines: true },
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: journal.companyId,
                    action: FICO_JOURNAL_APPROVAL_AUDIT_ACTIONS.POST,
                    entityType: 'FicoJournalEntry',
                    entityId: id,
                    previousValues: {
                        approvalStatus: journal.approvalStatus,
                        status: journal.status,
                    },
                    newValues: {
                        approvalStatus: 'POSTED',
                        status: 'POSTED',
                        documentNumber: journal.documentNumber,
                        postingDate: journal.postingDate.toISOString().slice(0, 10),
                        totalAmount: journal.totalAmount.toString(),
                        currencyCode: journal.currencyCode,
                        postedBy: user.id ?? null,
                    },
                    metadata: { source: 'MANUAL', postedBy: user.id ?? null },
                },
            })

            return posted
        })

        return this.toManualJournalEntry(updated)
    }

    private toManualJournalEntry(journal: {
        id: string
        documentNumber: string | null
        postingDate: Date
        fiscalYear: number | null
        fiscalPeriodId: string | null
        totalAmount: Decimal
        currencyCode: string
        status: string
        approvalStatus: string
        description: string | null
        postedAt: Date | null
        lines: ManualJournalEntry['lines']
    }): ManualJournalEntry {
        return {
            id: journal.id,
            documentNumber: journal.documentNumber ?? '',
            postingDate: journal.postingDate,
            fiscalYear: journal.fiscalYear,
            fiscalPeriodId: journal.fiscalPeriodId,
            totalAmount: journal.totalAmount,
            currencyCode: journal.currencyCode,
            status: journal.status,
            approvalStatus: journal.approvalStatus,
            description: journal.description,
            postedAt: journal.postedAt,
            lines: journal.lines,
        }
    }


    async getEntry(id: string): Promise<JournalEntryDetail> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: {
                lines: {
                    orderBy: { lineNumber: 'asc' },
                    include: {
                        glAccount: {
                            select: {
                                id: true,
                                accountCode: true,
                                accountName: true,
                                accountType: true,
                            },
                        },
                    },
                },
                fiscalPeriod: {
                    select: {
                        id: true,
                        fiscalYear: true,
                        periodNumber: true,
                        name: true,
                        status: true,
                    },
                },
            },
        })

        if (!journal) {
            throw new NotFoundException('Journal entry not found.')
        }

        return journal
    }

    async listEntries(
        query: {
            companyId: string
            status?: string
            dateFrom?: string
            dateTo?: string
            page: number
            pageSize: number
        },
    ): Promise<{
        items: JournalEntryListItem[]
        total: number
        page: number
        pageSize: number
        totalPages: number
    }> {
        const page = Math.max(1, query.page)
        const pageSize = Math.min(100, Math.max(1, query.pageSize))
        const where: {
            companyId: string
            status?: string
            postingDate?: { gte?: Date; lte?: Date }
        } = { companyId: query.companyId }

        if (query.status) {
            where.status = query.status
        }
        if (query.dateFrom || query.dateTo) {
            where.postingDate = {}
            if (query.dateFrom) {
                where.postingDate.gte = new Date(query.dateFrom)
            }
            if (query.dateTo) {
                where.postingDate.lte = new Date(query.dateTo)
            }
        }

        const [items, total] = await Promise.all([
            this.prisma.ficoJournalEntry.findMany({
                where,
                orderBy: [{ postedAt: 'desc' }, { postingDate: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    lines: {
                        select: {
                            id: true,
                            lineNumber: true,
                        },
                    },
                    fiscalPeriod: {
                        select: {
                            fiscalYear: true,
                            periodNumber: true,
                            name: true,
                            status: true,
                        },
                    },
                },
            }),
            this.prisma.ficoJournalEntry.count({ where }),
        ])

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        }
    }

    async reverseEntry(
        id: string,
        dto: ReverseJournalEntryDto,
        user: { id?: string; name?: string | null },
    ): Promise<JournalReversalResult> {
        const original = await this.prisma.ficoJournalEntry.findUnique({
            where: { id },
            include: {
                lines: {
                    orderBy: { lineNumber: 'asc' },
                },
                reversalOf: true,
            },
        })

        if (!original) {
            throw new NotFoundException('Journal entry not found.')
        }

        if (original.status === 'REVERSED') {
            throw new BadRequestException('This journal entry has already been reversed.')
        }

        if (original.status !== 'POSTED') {
            throw new BadRequestException(
                `Only posted journal entries can be reversed. This entry has status ${original.status}.`,
            )
        }

        if (!dto.reason || dto.reason.trim().length < 3) {
            throw new BadRequestException('A reversal reason of at least 3 characters is required.')
        }

        const reversed = await this.prisma.$transaction(async (tx) => {
            // Lock the original to prevent concurrent reversal.
            await tx.$queryRaw`
                SELECT id FROM fico_journal_entries
                WHERE id = ${original.id}
                FOR SHARE
            `

            const reversal = await tx.ficoJournalEntry.create({
                data: {
                    idempotencyKey: `REVERSE:${original.id}:${Date.now()}`,
                    companyId: original.companyId,
                    postingDate: new Date(),
                    documentDate: new Date(),
                    fiscalYear: original.fiscalYear,
                    fiscalPeriodId: original.fiscalPeriodId,
                    totalAmount: original.totalAmount,
                    currencyCode: original.currencyCode,
                    status: 'POSTED',
                    documentType: 'JOURNAL_REVERSAL',
                    description: `Reversal of ${original.documentNumber ?? original.id} — ${dto.reason.trim()}`,
                    reversalOfId: original.id,
                    postedAt: new Date(),
                    postedBy: user.id ?? null,
                    createdBy: user.id ?? null,
                    lines: {
                        create: original.lines.map((line) => ({
                            lineNumber: line.lineNumber,
                            glAccountId: line.glAccountId,
                            companyId: original.companyId,
                            debitAmount: new Decimal(line.creditAmount.toString()),
                            creditAmount: new Decimal(line.debitAmount.toString()),
                            currency: original.currencyCode,
                            description: `Reverse of line ${line.lineNumber}`,
                        })),
                    },
                },
            })

            await tx.ficoJournalEntry.update({
                where: { id: original.id },
                data: { status: 'REVERSED' },
            })

            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: original.companyId,
                    action: 'JOURNAL_REVERSE',
                    entityType: 'FicoJournalEntry',
                    entityId: reversal.id,
                    previousValues: {
                        journalEntryId: original.id,
                        documentNumber: original.documentNumber,
                        status: original.status,
                    },
                    newValues: {
                        documentNumber: reversal.documentNumber,
                        reversedJournalEntryId: original.id,
                        reason: dto.reason.trim(),
                    },
                    metadata: {
                        idempotencyKey: `REVERSE:${original.id}:${Date.now()}`,
                    },
                },
            })

            return { original, reversal }
        })

        return {
            originalId: reversed.original.id,
            originalStatus: reversed.original.status,
            reversalId: reversed.reversal.id,
            reversalDocumentNumber: reversed.reversal.documentNumber,
            reversalPostedAt: reversed.reversal.postedAt,
        }
    }

    private async settingsPrefix(companyId: string): Promise<string | null> {
        try {
            const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId },
                select: { documentNumberPrefix: true },
            })
            return settings?.documentNumberPrefix ?? null
        } catch {
            return null
        }
    }

    private documentType(eventType: string) {
        if (eventType === 'GoodsReceiptPosted') return 'MM_GR'
        if (eventType === 'GoodsIssuePosted') return 'MM_GI'
        return 'MM_ADJUSTMENT'
    }

    private isUniqueConstraintError(error: unknown): error is { code: string } {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: unknown }).code === 'P2002'
        )
    }

    private errorMessage(error: unknown) {
        return error instanceof Error ? error.message : String(error)
    }
}
