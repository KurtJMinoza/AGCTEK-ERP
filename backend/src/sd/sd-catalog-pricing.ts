import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { SD_CATALOG_CURRENCY } from './dto/sales-order.dto'

/**
 * SD catalog pricing shared by quotations and CRM sales orders. Prices come from
 * `SdProduct.price` in the catalog currency; SD does not convert currencies.
 */

export type CatalogLineInput = { productId: string; quantity: number }

export type PricedCatalogLine = {
    lineNumber: number
    productId: string
    sku: string
    description: string
    quantity: Decimal
    unitPrice: Decimal
    lineTotal: Decimal
    /** Set when the product is inactive; the line is still priced so callers can show it. */
    inactive: boolean
}

export type CatalogPricing = {
    /** Lines whose product exists, in input order (unknown products are omitted). */
    lines: PricedCatalogLine[]
    unknownProductIds: string[]
    divisions: string[]
    subtotal: Decimal
}

type Client = Prisma.TransactionClient

const MAX_QUANTITY_DECIMALS = 3

export function assertCatalogLineInput(lines: CatalogLineInput[] | undefined) {
    if (!lines?.length) {
        throw new BadRequestException('At least one line is required')
    }
    const productIds = lines.map((l) => l.productId)
    if (new Set(productIds).size !== productIds.length) {
        throw new BadRequestException('Each product may appear on only one line')
    }
    for (const line of lines) {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
            throw new BadRequestException('Line quantities must be positive')
        }
        if (new Decimal(line.quantity).decimalPlaces() > MAX_QUANTITY_DECIMALS) {
            throw new BadRequestException(
                `Line quantities may have at most ${MAX_QUANTITY_DECIMALS} decimal places`,
            )
        }
    }
}

/** An existing, ACTIVE customer billed in the catalog currency. */
export async function loadBillableCustomer(client: Client, customerId: string) {
    const customer = await client.sdCustomer.findUnique({ where: { id: customerId } })
    if (!customer) throw new NotFoundException('Customer not found')
    if (customer.status !== 'ACTIVE') {
        throw new ConflictException(`Customer ${customer.customerNumber} is ${customer.status}`)
    }
    if (customer.currency !== SD_CATALOG_CURRENCY) {
        throw new BadRequestException(
            `Customer ${customer.customerNumber} is billed in ${customer.currency}, but SD catalog prices are in ${SD_CATALOG_CURRENCY}; SD does not convert currencies`,
        )
    }
    return customer
}

/** Prices lines from the current catalog (line totals HALF_UP to 2 dp); problems are reported, not thrown. */
export async function priceCatalogLines(
    client: Client,
    input: CatalogLineInput[],
): Promise<CatalogPricing> {
    const productIds = input.map((l) => l.productId)
    const products = await client.sdProduct.findMany({ where: { id: { in: productIds } } })
    const byId = new Map(products.map((p) => [p.id, p]))

    const lines: PricedCatalogLine[] = []
    input.forEach((line, idx) => {
        const product = byId.get(line.productId)
        if (!product) return
        const unitPrice = new Decimal(product.price)
        lines.push({
            lineNumber: idx + 1,
            productId: product.id,
            sku: product.sku,
            description: product.name,
            quantity: new Decimal(line.quantity),
            unitPrice,
            lineTotal: unitPrice.mul(line.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            inactive: !product.isActive,
        })
    })
    return {
        lines,
        unknownProductIds: productIds.filter((id) => !byId.has(id)),
        divisions: [...new Set(products.map((p) => p.divisionId))],
        subtotal: lines.reduce((sum, l) => sum.add(l.lineTotal), new Decimal(0)),
    }
}

/** Rejects unknown or inactive products and mixed divisions; returns the single division. */
export function assertSellable(pricing: CatalogPricing) {
    if (pricing.unknownProductIds.length) {
        throw new BadRequestException(
            `Unknown product(s): ${pricing.unknownProductIds.join(', ')}`,
        )
    }
    const inactive = pricing.lines.filter((l) => l.inactive)
    if (inactive.length) {
        throw new BadRequestException(
            `Inactive product(s): ${inactive.map((l) => l.sku).join(', ')}`,
        )
    }
    if (pricing.divisions.length > 1) {
        throw new BadRequestException('All lines must belong to one sales division')
    }
    return { divisionId: pricing.divisions[0] }
}
