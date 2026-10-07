import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { RfqService } from './rfq.service'
import {
    AwardRfqDto,
    CreateRfqDto,
    CreateRfqFromPrDto,
    InviteSuppliersDto,
} from './dto/create-rfq.dto'
import { RfqQueryDto } from './dto/rfq-query.dto'
import { MmMutation } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/rfqs')
export class RfqController {
    constructor(private readonly service: RfqService) {}

    @Post()
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    create(@Body() dto: CreateRfqDto) {
        return this.service.create(dto)
    }

    @Post('from-pr')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
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
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    update(@Param('id') id: string, @Body() dto: Partial<CreateRfqDto>) {
        return this.service.update(id, dto)
    }

    @Post(':id/invite-suppliers')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    invite(
        @Param('id') id: string,
        @Body() dto: InviteSuppliersDto & { performedBy?: string },
    ) {
        return this.service.inviteSuppliers(id, dto, dto.performedBy)
    }

    @Post(':id/issue')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    issue(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.issue(id, body?.performedBy)
    }

    @Post(':id/start-evaluation')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    startEvaluation(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.startEvaluation(id, body?.performedBy)
    }

    @Get(':id/comparison')
    comparison(@Param('id') id: string) {
        return this.service.getComparison(id)
    }

    @Post(':id/award')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    award(@Param('id') id: string, @Body() dto: AwardRfqDto) {
        return this.service.award(id, dto)
    }

    @Post(':id/close')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    close(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.close(id, body?.performedBy)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('procurement', 'rfqs'))
    cancel(@Param('id') id: string, @Body() body: { performedBy?: string }) {
        return this.service.cancel(id, body?.performedBy)
    }

    @Get(':id/audit')
    audit(@Param('id') id: string) {
        return this.service.getAudit(id)
    }
}
