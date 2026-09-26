import { Injectable } from '@nestjs/common'
import {
    QualityRuleService,
    type InspectionRequirementResult,
} from '../quality/quality-rule.service'

/** Thin delegator — receiving must not contain rule logic. */
@Injectable()
export class InspectionRequirementService {
    constructor(private qualityRuleService: QualityRuleService) {}

    async resolveInspectionRequirement(params: {
        companyId: string
        materialId: string
        supplierId?: string | null
        warehouseId: string
        expectedReceiptId?: string | null
        purchaseOrderId?: string | null
    }): Promise<InspectionRequirementResult> {
        return this.qualityRuleService.resolveInspectionRequirement(params)
    }

    /** @deprecated Use resolveInspectionRequirement for full result. */
    async isInspectionRequired(params: {
        companyId: string
        materialId: string
        supplierId?: string | null
        warehouseId: string
        expectedReceiptId?: string | null
        purchaseOrderId?: string | null
    }): Promise<boolean> {
        const result = await this.resolveInspectionRequirement(params)
        return result.inspectionRequired
    }
}
