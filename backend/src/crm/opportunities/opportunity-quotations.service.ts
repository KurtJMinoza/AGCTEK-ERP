import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PermissionsService } from '../../permissions/permissions.service'
import { QuotationService } from '../../sd/quotation.service'
import { CreateOpportunityQuotationDto } from './dto/opportunity.dto'
import { lockOpportunity } from './opportunities.service'

const QUOTABLE_STAGES: ReadonlySet<string> = new Set(['PROPOSAL', 'NEGOTIATION'])

/**
 * Opportunity → SD quotation. CRM checks the opportunity (stage, no SD order yet) and passes its
 * customer; SD owns the quotation. Runs under the opportunity row lock shared with Closed Won /
 * Lost and customer changes.
 */
@Injectable()
export class CrmOpportunityQuotationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly quotations: QuotationService,
        private readonly permissions: PermissionsService,
    ) {}

    async list(id: string) {
        await this.findRow(id)
        return this.quotations.listForOpportunity(id)
    }

    async create(id: string, dto: CreateOpportunityQuotationDto, user: { id: string; role: string }) {
        await this.permissions.assertPermission({ role: user.role }, 'sd.quotations', 'create')
        return this.prisma.$transaction(async (tx) => {
            await lockOpportunity(tx, id)
            const opp = await tx.crmOpportunity.findUniqueOrThrow({ where: { id } })
            if (!QUOTABLE_STAGES.has(opp.stage)) {
                throw new ConflictException(
                    `Quotations are created in the Proposal or Negotiation stage (this opportunity is ${opp.stage})`,
                )
            }
            if (opp.sdSalesOrderId) {
                throw new ConflictException(
                    'This opportunity already has its SD sales order; it cannot be quoted again',
                )
            }
            return this.quotations.create(
                {
                    crmOpportunityId: id,
                    customerId: opp.customerId,
                    lines: dto.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
                    notes: dto.notes,
                    createdBy: user.id,
                },
                { tx },
            )
        })
    }

    private async findRow(id: string) {
        const row = await this.prisma.crmOpportunity.findUnique({ where: { id }, select: { id: true } })
        if (!row) throw new NotFoundException('Opportunity not found')
        return row
    }
}
