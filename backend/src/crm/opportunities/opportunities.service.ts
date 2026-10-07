import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { QuotationService } from '../../sd/quotation.service'
import { CrmActivitiesService, overdueOpportunityWhere } from '../activities/activities.service'
import { NO_NEXT_ACTIVITY } from '../activities/activity-status'
import {
    assertCustomerExists,
    assertUserExists,
    CRM_CUSTOMER_SUMMARY_SELECT,
    CRM_USER_SUMMARY_SELECT,
    type CrmPrismaClient,
} from '../crm-references'
import {
    CreateOpportunityDto,
    ListOpportunitiesQueryDto,
    OPPORTUNITY_OPEN_STAGES,
    OpportunityPipelineQueryDto,
    OpportunityStage,
    UpdateOpportunityDto,
} from './dto/opportunity.dto'
import {
    isForwardMove,
    LOST_REASONS,
    LOST_REASONS_REQUIRING_NOTES,
    OPPORTUNITY_STAGE_META,
    stageMeta,
    unmetStageRequirements,
} from './opportunity-stages'

const DEFAULT_PAGE_SIZE = 20

const OPEN_STAGES: ReadonlySet<string> = new Set(OPPORTUNITY_OPEN_STAGES)

export const opportunityInclude = {
    customer: { select: CRM_CUSTOMER_SUMMARY_SELECT },
    lead: { select: { id: true, name: true, status: true, source: true } },
} satisfies Prisma.CrmOpportunityInclude

type OpportunityRow = Prisma.CrmOpportunityGetPayload<{ include: typeof opportunityInclude }>

/** CRM money contract: Decimal amounts are returned as fixed 2-decimal strings (or null). */
export function serializeOpportunity<T extends { amount: Decimal | null }>(row: T) {
    return { ...row, amount: row.amount === null ? null : row.amount.toFixed(2) }
}

/** Stage fields written when an opportunity closes as won. */
export function wonUpdateData(userId: string) {
    return {
        stage: 'CLOSED_WON',
        closedAt: new Date(),
        probability: stageMeta('CLOSED_WON').defaultProbability,
        updatedBy: userId,
    } satisfies Prisma.CrmOpportunityUncheckedUpdateManyInput
}

/**
 * Row lock for the rest of the transaction. Serializes quotation creation, Closed Won / Lost and
 * customer changes, so none of them acts on a quotation state another one is changing.
 */
export async function lockOpportunity(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "crm_opportunities" WHERE "id" = ${id} FOR UPDATE`
    if (!rows.length) throw new NotFoundException('Opportunity not found')
}

/** 409 for an action that an active quotation blocks; `message` tells the rep what to do. */
export function activeQuotationBlocks(
    quote: { id: string; quotationNumber: string; revision: number; status: string },
    message: string,
) {
    return new ConflictException({
        code: 'QUOTATION_ACTIVE',
        message: `Quotation ${quote.quotationNumber} rev ${quote.revision} is ${quote.status}; ${message}`,
        quotationId: quote.id,
    })
}

export function isOpenStage(stage: string) {
    return OPEN_STAGES.has(stage)
}

/**
 * Any stage may move into an open stage (including reopening CLOSED_WON / CLOSED_LOST);
 * only open stages may close. Closed → closed must go through an open stage.
 */
export function canMoveStage(from: string, to: OpportunityStage) {
    if (from === to) return true
    if (isOpenStage(to)) return true
    return isOpenStage(from)
}

const stageLabel = (stage: string) =>
    stage
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')

const joinRequirements = (items: string[]) =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

type PipelineRow = {
    stage: string
    currency: string
    count: number
    amount: Prisma.Decimal | null
    weighted: Prisma.Decimal | null
}

const money = (value: Prisma.Decimal | null) => (value === null ? '0.00' : value.toFixed(2))

@Injectable()
export class CrmOpportunitiesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly activities: CrmActivitiesService,
        private readonly quotations: QuotationService,
    ) {}

    async list(query: ListOpportunitiesQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
        const search = query.search?.trim()
        const where: Prisma.CrmOpportunityWhereInput = {
            ...(query.stage ? { stage: query.stage } : {}),
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
            ...(query.leadId ? { leadId: query.leadId } : {}),
            ...(query.lostReason ? { lostReason: query.lostReason } : {}),
            ...(query.closedFrom ? { closedAt: { gte: query.closedFrom } } : {}),
            ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
            ...(query.activity === 'OVERDUE' ? { AND: [overdueOpportunityWhere(new Date())] } : {}),
        }

        const [rows, total] = await this.prisma.$transaction([
            this.prisma.crmOpportunity.findMany({
                where,
                include: opportunityInclude,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.crmOpportunity.count({ where }),
        ])
        const data = await this.activities.withNextActivity(rows.map(serializeOpportunity))
        return { data, total, page, pageSize }
    }

    stages() {
        return {
            stages: OPPORTUNITY_STAGE_META,
            lostReasons: LOST_REASONS,
            lostReasonsRequiringNotes: [...LOST_REASONS_REQUIRING_NOTES],
        }
    }

    /**
     * Open pipeline per stage and currency (amounts are never summed across currencies).
     * Weighted = amount × probability; a null probability falls back to the stage default.
     */
    async pipeline(query: OpportunityPipelineQueryDto) {
        const openMeta = OPPORTUNITY_STAGE_META.filter((m) => isOpenStage(m.stage))
        const conditions = [
            Prisma.sql`"stage" IN (${Prisma.join(openMeta.map((m) => m.stage))})`,
        ]
        const search = query.search?.trim()
        if (search) conditions.push(Prisma.sql`"name" ILIKE ${`%${escapeLike(search)}%`}`)
        if (query.customerId) conditions.push(Prisma.sql`"customerId" = ${query.customerId}`)
        if (query.assignedTo) conditions.push(Prisma.sql`"assignedTo" = ${query.assignedTo}`)
        const defaultProbability = Prisma.sql`CASE "stage" ${Prisma.join(
            openMeta.map(
                (m) => Prisma.sql`WHEN ${m.stage} THEN ${Prisma.raw(String(m.defaultProbability))}`,
            ),
            ' ',
        )} ELSE 0 END`

        const rows = await this.prisma.$queryRaw<PipelineRow[]>`
            SELECT "stage", "currency", COUNT(*)::int AS "count",
                   SUM("amount") AS "amount",
                   SUM("amount" * COALESCE("probability", ${defaultProbability}) / 100.0) AS "weighted"
            FROM "crm_opportunities"
            WHERE ${Prisma.join(conditions, ' AND ')}
            GROUP BY "stage", "currency"
            ORDER BY "currency"`

        const totals = new Map<string, { count: number; amount: Prisma.Decimal; weighted: Prisma.Decimal }>()
        for (const row of rows) {
            const t = totals.get(row.currency) ?? {
                count: 0,
                amount: new Prisma.Decimal(0),
                weighted: new Prisma.Decimal(0),
            }
            t.count += row.count
            t.amount = t.amount.plus(row.amount ?? 0)
            t.weighted = t.weighted.plus(row.weighted ?? 0)
            totals.set(row.currency, t)
        }

        return {
            stages: openMeta.map((m) => {
                const stageRows = rows.filter((r) => r.stage === m.stage)
                return {
                    stage: m.stage,
                    count: stageRows.reduce((sum, r) => sum + r.count, 0),
                    byCurrency: stageRows.map((r) => ({
                        currency: r.currency,
                        count: r.count,
                        amount: money(r.amount),
                        weightedAmount: money(r.weighted),
                    })),
                }
            }),
            totals: [...totals].map(([currency, t]) => ({
                currency,
                count: t.count,
                amount: money(t.amount),
                weightedAmount: money(t.weighted),
            })),
        }
    }

    /** Detail view: list fields plus the owner's display name (`assignedTo` has no FK relation). */
    async findOne(id: string) {
        const opportunity = await this.findRow(id)
        const [[row], owner] = await Promise.all([
            this.activities.withNextActivity([serializeOpportunity(opportunity)]),
            opportunity.assignedTo
                ? this.prisma.user.findUnique({
                      where: { id: opportunity.assignedTo },
                      select: CRM_USER_SUMMARY_SELECT,
                  })
                : null,
        ])
        return { ...row, owner }
    }

    /** `client` lets lead conversion create the opportunity inside its transaction. */
    async create(dto: CreateOpportunityDto, userId: string, client: CrmPrismaClient = this.prisma) {
        await assertCustomerExists(client, dto.customerId)
        if (dto.assignedTo) await assertUserExists(client, dto.assignedTo)
        if (dto.leadId) await this.assertLeadMatchesCustomer(dto.leadId, dto.customerId, client)

        const stage = dto.stage ?? 'PROSPECTING'
        await this.assertStageRequirements(
            stage,
            {
                amount: dto.amount ?? null,
                expectedCloseDate: dto.expectedCloseDate ?? null,
                customerId: dto.customerId,
            },
            true,
            client,
        )

        const row = await client.crmOpportunity.create({
            data: {
                customerId: dto.customerId,
                leadId: dto.leadId ?? null,
                name: dto.name,
                description: dto.description ?? null,
                amount: dto.amount === undefined ? null : new Decimal(dto.amount),
                currency: dto.currency ?? 'PHP',
                stage,
                probability: dto.probability ?? stageMeta(stage).defaultProbability,
                expectedCloseDate: dto.expectedCloseDate ?? null,
                assignedTo: dto.assignedTo ?? null,
                createdBy: userId,
                updatedBy: userId,
            },
            include: opportunityInclude,
        })
        return { ...serializeOpportunity(row), ...NO_NEXT_ACTIVITY }
    }

    /**
     * Transition and gate checks for closing as won. The commit happens in
     * CrmOpportunityHandoffService (POST :id/win) together with the SD order.
     */
    async assertCanWin(current: {
        stage: string
        amount: Decimal | null
        expectedCloseDate: Date | null
        customerId: string
    }) {
        if (!canMoveStage(current.stage, 'CLOSED_WON')) {
            throw new BadRequestException(
                `Cannot move opportunity from ${current.stage} to CLOSED_WON`,
            )
        }
        await this.assertStageRequirements('CLOSED_WON', current)
    }

    async update(id: string, dto: UpdateOpportunityDto, userId: string) {
        const current = await this.findRow(id)
        const targetStage = dto.stage ?? (current.stage as OpportunityStage)
        const stageChanged = targetStage !== current.stage
        if (stageChanged && stageMeta(targetStage).isWon) {
            throw new BadRequestException(
                'Close as won with POST /crm/opportunities/:id/win so the SD sales order is created first',
            )
        }
        if (current.stage === 'CLOSED_WON' && !(stageChanged && isOpenStage(targetStage))) {
            throw new ConflictException(
                'Closed Won opportunities are read-only; reopen to an open stage to edit',
            )
        }

        const data: Prisma.CrmOpportunityUncheckedUpdateManyInput = { updatedBy: userId }
        if (dto.name !== undefined) data.name = dto.name
        if (dto.description !== undefined) data.description = dto.description
        if (dto.currency !== undefined) data.currency = dto.currency
        if (dto.probability !== undefined) data.probability = dto.probability
        if (dto.expectedCloseDate !== undefined) data.expectedCloseDate = dto.expectedCloseDate
        if (dto.amount !== undefined) {
            data.amount = dto.amount === null ? null : new Decimal(dto.amount)
        }
        if (dto.customerId !== undefined && dto.customerId !== current.customerId) {
            if (current.sdSalesOrderId) {
                throw new BadRequestException(
                    'The customer cannot change once an SD sales order is linked',
                )
            }
            await assertCustomerExists(this.prisma, dto.customerId)
            data.customerId = dto.customerId
        }
        if (dto.assignedTo !== undefined) {
            if (dto.assignedTo) await assertUserExists(this.prisma, dto.assignedTo)
            data.assignedTo = dto.assignedTo
        }

        const customerId = dto.customerId ?? current.customerId
        const leadId = dto.leadId !== undefined ? dto.leadId : current.leadId
        if (leadId && (dto.leadId !== undefined || data.customerId !== undefined)) {
            await this.assertLeadMatchesCustomer(leadId, customerId)
        }
        if (dto.leadId !== undefined) data.leadId = dto.leadId

        if (stageChanged) {
            if (!canMoveStage(current.stage, targetStage)) {
                throw new BadRequestException(
                    `Cannot move opportunity from ${current.stage} to ${targetStage}`,
                )
            }
            const meta = stageMeta(targetStage)
            data.stage = targetStage
            if (meta.isLost) {
                data.closedAt = new Date()
                data.probability = meta.defaultProbability
            } else {
                // Reopening keeps amount, dates, customer, activities and any sdSalesOrderId (SD-owned).
                data.closedAt = null
                if (dto.probability === undefined) data.probability = meta.defaultProbability
            }
        }

        const touchesGatedField =
            dto.amount !== undefined ||
            dto.expectedCloseDate !== undefined ||
            dto.customerId !== undefined
        if (stageChanged ? isForwardMove(current.stage, targetStage) : touchesGatedField) {
            await this.assertStageRequirements(
                targetStage,
                {
                    amount: dto.amount !== undefined ? dto.amount : current.amount,
                    expectedCloseDate:
                        dto.expectedCloseDate !== undefined
                            ? dto.expectedCloseDate
                            : current.expectedCloseDate,
                    customerId,
                },
                stageChanged,
            )
        }

        this.applyLostReason(current, targetStage, stageChanged, dto, data)

        if (Object.keys(data).length === 1) {
            throw new BadRequestException('No changes supplied')
        }

        const customerChanges = data.customerId !== undefined
        const closesLost = stageChanged && stageMeta(targetStage).isLost
        const write = (client: Prisma.TransactionClient) =>
            client.crmOpportunity.updateMany({
                where: { id, stage: current.stage, updatedAt: current.updatedAt },
                data,
            })
        const result =
            customerChanges || closesLost
                ? await this.prisma.$transaction(async (tx) => {
                      await lockOpportunity(tx, id)
                      if (customerChanges) {
                          await this.quotations.expireOverdue(tx, id)
                          const active = await this.quotations.findActiveForOpportunity(tx, id)
                          if (active) {
                              throw activeQuotationBlocks(active, 'cancel it before changing the customer')
                          }
                      }
                      const updated = await write(tx)
                      if (updated.count > 0 && closesLost) {
                          await this.quotations.cancelActiveForOpportunity(tx, id, {
                              cancelledBy: userId,
                              reason: `Opportunity closed as lost (${data.lostReason})`,
                          })
                      }
                      return updated
                  })
                : await write(this.prisma)
        if (result.count === 0) {
            throw new ConflictException(
                'Opportunity changed concurrently, reload and retry',
            )
        }
        return this.findOne(id)
    }

    private async assertStageRequirements(
        stage: string,
        input: { amount: unknown | null; expectedCloseDate: Date | null; customerId: string },
        moving = true,
        client: CrmPrismaClient = this.prisma,
    ) {
        const meta = stageMeta(stage)
        const customerStatus = meta.requiresCustomer
            ? ((
                  await client.sdCustomer.findUnique({
                      where: { id: input.customerId },
                      select: { status: true },
                  })
              )?.status ?? null)
            : null
        const missing = unmetStageRequirements(stage, { ...input, customerStatus })
        if (missing.length > 0) {
            const verb = moving ? `Moving to ${stageLabel(stage)}` : `${stageLabel(stage)} stage`
            throw new BadRequestException(`${verb} requires ${joinRequirements(missing)}`)
        }
    }

    /**
     * Moving to CLOSED_LOST needs a reason (OTHER also needs notes); editing a lost
     * opportunity's reason re-validates it. Leaving CLOSED_LOST clears reason and notes only.
     */
    private applyLostReason(
        current: OpportunityRow,
        targetStage: string,
        stageChanged: boolean,
        dto: UpdateOpportunityDto,
        data: Prisma.CrmOpportunityUncheckedUpdateManyInput,
    ) {
        const touchesLost = dto.lostReason !== undefined || dto.lostNotes !== undefined
        if (!stageMeta(targetStage).isLost) {
            if (dto.lostReason || dto.lostNotes) {
                throw new BadRequestException(
                    'Lost reason and notes are only accepted on lost opportunities',
                )
            }
            if (stageChanged && current.stage === 'CLOSED_LOST') {
                data.lostReason = null
                data.lostNotes = null
            }
            return
        }
        if (!stageChanged && !touchesLost) return

        const reason = dto.lostReason !== undefined ? dto.lostReason : current.lostReason
        const notes = (dto.lostNotes !== undefined ? dto.lostNotes : current.lostNotes) || null
        if (!reason) {
            throw new BadRequestException('A lost reason is required to close an opportunity as lost')
        }
        if (LOST_REASONS_REQUIRING_NOTES.has(reason) && !notes) {
            throw new BadRequestException(`Lost notes are required when the reason is ${reason}`)
        }
        data.lostReason = reason
        data.lostNotes = notes
    }

    private async findRow(id: string): Promise<OpportunityRow> {
        const row = await this.prisma.crmOpportunity.findUnique({
            where: { id },
            include: opportunityInclude,
        })
        if (!row) throw new NotFoundException('Opportunity not found')
        return row
    }

    private async assertLeadMatchesCustomer(
        leadId: string,
        customerId: string,
        client: CrmPrismaClient = this.prisma,
    ) {
        const lead = await client.crmLead.findUnique({
            where: { id: leadId },
            select: { customerId: true },
        })
        if (!lead) throw new NotFoundException('Lead not found')
        if (lead.customerId && lead.customerId !== customerId) {
            throw new BadRequestException('Lead belongs to a different customer')
        }
    }
}
