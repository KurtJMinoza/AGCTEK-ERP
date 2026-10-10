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
import { InspectionLotLifecycleService } from '../quality/inspection-lot-lifecycle.service'
import {
    RecordInspectionResultsDto,
    UsageDecisionDto,
    ReceivingQueryDto,
} from './dto/receiving.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('receiving', 'inspection-queue', 'receiving-inspection', 'usage-decisions')

@Controller('mm/inspection-lots')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InspectionLotController {
    constructor(
        private lots: InspectionLotService,
        private lifecycle: InspectionLotLifecycleService,
    ) {}

    @Get()
    @MmRead(READERS)
    list(@Query() query: ReceivingQueryDto) {
        return this.lots.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    get(@Param('id') id: string) {
        return this.lots.findOne(id)
    }

    @Post(':id/results')
    @MmMutation(mmFeatures('receiving', 'inspection-queue', 'receiving-inspection'))
    recordResults(@Param('id') id: string, @Body() dto: RecordInspectionResultsDto) {
        return this.lots.recordResults(id, dto)
    }

    @Post(':id/start')
    @MmMutation(mmFeatures('receiving', 'inspection-queue', 'receiving-inspection'))
    start(@Param('id') id: string, @Body() dto: { inspector?: string }) {
        return this.lifecycle.start(id, dto)
    }

    @Post(':id/complete')
    @MmMutation(mmFeatures('receiving', 'inspection-queue', 'receiving-inspection'))
    complete(@Param('id') id: string, @Body() dto: { completedBy?: string; remarks?: string }) {
        return this.lifecycle.complete(id, dto)
    }

    @Post(':id/usage-decision')
    @MmMutation(mmFeatures('receiving', 'usage-decisions', 'inspection-queue', 'receiving-inspection'))
    usageDecision(@Param('id') id: string, @Body() dto: UsageDecisionDto) {
        return this.lots.usageDecision(id, dto)
    }
}
