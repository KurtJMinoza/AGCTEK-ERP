import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
    isSdSaleTaxPolicy,
    type SdSaleTaxPolicy,
} from './sd-sale-tax-policy'

export type ResolvedChannelTaxContext = {
    policy: SdSaleTaxPolicy
    requireMaterialTax: boolean
}

/**
 * POS vs external platform tax: material master keeps one product tax;
 * channels decide whether to apply it on the sale line.
 */
@Injectable()
export class SdSaleTaxResolutionService {
    constructor(private readonly prisma: PrismaService) {}

    async resolvePosPolicy(companyId: string): Promise<ResolvedChannelTaxContext> {
        const settings = await this.prisma.ficoCompanyAccountingSettings.findFirst({
            where: { companyId, status: 'ACTIVE' },
            select: { posSaleTaxPolicy: true },
        })
        const policy = isSdSaleTaxPolicy(settings?.posSaleTaxPolicy)
            ? settings.posSaleTaxPolicy
            : 'FOLLOW_MATERIAL'
        return {
            policy,
            requireMaterialTax: policy === 'FOLLOW_MATERIAL',
        }
    }

    async resolveExtPlatformPolicy(
        salesSourceId: string,
    ): Promise<ResolvedChannelTaxContext> {
        const source = await this.prisma.sdSalesSource.findUnique({
            where: { id: salesSourceId },
            select: { saleTaxPolicy: true },
        })
        const policy = isSdSaleTaxPolicy(source?.saleTaxPolicy)
            ? source.saleTaxPolicy
            : 'FOLLOW_MATERIAL'
        return {
            policy,
            requireMaterialTax: policy === 'FOLLOW_MATERIAL',
        }
    }
}

/** Strip line tax amounts when channel policy is non-VAT output. */
export function applyNonVatOutputToPosLine<
    T extends {
        taxClassification: string | null
        taxCode: string | null
        taxRate: number
        taxTreatment: string | null
        taxIncluded: number
        taxAdded: number
        taxWarning: string | null
    },
>(line: T): T {
    return {
        ...line,
        taxClassification: null,
        taxCode: null,
        taxRate: 0,
        taxTreatment: null,
        taxIncluded: 0,
        taxAdded: 0,
        taxWarning: null,
    }
}