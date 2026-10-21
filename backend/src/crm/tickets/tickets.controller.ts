import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import {
    CreateTicketCommentDto,
    CreateTicketDto,
    ListTicketsQueryDto,
    RejectReturnCaseDto,
    UpdateTicketDto,
} from './dto/ticket.dto'
import { CrmReturnCasesService } from './return-cases.service'
import { CrmTicketsService } from './tickets.service'

@Controller('crm/tickets')
export class CrmTicketsController {
    constructor(
        private readonly tickets: CrmTicketsService,
        private readonly returnCases: CrmReturnCasesService,
    ) {}

    /** Opens the case for an SD customer return, or returns the existing one. */
    @Post('from-return/:returnRequestId')
    @RequirePermission('crm.tickets', 'create')
    openForReturn(
        @Param('returnRequestId') returnRequestId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.returnCases.openForReturn(returnRequestId, user.id)
    }

    /** Linked SD customer return, read live from SD. */
    @Get(':id/return')
    @RequirePermission('crm.tickets', 'read')
    linkedReturn(@Param('id') id: string) {
        return this.returnCases.returnForTicket(id)
    }

    /** Agent approves the linked return (customer's resolution); SD applies it. */
    @Post(':id/return/approve')
    @RequirePermission('crm.tickets', 'update')
    approveReturn(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.returnCases.approveReturn(id, user)
    }

    /** Agent rejects the linked return with a reason; SD records it. */
    @Post(':id/return/reject')
    @RequirePermission('crm.tickets', 'update')
    rejectReturn(
        @Param('id') id: string,
        @Body() dto: RejectReturnCaseDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.returnCases.rejectReturn(id, dto.reason, user)
    }

    @Get()
    @RequirePermission('crm.tickets', 'read')
    list(@Query() query: ListTicketsQueryDto) {
        return this.tickets.list(query)
    }

    @Get(':id')
    @RequirePermission('crm.tickets', 'read')
    findOne(@Param('id') id: string) {
        return this.tickets.findOne(id)
    }

    @Post()
    @RequirePermission('crm.tickets', 'create')
    create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthRequestUser) {
        return this.tickets.create(dto, user.id)
    }

    @Patch(':id')
    @RequirePermission('crm.tickets', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateTicketDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.tickets.update(id, dto, user.id)
    }

    @Get(':id/comments')
    @RequirePermission('crm.tickets', 'read')
    listComments(@Param('id') id: string) {
        return this.tickets.listComments(id)
    }

    @Post(':id/comments')
    @RequirePermission('crm.tickets', 'create')
    addComment(
        @Param('id') id: string,
        @Body() dto: CreateTicketCommentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.tickets.addComment(id, dto, user.id)
    }
}
