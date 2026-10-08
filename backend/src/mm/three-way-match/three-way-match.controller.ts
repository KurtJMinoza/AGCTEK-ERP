import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { SupplierInvoiceService } from './supplier-invoice.service'
import { ThreeWayMatchService } from './three-way-match.service'
import { MatchExceptionService } from './match-exception.service'
import { MatchToleranceService } from './match-tolerance.service'
import {
    CreateSupplierInvoiceDto,
    UpdateSupplierInvoiceDto,
    SupplierInvoiceQueryDto,
    ApproveInvoiceDto,
    MatchExceptionQueryDto,
    ResolveExceptionDto,
    UpsertMatchToleranceDto,
} from './dto/three-way-match.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('procurement', 'match-exceptions', 'supplier-invoices', 'three-way-match')

@Controller('mm/three-way-match')
export class ThreeWayMatchController {
    constructor(
        private invoices: SupplierInvoiceService,
        private match: ThreeWayMatchService,
        private exceptions: MatchExceptionService,
        private tolerances: MatchToleranceService,
    ) {}

    // ── Tolerance config ───────────────────────────────────────────

    @Get('tolerance-config')
    @MmRead(READERS)
    getTolerance(@Query('companyId') companyId: string) {
        return this.tolerances.getCompanyConfig(companyId)
    }

    @Patch('tolerance-config')
    @MmMutation(mmFeatures('procurement', 'three-way-match'), 'update')
    upsertTolerance(@Body() dto: UpsertMatchToleranceDto) {
        return this.tolerances.upsertCompanyConfig(dto)
    }

    // ── Exceptions ─────────────────────────────────────────────────

    @Get('exceptions')
    @MmRead(READERS)
    listExceptions(@Query() query: MatchExceptionQueryDto) {
        return this.exceptions.findAll(query)
    }

    @Get('exceptions/:id')
    @MmRead(READERS)
    getException(@Param('id') id: string) {
        return this.exceptions.findOne(id)
    }

    @Post('exceptions/:id/acknowledge')
    @MmMutation(mmFeatures('procurement', 'match-exceptions', 'three-way-match'), 'update')
    acknowledge(@Param('id') id: string) {
        return this.exceptions.acknowledge(id)
    }

    @Post('exceptions/:id/resolve')
    @MmMutation(mmFeatures('procurement', 'match-exceptions', 'three-way-match'), 'update')
    resolve(@Param('id') id: string, @Body() dto: ResolveExceptionDto) {
        return this.exceptions.resolve(id, dto ?? {})
    }

    @Post('exceptions/:id/waive')
    @MmMutation(mmFeatures('procurement', 'match-exceptions', 'three-way-match'), 'update')
    waive(@Param('id') id: string, @Body() dto: ResolveExceptionDto) {
        return this.exceptions.waive(id, dto ?? {})
    }

    // ── Invoices ───────────────────────────────────────────────────

    @Get('invoices')
    @MmRead(READERS)
    listInvoices(@Query() query: SupplierInvoiceQueryDto) {
        return this.invoices.findAll(query)
    }

    @Get('invoices/:id')
    @MmRead(READERS)
    getInvoice(@Param('id') id: string) {
        return this.invoices.findOne(id)
    }

    @Post('invoices')
    @MmMutation(mmFeatures('procurement', 'supplier-invoices'), 'create')
    createInvoice(@Body() dto: CreateSupplierInvoiceDto) {
        return this.invoices.create(dto)
    }

    @Patch('invoices/:id')
    @MmMutation(mmFeatures('procurement', 'supplier-invoices'), 'update')
    updateInvoice(@Param('id') id: string, @Body() dto: UpdateSupplierInvoiceDto) {
        return this.invoices.update(id, dto)
    }

    @Post('invoices/:id/submit')
    @MmMutation(mmFeatures('procurement', 'supplier-invoices'), 'update')
    submit(@Param('id') id: string) {
        return this.invoices.submit(id)
    }

    @Get('invoices/:id/match-preview')
    @MmRead(READERS)
    preview(@Param('id') id: string) {
        return this.match.matchPreview(id)
    }

    @Post('invoices/:id/run-match')
    @MmMutation(mmFeatures('procurement', 'supplier-invoices', 'three-way-match'), 'update')
    runMatch(@Param('id') id: string) {
        return this.match.runMatch(id)
    }

    @Post('invoices/:id/approve')
    @MmMutation(mmFeatures('procurement', 'supplier-invoices'), 'update')
    approve(@Param('id') id: string, @Body() dto: ApproveInvoiceDto) {
        return this.match.approve(id, dto ?? {})
    }
}
