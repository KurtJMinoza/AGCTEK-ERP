import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    AcceptQuotationDto,
    CancelQuotationDto,
    ListQuotationsQueryDto,
    RejectQuotationDto,
    ReviseQuotationDto,
    SendQuotationDto,
    UpdateQuotationDraftDto,
} from './dto/quotation.dto'
import { QuotationService } from './quotation.service'

/**
 * SD quotations. Created from a CRM opportunity (POST /crm/opportunities/:id/quotations, which
 * validates the opportunity); converted into the sales order by the Closed Won handoff.
 */
@Controller('sd/quotations')
export class QuotationController {
    constructor(private readonly quotations: QuotationService) {}

    @Get()
    @RequirePermission('sd.quotations', 'read')
    list(@Query() query: ListQuotationsQueryDto) {
        return this.quotations.list(query)
    }

    @Get(':id')
    @RequirePermission('sd.quotations', 'read')
    findOne(@Param('id') id: string) {
        return this.quotations.findOne(id)
    }

    @Patch(':id')
    @RequirePermission('sd.quotations', 'update')
    updateDraft(
        @Param('id') id: string,
        @Body() dto: UpdateQuotationDraftDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.quotations.updateDraft(id, dto, user.id)
    }

    @Post(':id/send')
    @RequirePermission('sd.quotations', 'update')
    send(@Param('id') id: string, @Body() dto: SendQuotationDto, @CurrentUser() user: AuthRequestUser) {
        return this.quotations.send(id, dto, user.id)
    }

    @Post(':id/revise')
    @RequirePermission('sd.quotations', 'update')
    revise(@Param('id') id: string, @Body() dto: ReviseQuotationDto, @CurrentUser() user: AuthRequestUser) {
        return this.quotations.revise(id, dto, user.id)
    }

    @Post(':id/accept')
    @RequirePermission('sd.quotations', 'update')
    accept(@Param('id') id: string, @Body() dto: AcceptQuotationDto, @CurrentUser() user: AuthRequestUser) {
        return this.quotations.accept(id, dto, user.id)
    }

    @Post(':id/reject')
    @RequirePermission('sd.quotations', 'update')
    reject(@Param('id') id: string, @Body() dto: RejectQuotationDto, @CurrentUser() user: AuthRequestUser) {
        return this.quotations.reject(id, dto, user.id)
    }

    @Post(':id/cancel')
    @RequirePermission('sd.quotations', 'update')
    cancel(@Param('id') id: string, @Body() dto: CancelQuotationDto, @CurrentUser() user: AuthRequestUser) {
        return this.quotations.cancel(id, dto, user.id)
    }
}
