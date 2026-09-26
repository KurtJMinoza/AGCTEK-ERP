import { Injectable } from '@nestjs/common'
import { InventoryPostingService } from './inventory-posting.service'
import { ReverseTransactionDto } from './dto/reverse-transaction.dto'
import { reversalKey } from '../common/idempotency.util'

@Injectable()
export class InventoryReversalService {
    constructor(private posting: InventoryPostingService) {}

    async reverse(transactionId: string, dto: ReverseTransactionDto) {
        const key = dto.idempotencyKey ?? reversalKey(transactionId)
        if (!dto.idempotencyKey) {
            dto = { ...dto, idempotencyKey: key }
        }
        return this.posting.reverseTransaction(transactionId, dto)
    }
}
