import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { RequirePermission } from '../permissions/permission.guard'
import { ListSalesInvoicesQueryDto } from './dto/sales-invoice.dto'
import { SalesInvoiceService } from './sales-invoice.service'
import { SalesInvoicePdfService } from './sales-invoice-pdf.service'

/**
 * Customer billing (read-only). Invoices are drafted at goods issue, posted on
 * delivery POD and marked paid from the order payment; nothing here changes them.
 */
@Controller('sd/invoices')
export class SalesInvoiceController {
    constructor(
        private readonly invoices: SalesInvoiceService,
        private readonly pdf: SalesInvoicePdfService,
    ) {}

    @Get()
    @RequirePermission('sd.billing', 'read')
    list(@Query() query: ListSalesInvoicesQueryDto) {
        return this.invoices.list(query)
    }

    @Get(':id')
    @RequirePermission('sd.billing', 'read')
    findOne(@Param('id') id: string) {
        return this.invoices.findOne(id)
    }

    /** `?inline=1` opens the PDF in the browser instead of downloading. */
    @Get(':id/pdf')
    @RequirePermission('sd.billing', 'read')
    async downloadPdf(
        @Param('id') id: string,
        @Query('inline') inline: string | undefined,
        @Res() res: FastifyReply,
    ) {
        const input = await this.invoices.pdfInput(id)
        const doc = this.pdf.createDocument(input)
        res.header('Content-Type', 'application/pdf')
        res.header(
            'Content-Disposition',
            `${inline === '1' ? 'inline' : 'attachment'}; filename="${input.invoiceNumber}.pdf"`,
        )
        doc.end()
        return res.send(doc)
    }
}
