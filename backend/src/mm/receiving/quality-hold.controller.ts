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
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/quality-holds')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class QualityHoldController {
    constructor(private holds: QualityHoldService) {}

    @Post()
    @MmMutation()
    create(@Body() dto: CreateQualityHoldDto) {
        return this.holds.create(dto)
    }

    @Get()
    list(@Query() query: ReceivingQueryDto) {
        return this.holds.findAll(query)
    }

    @Post(':id/release')
    @MmMutation()
    release(@Param('id') id: string, @Body() dto: ReleaseQualityHoldDto) {
        return this.holds.release(id, dto)
    }
}
