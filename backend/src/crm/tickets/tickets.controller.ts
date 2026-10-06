import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import {
    CreateTicketCommentDto,
    CreateTicketDto,
    ListTicketsQueryDto,
    UpdateTicketDto,
} from './dto/ticket.dto'
import { CrmTicketsService } from './tickets.service'

@Controller('crm/tickets')
export class CrmTicketsController {
    constructor(private readonly tickets: CrmTicketsService) {}

    @Get()
    @RequirePermission(MODULE_CODES.CRM, 'read')
    list(@Query() query: ListTicketsQueryDto) {
        return this.tickets.list(query)
    }

    @Get(':id')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    findOne(@Param('id') id: string) {
        return this.tickets.findOne(id)
    }

    @Post()
    @RequirePermission(MODULE_CODES.CRM, 'create')
    create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthRequestUser) {
        return this.tickets.create(dto, user.id)
    }

    @Patch(':id')
    @RequirePermission(MODULE_CODES.CRM, 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateTicketDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.tickets.update(id, dto, user.id)
    }

    @Get(':id/comments')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    listComments(@Param('id') id: string) {
        return this.tickets.listComments(id)
    }

    @Post(':id/comments')
    @RequirePermission(MODULE_CODES.CRM, 'create')
    addComment(
        @Param('id') id: string,
        @Body() dto: CreateTicketCommentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.tickets.addComment(id, dto, user.id)
    }
}
