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
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    FicoDocumentTypeCreateDto,
    FicoDocumentTypeHistoryQueryDto,
    FicoDocumentTypeListQueryDto,
    FicoDocumentTypeStatusDto,
    FicoDocumentTypeUpdateDto,
} from './dto/fico-document-type.dto'
import { FicoDocumentTypeService } from './fico-document-type.service'

@Controller('fico')
export class FicoDocumentTypeController {
    constructor(private readonly documentTypes: FicoDocumentTypeService) {}

    @Get('document-types')
    @RequirePermission('fico.document-types', 'read')
    list(
        @Query() query: FicoDocumentTypeListQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.list(query, user)
    }

    @Get('document-types/summary')
    @RequirePermission('fico.document-types', 'read')
    summary(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.summary(companyId, user)
    }

    @Get('document-types/reference-data')
    @RequirePermission('fico.document-types', 'read')
    referenceData() {
        return this.documentTypes.referenceData()
    }

    @Post('document-types')
    @RequirePermission('fico.document-types', 'create')
    create(
        @Body() dto: FicoDocumentTypeCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.create(dto, user)
    }

    @Get('document-types/:id')
    @RequirePermission('fico.document-types', 'read')
    get(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.documentTypes.get(id, user)
    }

    @Patch('document-types/:id')
    @RequirePermission('fico.document-types', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: FicoDocumentTypeUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.update(id, dto, user)
    }

    @Delete('document-types/:id')
    @RequirePermission('fico.document-types', 'delete')
    remove(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.documentTypes.remove(id, user)
    }

    @Post('document-types/:id/activate')
    @RequirePermission('fico.document-types', 'update')
    activate(
        @Param('id') id: string,
        @Body() dto: FicoDocumentTypeStatusDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.activate(id, dto, user)
    }

    @Post('document-types/:id/deactivate')
    @RequirePermission('fico.document-types', 'update')
    deactivate(
        @Param('id') id: string,
        @Body() dto: FicoDocumentTypeStatusDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.deactivate(id, dto, user)
    }

    @Get('document-types/:id/history')
    @RequirePermission('fico.document-types', 'read')
    history(
        @Param('id') id: string,
        @Query() query: FicoDocumentTypeHistoryQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.documentTypes.history(id, query, user)
    }
}
