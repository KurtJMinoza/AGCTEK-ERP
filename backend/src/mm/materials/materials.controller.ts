import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common'
import { MaterialsService } from './materials.service'
import { CreateMaterialDto } from './dto/create-material.dto'
import { UpdateMaterialDto } from './dto/update-material.dto'
import { MaterialQueryDto } from './dto/material-query.dto'

@Controller('mm/materials')
export class MaterialsController {
    constructor(private readonly service: MaterialsService) {}

    @Get()
    findAll(@Query() query: MaterialQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id/balances')
    listBalances(@Param('id') id: string) {
        return this.service.listBalances(id)
    }

    @Get(':id/transactions')
    listTransactions(@Param('id') id: string, @Query('limit') limit?: string) {
        return this.service.listTransactions(id, limit ? Number(limit) : 50)
    }

    @Get(':id/attachments')
    listAttachments(@Param('id') id: string) {
        return this.service.listAttachments(id)
    }

    @Post(':id/attachments')
    addAttachment(
        @Param('id') id: string,
        @Body() body: {
            fileName: string
            fileUrl?: string
            storageKey?: string
            mimeType?: string
            uploadedBy?: string
        },
    ) {
        return this.service.addAttachment(id, body)
    }

    @Delete(':id/attachments/:attachmentId')
    removeAttachment(
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
    ) {
        return this.service.removeAttachment(id, attachmentId)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateMaterialDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
        return this.service.update(id, dto)
    }

    @Post(':id/activate')
    activate(@Param('id') id: string) {
        return this.service.activate(id)
    }

    @Post(':id/deactivate')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }

    @Post(':id/block')
    block(@Param('id') id: string, @Body() body?: { reason?: string }) {
        return this.service.block(id, body?.reason)
    }

    @Post(':id/unblock')
    unblock(@Param('id') id: string) {
        return this.service.unblock(id)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
