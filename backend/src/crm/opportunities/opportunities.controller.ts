import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import {
    CreateOpportunityDto,
    CreateOpportunityQuotationDto,
    CreateOpportunitySalesOrderDto,
    ListOpportunitiesQueryDto,
    OpportunityPipelineQueryDto,
    UpdateOpportunityDto,
    WinOpportunityDto,
} from './dto/opportunity.dto'
import { CrmOpportunitiesService } from './opportunities.service'
import { CrmOpportunityHandoffService } from './opportunity-handoff.service'
import { CrmOpportunityQuotationsService } from './opportunity-quotations.service'

@Controller('crm/opportunities')
export class CrmOpportunitiesController {
    constructor(
        private readonly opportunities: CrmOpportunitiesService,
        private readonly handoff: CrmOpportunityHandoffService,
        private readonly opportunityQuotations: CrmOpportunityQuotationsService,
    ) {}

    @Get()
    @RequirePermission(MODULE_CODES.CRM, 'read')
    list(@Query() query: ListOpportunitiesQueryDto) {
        return this.opportunities.list(query)
    }

    @Get('stages')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    stages() {
        return this.opportunities.stages()
    }

    @Get('pipeline')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    pipeline(@Query() query: OpportunityPipelineQueryDto) {
        return this.opportunities.pipeline(query)
    }

    @Get(':id')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    findOne(@Param('id') id: string) {
        return this.opportunities.findOne(id)
    }

    @Post()
    @RequirePermission(MODULE_CODES.CRM, 'create')
    create(@Body() dto: CreateOpportunityDto, @CurrentUser() user: AuthRequestUser) {
        return this.opportunities.create(dto, user.id)
    }

    @Patch(':id')
    @RequirePermission(MODULE_CODES.CRM, 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateOpportunityDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.opportunities.update(id, dto, user.id)
    }

    @Get(':id/sales-order')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    salesOrder(@Param('id') id: string) {
        return this.handoff.salesOrder(id)
    }

    /**
     * Close as won: creates the SD sales order and commits CLOSED_WON atomically.
     * Idempotent: a won opportunity returns its linked order (`created: false`).
     */
    @Post(':id/win')
    @RequirePermission(MODULE_CODES.CRM, 'update')
    win(
        @Param('id') id: string,
        @Body() dto: WinOpportunityDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.handoff.win(id, dto, user)
    }

    @Get(':id/quotations')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    quotations(@Param('id') id: string) {
        return this.opportunityQuotations.list(id)
    }

    /** New SD quotation (DRAFT) in Proposal / Negotiation; also requires sd:create. */
    @Post(':id/quotations')
    @RequirePermission(MODULE_CODES.CRM, 'update')
    createQuotation(
        @Param('id') id: string,
        @Body() dto: CreateOpportunityQuotationDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.opportunityQuotations.create(id, dto, user)
    }

    /** Retry ERP handoff for Closed Won without an SD order; idempotent like `win`. */
    @Post(':id/sales-order')
    @RequirePermission(MODULE_CODES.CRM, 'update')
    createSalesOrder(
        @Param('id') id: string,
        @Body() dto: CreateOpportunitySalesOrderDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.handoff.createSalesOrder(id, dto, user)
    }
}
