import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { WorkflowService } from '../workflow/workflow.service'

@Injectable()
export class QualityWorkflowService {
    constructor(
        private prisma: PrismaService,
        private workflow: WorkflowService,
    ) {}

    /** Returns workflow instance id if approval required, else null */
    async requireApprovalIfConfigured(params: {
        companyId: string
        entityType: string
        entityId: string
        decisionCode?: string
        quantity?: number
        initiatedBy?: string
    }): Promise<string | null> {
        const rules = await this.prisma.mmQualityWorkflowRule.findMany({
            where: {
                companyId: params.companyId,
                entityType: params.entityType,
                active: true,
            },
        })
        const match = rules.find((r) => {
            if (r.decisionCode && params.decisionCode && r.decisionCode !== params.decisionCode) {
                return false
            }
            if (r.minQuantity != null && params.quantity != null) {
                if (new Decimal(params.quantity).lt(r.minQuantity)) return false
            }
            return true
        })
        if (!match) return null

        const instance = await this.workflow.start(params.entityType, params.entityId, {
            initiatedBy: params.initiatedBy,
            context: { companyId: params.companyId },
        })
        return instance.instance.id
    }
}
