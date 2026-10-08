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
import { StorageBinsService } from './storage-bins.service'
import { CreateStorageBinDto } from './dto/create-storage-bin.dto'
import { UpdateStorageBinDto } from './dto/update-storage-bin.dto'
import { StorageBinQueryDto } from './dto/storage-bin-query.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/storage-bins')
export class StorageBinsController {
    constructor(private readonly service: StorageBinsService) {}

    @Get('capacity/summary')
    @MmRead(MM_REFERENCE_READ)
    getCapacitySummary(@Query('warehouseId') warehouseId?: string) {
        return this.service.getCapacitySummary(warehouseId)
    }

    @Get('capacity/details')
    @MmRead(MM_REFERENCE_READ)
    getCapacityDetails(@Query() query: StorageBinQueryDto) {
        return this.service.findAllWithOccupancy(query)
    }

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Query() query: StorageBinQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'storage-bins'), 'create')
    create(@Body() dto: CreateStorageBinDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-bins'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateStorageBinDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('warehouse-management', 'storage-bins'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
