import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CreateFiDocumentTypeDto, UpdateFiDocumentTypeDto } from '../dto/document-type.dto'
import { DocumentTypesService } from './document-types.service'
@Controller('fico/document-types')
export class DocumentTypesController {
    constructor(private service: DocumentTypesService) {}
    @Get() @RequirePermission('fico.configuration', 'read') list() { return this.service.list() }
    @Post() @RequirePermission('fico.configuration', 'create') create(@Body() dto: CreateFiDocumentTypeDto) { return this.service.create(dto) }
    @Patch(':id') @RequirePermission('fico.configuration', 'update') update(@Param('id') id: string, @Body() dto: UpdateFiDocumentTypeDto) { return this.service.update(id, dto) }
    @Delete(':id') @RequirePermission('fico.configuration', 'delete') deactivate(@Param('id') id: string) { return this.service.deactivate(id) }
}
