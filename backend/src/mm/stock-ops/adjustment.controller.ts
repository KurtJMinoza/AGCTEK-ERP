import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { AdjustmentService } from './adjustment.service'
import { CreateAdjustmentDto } from './dto/create-adjustment.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'

@Controller('mm/adjustments')
export class AdjustmentController {
    constructor(private service: AdjustmentService) {}

    @Post()
    create(@Body() dto: CreateAdjustmentDto) {
        return this.service.create(dto)
    }

    @Post(':id/submit')
    submit(@Param('id') id: string) {
        return this.service.submit(id)
    }

    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() body: { approvedBy?: string }) {
        return this.service.approve(id, body?.approvedBy)
    }

    @Post(':id/reject')
    reject(@Param('id') id: string, @Body() body: { reason?: string }) {
        return this.service.reject(id, body?.reason)
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
