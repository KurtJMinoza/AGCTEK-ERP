import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { DisposalService } from './disposal.service'
import { DamagedExpiredQueryService } from './damaged-expired-query.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'
import {
    CreateDisposalDto,
    UpdateDisposalDto,
    DisposalQueryDto,
    ActionDto,
    CreateFromBalancesDto,
} from './dto/returns-disposal.dto'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('returns-disposal', 'customer-return-intake', 'damaged-stock', 'disposal', 'expired-stock', 'scrap', 'supplier-returns')

@Controller('mm/disposals')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DisposalsController {
    constructor(
        private disposalService: DisposalService,
        private damagedExpiredService: DamagedExpiredQueryService,
    ) {}

    @Get()
    @MmRead(READERS)
    list(@Query() query: DisposalQueryDto) {
        return this.disposalService.findAll(query)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post()
    create(@Body() dto: CreateDisposalDto) {
        return this.disposalService.create(dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post('from-balances')
    createFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createDisposalFromBalances(dto)
    }

    @Get(':id')
    @MmRead(READERS)
    get(@Param('id') id: string) {
        return this.disposalService.findOne(id)
    }

    @Patch(':id')
    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'), 'update')
    update(@Param('id') id: string, @Body() dto: UpdateDisposalDto) {
        return this.disposalService.update(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post(':id/submit')
    submit(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.submit(id, dto?.performedBy)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.approve(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post(':id/reject')
    reject(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reject(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post(':id/post')
    post(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.post(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post(':id/cancel')
    cancel(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.cancel(id, dto)
    }

    @MmMutation(mmFeatures('returns-disposal', 'disposal', 'scrap'))
    @Post(':id/reverse')
    reverse(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reverse(id, dto)
    }
}
