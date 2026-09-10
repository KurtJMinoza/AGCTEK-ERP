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
    getTolerance(@Query('companyId') companyId: string) {
        return this.tolerances.getCompanyConfig(companyId)
    }

    @Patch('tolerance-config')
    upsertTolerance(@Body() dto: UpsertMatchToleranceDto) {
        return this.tolerances.upsertCompanyConfig(dto)
    }

    // ── Exceptions ─────────────────────────────────────────────────

    @Get('exceptions')
    listExceptions(@Query() query: MatchExceptionQueryDto) {
        return this.exceptions.findAll(query)
    }

    @Get('exceptions/:id')
    getException(@Param('id') id: string) {
        return this.exceptions.findOne(id)
    }

    @Post('exceptions/:id/acknowledge')
    acknowledge(@Param('id') id: string) {
        return this.exceptions.acknowledge(id)
    }

    @Post('exceptions/:id/resolve')
    resolve(@Param('id') id: string, @Body() dto: ResolveExceptionDto) {
        return this.exceptions.resolve(id, dto ?? {})
    }

    @Post('exceptions/:id/waive')
    waive(@Param('id') id: string, @Body() dto: ResolveExceptionDto) {
        return this.exceptions.waive(id, dto ?? {})
    }

    // ── Invoices ───────────────────────────────────────────────────

    @Get('invoices')
    listInvoices(@Query() query: SupplierInvoiceQueryDto) {
        return this.invoices.findAll(query)
    }

    @Get('invoices/:id')
    getInvoice(@Param('id') id: string) {
        return this.invoices.findOne(id)
    }

    @Post('invoices')
    createInvoice(@Body() dto: CreateSupplierInvoiceDto) {
        return this.invoices.create(dto)
    }

    @Patch('invoices/:id')
    updateInvoice(@Param('id') id: string, @Body() dto: UpdateSupplierInvoiceDto) {
        return this.invoices.update(id, dto)
    }

    @Post('invoices/:id/submit')
    submit(@Param('id') id: string) {
        return this.invoices.submit(id)
    }

    @Get('invoices/:id/match-preview')
    preview(@Param('id') id: string) {
        return this.match.matchPreview(id)
    }

    @Post('invoices/:id/run-match')
    runMatch(@Param('id') id: string) {
        return this.match.runMatch(id)
    }

    @Post('invoices/:id/approve')
    approve(@Param('id') id: string, @Body() dto: ApproveInvoiceDto) {
        return this.match.approve(id, dto ?? {})
    }
}
