import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoTaxReconciliationQueryDto } from './dto/fico-treasury.dto'
import { FicoCompanyAccessService } from './fico-company-access.service'

type Actor = AuthRequestUser | undefined

function day(value: Date | string) {
    return new Date(value)
}

function money(v: Decimal | null | undefined) {
    return new Decimal(v?.toString() ?? 0)
}

@Injectable()
export class FicoTaxReconciliationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    async reconcile(query: FicoTaxReconciliationQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const fromDate = query.fromDate ? day(query.fromDate) : null
        const toDate = query.toDate ? day(query.toDate) : null

        const snapshotWhere = {
            companyId: query.companyId,
            ...(fromDate && toDate
                ? { postingDate: { gte: fromDate, lte: toDate } }
                : {}),
        }

        const snapshots = await this.prisma.ficoTaxPostingSnapshot.groupBy({
            by: ['taxCodeId', 'taxType'],
            where: snapshotWhere,
            _sum: {
                taxAmount: true,
                recoverableTax: true,
                nonRecoverableTax: true,
                withholdingPayable: true,
                withholdingReceivable: true,
            },
        })

        const taxCodes = await this.prisma.ficoTaxCode.findMany({
            where: {
                id: { in: snapshots.map((row) => row.taxCodeId) },
            },
            select: {
                id: true,
                code: true,
                name: true,
                taxType: true,
                outputTaxGlAccountId: true,
                inputTaxGlAccountId: true,
                withholdingPayableGlAccountId: true,
                withholdingReceivableGlAccountId: true,
            },
        })
        const taxCodeMap = new Map(taxCodes.map((row) => [row.id, row]))

        const glAccountIds = [
            ...new Set(
                taxCodes.flatMap((row) =>
                    [
                        row.outputTaxGlAccountId,
                        row.inputTaxGlAccountId,
                        row.withholdingPayableGlAccountId,
                        row.withholdingReceivableGlAccountId,
                    ].filter(Boolean),
                ),
            ),
        ] as string[]

        const journalFilter =
            fromDate && toDate
                ? {
                      postingDate: { gte: fromDate, lte: toDate },
                      status: 'POSTED' as const,
                  }
                : { status: 'POSTED' as const }

        const glMovements =
            glAccountIds.length > 0
                ? await this.prisma.ficoJournalEntryLine.groupBy({
                      by: ['glAccountId'],
                      where: {
                          companyId: query.companyId,
                          glAccountId: { in: glAccountIds },
                          journalEntry: journalFilter,
                      },
                      _sum: {
                          debitAmount: true,
                          creditAmount: true,
                      },
                  })
                : []

        const glBalanceById = new Map(
            glMovements.map((row) => [
                row.glAccountId,
                money(row._sum.creditAmount).minus(money(row._sum.debitAmount)),
            ]),
        )

        let outputTaxSnapshots = new Decimal(0)
        let inputTaxSnapshots = new Decimal(0)
        let withholdingPayableSnapshots = new Decimal(0)
        let withholdingReceivableSnapshots = new Decimal(0)

        const rows = snapshots.map((row) => {
            const code = taxCodeMap.get(row.taxCodeId)
            const snapshotTax = money(row._sum.taxAmount)
            const glAccountId =
                code?.outputTaxGlAccountId ??
                code?.inputTaxGlAccountId ??
                code?.withholdingPayableGlAccountId ??
                code?.withholdingReceivableGlAccountId
            const glBalance = glAccountId
                ? glBalanceById.get(glAccountId) ?? new Decimal(0)
                : new Decimal(0)
            const variance = snapshotTax.minus(glBalance)

            if (row.taxType.includes('OUTPUT') || code?.taxType === 'VAT') {
                outputTaxSnapshots = outputTaxSnapshots.plus(snapshotTax)
            }
            if (row.taxType.includes('INPUT') || code?.taxType === 'PERCENTAGE_TAX') {
                inputTaxSnapshots = inputTaxSnapshots.plus(snapshotTax)
            }
            withholdingPayableSnapshots = withholdingPayableSnapshots.plus(
                money(row._sum.withholdingPayable),
            )
            withholdingReceivableSnapshots = withholdingReceivableSnapshots.plus(
                money(row._sum.withholdingReceivable),
            )

            return {
                taxCodeId: row.taxCodeId,
                taxCode: code?.code ?? '—',
                taxName: code?.name ?? '—',
                taxType: row.taxType,
                snapshotTaxAmount: snapshotTax.toString(),
                glBalance: glBalance.toString(),
                variance: variance.toString(),
                reconciled: variance.abs().lte(new Decimal('0.01')),
            }
        })

        return {
            companyId: query.companyId,
            fromDate: query.fromDate ?? null,
            toDate: query.toDate ?? null,
            summary: {
                outputTaxFromSnapshots: outputTaxSnapshots.toString(),
                inputTaxFromSnapshots: inputTaxSnapshots.toString(),
                withholdingPayableFromSnapshots: withholdingPayableSnapshots.toString(),
                withholdingReceivableFromSnapshots: withholdingReceivableSnapshots.toString(),
            },
            rows,
        }
    }
}