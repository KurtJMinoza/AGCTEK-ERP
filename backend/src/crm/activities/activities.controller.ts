import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmActivitiesService } from './activities.service'
import { CompleteActivityDto, CreateActivityDto } from './dto/activity.dto'

@Controller('crm/opportunities/:opportunityId/activities')
export class CrmActivitiesController {
    constructor(private readonly activities: CrmActivitiesService) {}

    @Get()
    @RequirePermission('crm.activities', 'read')
    list(@Param('opportunityId') opportunityId: string) {
        return this.activities.listForOpportunity(opportunityId)
    }

    @Post()
    @RequirePermission('crm.activities', 'create')
    create(
        @Param('opportunityId') opportunityId: string,
        @Body() dto: CreateActivityDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.activities.createForOpportunity(opportunityId, dto, user.id)
    }

    @Post(':activityId/complete')
    @HttpCode(200)
    @RequirePermission('crm.activities', 'update')
    complete(
        @Param('opportunityId') opportunityId: string,
        @Param('activityId') activityId: string,
        @Body() dto: CompleteActivityDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.activities.complete(opportunityId, activityId, dto, user.id)
    }
}

@Controller('crm/tickets/:ticketId/activities')
export class CrmTicketActivitiesController {
    constructor(private readonly activities: CrmActivitiesService) {}

    @Get()
    @RequirePermission('crm.activities', 'read')
    list(@Param('ticketId') ticketId: string) {
        return this.activities.listForTicket(ticketId)
    }

    @Post()
    @RequirePermission('crm.activities', 'create')
    create(
        @Param('ticketId') ticketId: string,
        @Body() dto: CreateActivityDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.activities.createForTicket(ticketId, dto, user.id)
    }

    @Post(':activityId/complete')
    @HttpCode(200)
    @RequirePermission('crm.activities', 'update')
    complete(
        @Param('ticketId') ticketId: string,
        @Param('activityId') activityId: string,
        @Body() dto: CompleteActivityDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.activities.completeForTicket(ticketId, activityId, dto, user.id)
    }
}
