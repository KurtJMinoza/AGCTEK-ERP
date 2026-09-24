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
import { MmMutation } from '../common/mm-mutation.decorator'
import {
    CreateDisposalDto,
    UpdateDisposalDto,
    DisposalQueryDto,
    ActionDto,
    CreateFromBalancesDto,
} from './dto/returns-disposal.dto'

@Controller('mm/disposals')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DisposalsController {
    constructor(
        private disposalService: DisposalService,
        private damagedExpiredService: DamagedExpiredQueryService,
    ) {}

    @Get()
    list(@Query() query: DisposalQueryDto) {
        return this.disposalService.findAll(query)
    }

    @MmMutation()
    @Post()
    create(@Body() dto: CreateDisposalDto) {
        return this.disposalService.create(dto)
    }

    @MmMutation()
    @Post('from-balances')
    createFromBalances(@Body() dto: CreateFromBalancesDto) {
        return this.damagedExpiredService.createDisposalFromBalances(dto)
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.disposalService.findOne(id)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateDisposalDto) {
        return this.disposalService.update(id, dto)
    }

    @MmMutation()
    @Post(':id/submit')
    submit(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.submit(id, dto?.performedBy)
    }

    @MmMutation()
    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.approve(id, dto)
    }

    @MmMutation()
    @Post(':id/reject')
    reject(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reject(id, dto)
    }

    @MmMutation()
    @Post(':id/post')
    post(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.post(id, dto)
    }

    @MmMutation()
    @Post(':id/cancel')
    cancel(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.cancel(id, dto)
    }

    @MmMutation()
    @Post(':id/reverse')
    reverse(@Param('id') id: string, @Body() dto: ActionDto) {
        return this.disposalService.reverse(id, dto)
    }
}
