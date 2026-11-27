import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
    FICO_DETERMINATION_ERROR_CODES,
    FicoDeterminationForbiddenError,
} from './fico-determination-error'

export type DeterminationActorTrail = {
    companyId: string
    determinationCode: string
    createdBy?: string | null
    submittedBy?: string | null
    approvedBy?: string | null
}

/**
 * Phase 04.27 — maker-checker for account determination. Enforced in the
 * backend; hiding frontend buttons is never the control.
 * Toggled per company by
 * `fico_company_accounting_settings.determinationSeparationOfDuties`.
 */
@Injectable()
export class FicoDeterminationSodPolicy {
    constructor(private readonly prisma: PrismaService) {}

    async isEnabled(companyId: string): Promise<boolean> {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: { determinationSeparationOfDuties: true },
        })
        return settings?.determinationSeparationOfDuties ?? true
    }

    /** The approver may not be the submitter or the author of the draft. */
    async assertCanApprove(rule: DeterminationActorTrail, actorId?: string | null) {
        if (!actorId) return
        if (!(await this.isEnabled(rule.companyId))) return
        if (rule.submittedBy && rule.submittedBy === actorId) {
            throw new FicoDeterminationForbiddenError(
                FICO_DETERMINATION_ERROR_CODES.RULE_APPROVAL_REQUIRED,
                `Separation of duties: the user who submitted ${rule.determinationCode} cannot approve it.`,
                {
                    companyId: rule.companyId,
                    ruleCodes: [rule.determinationCode],
                    remediation:
                        'Ask a second Finance approver to review this determination rule.',
                },
            )
        }
        if (rule.createdBy && rule.createdBy === actorId && !rule.submittedBy) {
            throw new FicoDeterminationForbiddenError(
                FICO_DETERMINATION_ERROR_CODES.RULE_APPROVAL_REQUIRED,
                `Separation of duties: the author of ${rule.determinationCode} cannot approve it.`,
                {
                    companyId: rule.companyId,
                    ruleCodes: [rule.determinationCode],
                    remediation:
                        'Ask a second Finance approver to review this determination rule.',
                },
            )
        }
    }

    /** Activation is a second control point: the approver may not self-activate. */
    async assertCanActivate(rule: DeterminationActorTrail, actorId?: string | null) {
        if (!actorId) return
        if (!(await this.isEnabled(rule.companyId))) return
        if (rule.approvedBy && rule.approvedBy === actorId && rule.submittedBy === actorId) {
            throw new FicoDeterminationForbiddenError(
                FICO_DETERMINATION_ERROR_CODES.RULE_ACTIVATION_DENIED,
                `Separation of duties: ${rule.determinationCode} was submitted and approved by this user, so it cannot also be activated by them.`,
                {
                    companyId: rule.companyId,
                    ruleCodes: [rule.determinationCode],
                    remediation:
                        'A different authorized user must activate this determination rule.',
                },
            )
        }
    }
}