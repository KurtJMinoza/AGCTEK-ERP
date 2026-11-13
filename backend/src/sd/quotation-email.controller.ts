import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    QuotationEmailPreviewQueryDto,
    SaveQuotationEmailTemplateDto,
    SendQuotationEmailDto,
    UpdateQuotationEmailTemplateDto,
} from './dto/quotation-email.dto'
import { QuotationEmailService } from './quotation-email.service'
import { UpdatePdfLayoutProfileDto } from './dto/pdf-layout-profile.dto'
import { PdfLayoutProfileService } from './pdf-layout-profile.service'

/**
 * SD-owned quotation email. Sending the quotation (DRAFT → SENT) never emails by itself: the CRM
 * composer loads the preview, lets the rep edit the cover letter, then posts it here. The PDF stays
 * the commercial source of truth and is always attached.
 */
@Controller('sd/quotations')
export class QuotationEmailController {
    constructor(private readonly email: QuotationEmailService) {}

    @Post(':id/email')
    @RequirePermission('sd.quotations', 'update')
    send(
        @Param('id') id: string,
        @Body() dto: SendQuotationEmailDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.email.send(id, dto, user.id)
    }

    /** Backwards-compatible alias for a plain resend with the `quotation_resent` template. */
    @Post(':id/resend-email')
    @RequirePermission('sd.quotations', 'update')
    resend(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.email.send(id, { isResend: true }, user.id)
    }

    /** Rendered composer content (recipient, subject, body, attachment) for this revision. */
    @Get(':id/email-preview')
    @RequirePermission('sd.quotations', 'read')
    preview(@Param('id') id: string, @Query() query: QuotationEmailPreviewQueryDto) {
        return this.email.preview(id, query.templateKey)
    }

    /** Saves the composer's current copy as a reusable template for this quote's values. */
    @Post(':id/email-templates')
    @RequirePermission('sd.quotations', 'update')
    saveTemplate(@Param('id') id: string, @Body() dto: SaveQuotationEmailTemplateDto) {
        return this.email.createTemplateFromQuotation(id, dto)
    }

    /**
     * The stored PDF exactly as emailed (404 until the first email). `?inline=1` opens it in the
     * browser instead of downloading.
     */
    @Get(':id/pdf/sent')
    @RequirePermission('sd.quotations', 'read')
    async downloadStoredPdf(
        @Param('id') id: string,
        @Query('inline') inline: string | undefined,
        @Res() res: FastifyReply,
    ) {
        const { buffer, filename } = await this.email.storedDocument(id)
        res.header('Content-Type', 'application/pdf')
        res.header('Content-Length', String(buffer.length))
        res.header(
            'Content-Disposition',
            `${inline === '1' ? 'inline' : 'attachment'}; filename="${filename}"`,
        )
        // Prices are commercial data: never cache a stored quotation PDF in shared proxies.
        res.header('Cache-Control', 'private, no-store')
        return res.send(buffer)
    }
}

/** Quotation PDF layout profiles (CRM › Documents › PDF templates); layout only, never data. */
@Controller('sd/pdf-layout-profiles')
export class PdfLayoutProfileController {
    constructor(private readonly profiles: PdfLayoutProfileService) {}

    @Get()
    @RequirePermission('sd.quotations', 'read')
    list() {
        return this.profiles.list()
    }

    @Patch(':key')
    @RequirePermission('sd.quotations', 'update')
    update(@Param('key') key: string, @Body() dto: UpdatePdfLayoutProfileDto) {
        return this.profiles.update(key, dto)
    }
}

/** Quotation email template copy (admin edit surface; v1 read + update, no structural builder). */
@Controller('sd/email-templates')
export class QuotationEmailTemplateController {
    constructor(private readonly email: QuotationEmailService) {}

    @Get()
    @RequirePermission('sd.quotations', 'read')
    list(@Query('includeInactive') includeInactive?: string) {
        return this.email.listTemplates(includeInactive === '1' || includeInactive === 'true')
    }

    @Get(':key')
    @RequirePermission('sd.quotations', 'read')
    async findOne(@Param('key') key: string) {
        const templates = await this.email.listTemplates(true)
        return templates.find((template) => template.key === key) ?? null
    }

    @Patch(':key')
    @RequirePermission('sd.quotations', 'update')
    update(@Param('key') key: string, @Body() dto: UpdateQuotationEmailTemplateDto) {
        return this.email.updateTemplate(key, dto)
    }
}
