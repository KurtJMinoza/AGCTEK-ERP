import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoJournalService } from './fico-journal.service'

const INCOME_EXPENSE = new Set(['REVENUE', 'EXPENSE'])

@Injectable()
export class FicoOpeningBalanceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly journal: FicoJournalService,
    ) {}

    async list(companyId: string, user: AuthRequestUser) {
        await this.access.assertAccess(user, companyId)
        return this.prisma.ficoOpeningBalanceBatch.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { lines: true } } },
        })
    }

    async get(batchId: string, user: AuthRequestUser) {
        const batch = await this.getBatch(batchId, user)
        const lines = await this.prisma.ficoOpeningBalanceLine.findMany({
            where: { batchId },
            orderBy: { lineNumber: 'asc' },
            include: {
                glAccount: { select: { accountCode: true, accountName: true } },
            },
        })
        return { ...batch, lines }
    }

    async create(
        user: AuthRequestUser,
        input: {
            companyId: string
            batchReference: string
            migrationDate: string
            postingDate: string
            fiscalYear: number
            currencyCode: string
            sourceSystem?: string
            description?: string
        },
    ) {
        await this.access.assertAccess(user, input.companyId)
        const duplicate = await this.prisma.ficoOpeningBalanceBatch.findUnique({
            where: {
                companyId_batchReference: {
                    companyId: input.companyId,
                    batchReference: input.batchReference,
                },
            },
        })
        if (duplicate) {
            throw new BadRequestException('Batch reference already exists.')
        }
        return this.prisma.ficoOpeningBalanceBatch.create({
            data: {
                ...input,
                migrationDate: new Date(input.migrationDate),
                postingDate: new Date(input.postingDate),
                createdBy: user.id ?? null,
                status: 'DRAFT',
            },
        })
    }

    async importLines(
        user: AuthRequestUser,
        batchId: string,
        rows: Array<{
            accountCode: string
            debitAmount?: number
            creditAmount?: number
            accountName?: string
        }>,
    ) {
        const batch = await this.requireDraftBatch(batchId, user)
        const settings =
            await this.prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId: batch.companyId },
                select: { chartOfAccountsId: true },
            })
        if (!settings?.chartOfAccountsId) {
            throw new BadRequestException('Company chart of accounts is not configured.')
        }

        const codes = rows.map((r) => r.accountCode.trim())
        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: { in: codes },
                status: 'ACTIVE',
            },
            select: {
                id: true,
                accountCode: true,
                accountType: true,
                isPostingAccount: true,
            },
        })
        const byCode = new Map(accounts.map((a) => [a.accountCode, a]))
        const errors: string[] = []
        const lines: Array<{
            lineNumber: number
            glAccountId: string
            debitAmount: Prisma.Decimal
            creditAmount: Prisma.Decimal
            importCode: string
            importName?: string
        }> = []

        rows.forEach((row, index) => {
            const acct = byCode.get(row.accountCode.trim())
            if (!acct) {
                errors.push(`Line ${index + 1}: unknown account ${row.accountCode}`)
                return
            }
            if (!acct.isPostingAccount) {
                errors.push(`Line ${index + 1}: ${row.accountCode} is not a posting account.`)
            }
            if (INCOME_EXPENSE.has(acct.accountType)) {
                errors.push(
                    `Line ${index + 1}: ${row.accountCode} is P&L; opening migration must use balance sheet accounts only.`,
                )
            }
            const debit = new Prisma.Decimal(row.debitAmount ?? 0)
            const credit = new Prisma.Decimal(row.creditAmount ?? 0)
            if (debit.lt(0) || credit.lt(0)) {
                errors.push(`Line ${index + 1}: amounts must be non-negative.`)
            }
            lines.push({
                lineNumber: index + 1,
                glAccountId: acct.id,
                debitAmount: debit,
                creditAmount: credit,
                importCode: row.accountCode,
                importName: row.accountName,
            })
        })

        const totalDebit = lines.reduce(
            (s, l) => s.plus(l.debitAmount),
            new Prisma.Decimal(0),
        )
        const totalCredit = lines.reduce(
            (s, l) => s.plus(l.creditAmount),
            new Prisma.Decimal(0),
        )
        if (!totalDebit.eq(totalCredit)) {
            errors.push(
                `Batch is unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}.`,
            )
        }

        if (errors.length) {
            return { valid: false, errors, lines: [] }
        }

        await this.prisma.$transaction([
            this.prisma.ficoOpeningBalanceLine.deleteMany({ where: { batchId } }),
            this.prisma.ficoOpeningBalanceLine.createMany({
                data: lines.map((line) => ({ batchId, ...line })),
            }),
        ])

        return { valid: true, errors: [], lines, totalDebit: totalDebit.toString(), totalCredit: totalCredit.toString() }
    }

    async submit(user: AuthRequestUser, batchId: string) {
        const batch = await this.requireDraftBatch(batchId, user)
        const lineCount = await this.prisma.ficoOpeningBalanceLine.count({
            where: { batchId },
        })
        if (lineCount < 2) {
            throw new BadRequestException('Batch requires at least two lines.')
        }
        return this.prisma.ficoOpeningBalanceBatch.update({
            where: { id: batchId },
            data: { status: 'SUBMITTED', submittedAt: new Date() },
        })
    }

    async approve(user: AuthRequestUser, batchId: string) {
        const batch = await this.getBatch(batchId, user)
        if (batch.status !== 'SUBMITTED') {
            throw new BadRequestException('Only submitted batches can be approved.')
        }
        return this.prisma.ficoOpeningBalanceBatch.update({
            where: { id: batchId },
            data: {
                status: 'APPROVED',
                approvedBy: user.id ?? null,
                approvedAt: new Date(),
            },
        })
    }

    async post(user: AuthRequestUser, batchId: string) {
        const batch = await this.getBatch(batchId, user)
        if (batch.status !== 'APPROVED') {
            throw new BadRequestException('Only approved batches can be posted.')
        }
        const lines = await this.prisma.ficoOpeningBalanceLine.findMany({
            where: { batchId },
            orderBy: { lineNumber: 'asc' },
        })
        if (lines.length < 2) {
            throw new BadRequestException('Batch has no lines.')
        }

        const idempotencyKey = `OPENING_BALANCE:${batch.companyId}:${batch.batchReference}`
        const existing = await this.prisma.ficoJournalEntry.findUnique({
            where: { idempotencyKey },
        })
        if (existing) {
            throw new BadRequestException('Opening balance journal already posted.')
        }

        const result = await this.journal.postAutomaticJournal({
            companyId: batch.companyId,
            documentType: 'OPENING_BALANCE',
            documentDate: batch.postingDate,
            postingDate: batch.postingDate,
            currencyCode: batch.currencyCode,
            sourceModule: 'FICO',
            sourceDocumentType: 'OPENING_BALANCE_BATCH',
            sourceDocumentId: batch.id,
            idempotencyKey,
            description: `Opening balance migration · ${batch.batchReference}`,
            lines: lines.map((line) => ({
                glAccountId: line.glAccountId,
                debit: line.debitAmount,
                credit: line.creditAmount,
                description: `OB ${batch.batchReference} L${line.lineNumber}`,
            })),
            postImmediately: true,
            postingSource: 'AUTOMATIC',
        })

        return this.prisma.ficoOpeningBalanceBatch.update({
            where: { id: batchId },
            data: {
                status: 'POSTED',
                journalEntryId: result.journalEntryId,
                postedBy: user.id ?? null,
                postedAt: new Date(),
            },
        })
    }

    async lock(user: AuthRequestUser, batchId: string) {
        const batch = await this.getBatch(batchId, user)
        if (batch.status !== 'POSTED') {
            throw new BadRequestException('Only posted batches can be locked.')
        }
        return this.prisma.ficoOpeningBalanceBatch.update({
            where: { id: batchId },
            data: { status: 'LOCKED', lockedAt: new Date() },
        })
    }

    templateCsv(): string {
        return 'account_code,account_name,debit,credit\n1000,Cash on hand,10000.00,0.00\n3000,Share capital,0.00,10000.00\n'
    }

    private async requireDraftBatch(batchId: string, user: AuthRequestUser) {
        const batch = await this.getBatch(batchId, user)
        if (batch.status !== 'DRAFT') {
            throw new BadRequestException('Only draft batches can be edited.')
        }
        return batch
    }

    private async getBatch(batchId: string, user: AuthRequestUser) {
        const batch = await this.prisma.ficoOpeningBalanceBatch.findUnique({
            where: { id: batchId },
        })
        if (!batch) throw new NotFoundException('Opening balance batch not found.')
        await this.access.assertAccess(user, batch.companyId)
        return batch
    }
}