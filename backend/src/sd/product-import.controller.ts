import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    Res,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { RequirePermission } from '../permissions/permission.guard'
import { MmMutation } from '../mm/common/mm-mutation.decorator'
import { mmFeatures } from '../permissions/permissions.constants'
import { ProductImportService } from './product-import.service'

/**
 * One bulk-import API for both entry points: MM → Material Master → Bulk
 * Import and SD → Product Catalog → Bulk Import send the same workbook here.
 */
@Controller('sd/product-imports')
export class ProductImportController {
    constructor(private readonly service: ProductImportService) {}

    @Get('template')
    @RequirePermission('sd.product-catalog', 'read')
    async template(@Res() res: FastifyReply) {
        const buffer = this.service.template()
        res.header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        res.header(
            'Content-Disposition',
            'attachment; filename="product-import-template.xlsx"',
        )
        return res.send(buffer)
    }

    @Get()
    @RequirePermission('sd.product-catalog', 'read')
    history(@Query('limit') limit?: string) {
        return this.service.listBatches(limit ? Number(limit) : 20)
    }

    @Get(':id')
    @RequirePermission('sd.product-catalog', 'read')
    detail(@Param('id') id: string) {
        return this.service.getBatch(id)
    }

    /** Multipart: `file` plus `companyId`, `divisionId`, `source`, `idempotencyKey`. */
    @Post('preview')
    @RequirePermission('sd.product-catalog', 'create')
    async preview(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        let filename = 'products.xlsx'
        const fields: Record<string, string> = {}
        for await (const part of req.parts({
            limits: { fileSize: 10 * 1024 * 1024, files: 1 },
        })) {
            if (part.type === 'file') {
                if (!buffer) {
                    buffer = await part.toBuffer()
                    filename = part.filename || filename
                }
            } else {
                fields[part.fieldname] = String(part.value ?? '')
            }
        }
        if (!fields.companyId) {
            throw new BadRequestException('companyId is required')
        }
        if (!fields.divisionId) {
            throw new BadRequestException('divisionId is required')
        }
        return this.service.preview({
            buffer,
            filename,
            source: fields.source,
            companyId: fields.companyId,
            divisionId: fields.divisionId,
            createdBy: fields.createdBy,
            idempotencyKey: fields.idempotencyKey,
        })
    }

    @Post(':id/commit')
    @RequirePermission('sd.product-catalog', 'update')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'create')
    commit(@Param('id') id: string) {
        return this.service.commit(id)
    }

    @Post(':id/retry')
    @RequirePermission('sd.product-catalog', 'update')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'create')
    retry(@Param('id') id: string) {
        return this.service.retry(id)
    }

    @Post(':id/cancel')
    @RequirePermission('sd.product-catalog', 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    /** Authorized opening-stock posting; never part of the commit itself. */
    @Post(':id/opening-stock')
    @RequirePermission('sd.product-catalog', 'update')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'create')
    postOpeningStock(
        @Param('id') id: string,
        @Body() body: { allowExisting?: boolean; createdBy?: string },
    ) {
        return this.service.postOpeningStock(id, {
            allowExisting: Boolean(body?.allowExisting),
            createdBy: body?.createdBy,
        })
    }
}
