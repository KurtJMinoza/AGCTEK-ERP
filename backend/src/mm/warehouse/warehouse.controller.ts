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

@Controller('mm/warehouses')
export class WarehouseController {
    constructor(private readonly service: WarehouseService) {}

    @Get()
    findAll(@Query() query: WarehouseQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateWarehouseDto) {
        return this.service.create(dto)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
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

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
