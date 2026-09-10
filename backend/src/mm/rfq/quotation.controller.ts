import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { QuotationService } from './quotation.service'
import {
    CreateQuotationDto,
    UpdateQuotationScoresDto,
} from './dto/create-quotation.dto'
import { QuotationQueryDto } from './dto/rfq-query.dto'

@Controller('mm/supplier-quotations')
export class QuotationController {
    constructor(private readonly service: QuotationService) {}

    @Post()
    create(@Body() dto: CreateQuotationDto) {
        return this.service.create(dto)
    }

    @Get()
    findAll(@Query() query: QuotationQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: Partial<CreateQuotationDto>) {
        return this.service.update(id, dto)
    }

    @Post(':id/submit')
    submit(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.submit(id, body?.performedBy)
    }

    @Post(':id/withdraw')
    withdraw(@Param('id') id: string) {
        return this.service.withdraw(id)
    }

    @Put(':id/scores')
    scores(@Param('id') id: string, @Body() dto: UpdateQuotationScoresDto) {
        return this.service.updateScores(id, dto)
    }
}
