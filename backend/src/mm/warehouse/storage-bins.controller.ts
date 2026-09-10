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

@Controller('mm/storage-bins')
export class StorageBinsController {
    constructor(private readonly service: StorageBinsService) {}

    @Get('capacity/summary')
    getCapacitySummary(@Query('warehouseId') warehouseId?: string) {
        return this.service.getCapacitySummary(warehouseId)
    }

    @Get('capacity/details')
    getCapacityDetails(@Query() query: StorageBinQueryDto) {
        return this.service.findAllWithOccupancy(query)
    }

    @Get()
    findAll(@Query() query: StorageBinQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateStorageBinDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateStorageBinDto) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
