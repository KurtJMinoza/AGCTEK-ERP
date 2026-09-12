import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { InventoryPostingService } from './inventory-posting.service'
import { MmInventoryBalanceService } from './inventory-balance.service'
import { InventoryBalanceQueryService } from './inventory-balance-query.service'
import { InventoryAvailabilityService } from './inventory-availability.service'
import { InventoryOperationService } from './inventory-operation.service'
import { InventoryReversalService } from './inventory-reversal.service'
import { InventoryTraceabilityService } from './inventory-traceability.service'
import { StockStatusService } from './stock-status.service'
import { PostTransactionDto } from './dto/post-transaction.dto'
import { ReverseTransactionDto } from './dto/reverse-transaction.dto'
import { TransactionQueryDto } from './dto/transaction-query.dto'
import { BalanceQueryDto } from './dto/balance-query.dto'
import { AvailabilityQueryDto } from './dto/availability-query.dto'
import { TraceabilityQueryDto } from './dto/traceability-query.dto'
import {
    PostAdjustmentDto,
    PostIssueDto,
    PostReceiptDto,
    PostTransferDto,
} from './dto/inventory-operation.dto'
import { PostStatusChangeDto } from './dto/post-status-change.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/inventory')
export class InventoryController {
    constructor(
        private readonly postingService: InventoryPostingService,
        private readonly balanceService: MmInventoryBalanceService,
        private readonly balanceQueryService: InventoryBalanceQueryService,
        private readonly availabilityService: InventoryAvailabilityService,
        private readonly operations: InventoryOperationService,
        private readonly reversalService: InventoryReversalService,
        private readonly traceability: InventoryTraceabilityService,
        private readonly stockStatus: StockStatusService,
    ) {}

    // ── Read APIs ──────────────────────────────────────────────────────────

    @Get('balance')
    getBalance(@Query() query: BalanceQueryDto) {
        return this.balanceService.getBalance(query)
    }

    @Get('balance/summary')
    getBalanceSummary(@Query() query: BalanceQueryDto) {
        return this.balanceService.getBalanceSummary(query)
    }

    /** @deprecated use GET balance */
    @Get('balances')
    getBalances(@Query() query: BalanceQueryDto) {
        return this.balanceService.queryBalances(query)
    }

    @Get('available')
    getAvailable(@Query() query: AvailabilityQueryDto) {
        return this.availabilityService.getAvailability(query)
    }

    @Get('ledger')
    getLedger(@Query() query: TransactionQueryDto) {
        return this.balanceQueryService.queryTransactions(query)
    }

    @Get('transactions')
    getTransactions(@Query() query: TransactionQueryDto) {
        return this.balanceQueryService.queryTransactions(query)
    }

    @Get('traceability')
    trace(@Query() query: TraceabilityQueryDto) {
        return this.traceability.trace(query)
    }

    @Get('stock-statuses')
    listStockStatuses() {
        return this.stockStatus.listStatuses()
    }

    @Get('materials/:materialId')
    getByMaterial(@Param('materialId') materialId: string) {
        return this.balanceService.getByMaterial(materialId)
    }

    @Get('warehouses/:warehouseId')
    getByWarehouse(@Param('warehouseId') warehouseId: string) {
        return this.balanceService.getByWarehouse(warehouseId)
    }

    // ── Posting APIs ───────────────────────────────────────────────────────

    @MmMutation()
    @Post('receipts')
    postReceipt(@Body() dto: PostReceiptDto) {
        return this.operations.postReceipt(dto)
    }

    @MmMutation()
    @Post('issues')
    postIssue(@Body() dto: PostIssueDto) {
        return this.operations.postIssue(dto)
    }

    @MmMutation()
    @Post('transfers')
    postTransfer(@Body() dto: PostTransferDto) {
        return this.operations.postTransfer(dto)
    }

    @MmMutation()
    @Post('adjustments')
    postAdjustment(@Body() dto: PostAdjustmentDto) {
        return this.operations.postAdjustment(dto)
    }

    @MmMutation()
    @Post('status-changes')
    postStatusChange(@Body() dto: PostStatusChangeDto) {
        return this.stockStatus.postStatusChange(dto)
    }

    @MmMutation()
    @Post('reversals')
    postReversal(@Body() body: ReverseTransactionDto & { transactionId: string }) {
        return this.reversalService.reverse(body.transactionId, body)
    }

    /** Low-level posting — prefer typed operation endpoints above. */
    @MmMutation()
    @Post('post')
    postTransaction(@Body() dto: PostTransactionDto) {
        return this.postingService.postTransaction(dto)
    }

    @MmMutation()
    @Post(':transactionId/reverse')
    reverseTransaction(
        @Param('transactionId') transactionId: string,
        @Body() dto: ReverseTransactionDto,
    ) {
        return this.reversalService.reverse(transactionId, dto)
    }
}
