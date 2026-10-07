import { Module } from '@nestjs/common'
import { ScmModule } from '../scm/scm.module'
import { SdModule } from '../sd/sd.module'
import { CrmLeadsController } from './leads/leads.controller'
import { CrmLeadsService } from './leads/leads.service'
import { CrmOpportunitiesController } from './opportunities/opportunities.controller'
import { CrmOpportunitiesService } from './opportunities/opportunities.service'
import { CrmOpportunityHandoffService } from './opportunities/opportunity-handoff.service'
import { CrmOpportunityQuotationsService } from './opportunities/opportunity-quotations.service'
import { CrmTicketsController } from './tickets/tickets.controller'
import { CrmTicketsService } from './tickets/tickets.service'
import { CrmLoyaltyController } from './loyalty/loyalty.controller'
import { CrmLoyaltyService } from './loyalty/loyalty.service'
import { CrmCustomer360Controller } from './customer-360/customer-360.controller'
import { CrmCustomer360Service } from './customer-360/customer-360.service'
import {
    CrmActivitiesController,
    CrmTicketActivitiesController,
} from './activities/activities.controller'
import { CrmActivitiesService } from './activities/activities.service'
import { CrmDashboardController } from './dashboard/dashboard.controller'
import { CrmDashboardService } from './dashboard/dashboard.service'

/**
 * CRM extends SdCustomer (SD-owned customer master). Every endpoint is guarded with
 * `@RequirePermission(MODULE_CODES.CRM, action)`; PermissionsModule is global.
 * SdModule supplies CustomerService (lead conversion), SalesOrderService (Closed Won
 * handoff) and QuotationService (opportunity quotations) so CRM creates SD documents only
 * through SD. Customer 360 reads SD orders and
 * SCM shipments live through those modules' services (ScmModule exports ShipmentsService).
 */
@Module({
    imports: [SdModule, ScmModule],
    controllers: [
        CrmLeadsController,
        CrmOpportunitiesController,
        CrmTicketsController,
        CrmLoyaltyController,
        CrmCustomer360Controller,
        CrmActivitiesController,
        CrmTicketActivitiesController,
        CrmDashboardController,
    ],
    providers: [
        CrmLeadsService,
        CrmOpportunitiesService,
        CrmOpportunityHandoffService,
        CrmOpportunityQuotationsService,
        CrmTicketsService,
        CrmLoyaltyService,
        CrmCustomer360Service,
        CrmActivitiesService,
        CrmDashboardService,
    ],
})
export class CrmModule {}
