import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
} from '@nestjs/common'
import { RequirePermission } from '../permissions/permission.guard'
import {
    CreateFiDocumentTypeDto,
    UpdateFiDocumentTypeDto,
} from './dto/fico-fi-document-type.dto'
import { FicoFiDocumentTypeService } from './fico-fi-document-type.service'

/** Legacy global FI document types — Desktop journal UI compatibility. */
@Controller('fico/fi-document-types')
export class FicoFiDocumentTypeController {
    constructor(private readonly service: FicoFiDocumentTypeService) {}

    @Get()
    @RequirePermission('fico.configuration', 'read')
    list() {
        return this.service.list()
    }

    @Post()
    @RequirePermission('fico.configuration', 'create')
    create(@Body() dto: CreateFiDocumentTypeDto) {
        return this.service.create(dto)
    }

    @Patch(':id')
    @RequirePermission('fico.configuration', 'update')
    update(@Param('id') id: string, @Body() dto: UpdateFiDocumentTypeDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @RequirePermission('fico.configuration', 'delete')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }
}
