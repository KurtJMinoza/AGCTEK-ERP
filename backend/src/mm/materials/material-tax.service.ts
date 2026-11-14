import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertTaxCodeCompatible,
    buildMaterialTaxProjection,
    compatibleClassifications,
    hasMaterialTaxFields,
    isMaterialTaxClassification,
    isMaterialTaxStatus,
    isPriceTaxTreatment,
    materialTaxChanged,
    materialTaxSnapshot,
    resolveCurrentTaxRate,
    taxDateOnly,
    taxDateString,
    taxTodayUtc,
    type MaterialTaxClassification,
    type MaterialTaxFields,
    type TaxCodeLike,
} from './material-tax'

export type MaterialTaxWriteInput = MaterialTaxFields & {
    taxDescription?: string | null
}

type TaxCodeRecord = TaxCodeLike & {
    taxCategory?: string | null
    calculationMethod?: string | null
    rateUnit?: string | null
    taxRates?: Array<{
        rate: unknown
        rateUnit?: string | null
        effectiveFrom: Date | string
        effectiveTo?: Date | string | null
        status?: string | null
    }>
}

/**
 * Material tax configuration, owned by MM Material Master.
 *
 * FICO owns the tax code, its type and its effective-dated rates. This service
 * validates that a material's classification is compatible with the chosen
 * FICO code, snapshots every change for history, and projects the read-only
 * result for MM and SD. It never stores a second tax rate.
 */
@Injectable()
export class MaterialTaxService {
    constructor(private readonly prisma: PrismaService) {}

    /** Active + inactive FICO tax codes available to a company. */
    async listTaxCodes(companyId: string) {
        const scopedCompanyId = companyId?.trim()
        if (!scopedCompanyId) {
            throw new BadRequestException('companyId is required')
        }
        const today = taxTodayUtc()
        const codes = (await this.prisma.ficoTaxCode.findMany({
            where: { companyId: scopedCompanyId },
            include: { taxRates: true },
            orderBy: { code: 'asc' },
        })) as unknown as TaxCodeRecord[]

        return {
            companyId: scopedCompanyId,
            data: codes.map((code) => {
                const rate = resolveCurrentTaxRate(code, today)
                return {
                    id: code.id,
                    code: code.code,
                    name: code.name,
                    taxCategory: code.taxCategory ?? null,
                    taxType: code.taxType,
                    status: code.status,
                    calculationMethod: code.calculationMethod ?? null,
                    compatibleClassifications: compatibleClassifications(
                        code.taxType,
                    ),
                    rate: rate?.rate ?? null,
                    rateUnit: rate?.rateUnit ?? code.rateUnit ?? null,
                    rateEffectiveFrom: rate?.effectiveFrom ?? null,
                    rateEffectiveTo: rate?.effectiveTo ?? null,
                }
            }),
        }
    }

    /** Append-only tax configuration history for one material. */
    async history(materialId: string) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: materialId, deletedAt: null },
            select: { id: true },
        })
        if (!material) throw new NotFoundException('Material not found')

        const rows = await this.prisma.mmMaterialTaxHistory.findMany({
            where: { materialId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        })
        return rows.map((row) => ({
            id: row.id,
            materialId: row.materialId,
            companyId: row.companyId,
            taxClassification: row.taxClassification,
            taxCodeId: row.taxCodeId,
            taxCode: row.taxCodeValue,
            taxCodeName: row.taxCodeName,
            taxType: row.taxType,
            taxRate: row.taxRate == null ? null : Number(row.taxRate),
            rateUnit: row.rateUnit,
            priceTaxTreatment: row.priceTaxTreatment,
            taxStatus: row.taxStatus,
            taxEffectiveFrom: taxDateString(row.taxEffectiveFrom),
            taxEffectiveTo: taxDateString(row.taxEffectiveTo),
            taxDescription: row.taxDescription,
            changeType: row.changeType,
            changedBy: row.changedBy,
            createdAt: row.createdAt,
        }))
    }

    /**
     * Validate a complete tax configuration and return normalized column data.
     *
     * Empty input means "not configured" and is allowed only when the caller
     * explicitly supports incomplete setup (imports, auto-created materials).
     */
    async validateForWrite(
        companyId: string | null,
        input: MaterialTaxWriteInput,
        options: { requireComplete?: boolean } = {},
    ): Promise<{
        data: Prisma.MmMaterialUncheckedUpdateInput
        warnings: string[]
        taxCode: TaxCodeRecord | null
    }> {
        const hasAny = hasMaterialTaxFields(
            input as unknown as Record<string, unknown>,
        )
        if (!hasAny) {
            if (options.requireComplete) {
                throw new BadRequestException(
                    'Tax information is required: select a tax classification and a FICO tax code.',
                )
            }
            return { data: {}, warnings: [], taxCode: null }
        }

        if (!isMaterialTaxClassification(input.taxClassification)) {
            throw new BadRequestException(
                'Tax classification must be VATABLE, VAT_EXEMPT or ZERO_RATED.',
            )
        }
        const classification: MaterialTaxClassification =
            input.taxClassification

        const taxCodeId = input.taxCodeId?.trim()
        if (!taxCodeId) {
            throw new BadRequestException(
                'A FICO tax code is required for the selected tax classification.',
            )
        }

        if (!isPriceTaxTreatment(input.priceTaxTreatment)) {
            throw new BadRequestException(
                'Price tax treatment must be VAT_INCLUSIVE or VAT_EXCLUSIVE.',
            )
        }
        const taxStatus = input.taxStatus ?? 'ACTIVE'
        if (!isMaterialTaxStatus(taxStatus)) {
            throw new BadRequestException(
                'Tax status must be ACTIVE or INACTIVE.',
            )
        }

        const effectiveFrom = taxDateOnly(input.taxEffectiveFrom)
        const effectiveTo = taxDateOnly(input.taxEffectiveTo)
        if (input.taxEffectiveFrom && !effectiveFrom) {
            throw new BadRequestException('Invalid tax effective-from date.')
        }
        if (input.taxEffectiveTo && !effectiveTo) {
            throw new BadRequestException('Invalid tax effective-to date.')
        }
        if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
            throw new BadRequestException(
                'Tax effective-to date must be on or after the effective-from date.',
            )
        }

        const taxCode = (await this.prisma.ficoTaxCode.findUnique({
            where: { id: taxCodeId },
            include: { taxRates: true },
        })) as unknown as TaxCodeRecord | null
        if (!taxCode) {
            throw new BadRequestException(
                'FICO tax code not found. Create it in FICO Tax Codes first.',
            )
        }
        if ((taxCode.companyId ?? null) !== (companyId ?? null)) {
            throw new BadRequestException(
                'The selected FICO tax code belongs to a different company.',
            )
        }
        assertTaxCodeCompatible(classification, taxCode.taxType)

        const warnings: string[] = []
        if (taxCode.status !== 'ACTIVE') {
            warnings.push(
                `FICO tax code ${taxCode.code} is ${taxCode.status}; the material tax configuration cannot be active.`,
            )
        }
        if (!resolveCurrentTaxRate(taxCode, taxTodayUtc())) {
            warnings.push(
                `FICO tax code ${taxCode.code} has no active rate effective today.`,
            )
        }

        return {
            data: {
                taxClassification: classification,
                taxCodeId,
                priceTaxTreatment: input.priceTaxTreatment,
                taxStatus,
                taxEffectiveFrom: effectiveFrom,
                taxEffectiveTo: effectiveTo,
                taxDescription: input.taxDescription?.trim() || null,
            },
            warnings,
            taxCode,
        }
    }

    /** Project the read-only tax block shown by MM and SD. */
    projection(material: MaterialTaxFields & { taxCode?: TaxCodeLike | null }) {
        return buildMaterialTaxProjection(material)
    }

    /** Append a snapshot when the tax configuration actually changed. */
    async recordHistory(
        db: PrismaService | { mmMaterialTaxHistory: any },
        material: MaterialTaxFields & {
            id: string
            companyId?: string | null
            taxCode?: TaxCodeLike | null
        },
        changeType: 'CREATE' | 'UPDATE' | 'CLEAR',
        changedBy?: string | null,
    ) {
        const snapshot = materialTaxSnapshot(material)
        await db.mmMaterialTaxHistory.create({
            data: {
                materialId: material.id,
                companyId: material.companyId ?? null,
                ...snapshot,
                changeType,
                changedBy: changedBy ?? null,
            },
        })
    }

    /** True when an update changed any tax field. */
    taxChanged(
        before: MaterialTaxFields,
        after: MaterialTaxFields,
    ): boolean {
        return materialTaxChanged(before, after)
    }
}
