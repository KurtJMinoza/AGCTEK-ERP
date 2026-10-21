import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import {
    ConsignmentsService,
    type ConsignmentListQuery,
} from './consignments.service'

@Controller('scm/consignments')
export class ConsignmentsController {
    constructor(private readonly consignments: ConsignmentsService) {}

    @Get()
    @RequirePermission('scm.consignments', 'read')
    findAll(@Query() query: ConsignmentListQuery) {
        return this.consignments.findAll(query)
    }

    @Get(':id')
    @RequirePermission('scm.consignments', 'read')
    findOne(@Param('id') id: string) {
        return this.consignments.findOne(id)
    }

    /** Ship with courier: book a READY shipment with a carrier + tracking number. */
    @Post()
    @RequirePermission('scm.consignments', 'create')
    book(
        @Body() body: Record<string, unknown>,
        @CurrentUser() user?: AuthRequestUser,
    ) {
        return this.consignments.book(body as never, user?.id)
    }

    /** Manual courier status: PICKED_UP posts goods issue; DELIVERED delivers the SD order. */
    @Patch(':id/status')
    @RequirePermission('scm.consignments', 'update')
    updateStatus(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @CurrentUser() user?: AuthRequestUser,
    ) {
        return this.consignments.updateStatus(id, body as never, user?.id)
    }
}
