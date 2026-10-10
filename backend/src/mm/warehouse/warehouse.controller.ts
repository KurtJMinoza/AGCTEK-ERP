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
import { WarehouseService } from './warehouse.service'
import { CreateWarehouseDto } from './dto/create-warehouse.dto'
import { UpdateWarehouseDto } from './dto/update-warehouse.dto'
import { WarehouseQueryDto } from './dto/warehouse-query.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/warehouses')
export class WarehouseController {
    constructor(private readonly service: WarehouseService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query() query: WarehouseQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'warehouses'), 'create')
    create(@Body() dto: CreateWarehouseDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    @MmMutation(mmFeatures('warehouse-management', 'warehouses'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
        return this.service.update(id, dto)
    }

    @Post(':id/geocode/confirm')
    @MmMutation(mmFeatures('warehouse-management', 'warehouses'), 'update')
    confirmGeocode(@Param('id') id: string, @Body() body: { lat?: unknown; lng?: unknown }) {
        return this.service.confirmGeocode(id, body)
    }

    @Post(':id/activate')
    @MmMutation(mmFeatures('warehouse-management', 'warehouses'), 'update')
    activate(@Param('id') id: string) {
        return this.service.activate(id)
    }

    @Post(':id/deactivate')
    @MmMutation(mmFeatures('warehouse-management', 'warehouses'), 'update')
    deactivate(@Param('id') id: string) {
        return this.service.deactivate(id)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('warehouse-management', 'warehouses'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
