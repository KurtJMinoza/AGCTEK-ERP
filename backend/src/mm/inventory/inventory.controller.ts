import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { InventoryPostingService } from './inventory-posting.service'
import { InventoryBalanceQueryService } from './inventory-balance-query.service'
import { PostTransactionDto } from './dto/post-transaction.dto'
import { ReverseTransactionDto } from './dto/reverse-transaction.dto'
import { TransactionQueryDto } from './dto/transaction-query.dto'
import { BalanceQueryDto } from './dto/balance-query.dto'

@Controller('mm/inventory')
export class InventoryController {
    constructor(
        private readonly postingService: InventoryPostingService,
        private readonly balanceQueryService: InventoryBalanceQueryService,
    ) {}

    @Get('balances')
    getBalances(@Query() query: BalanceQueryDto) {
        return this.balanceQueryService.queryBalances(query)
    }

    @Get('transactions')
    getTransactions(@Query() query: TransactionQueryDto) {
        return this.balanceQueryService.queryTransactions(query)
    }

    @Get('materials/:materialId')
    getByMaterial(@Param('materialId') materialId: string) {
        return this.balanceQueryService.getByMaterial(materialId)
    }

    @Get('warehouses/:warehouseId')
    getByWarehouse(@Param('warehouseId') warehouseId: string) {
        return this.balanceQueryService.getByWarehouse(warehouseId)
    }

    @Post('post')
    postTransaction(@Body() dto: PostTransactionDto) {
        return this.postingService.postTransaction(dto)
    }

    @Post(':transactionId/reverse')
    reverseTransaction(
        @Param('transactionId') transactionId: string,
        @Body() dto: ReverseTransactionDto,
    ) {
        return this.postingService.reverseTransaction(transactionId, dto)
    }
}
