import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmEmailService } from './crm-email.service'
import { CrmEmailInboundService } from './crm-email-inbound.service'
import {
    ListCrmEmailsQueryDto,
    SetCrmEmailSpamDto,
    SetCrmEmailStarredDto,
    UpdateCrmEmailDraftDto,
    UploadCrmEmailAttachmentDto,
    UpsertCrmEmailDraftDto,
} from './dto/crm-email.dto'

@Controller('crm/emails')
export class CrmEmailController {
    constructor(
        private readonly emails: CrmEmailService,
        private readonly inbound: CrmEmailInboundService,
    ) {}

    @Get()
    @RequirePermission('emails.messages', 'read')
    list(@Query() query: ListCrmEmailsQueryDto) {
        return this.emails.list(query)
    }

    @Post('inbound/sync')
    @RequirePermission('emails.messages', 'update')
    syncInbound() {
        return this.inbound.syncFromMaildev()
    }

    @Get(':id')
    @RequirePermission('emails.messages', 'read')
    findOne(@Param('id') id: string) {
        return this.emails.findOne(id)
    }

    @Post('drafts')
    @RequirePermission('emails.messages', 'create')
    upsertDraft(@Body() dto: UpsertCrmEmailDraftDto, @CurrentUser() user: AuthRequestUser) {
        return this.emails.upsertDraft(dto, user.id)
    }

    @Patch(':id/star')
    @RequirePermission('emails.messages', 'update')
    setStarred(
        @Param('id') id: string,
        @Body() dto: SetCrmEmailStarredDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.emails.setStarred(id, dto, user.id)
    }

    @Patch(':id/spam')
    @RequirePermission('emails.messages', 'update')
    setSpam(
        @Param('id') id: string,
        @Body() dto: SetCrmEmailSpamDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.emails.setSpam(id, dto, user.id)
    }

    @Patch(':id')
    @RequirePermission('emails.messages', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateCrmEmailDraftDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.emails.updateDraft(id, dto, user.id)
    }

    @Post(':id/attachments')
    @RequirePermission('emails.messages', 'update')
    upload(
        @Param('id') id: string,
        @Body() dto: UploadCrmEmailAttachmentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.emails.uploadAttachment(id, dto, user.id)
    }

    @Delete(':id/attachments/:attachmentId')
    @RequirePermission('emails.messages', 'update')
    removeAttachment(
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.emails.removeAttachment(id, attachmentId, user.id)
    }

    @Post(':id/send')
    @RequirePermission('emails.messages', 'update')
    send(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.emails.send(id, user.id)
    }
}
