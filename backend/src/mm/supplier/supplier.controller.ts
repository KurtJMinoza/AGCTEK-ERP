import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    Req,
    Res,
    BadRequestException,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { SupplierService } from './supplier.service'
import { CreateSupplierDto } from './dto/create-supplier.dto'
import { UpdateSupplierDto } from './dto/update-supplier.dto'
import { SupplierQueryDto } from './dto/supplier-query.dto'

@Controller('mm/suppliers')
export class SupplierController {
    constructor(private service: SupplierService) {}

    @Post()
    create(@Body() dto: CreateSupplierDto) {
        return this.service.create(dto)
    }

    @Get()
    findAll(@Query() query: SupplierQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
        return this.service.update(id, dto)
    }

    @Post(':id/submit')
    submit(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.submitForReview(id, body?.performedBy)
    }

    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.approve(id, body?.performedBy)
    }

    @Post(':id/activate')
    activate(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.activate(id, body?.performedBy)
    }

    @Post(':id/deactivate')
    deactivate(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.deactivate(id, body?.performedBy)
    }

    @Post(':id/block')
    block(@Param('id') id: string, @Body() body: { reason?: string; performedBy?: string }) {
        return this.service.block(id, body?.reason, body?.performedBy)
    }

    @Post(':id/unblock')
    unblock(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.unblock(id, body?.performedBy)
    }

    @Delete(':id')
    softDelete(@Param('id') id: string) {
        return this.service.softDelete(id)
    }

    @Get(':id/audit')
    getAudit(@Param('id') id: string) {
        return this.service.getAuditTrail(id)
    }

    @Get(':id/documents')
    listDocuments(@Param('id') id: string) {
        return this.service.listDocuments(id)
    }

    @Post(':id/documents/upload')
    async uploadDocument(
        @Param('id') id: string,
        @Req() req: FastifyRequest,
    ) {
        let buffer: Buffer | null = null
        let fileName = ''
        let mimeType = ''
        let docType = 'OTHER'
        let uploadedBy: string | undefined

        for await (const part of req.parts()) {
            if (part.type === 'file') {
                buffer = await part.toBuffer()
                fileName = part.filename
                mimeType = part.mimetype
            } else if (part.fieldname === 'docType') {
                docType = String(part.value || 'OTHER')
            } else if (part.fieldname === 'uploadedBy') {
                uploadedBy = String(part.value)
            }
        }

        if (!buffer || !fileName) {
            throw new BadRequestException('No file uploaded')
        }

        return this.service.uploadDocumentFile(id, {
            buffer,
            fileName,
            mimeType,
            docType,
            uploadedBy,
        })
    }

    @Post(':id/documents')
    addDocument(
        @Param('id') id: string,
        @Body()
        body: {
            fileName: string
            fileUrl?: string
            storageKey?: string
            mimeType?: string
            docType?: string
            uploadedBy?: string
        },
    ) {
        return this.service.addDocument(id, body)
    }

    @Get(':id/documents/:documentId/file')
    async getDocumentFile(
        @Param('id') id: string,
        @Param('documentId') documentId: string,
        @Res() res: FastifyReply,
    ) {
        const { stream, fileName, mimeType } = await this.service.getDocumentFile(
            id,
            documentId,
        )

        res.header('Content-Type', mimeType)
        res.header(
            'Content-Disposition',
            `inline; filename="${encodeURIComponent(fileName)}"`,
        )

        return res.send(stream)
    }

    @Delete(':id/documents/:documentId')
    removeDocument(@Param('id') id: string, @Param('documentId') documentId: string) {
        return this.service.removeDocument(id, documentId)
    }
}
