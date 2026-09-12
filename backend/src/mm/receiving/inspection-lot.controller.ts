import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { InspectionLotService } from './inspection-lot.service'
import {
    RecordInspectionResultsDto,
    UsageDecisionDto,
    ReceivingQueryDto,
} from './dto/receiving.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/inspection-lots')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InspectionLotController {
    constructor(private lots: InspectionLotService) {}

    @Get()
    list(@Query() query: ReceivingQueryDto) {
        return this.lots.findAll(query)
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.lots.findOne(id)
    }

    @Post(':id/results')
    @MmMutation()
    recordResults(@Param('id') id: string, @Body() dto: RecordInspectionResultsDto) {
        return this.lots.recordResults(id, dto)
    }

    @Post(':id/usage-decision')
    @MmMutation()
    usageDecision(@Param('id') id: string, @Body() dto: UsageDecisionDto) {
        return this.lots.usageDecision(id, dto)
    }
}
