import { BadRequestException, Injectable } from '@nestjs/common'
import {
    ALLOWED_STATUS_TRANSITIONS,
    MM_STOCK_STATUSES,
    type MmStockStatus,
} from './inventory.constants'
import { InventoryPostingService } from './inventory-posting.service'
import { PostStatusChangeDto } from './dto/post-status-change.dto'

@Injectable()
export class StockStatusService {
    constructor(private posting: InventoryPostingService) {}

    listStatuses() {
        return MM_STOCK_STATUSES.map((code) => ({
            code,
            restricted: code !== 'UNRESTRICTED',
        }))
    }

    assertTransition(fromStatus: string, toStatus: string) {
        if (fromStatus === toStatus) {
            throw new BadRequestException('Source and target stock status must differ')
        }
        if (!MM_STOCK_STATUSES.includes(fromStatus as MmStockStatus)) {
            throw new BadRequestException(`Invalid source status: ${fromStatus}`)
        }
        if (!MM_STOCK_STATUSES.includes(toStatus as MmStockStatus)) {
            throw new BadRequestException(`Invalid target status: ${toStatus}`)
        }
        const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus]
        if (allowed && !allowed.has(toStatus)) {
            throw new BadRequestException(
                `Status transition ${fromStatus} → ${toStatus} is not allowed`,
            )
        }
    }

    async postStatusChange(dto: PostStatusChangeDto) {
        this.assertTransition(dto.fromStatus, dto.toStatus)
        return this.posting.postStatusChange(dto)
    }
}
