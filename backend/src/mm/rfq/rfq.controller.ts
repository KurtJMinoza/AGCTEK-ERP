import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { RfqService } from './rfq.service'
import {
    AwardRfqDto,
    CreateRfqDto,
    CreateRfqFromPrDto,
    InviteSuppliersDto,
} from './dto/create-rfq.dto'
import { RfqQueryDto } from './dto/rfq-query.dto'

@Controller('mm/rfqs')
export class RfqController {
    constructor(private readonly service: RfqService) {}

    @Post()
    create(@Body() dto: CreateRfqDto) {
        return this.service.create(dto)
    }

    @Post('from-pr')
    createFromPr(@Body() dto: CreateRfqFromPrDto) {
        return this.service.createFromPr(dto)
    }

    @Get()
    findAll(@Query() query: RfqQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: Partial<CreateRfqDto>) {
        return this.service.update(id, dto)
    }

    @Post(':id/invite-suppliers')
    invite(
        @Param('id') id: string,
        @Body() dto: InviteSuppliersDto & { performedBy?: string },
    ) {
        return this.service.inviteSuppliers(id, dto, dto.performedBy)
    }

    @Post(':id/issue')
    issue(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.issue(id, body?.performedBy)
    }

    @Post(':id/start-evaluation')
    startEvaluation(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.startEvaluation(id, body?.performedBy)
    }

    @Get(':id/comparison')
    comparison(@Param('id') id: string) {
        return this.service.getComparison(id)
    }

    @Post(':id/award')
    award(@Param('id') id: string, @Body() dto: AwardRfqDto) {
        return this.service.award(id, dto)
    }

    @Post(':id/close')
    close(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.close(id, body?.performedBy)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.cancel(id, body?.performedBy)
    }

    @Get(':id/audit')
    audit(@Param('id') id: string) {
        return this.service.getAudit(id)
    }
}
