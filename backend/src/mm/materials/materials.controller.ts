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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/materials')
export class MaterialsController {
    constructor(private readonly service: MaterialsService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query() query: MaterialQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id/balances')
    @MmRead(MM_REFERENCE_READ)
    listBalances(@Param('id') id: string) {
        return this.service.listBalances(id)
    }

    @Get(':id/transactions')
    @MmRead(MM_REFERENCE_READ)
    listTransactions(@Param('id') id: string, @Query('limit') limit?: string) {
        return this.service.listTransactions(id, limit ? Number(limit) : 50)
    }

    @Get(':id/attachments')
    @MmRead(MM_REFERENCE_READ)
    listAttachments(@Param('id') id: string) {
        return this.service.listAttachments(id)
    }

    @Post(':id/attachments')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'update')
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
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'delete')
    removeAttachment(
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
    ) {
        return this.service.removeAttachment(id, attachmentId)
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'create')
    create(@Body() dto: CreateMaterialDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
        return this.service.update(id, dto)
    }

    @Post(':id/activate')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'update')
    activate(@Param('id') id: string) {
        return this.service.activate(id)
    }

    @Post(':id/deactivate')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'update')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }

    @Post(':id/block')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'update')
    block(@Param('id') id: string, @Body() body?: { reason?: string }) {
        return this.service.block(id, body?.reason)
    }

    @Post(':id/unblock')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'update')
    unblock(@Param('id') id: string) {
        return this.service.unblock(id)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'materials-skus'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
