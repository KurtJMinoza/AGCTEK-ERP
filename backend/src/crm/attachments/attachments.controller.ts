import { Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmAttachmentsService, type AttachmentParent } from './attachments.service'
import { UploadCrmAttachmentDto } from './dto/attachment.dto'

async function sendFile(
    attachments: CrmAttachmentsService,
    parent: AttachmentParent,
    attachmentId: string,
    res: FastifyReply,
) {
    const { row, stream } = await attachments.download(parent, attachmentId)
    res.header('Content-Type', row.mimeType || 'application/octet-stream')
    res.header('Content-Disposition', `attachment; filename="${row.fileName.replace(/"/g, '')}"`)
    return res.send(stream)
}

@Controller('crm/tickets/:ticketId/attachments')
export class CrmTicketAttachmentsController {
    constructor(private readonly attachments: CrmAttachmentsService) {}

    @Get()
    @RequirePermission('crm.tickets', 'read')
    list(@Param('ticketId') ticketId: string) {
        return this.attachments.list({ kind: 'ticket', id: ticketId })
    }

    @Post()
    @RequirePermission('crm.tickets', 'create')
    upload(
        @Param('ticketId') ticketId: string,
        @Body() dto: UploadCrmAttachmentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.attachments.upload({ kind: 'ticket', id: ticketId }, dto, user.id)
    }

    @Get(':attachmentId/download')
    @RequirePermission('crm.tickets', 'read')
    download(
        @Param('ticketId') ticketId: string,
        @Param('attachmentId') attachmentId: string,
        @Res() res: FastifyReply,
    ) {
        return sendFile(this.attachments, { kind: 'ticket', id: ticketId }, attachmentId, res)
    }

    @Delete(':attachmentId')
    @RequirePermission('crm.tickets', 'delete')
    remove(
        @Param('ticketId') ticketId: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.attachments.remove({ kind: 'ticket', id: ticketId }, attachmentId, user.id)
    }
}

@Controller('crm/opportunities/:opportunityId/attachments')
export class CrmOpportunityAttachmentsController {
    constructor(private readonly attachments: CrmAttachmentsService) {}

    @Get()
    @RequirePermission('crm.opportunities', 'read')
    list(@Param('opportunityId') opportunityId: string) {
        return this.attachments.list({ kind: 'opportunity', id: opportunityId })
    }

    @Post()
    @RequirePermission('crm.opportunities', 'create')
    upload(
        @Param('opportunityId') opportunityId: string,
        @Body() dto: UploadCrmAttachmentDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.attachments.upload({ kind: 'opportunity', id: opportunityId }, dto, user.id)
    }

    @Get(':attachmentId/download')
    @RequirePermission('crm.opportunities', 'read')
    download(
        @Param('opportunityId') opportunityId: string,
        @Param('attachmentId') attachmentId: string,
        @Res() res: FastifyReply,
    ) {
        return sendFile(this.attachments, { kind: 'opportunity', id: opportunityId }, attachmentId, res)
    }

    @Delete(':attachmentId')
    @RequirePermission('crm.opportunities', 'delete')
    remove(
        @Param('opportunityId') opportunityId: string,
        @Param('attachmentId') attachmentId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.attachments.remove({ kind: 'opportunity', id: opportunityId }, attachmentId, user.id)
    }
}
