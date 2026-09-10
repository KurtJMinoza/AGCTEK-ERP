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
import { ExpectedReceiptService } from './expected-receipt.service'
import { ReceivingService } from './receiving.service'
import { QualityInspectionService } from './quality-inspection.service'
import {
    CreateAsnDto,
    CreateExpectedReceiptFromAsnDto,
    CreateExpectedReceiptFromPoDto,
    InboundQueryDto,
    QualityDecideDto,
    ReceiveDto,
} from './dto/inbound.dto'

@Controller('mm/inbound')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InboundController {
    constructor(
        private expectedReceipts: ExpectedReceiptService,
        private receiving: ReceivingService,
        private quality: QualityInspectionService,
    ) {}

    // ── ASN ─────────────────────────────────────────────────────────
    @Post('asns')
    createAsn(@Body() dto: CreateAsnDto) {
        return this.expectedReceipts.createAsn(dto)
    }

    @Get('asns')
    listAsns(@Query() query: InboundQueryDto) {
        return this.expectedReceipts.listAsns(query)
    }

    @Get('asns/:id')
    getAsn(@Param('id') id: string) {
        return this.expectedReceipts.getAsn(id)
    }

    @Post('asns/:id/confirm')
    confirmAsn(@Param('id') id: string) {
        return this.expectedReceipts.confirmAsn(id)
    }

    @Post('asns/:id/cancel')
    cancelAsn(@Param('id') id: string) {
        return this.expectedReceipts.cancelAsn(id)
    }

    // ── Expected receipts ───────────────────────────────────────────
    @Post('expected-receipts/from-po')
    fromPo(@Body() dto: CreateExpectedReceiptFromPoDto) {
        return this.expectedReceipts.createFromPo(dto)
    }

    @Post('expected-receipts/from-asn')
    fromAsn(@Body() dto: CreateExpectedReceiptFromAsnDto) {
        return this.expectedReceipts.createFromAsn(dto)
    }

    @Get('expected-receipts')
    listExpected(@Query() query: InboundQueryDto) {
        return this.expectedReceipts.list(query)
    }

    @Get('expected-receipts/:id')
    getExpected(@Param('id') id: string) {
        return this.expectedReceipts.findOne(id)
    }

    // ── Receiving ───────────────────────────────────────────────────
    @Post('receiving')
    receive(@Body() dto: ReceiveDto) {
        return this.receiving.receive(dto)
    }

    // ── Quality ─────────────────────────────────────────────────────
    @Get('quality-inspections')
    listQi(@Query() query: InboundQueryDto) {
        return this.quality.list(query)
    }

    @Get('quality-inspections/:id')
    getQi(@Param('id') id: string) {
        return this.quality.findOne(id)
    }

    @Post('quality-inspections/:id/decide')
    decideQi(@Param('id') id: string, @Body() dto: QualityDecideDto) {
        return this.quality.decide(id, dto)
    }
}
