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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('barcode-rfid', 'mobile-receiving'), ...mmFeatures('receiving', 'advanced-shipping-notices', 'expected-receipts', 'goods-receipt', 'inspection-queue', 'quality-quarantine', 'receiving-inspection', 'usage-decisions')]

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
    @MmMutation(mmFeatures('receiving', 'advanced-shipping-notices'), 'create')
    createAsn(@Body() dto: CreateAsnDto) {
        return this.expectedReceipts.createAsn(dto)
    }

    @Get('asns')
    @MmRead(READERS)
    listAsns(@Query() query: InboundQueryDto) {
        return this.expectedReceipts.listAsns(query)
    }

    @Get('asns/:id')
    @MmRead(READERS)
    getAsn(@Param('id') id: string) {
        return this.expectedReceipts.getAsn(id)
    }

    @Post('asns/:id/confirm')
    @MmMutation(mmFeatures('receiving', 'advanced-shipping-notices'), 'update')
    confirmAsn(@Param('id') id: string) {
        return this.expectedReceipts.confirmAsn(id)
    }

    @Post('asns/:id/cancel')
    @MmMutation(mmFeatures('receiving', 'advanced-shipping-notices'), 'update')
    cancelAsn(@Param('id') id: string) {
        return this.expectedReceipts.cancelAsn(id)
    }

    // ── Expected receipts ───────────────────────────────────────────
    @Post('expected-receipts/from-po')
    @MmMutation(mmFeatures('receiving', 'expected-receipts'), 'create')
    fromPo(@Body() dto: CreateExpectedReceiptFromPoDto) {
        return this.expectedReceipts.createFromPo(dto)
    }

    @Post('expected-receipts/from-asn')
    @MmMutation(mmFeatures('receiving', 'expected-receipts'), 'create')
    fromAsn(@Body() dto: CreateExpectedReceiptFromAsnDto) {
        return this.expectedReceipts.createFromAsn(dto)
    }

    @Get('expected-receipts')
    @MmRead(READERS)
    listExpected(@Query() query: InboundQueryDto) {
        return this.expectedReceipts.list(query)
    }

    @Get('expected-receipts/:id')
    @MmRead(READERS)
    getExpected(@Param('id') id: string) {
        return this.expectedReceipts.findOne(id)
    }

    // ── Receiving ───────────────────────────────────────────────────
    @Post('receiving')
    @MmMutation(mmFeatures('receiving', 'goods-receipt', 'receiving-inspection'))
    receive(@Body() dto: ReceiveDto & { autoPost?: boolean }) {
        return this.receiving.receive({ ...dto, autoPost: dto.autoPost ?? true })
    }

    // ── Quality ─────────────────────────────────────────────────────
    @Get('quality-inspections')
    @MmRead(READERS)
    listQi(@Query() query: InboundQueryDto) {
        return this.quality.list(query)
    }

    @Get('quality-inspections/:id')
    @MmRead(READERS)
    getQi(@Param('id') id: string) {
        return this.quality.findOne(id)
    }

    @Post('quality-inspections/:id/decide')
    @MmMutation(mmFeatures('receiving', 'usage-decisions', 'inspection-queue', 'receiving-inspection'))
    decideQi(@Param('id') id: string, @Body() dto: QualityDecideDto) {
        return this.quality.decide(id, dto)
    }
}
