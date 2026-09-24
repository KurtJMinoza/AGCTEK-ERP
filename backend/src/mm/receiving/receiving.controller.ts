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
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/receiving')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReceivingController {
    constructor(
        private receivingDocs: ReceivingDocumentService,
        private variances: ReceivingVarianceService,
    ) {}

    @Post()
    @MmMutation()
    create(@Body() dto: CreateReceivingDocumentDto) {
        return this.receivingDocs.create(dto)
    }

    @Get()
    list(@Query() query: ReceivingQueryDto) {
        return this.receivingDocs.findAll(query)
    }

    @Get('variances')
    listVariances(@Query() query: VarianceQueryDto) {
        return this.variances.list(query)
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.receivingDocs.findOne(id)
    }

    @Post(':id/validate')
    @MmMutation()
    validate(@Param('id') id: string, @Body() dto: ReceivingActionDto) {
        return this.receivingDocs.validate(id, dto)
    }

    @Post(':id/post')
    @MmMutation()
    post(@Param('id') id: string, @Body() dto: ReceivingActionDto) {
        return this.receivingDocs.post(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation()
    cancel(@Param('id') id: string, @Body() dto: ReceivingActionDto) {
        return this.receivingDocs.cancel(id, dto)
    }
}
