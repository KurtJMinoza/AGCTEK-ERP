import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { QuotationService } from './quotation.service'
import {
    CreateQuotationDto,
    UpdateQuotationScoresDto,
} from './dto/create-quotation.dto'
import { QuotationQueryDto } from './dto/rfq-query.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/supplier-quotations')
export class QuotationController {
    constructor(private readonly service: QuotationService) {}

    @Post()
    @MmMutation()
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
    @MmMutation()
    update(@Param('id') id: string, @Body() dto: Partial<CreateQuotationDto>) {
        return this.service.update(id, dto)
    }

    @Post(':id/submit')
    @MmMutation()
    submit(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.submit(id, body?.performedBy)
    }

    @Post(':id/withdraw')
    @MmMutation()
    withdraw(@Param('id') id: string) {
        return this.service.withdraw(id)
    }

    @Put(':id/scores')
    @MmMutation()
    scores(@Param('id') id: string, @Body() dto: UpdateQuotationScoresDto) {
        return this.service.updateScores(id, dto)
    }
}
