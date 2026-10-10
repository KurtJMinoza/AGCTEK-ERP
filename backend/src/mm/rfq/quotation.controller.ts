import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { QuotationService } from './quotation.service'
import {
    CreateQuotationDto,
    UpdateQuotationScoresDto,
} from './dto/create-quotation.dto'
import { QuotationQueryDto } from './dto/rfq-query.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('procurement', 'quotation-comparison', 'supplier-quotations')

@Controller('mm/supplier-quotations')
export class QuotationController {
    constructor(private readonly service: QuotationService) {}

    @Post()
    @MmMutation(mmFeatures('procurement', 'supplier-quotations'))
    create(@Body() dto: CreateQuotationDto) {
        return this.service.create(dto)
    }

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: QuotationQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    @MmMutation(mmFeatures('procurement', 'supplier-quotations'))
    update(@Param('id') id: string, @Body() dto: Partial<CreateQuotationDto>) {
        return this.service.update(id, dto)
    }

    @Post(':id/submit')
    @MmMutation(mmFeatures('procurement', 'supplier-quotations'))
    submit(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.submit(id, body?.performedBy)
    }

    @Post(':id/withdraw')
    @MmMutation(mmFeatures('procurement', 'supplier-quotations'))
    withdraw(@Param('id') id: string) {
        return this.service.withdraw(id)
    }

    @Put(':id/scores')
    @MmMutation(mmFeatures('procurement', 'supplier-quotations', 'quotation-comparison'))
    scores(@Param('id') id: string, @Body() dto: UpdateQuotationScoresDto) {
        return this.service.updateScores(id, dto)
    }
}
