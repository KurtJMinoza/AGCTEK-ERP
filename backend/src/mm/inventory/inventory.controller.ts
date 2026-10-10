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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('inventory-management', 'available-stock', 'goods-issue', 'goods-receipt', 'inventory-adjustments', 'inventory-ledger', 'inventory-status', 'reservations', 'stock-movements', 'stock-overview', 'stock-transfers', 'traceability'), ...mmFeatures('receiving', 'goods-receipt')]

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
    @MmRead(READERS)
    getBalance(@Query() query: BalanceQueryDto) {
        return this.balanceService.getBalance(query)
    }

    @Get('balance/summary')
    @MmRead(READERS)
    getBalanceSummary(@Query() query: BalanceQueryDto) {
        return this.balanceService.getBalanceSummary(query)
    }

    /** @deprecated use GET balance */
    @Get('balances')
    @MmRead(READERS)
    getBalances(@Query() query: BalanceQueryDto) {
        return this.balanceService.queryBalances(query)
    }

    @Get('available')
    @MmRead(READERS)
    getAvailable(@Query() query: AvailabilityQueryDto) {
        return this.availabilityService.getAvailability(query)
    }

    @Get('ledger')
    @MmRead(READERS)
    getLedger(@Query() query: TransactionQueryDto) {
        return this.balanceQueryService.queryTransactions(query)
    }

    @Get('transactions')
    @MmRead(READERS)
    getTransactions(@Query() query: TransactionQueryDto) {
        return this.balanceQueryService.queryTransactions(query)
    }

    @Get('traceability')
    @MmRead(READERS)
    trace(@Query() query: TraceabilityQueryDto) {
        return this.traceability.trace(query)
    }

    @Get('stock-statuses')
    @MmRead(READERS)
    listStockStatuses() {
        return this.stockStatus.listStatuses()
    }

    @Get('materials/:materialId')
    @MmRead(READERS)
    getByMaterial(@Param('materialId') materialId: string) {
        return this.balanceService.getByMaterial(materialId)
    }

    @Get('warehouses/:warehouseId')
    @MmRead(READERS)
    getByWarehouse(@Param('warehouseId') warehouseId: string) {
        return this.balanceService.getByWarehouse(warehouseId)
    }

    // ── Posting APIs ───────────────────────────────────────────────────────

    @MmMutation([...mmFeatures('inventory-management', 'goods-receipt'), ...mmFeatures('receiving', 'goods-receipt')])
    @Post('receipts')
    postReceipt(@Body() dto: PostReceiptDto) {
        return this.operations.postReceipt(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'goods-issue'))
    @Post('issues')
    postIssue(@Body() dto: PostIssueDto) {
        return this.operations.postIssue(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'stock-transfers'))
    @Post('transfers')
    postTransfer(@Body() dto: PostTransferDto) {
        return this.operations.postTransfer(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'inventory-adjustments'))
    @Post('adjustments')
    postAdjustment(@Body() dto: PostAdjustmentDto) {
        return this.operations.postAdjustment(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'inventory-status'))
    @Post('status-changes')
    postStatusChange(@Body() dto: PostStatusChangeDto) {
        return this.stockStatus.postStatusChange(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'stock-movements', 'inventory-ledger'))
    @Post('reversals')
    postReversal(@Body() body: ReverseTransactionDto & { transactionId: string }) {
        return this.reversalService.reverse(body.transactionId, body)
    }

    /** Low-level posting — prefer typed operation endpoints above. */
    @MmMutation(mmFeatures('inventory-management', 'stock-movements'))
    @Post('post')
    postTransaction(@Body() dto: PostTransactionDto) {
        return this.postingService.postTransaction(dto)
    }

    @MmMutation(mmFeatures('inventory-management', 'stock-movements', 'inventory-ledger'))
    @Post(':transactionId/reverse')
    reverseTransaction(
        @Param('transactionId') transactionId: string,
        @Body() dto: ReverseTransactionDto,
    ) {
        return this.reversalService.reverse(transactionId, dto)
    }
}
