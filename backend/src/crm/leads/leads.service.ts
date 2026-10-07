import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PermissionsService } from '../../permissions/permissions.service'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import { PrismaService } from '../../prisma/prisma.service'
import { CustomerService } from '../../sd/customer.service'
import type { CreateCustomerDto } from '../../sd/dto/customer.dto'
import { CrmActivitiesService } from '../activities/activities.service'
import {
    assertCustomerExists,
    assertUserExists,
    CRM_CUSTOMER_SUMMARY_SELECT,
} from '../crm-references'
import { CrmOpportunitiesService } from '../opportunities/opportunities.service'
import {
    ConvertLeadDto,
    CreateLeadDto,
    LeadStatus,
    ListLeadsQueryDto,
    UpdateLeadDto,
} from './dto/lead.dto'

const DEFAULT_PAGE_SIZE = 20

/**
 * Status moves via PATCH. CONVERTED is reachable only through `convert()` and is terminal;
 * LOST and UNQUALIFIED leads may be re-engaged.
 */
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
    NEW: ['CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'LOST'],
    CONTACTED: ['QUALIFIED', 'UNQUALIFIED', 'LOST'],
    QUALIFIED: ['UNQUALIFIED', 'LOST'],
    UNQUALIFIED: ['CONTACTED', 'LOST'],
    CONVERTED: [],
    LOST: ['CONTACTED'],
}

/** LOST and UNQUALIFIED leads must be re-engaged (→ CONTACTED) before converting. */
export const CONVERTIBLE_LEAD_STATUSES: ReadonlySet<string> = new Set<LeadStatus>([
    'NEW',
    'CONTACTED',
    'QUALIFIED',
])

const leadInclude = {
    customer: { select: CRM_CUSTOMER_SUMMARY_SELECT },
} satisfies Prisma.CrmLeadInclude

@Injectable()
export class CrmLeadsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly opportunities: CrmOpportunitiesService,
        private readonly activities: CrmActivitiesService,
        private readonly customers: CustomerService,
        private readonly permissions: PermissionsService,
    ) {}

    async list(query: ListLeadsQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
        const search = query.search?.trim()
        const where: Prisma.CrmLeadWhereInput = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.source ? { source: query.source } : {}),
            ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(query.createdFrom ? { createdAt: { gte: query.createdFrom } } : {}),
            ...(search
                ? {
                      OR: [
                          { name: { contains: search, mode: 'insensitive' } },
                          { email: { contains: search, mode: 'insensitive' } },
                          { phone: { contains: search } },
                      ],
                  }
                : {}),
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.crmLead.findMany({
                where,
                include: leadInclude,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.crmLead.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const lead = await this.prisma.crmLead.findUnique({
            where: { id },
            include: leadInclude,
        })
        if (!lead) throw new NotFoundException('Lead not found')
        return lead
    }

    async create(dto: CreateLeadDto, userId: string) {
        if (dto.customerId) await assertCustomerExists(this.prisma, dto.customerId)
        if (dto.assignedTo) await assertUserExists(this.prisma, dto.assignedTo)

        return this.prisma.crmLead.create({
            data: {
                name: dto.name,
                email: dto.email ?? null,
                phone: dto.phone ?? null,
                source: dto.source ?? 'OTHER',
                customerId: dto.customerId ?? null,
                assignedTo: dto.assignedTo ?? null,
                score: dto.score ?? null,
                createdBy: userId,
                updatedBy: userId,
            },
            include: leadInclude,
        })
    }

    async update(id: string, dto: UpdateLeadDto, userId: string) {
        const current = await this.findOne(id)
        if (current.status === 'CONVERTED') {
            throw new ConflictException('Converted leads are read-only')
        }

        const data: Prisma.CrmLeadUncheckedUpdateManyInput = { updatedBy: userId }
        if (dto.name !== undefined) data.name = dto.name
        if (dto.email !== undefined) data.email = dto.email
        if (dto.phone !== undefined) data.phone = dto.phone
        if (dto.source !== undefined) data.source = dto.source
        if (dto.score !== undefined) data.score = dto.score
        if (dto.customerId !== undefined) {
            if (dto.customerId) await assertCustomerExists(this.prisma, dto.customerId)
            data.customerId = dto.customerId
        }
        if (dto.assignedTo !== undefined) {
            if (dto.assignedTo) await assertUserExists(this.prisma, dto.assignedTo)
            data.assignedTo = dto.assignedTo
        }
        if (dto.status !== undefined && dto.status !== current.status) {
            if (dto.status === 'CONVERTED') {
                throw new BadRequestException(
                    'Use POST /crm/leads/:id/convert to convert a lead into an opportunity',
                )
            }
            const from = current.status as LeadStatus
            if (!LEAD_TRANSITIONS[from]?.includes(dto.status)) {
                throw new BadRequestException(
                    `Cannot move lead from ${current.status} to ${dto.status}`,
                )
            }
            data.status = dto.status
        }

        if (Object.keys(data).length === 1) {
            throw new BadRequestException('No changes supplied')
        }

        const result = await this.prisma.crmLead.updateMany({
            where: { id, status: current.status, updatedAt: current.updatedAt },
            data,
        })
        if (result.count === 0) {
            throw new ConflictException('Lead changed concurrently, reload and retry')
        }
        return this.findOne(id)
    }

    /**
     * Lead → Opportunity in one transaction: resolve the SdCustomer (link, or create through
     * SD's CustomerService — CRM keeps no customer master), mark the lead CONVERTED, create the
     * opportunity (stage gates apply) and relink the lead's activities to it.
     */
    async convert(id: string, dto: ConvertLeadDto, user: { id: string; role: string }) {
        const lead = await this.findOne(id)
        if (lead.status === 'CONVERTED') {
            throw new ConflictException('Lead is already converted')
        }
        if (!CONVERTIBLE_LEAD_STATUSES.has(lead.status)) {
            throw new ConflictException(
                `A ${lead.status} lead cannot be converted; move it back to CONTACTED first`,
            )
        }
        if (dto.customerId && dto.newCustomer) {
            throw new BadRequestException('Provide either customerId or newCustomer, not both')
        }
        if (lead.customerId && dto.newCustomer) {
            throw new BadRequestException('Lead is already linked to an SD customer')
        }
        if (lead.customerId && dto.customerId && dto.customerId !== lead.customerId) {
            throw new BadRequestException('Lead is linked to a different SD customer')
        }

        const linkedCustomerId = dto.customerId ?? lead.customerId
        let newCustomer: CreateCustomerDto | null = null
        if (dto.newCustomer) {
            await this.permissions.assertPermission({ role: user.role }, MODULE_CODES.SD, 'create')
            const email = dto.newCustomer.email ?? lead.email
            if (!email) {
                throw new BadRequestException('An email is required to create the SD customer')
            }
            newCustomer = {
                companyName: dto.newCustomer.companyName,
                contactName: dto.newCustomer.contactName ?? lead.name,
                email,
                phone: dto.newCustomer.phone ?? lead.phone ?? undefined,
                // SD owns credit; a new account starts without a limit until SD sets one.
                creditLimit: 0,
                createdBy: user.id,
            }
        } else if (!linkedCustomerId) {
            throw new BadRequestException(
                'Link an existing SD customer or provide newCustomer to convert the lead',
            )
        }

        const opportunity = dto.opportunity ?? {}
        const result = await this.prisma.$transaction(async (tx) => {
            let customerId = linkedCustomerId
            if (newCustomer) {
                customerId = (await this.customers.create(newCustomer, tx)).id
            } else {
                await assertCustomerExists(tx, customerId!)
            }

            const updated = await tx.crmLead.updateMany({
                where: { id, status: lead.status, updatedAt: lead.updatedAt },
                data: { status: 'CONVERTED', customerId, updatedBy: user.id },
            })
            if (updated.count === 0) {
                throw new ConflictException('Lead changed concurrently, reload and retry')
            }

            const created = await this.opportunities.create(
                {
                    customerId: customerId!,
                    leadId: id,
                    name: opportunity.name ?? lead.name,
                    amount: opportunity.amount,
                    currency: opportunity.currency,
                    stage: opportunity.stage,
                    expectedCloseDate: opportunity.expectedCloseDate,
                    assignedTo: lead.assignedTo ?? undefined,
                },
                user.id,
                tx,
            )
            const activitiesMoved = await this.activities.reparentLeadActivities(
                id,
                created.id,
                tx,
            )
            return { opportunityId: created.id, customerId: customerId!, activitiesMoved }
        })

        return {
            lead: await this.findOne(id),
            opportunity: await this.opportunities.findOne(result.opportunityId),
            customer: { id: result.customerId, created: newCustomer !== null },
            activitiesMoved: result.activitiesMoved,
        }
    }
}
