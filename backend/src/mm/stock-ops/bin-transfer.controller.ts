import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { BinTransferService } from './bin-transfer.service'
import { CreateBinTransferDto } from './dto/create-bin-transfer.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'

@Controller('mm/bin-transfers')
export class BinTransferController {
    constructor(private service: BinTransferService) {}

    @Post()
    create(@Body() dto: CreateBinTransferDto) {
        return this.service.create(dto)
    }

    @Post(':id/post')
    post(@Param('id') id: string) {
        return this.service.post(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    @Post(':id/reverse')
    reverse(@Param('id') id: string, @Body() body: { createdBy?: string }) {
        return this.service.reverse(id, body?.createdBy)
    }

    @Get()
    findAll(@Query() query: StockOpsQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }
}
