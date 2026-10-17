import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { ProductService } from './product.service'
import type { UpdateProductDto } from './dto/product.dto'
import type {
    CreatePricingConditionDto,
    ListPricingConditionsQueryDto,
    PricingConditionType,
    PricingTab,
    UpdatePricingConditionDto,
} from './dto/pricing-condition.dto'

export type PricingStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE'

/** Catalog base price condition; the price itself lives on `SdProduct.price`. */
export const BASE_PRICE_CODE = 'PR00'

const CODE_PREFIX: Record<PricingConditionType, string> = {
    TIER_DISCOUNT: 'DISC',
    PROMO: 'PROMO',
}

/** Status from the validity window (inclusive on both ends). */
export function pricingStatusOf(
    window: { validFrom: Date; validTo: Date | null },
    now: Date = new Date(),
): PricingStatus {
    if (window.validFrom > now) return 'SCHEDULED'
    if (window.validTo && window.validTo < now) return 'EXPIRED'
    return 'ACTIVE'
}

const activeWhere = (now: Date): Prisma.SdPricingConditionWhereInput => ({
    validFrom: { lte: now },
    OR: [{ validTo: null }, { validTo: { gte: now } }],
})

const PRODUCT_REF = {
    select: { id: true, sku: true, name: true, divisionId: true },
} as const

type ConditionRow = Prisma.SdPricingConditionGetPayload<{
    include: { product: typeof PRODUCT_REF }
}>

@Injectable()
export class PricingConditionService {
    constructor(
        private prisma: PrismaService,
        private products: ProductService,
    ) {}

    async list(query: ListPricingConditionsQueryDto) {
        const tab: PricingTab = query.tab ?? 'BASE_PRICE'
        const page = Math.max(1, Number(query.page) || 1)
        const pageSize = Math.min(
            100,
            Math.max(1, Number(query.pageSize) || 20),
        )
        const search = query.search?.trim()
        const now = new Date()

        const summary = await this.summary(now)
        const result =
            tab === 'BASE_PRICE'
                ? await this.listBasePrices(search, page, pageSize)
                : await this.listConditions(tab, search, page, pageSize, now)
        return { ...result, page, pageSize, summary }
    }

    async create(dto: CreatePricingConditionDto, user?: AuthRequestUser) {
        const data = await this.validated(dto.conditionType, {
            name: dto.name,
            productId: dto.productId ?? null,
            minQuantity: dto.minQuantity ?? null,
            customerType: dto.customerType ?? 'ALL',
            valueType: dto.valueType,
            value: dto.value,
            promoCode: dto.promoCode ?? null,
            validFrom: dto.validFrom,
            validTo: dto.validTo ?? null,
        })
        const conditionCode =
            dto.conditionCode ?? (await this.nextCode(dto.conditionType))
        try {
            const created = await this.prisma.sdPricingCondition.create({
                data: {
                    ...data,
                    conditionCode,
                    conditionType: dto.conditionType,
                    createdBy: user?.id ?? null,
                    updatedBy: user?.id ?? null,
                },
                include: { product: PRODUCT_REF },
            })
            return this.toRow(created)
        } catch (error) {
            throw this.mapUniqueViolation(error, conditionCode)
        }
    }

    async update(
        id: string,
        dto: UpdatePricingConditionDto,
        user?: AuthRequestUser,
    ) {
        const current = await this.prisma.sdPricingCondition.findUnique({
            where: { id },
        })
        if (!current) throw new NotFoundException('Pricing condition not found')
        const data = await this.validated(
            current.conditionType as PricingConditionType,
            {
                name: dto.name ?? current.name,
                productId:
                    dto.productId === undefined
                        ? current.productId
                        : dto.productId,
                minQuantity:
                    dto.minQuantity === undefined
                        ? current.minQuantity === null
                            ? null
                            : Number(current.minQuantity)
                        : dto.minQuantity,
                customerType: dto.customerType ?? current.customerType,
                valueType: dto.valueType ?? current.valueType,
                value: dto.value ?? Number(current.value),
                promoCode:
                    dto.promoCode === undefined
                        ? current.promoCode
                        : dto.promoCode,
                validFrom: dto.validFrom ?? current.validFrom.toISOString(),
                validTo:
                    dto.validTo === undefined
                        ? (current.validTo?.toISOString() ?? null)
                        : dto.validTo,
            },
        )
        const updated = await this.prisma.sdPricingCondition.update({
            where: { id },
            data: { ...data, updatedBy: user?.id ?? null },
            include: { product: PRODUCT_REF },
        })
        return this.toRow(updated)
    }

    /** Ends the condition now; history is kept (no hard delete). */
    async expire(id: string, user?: AuthRequestUser) {
        const current = await this.prisma.sdPricingCondition.findUnique({
            where: { id },
        })
        if (!current) throw new NotFoundException('Pricing condition not found')
        const now = new Date()
        if (pricingStatusOf(current, now) === 'EXPIRED') {
            throw new ConflictException(
                `${current.conditionCode} has already expired`,
            )
        }
        const updated = await this.prisma.sdPricingCondition.update({
            where: { id },
            data: {
                // A scheduled condition never starts; keep validTo >= validFrom.
                validFrom: current.validFrom > now ? now : current.validFrom,
                validTo: now,
                updatedBy: user?.id ?? null,
            },
            include: { product: PRODUCT_REF },
        })
        return this.toRow(updated)
    }

    /** PR00 is the catalog price; changing it updates the Product Catalog. */
    async updateBasePrice(
        productId: string,
        price: number,
        user?: AuthRequestUser,
    ) {
        const product = await this.products.update(productId, {
            price,
            updatedBy: user?.id,
        } as UpdateProductDto)
        return this.toBasePriceRow({
            id: product.id,
            sku: product.sku,
            name: product.name,
            divisionId: product.divisionId,
            price: product.price,
            status: product.status,
            updatedAt: product.updatedAt,
        })
    }

    private async summary(now: Date) {
        const [basePrices, activeTierDiscounts, activePromos] =
            await Promise.all([
                this.prisma.sdProduct.count({ where: { status: 'ACTIVE' } }),
                this.prisma.sdPricingCondition.count({
                    where: {
                        conditionType: 'TIER_DISCOUNT',
                        ...activeWhere(now),
                    },
                }),
                this.prisma.sdPricingCondition.count({
                    where: { conditionType: 'PROMO', ...activeWhere(now) },
                }),
            ])
        return { basePrices, activeTierDiscounts, activePromos }
    }

    private async listBasePrices(
        search: string | undefined,
        page: number,
        pageSize: number,
    ) {
        const matchesCode =
            search !== undefined &&
            BASE_PRICE_CODE.toLowerCase().includes(search.toLowerCase())
        const where: Prisma.SdProductWhereInput =
            search && !matchesCode
                ? {
                      OR: [
                          { sku: { contains: search, mode: 'insensitive' } },
                          { name: { contains: search, mode: 'insensitive' } },
                      ],
                  }
                : {}
        const [rows, total] = await Promise.all([
            this.prisma.sdProduct.findMany({
                where,
                select: {
                    id: true,
                    sku: true,
                    name: true,
                    divisionId: true,
                    price: true,
                    status: true,
                    updatedAt: true,
                },
                orderBy: [{ status: 'asc' }, { name: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.sdProduct.count({ where }),
        ])
        return { data: rows.map((row) => this.toBasePriceRow(row)), total }
    }

    private async listConditions(
        tab: PricingConditionType,
        search: string | undefined,
        page: number,
        pageSize: number,
        now: Date,
    ) {
        const where: Prisma.SdPricingConditionWhereInput = {
            conditionType: tab,
            ...(search
                ? {
                      OR: [
                          {
                              conditionCode: {
                                  contains: search,
                                  mode: 'insensitive',
                              },
                          },
                          { name: { contains: search, mode: 'insensitive' } },
                          {
                              promoCode: {
                                  contains: search,
                                  mode: 'insensitive',
                              },
                          },
                          {
                              product: {
                                  sku: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                          },
                          {
                              product: {
                                  name: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                          },
                      ],
                  }
                : {}),
        }
        const [rows, total] = await Promise.all([
            this.prisma.sdPricingCondition.findMany({
                where,
                include: { product: PRODUCT_REF },
                orderBy: [{ validFrom: 'desc' }, { conditionCode: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.sdPricingCondition.count({ where }),
        ])
        return { data: rows.map((row) => this.toRow(row, now)), total }
    }

    private async validated(
        type: PricingConditionType,
        input: {
            name: string
            productId: string | null
            minQuantity: number | null
            customerType: string
            valueType: string
            value: number
            promoCode: string | null
            validFrom: string
            validTo: string | null
        },
    ) {
        const validFrom = new Date(input.validFrom)
        const validTo = input.validTo ? new Date(input.validTo) : null
        if (validTo && validTo < validFrom) {
            throw new BadRequestException(
                'Valid to must be on or after valid from',
            )
        }
        if (input.valueType === 'PERCENT_OFF' && input.value > 100) {
            throw new BadRequestException(
                'A percentage discount cannot exceed 100%',
            )
        }
        if (input.valueType === 'FIXED_PRICE' && !input.productId) {
            throw new BadRequestException(
                'A fixed price needs a target product',
            )
        }
        if (type === 'TIER_DISCOUNT' && input.minQuantity === null) {
            throw new BadRequestException(
                'A tier discount needs a minimum quantity',
            )
        }
        if (input.productId) {
            const exists = await this.prisma.sdProduct.findUnique({
                where: { id: input.productId },
                select: { id: true },
            })
            if (!exists)
                throw new BadRequestException('Target product not found')
        }
        return {
            name: input.name.trim(),
            productId: input.productId,
            minQuantity:
                type === 'TIER_DISCOUNT' && input.minQuantity !== null
                    ? new Decimal(input.minQuantity)
                    : null,
            customerType: input.customerType,
            valueType: input.valueType,
            value: new Decimal(input.value),
            promoCode:
                type === 'PROMO' && input.promoCode
                    ? input.promoCode.trim().toUpperCase()
                    : null,
            validFrom,
            validTo,
        }
    }

    /** DISC01, DISC02 … / PROMO01 …; the unique index guards concurrent creates. */
    private async nextCode(type: PricingConditionType) {
        const prefix = CODE_PREFIX[type]
        const existing = await this.prisma.sdPricingCondition.findMany({
            where: { conditionCode: { startsWith: prefix } },
            select: { conditionCode: true },
        })
        const highest = existing.reduce((max, { conditionCode }) => {
            const n = Number(conditionCode.slice(prefix.length))
            return Number.isInteger(n) && n > max ? n : max
        }, 0)
        return `${prefix}${String(highest + 1).padStart(2, '0')}`
    }

    private mapUniqueViolation(error: unknown, conditionCode: string) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
        ) {
            return new ConflictException(
                `Condition code ${conditionCode} already exists`,
            )
        }
        return error
    }

    private toBasePriceRow(product: {
        id: string
        sku: string
        name: string
        divisionId: string
        price: Prisma.Decimal | Decimal | number
        status: string
        updatedAt: Date
    }) {
        return {
            id: product.id,
            kind: 'BASE_PRICE' as const,
            conditionCode: BASE_PRICE_CODE,
            name: 'Base Retail Price',
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            divisionId: product.divisionId,
            minQuantity: null,
            customerType: 'ALL',
            valueType: 'PRICE' as const,
            value: Number(product.price),
            promoCode: null,
            validFrom: product.updatedAt,
            validTo: null,
            status: (product.status === 'ACTIVE'
                ? 'ACTIVE'
                : 'INACTIVE') as PricingStatus,
        }
    }

    private toRow(row: ConditionRow, now: Date = new Date()) {
        return {
            id: row.id,
            kind: row.conditionType as PricingConditionType,
            conditionCode: row.conditionCode,
            name: row.name,
            productId: row.productId,
            sku: row.product?.sku ?? null,
            productName: row.product?.name ?? null,
            divisionId: row.product?.divisionId ?? null,
            minQuantity:
                row.minQuantity === null ? null : Number(row.minQuantity),
            customerType: row.customerType,
            valueType: row.valueType,
            value: Number(row.value),
            promoCode: row.promoCode,
            validFrom: row.validFrom,
            validTo: row.validTo,
            status: pricingStatusOf(row, now),
        }
    }
}
