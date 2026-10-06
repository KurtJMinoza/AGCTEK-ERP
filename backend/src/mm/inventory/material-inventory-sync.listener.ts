import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InventoryAvailabilityService } from './inventory-availability.service'

@Injectable()
export class MaterialInventorySyncListener {
    constructor(private readonly availability: InventoryAvailabilityService) {}

    @OnEvent('inventory.stock.changed', { async: true })
    async onStockChanged(payload: { materialId?: string }) {
        const materialId = payload?.materialId
        if (!materialId) return
        try {
            await this.availability.syncMaterialMasterFromLedger(materialId)
        } catch {
            // Non-blocking; ledger remains source of truth on read paths.
        }
    }
}
