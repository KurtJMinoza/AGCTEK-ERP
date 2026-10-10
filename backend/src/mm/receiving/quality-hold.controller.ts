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
import { QualityHoldService } from './quality-hold.service'
import {
    CreateQualityHoldDto,
    ReleaseQualityHoldDto,
    ReceivingQueryDto,
} from './dto/receiving.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('receiving', 'quality-holds', 'quality-quarantine')

@Controller('mm/quality-holds')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class QualityHoldController {
    constructor(private holds: QualityHoldService) {}

    @Post()
    @MmMutation(mmFeatures('receiving', 'quality-holds', 'quality-quarantine'))
    create(@Body() dto: CreateQualityHoldDto) {
        return this.holds.create(dto)
    }

    @Get()
    @MmRead(READERS)
    list(@Query() query: ReceivingQueryDto) {
        return this.holds.findAll(query)
    }

    @Post(':id/release')
    @MmMutation(mmFeatures('receiving', 'quality-holds', 'quality-quarantine'))
    release(@Param('id') id: string, @Body() dto: ReleaseQualityHoldDto) {
        return this.holds.release(id, dto)
    }
}
