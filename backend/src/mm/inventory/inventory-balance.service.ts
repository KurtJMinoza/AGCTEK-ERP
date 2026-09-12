import { Injectable } from '@nestjs/common'
import { InventoryBalanceQueryService } from './inventory-balance-query.service'
import { BalanceQueryDto } from './dto/balance-query.dto'

/**
 * MM-08 balance read service — canonical read path for operational stock state.
 */
@Injectable()
export class MmInventoryBalanceService {
    constructor(private query: InventoryBalanceQueryService) {}

    queryBalances(dto: BalanceQueryDto) {
        return this.query.queryBalances(dto)
    }

    getBalance(dto: BalanceQueryDto) {
        return this.query.queryBalances({ ...dto, limit: dto.limit ?? 1, page: 1 })
    }

    getBalanceSummary(dto: BalanceQueryDto) {
        return this.query.queryBalanceSummary(dto)
    }

    getByMaterial(materialId: string) {
        return this.query.getByMaterial(materialId)
    }

    getByWarehouse(warehouseId: string) {
        return this.query.getByWarehouse(warehouseId)
    }
}
