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
import { ReceivingDocumentService } from './receiving-document.service'
import { ReceivingVarianceService } from './receiving-variance.service'
import {
    CreateReceivingDocumentDto,
    ReceivingActionDto,
    ReceivingQueryDto,
    VarianceQueryDto,
} from './dto/receiving.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('receiving', 'goods-receipt', 'receiving-inspection', 'receiving-variances')

@Controller('mm/receiving')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReceivingController {
    constructor(
        private receivingDocs: ReceivingDocumentService,
        private variances: ReceivingVarianceService,
    ) {}

    @Post()
    @MmMutation(mmFeatures('receiving', 'goods-receipt', 'receiving-inspection'))
    create(@Body() dto: CreateReceivingDocumentDto) {
        return this.receivingDocs.create(dto)
    }

    @Get()
    @MmRead(READERS)
    list(@Query() query: ReceivingQueryDto) {
        return this.receivingDocs.findAll(query)
    }

    @Get('variances')
    @MmRead(READERS)
    listVariances(@Query() query: VarianceQueryDto) {
        return this.variances.list(query)
    }

    @Get(':id')
    @MmRead(READERS)
    get(@Param('id') id: string) {
        return this.receivingDocs.findOne(id)
    }

    @Post(':id/validate')
    @MmMutation(mmFeatures('receiving', 'goods-receipt', 'receiving-inspection'))
    validate(@Param('id') id: string, @Body() dto: ReceivingActionDto) {
        return this.receivingDocs.validate(id, dto)
    }

    @Post(':id/post')
    @MmMutation(mmFeatures('receiving', 'goods-receipt', 'receiving-inspection'))
    post(@Param('id') id: string, @Body() dto: ReceivingActionDto) {
        return this.receivingDocs.post(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('receiving', 'goods-receipt', 'receiving-inspection'))
    cancel(@Param('id') id: string, @Body() dto: ReceivingActionDto) {
        return this.receivingDocs.cancel(id, dto)
    }
}
