import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
    FicoTaxCalculationService,
    type TaxCalculationInput,
} from '../fico/fico-tax-calculation.service'
import {
    type CreateExtPlatformTransactionDto,
    type UpdateExtPlatformTransactionDto,
    type UpdateExtPlatformTransactionStatusDto,
    type ListExtPlatformTransactionsQueryDto,
    type ExtPlatformTransactionLineDto,
    type CreateSalesSourceDto,
    type UpdateSalesSourceDto,
    type PreviewExtPlatformTransactionDto,
} from './dto/ext-platform-transaction.dto'
import {
    resolveCurrentTaxRate,
    taxDateOnly,
    taxTodayUtc,
    type TaxCodeLike,
} from '../mm/materials/material-tax'
import { MaterialResolutionService } from './material-resolution.service'
import { ProductService } from './product.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'

const Decimal = Prisma.Decimal

type CatalogLink = {
    productId: string
    variantId: string | null
    productSku: string
    productName: string
    variantName: string | null
    materialId: string
}
type LinkSuccess = { lineNumber: number; link: CatalogLink }
type LinkFailure = { lineNumber: number; error: string }
type LinkResult = LinkSuccess | LinkFailure
type StockRow = {
    productId: string
    variantId: string | null
    availableQuantity: number
    state: string
}
/** Max items per storefront availability batch call. */
const STOCK_BATCH_SIZE = 200
type CatalogLine = Omit<ExtPlatformTransactionLineDto, 'variantId'> &
    CatalogLink & { lineNumber: number }

type LineAmounts = {
    lineSubtotal: Prisma.Decimal
    discount: Prisma.Decimal
    taxAmount: Prisma.Decimal
    grossAmount: Prisma.Decimal
}

function headerTotals(lines: LineAmounts[]) {
    const sum = (pick: (l: LineAmounts) => Prisma.Decimal) =>
        lines.reduce((s, l) => s.plus(pick(l)), new Decimal(0))
    return {
        subtotal: sum((l) => l.lineSubtotal),
        discountTotal: sum((l) => l.discount),
        taxTotal: sum((l) => l.taxAmount),
        grandTotal: sum((l) => l.grossAmount),
    }
}

const TX_INCLUDE = {
    salesSource: true,
    company: { select: { id: true, code: true, name: true } },
    branch: { select: { id: true, code: true, name: true } },
    customer: { select: { id: true, companyName: true, customerNumber: true } },
    lines: {
        include: {
            material: {
                select: {
                    id: true,
                    materialCode: true,
                    materialName: true,
                    sku: true,
                    baseUomId: true,
                },
            },
            uom: { select: { id: true, code: true, name: true } },
        },
        orderBy: { lineNumber: 'asc' as const },
    },
} satisfies Prisma.SdExtPlatformTransactionInclude

/**
 * Manages manually-entered external platform sales transactions.
 *
 * Each line resolves tax from the MM Material Master + FICO tax engine.
 * No marketplace APIs are involved — this is pure back-office data entry.
 */
@Injectable()
export class ExtPlatformTransactionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly taxCalc: FicoTaxCalculationService,
        private readonly materialResolution: MaterialResolutionService,
        private readonly products: ProductService,
        private readonly availability: CommercialAvailabilityService,
    ) {}

    // ─── Sales Sources ───────────────────────────────────────────

    async listSalesSources() {
        return this.prisma.sdSalesSource.findMany({
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
    }

    async createSalesSource(dto: CreateSalesSourceDto, userId?: string) {
        const code = dto.code.toUpperCase().replace(/\s+/g, '_')
        const existing = await this.prisma.sdSalesSource.findUnique({
            where: { code },
        })
        if (existing) {
            throw new ConflictException(
                `Sales source with code "${code}" already exists.`,
            )
        }
        return this.prisma.sdSalesSource.create({
            data: {
                code,
                name: dto.name,
                description: dto.description,
                badgeColor: dto.badgeColor,
                createdBy: userId,
            },
        })
    }

    async updateSalesSource(id: string, dto: UpdateSalesSourceDto) {
        const source = await this.prisma.sdSalesSource.findUnique({
            where: { id },
        })
        if (!source) throw new NotFoundException('Sales source not found.')
        return this.prisma.sdSalesSource.update({
            where: { id },
            data: {
                name: dto.name,
                description: dto.description,
                badgeColor: dto.badgeColor,
                isActive: dto.isActive,
                sortOrder: dto.sortOrder,
            },
        })
    }

    async deleteSalesSource(id: string) {
        const source = await this.prisma.sdSalesSource.findUnique({
            where: { id },
        })
        if (!source) throw new NotFoundException('Sales source not found.')
        if (source.origin === 'SYSTEM') {
            throw new BadRequestException(
                'System sales sources cannot be deleted.',
            )
        }
        const txCount = await this.prisma.sdExtPlatformTransaction.count({
            where: { salesSourceId: id },
        })
        if (txCount > 0) {
            throw new ConflictException(
                'Cannot delete a sales source that has transactions. Deactivate it instead.',
            )
        }
        return this.prisma.sdSalesSource.delete({ where: { id } })
    }

    // ─── Transactions ────────────────────────────────────────────

    async list(query: ListExtPlatformTransactionsQueryDto) {
        const limit = Math.min(query.limit ?? 100, 500)
        const offset = query.offset ?? 0
        const where: Prisma.SdExtPlatformTransactionWhereInput = {}

        if (query.companyId) where.companyId = query.companyId
        if (query.salesSourceId) where.salesSourceId = query.salesSourceId
        if (query.branchId) where.branchId = query.branchId
        if (query.status) where.status = query.status

        if (query.from || query.to) {
            where.transactionDate = {}
            if (query.from) where.transactionDate.gte = new Date(query.from)
            if (query.to) where.transactionDate.lte = new Date(query.to)
        }
        if (query.search) {
            where.OR = [
                {
                    transactionNumber: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
                {
                    externalOrderRef: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
                {
                    customerName: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
            ]
        }

        const [data, total] = await Promise.all([
            this.prisma.sdExtPlatformTransaction.findMany({
                where,
                include: TX_INCLUDE,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.sdExtPlatformTransaction.count({ where }),
        ])

        return { data, total, limit, offset }
    }

    async findById(id: string) {
        const tx = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id },
            include: TX_INCLUDE,
        })
        if (!tx) throw new NotFoundException('Transaction not found.')
        return tx
    }

    async create(dto: CreateExtPlatformTransactionDto, userId?: string) {
        // Validate sales source exists
        const source = await this.prisma.sdSalesSource.findUnique({
            where: { id: dto.salesSourceId },
        })
        if (!source) {
            throw new BadRequestException('Sales source not found.')
        }
        if (!source.isActive) {
            throw new BadRequestException('Sales source is not active.')
        }

        // Validate company
        const company = await this.prisma.company.findUnique({
            where: { id: dto.companyId },
        })
        if (!company) {
            throw new BadRequestException('Company not found.')
        }

        await this.assertUniqueRef(
            dto.salesSourceId,
            dto.companyId,
            dto.externalOrderRef,
        )

        const lines = await this.resolveLines(
            dto.lines,
            dto.companyId,
            dto.transactionDate,
            dto.isCompanyInventory ?? true,
        )
        const { subtotal, discountTotal, taxTotal, grandTotal } =
            headerTotals(lines)

        const txNumber = await this.nextTransactionNumber()

        const tx = await this.prisma.sdExtPlatformTransaction.create({
            data: {
                transactionNumber: txNumber,
                salesSourceId: dto.salesSourceId,
                externalPlatformName: dto.externalPlatformName?.trim() || null,
                externalOrderRef: dto.externalOrderRef?.trim() || null,
                transactionDate: new Date(dto.transactionDate),
                companyId: dto.companyId,
                branchId: dto.branchId || null,
                customerId: dto.customerId || null,
                customerName: dto.customerName?.trim() || null,
                currency: dto.currency || 'PHP',
                status: 'DRAFT',
                subtotal,
                discountTotal,
                taxTotal,
                grandTotal,
                paymentMethod: dto.paymentMethod || null,
                settlementReference: dto.settlementReference?.trim() || null,
                platformFees: dto.platformFees ?? 0,
                remarks: dto.remarks?.trim() || null,
                isCompanyInventory: dto.isCompanyInventory ?? true,
                createdBy: userId || dto.createdBy || null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolveLines returns plain objects that match the Prisma create shape
                lines: { create: lines as any },
            },
            include: TX_INCLUDE,
        })

        return tx
    }

    async update(id: string, dto: UpdateExtPlatformTransactionDto) {
        const existing = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id },
            include: { lines: true },
        })
        if (!existing) throw new NotFoundException('Transaction not found.')
        if (existing.status !== 'DRAFT') {
            throw new BadRequestException(
                'Only DRAFT transactions can be edited.',
            )
        }

        if (
            dto.externalOrderRef !== undefined ||
            dto.salesSourceId !== undefined
        ) {
            await this.assertUniqueRef(
                dto.salesSourceId ?? existing.salesSourceId,
                existing.companyId,
                dto.externalOrderRef ?? existing.externalOrderRef,
                id,
            )
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- resolveLines output fed to Prisma create
        let linesData: any[] | undefined
        let totals: ReturnType<typeof headerTotals> | undefined

        if (dto.lines) {
            const txDate = dto.transactionDate || existing.transactionDate.toISOString().slice(0, 10)
            const lines = await this.resolveLines(
                dto.lines,
                existing.companyId,
                txDate,
                dto.isCompanyInventory ?? existing.isCompanyInventory,
            )
            linesData = lines
            totals = headerTotals(lines)
        }

        return this.prisma.sdExtPlatformTransaction.update({
            where: { id },
            data: {
                salesSourceId: dto.salesSourceId,
                externalPlatformName: dto.externalPlatformName?.trim(),
                externalOrderRef:
                    dto.externalOrderRef === undefined
                        ? undefined
                        : dto.externalOrderRef.trim() || null,
                transactionDate: dto.transactionDate
                    ? new Date(dto.transactionDate)
                    : undefined,
                branchId: dto.branchId,
                customerId: dto.customerId,
                customerName: dto.customerName?.trim(),
                paymentMethod: dto.paymentMethod,
                settlementReference: dto.settlementReference?.trim(),
                platformFees: dto.platformFees,
                remarks: dto.remarks?.trim(),
                isCompanyInventory: dto.isCompanyInventory,
                ...(totals ?? {}),
                ...(linesData
                    ? {
                          lines: {
                              deleteMany: {},
                              create: linesData,
                          },
                      }
                    : {}),
            },
            include: TX_INCLUDE,
        })
    }

    async updateStatus(
        id: string,
        dto: UpdateExtPlatformTransactionStatusDto,
        userId?: string,
    ) {
        const existing = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id },
        })
        if (!existing) throw new NotFoundException('Transaction not found.')

        const VALID_TRANSITIONS: Record<string, string[]> = {
            DRAFT: ['CONFIRMED', 'CANCELLED'],
            CONFIRMED: ['APPROVED', 'CANCELLED'],
            APPROVED: ['CANCELLED'],
        }

        const allowed = VALID_TRANSITIONS[existing.status] ?? []
        if (!allowed.includes(dto.status)) {
            throw new BadRequestException(
                `Cannot transition from ${existing.status} to ${dto.status}.`,
            )
        }

        return this.prisma.sdExtPlatformTransaction.update({
            where: { id },
            data: {
                status: dto.status,
                ...(dto.status === 'APPROVED'
                    ? { approvedBy: userId || dto.updatedBy, approvedAt: new Date() }
                    : {}),
            },
            include: TX_INCLUDE,
        })
    }

    async delete(id: string) {
        const existing = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: { id },
        })
        if (!existing) throw new NotFoundException('Transaction not found.')
        if (existing.status !== 'DRAFT') {
            throw new BadRequestException(
                'Only DRAFT transactions can be deleted.',
            )
        }
        await this.prisma.sdExtPlatformTransaction.delete({ where: { id } })
        return { deleted: true }
    }

    // ─── Reporting aggregate ─────────────────────────────────────

    async reportSummary(query: ListExtPlatformTransactionsQueryDto) {
        const where: Prisma.SdExtPlatformTransactionWhereInput = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.salesSourceId) where.salesSourceId = query.salesSourceId
        if (query.branchId) where.branchId = query.branchId
        if (query.status) where.status = query.status
        if (query.from || query.to) {
            where.transactionDate = {}
            if (query.from) where.transactionDate.gte = new Date(query.from)
            if (query.to) where.transactionDate.lte = new Date(query.to)
        }
        // Exclude cancelled from totals
        if (!query.status) {
            where.status = { not: 'CANCELLED' }
        }

        const agg = await this.prisma.sdExtPlatformTransaction.aggregate({
            where,
            _sum: {
                subtotal: true,
                discountTotal: true,
                taxTotal: true,
                grandTotal: true,
                platformFees: true,
            },
            _count: true,
        })

        // Per-source breakdown
        const bySource = await this.prisma.sdExtPlatformTransaction.groupBy({
            by: ['salesSourceId'],
            where,
            _sum: {
                grandTotal: true,
                taxTotal: true,
                discountTotal: true,
                platformFees: true,
            },
            _count: true,
        })

        // Enrich source names
        const sources = await this.prisma.sdSalesSource.findMany()
        const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]))

        // Tax breakdown from lines
        const taxBreakdown = await this.prisma.$queryRaw<
            Array<{
                tax_classification: string | null
                taxable_amount: Prisma.Decimal | null
                tax_amount: Prisma.Decimal | null
                exempt_amount: Prisma.Decimal | null
                zero_rated_amount: Prisma.Decimal | null
            }>
        >(Prisma.sql`
            SELECT
                l."taxClassification" AS tax_classification,
                SUM(l."taxableAmount") AS taxable_amount,
                SUM(l."taxAmount") AS tax_amount,
                SUM(l."exemptAmount") AS exempt_amount,
                SUM(l."zeroRatedAmount") AS zero_rated_amount
            FROM "sd_ext_platform_transaction_lines" l
            JOIN "sd_ext_platform_transactions" t ON t."id" = l."transactionId"
            WHERE t."status" != 'CANCELLED'
                ${query.companyId ? Prisma.sql`AND t."companyId" = ${query.companyId}` : Prisma.empty}
                ${query.salesSourceId ? Prisma.sql`AND t."salesSourceId" = ${query.salesSourceId}` : Prisma.empty}
                ${query.from ? Prisma.sql`AND t."transactionDate" >= ${new Date(query.from)}` : Prisma.empty}
                ${query.to ? Prisma.sql`AND t."transactionDate" <= ${new Date(query.to)}` : Prisma.empty}
            GROUP BY l."taxClassification"
        `)

        return {
            totalTransactions: agg._count,
            totalSales: Number(agg._sum.grandTotal ?? 0),
            totalSubtotal: Number(agg._sum.subtotal ?? 0),
            totalDiscount: Number(agg._sum.discountTotal ?? 0),
            totalTax: Number(agg._sum.taxTotal ?? 0),
            totalPlatformFees: Number(agg._sum.platformFees ?? 0),
            netSettlement:
                Number(agg._sum.grandTotal ?? 0) -
                Number(agg._sum.platformFees ?? 0),
            bySource: bySource.map((row) => ({
                salesSourceId: row.salesSourceId,
                salesSourceCode: sourceMap[row.salesSourceId]?.code ?? '',
                salesSourceName: sourceMap[row.salesSourceId]?.name ?? '',
                transactions: row._count,
                totalSales: Number(row._sum.grandTotal ?? 0),
                totalTax: Number(row._sum.taxTotal ?? 0),
                totalDiscount: Number(row._sum.discountTotal ?? 0),
                platformFees: Number(row._sum.platformFees ?? 0),
            })),
            taxBreakdown: taxBreakdown.map((row) => ({
                taxClassification: row.tax_classification ?? 'UNKNOWN',
                taxableAmount: Number(row.taxable_amount ?? 0),
                taxAmount: Number(row.tax_amount ?? 0),
                exemptAmount: Number(row.exempt_amount ?? 0),
                zeroRatedAmount: Number(row.zero_rated_amount ?? 0),
            })),
        }
    }

    /** Runs SD tax determination for the entry form without saving anything. */
    async preview(dto: PreviewExtPlatformTransactionDto) {
        let links = await this.linkCatalogLines(dto.lines, dto.companyId)
        const toLinked = () =>
            dto.lines.flatMap((line, i) => {
                const result = links[i]
                return 'link' in result
                    ? [{ ...line, ...result.link, lineNumber: result.lineNumber }]
                    : []
            })
        if (dto.isCompanyInventory ?? true) {
            const stockErrors = await this.stockErrors(toLinked())
            links = links.map((result) => {
                const error = stockErrors.get(result.lineNumber)
                return error ? { lineNumber: result.lineNumber, error } : result
            })
        }
        const linked = toLinked()
        const lines = await this.computeLines(linked, dto.companyId, dto.transactionDate)
        const byNumber = new Map(lines.map((l) => [l.lineNumber, l]))
        const sum = (pick: (l: (typeof lines)[number]) => Prisma.Decimal) =>
            lines.reduce((s, l) => s.plus(pick(l)), new Decimal(0))
        const grandTotal = sum((l) => l.grossAmount)
        const platformFees = new Decimal(dto.platformFees ?? 0)

        return {
            // One entry per requested line, in order; unlinked lines carry `error` and no amounts.
            lines: links.map((result) => {
                const l = byNumber.get(result.lineNumber)
                if ('error' in result || !l) {
                    return { lineNumber: result.lineNumber, error: 'error' in result ? result.error : 'Unable to resolve line.' }
                }
                return {
                lineNumber: l.lineNumber,
                materialId: l.materialId,
                materialCode: l.materialCode,
                taxClassification: l.taxClassification,
                taxCode: l.taxCode,
                taxRate: l.taxRate.toNumber(),
                calculationMethod: l.taxCode ? l.calculationMethod : null,
                lineSubtotal: l.lineSubtotal.toNumber(),
                taxableAmount: l.taxableAmount.toNumber(),
                taxAmount: l.taxAmount.toNumber(),
                exemptAmount: l.exemptAmount.toNumber(),
                zeroRatedAmount: l.zeroRatedAmount.toNumber(),
                netAmount: l.netAmount.toNumber(),
                grossAmount: l.grossAmount.toNumber(),
                }
            }),
            totals: {
                grossSales: sum((l) => l.quantity.mul(l.unitPrice)).toNumber(),
                discount: sum((l) => l.discount).toNumber(),
                taxableSales: sum((l) => l.taxableAmount).toNumber(),
                vatAmount: sum((l) => l.taxAmount).toNumber(),
                exemptSales: sum((l) => l.exemptAmount).toNumber(),
                zeroRatedSales: sum((l) => l.zeroRatedAmount).toNumber(),
                nonTaxableSales: sum((l) =>
                    l.taxClassification ? new Decimal(0) : l.netAmount,
                ).toNumber(),
                netAmount: sum((l) => l.netAmount).toNumber(),
                grandTotal: grandTotal.toNumber(),
                platformFees: platformFees.toNumber(),
                netSettlement: grandTotal.minus(platformFees).toNumber(),
            },
        }
    }

    private async assertUniqueRef(
        salesSourceId: string,
        companyId: string,
        externalOrderRef: string | null | undefined,
        excludeId?: string,
    ) {
        const ref = externalOrderRef?.trim()
        if (!ref) return
        const dup = await this.prisma.sdExtPlatformTransaction.findUnique({
            where: {
                salesSourceId_companyId_externalOrderRef: {
                    salesSourceId,
                    companyId,
                    externalOrderRef: ref,
                },
            },
            select: { id: true, transactionNumber: true },
        })
        if (dup && dup.id !== excludeId) {
            throw new ConflictException(
                `External reference "${ref}" is already recorded as ${dup.transactionNumber} for this source and company.`,
            )
        }
    }

    // ─── Stock (MM availability via the POS / storefront ATP path) ───

    /** Live availability per requested catalog item, in request order. */
    async stockFor(items: Array<{ productId: string; variantId?: string | null }>) {
        const products = await this.prisma.sdProduct.findMany({
            where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
            select: { id: true, sku: true, divisionId: true },
        })
        const productById = new Map(products.map((p) => [p.id, p]))
        const result: StockRow[] = items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            availableQuantity: 0,
            state: 'OUT_OF_STOCK',
        }))

        const indexesByDivision = new Map<string, number[]>()
        items.forEach((item, index) => {
            const product = productById.get(item.productId)
            if (!product) return
            const list = indexesByDivision.get(product.divisionId) ?? []
            list.push(index)
            indexesByDivision.set(product.divisionId, list)
        })
        for (const [divisionId, indexes] of indexesByDivision) {
            for (let start = 0; start < indexes.length; start += STOCK_BATCH_SIZE) {
                const chunk = indexes.slice(start, start + STOCK_BATCH_SIZE)
                const rows = await this.products.getStorefrontAvailabilityBatch(
                    divisionId,
                    chunk.map((index) => ({
                        sku: productById.get(items[index].productId)!.sku,
                        variantId: items[index].variantId ?? null,
                    })),
                    this.availability,
                )
                rows.forEach((row, k) => {
                    result[chunk[k]].availableQuantity = row.availableQuantity
                    result[chunk[k]].state = row.state
                })
            }
        }
        return result
    }

    /**
     * Company-owned sales cannot exceed MM availability. Quantities of the same
     * item on several lines are summed. Returns an error per offending line.
     */
    private async stockErrors(
        lines: Array<{ lineNumber: number; productId: string; variantId: string | null; quantity: number; productName: string }>,
    ): Promise<Map<number, string>> {
        const errors = new Map<number, string>()
        if (!lines.length) return errors
        const stock = await this.stockFor(lines)
        const requested = new Map<string, number>()
        lines.forEach((l) => {
            const key = `${l.productId}:${l.variantId ?? ''}`
            requested.set(key, (requested.get(key) ?? 0) + l.quantity)
        })
        lines.forEach((l, i) => {
            const { state, availableQuantity } = stock[i]
            if (state === 'NON_INVENTORY' || state === 'NOT_MAPPED') return
            const total = requested.get(`${l.productId}:${l.variantId ?? ''}`) ?? l.quantity
            if (total > availableQuantity) {
                errors.set(
                    l.lineNumber,
                    availableQuantity <= 0
                        ? `${l.productName} is out of stock. Choose third-party stock if someone else's inventory was sold.`
                        : `Only ${availableQuantity} of ${l.productName} in stock (${total} entered).`,
                )
            }
        })
        return errors
    }

    // ─── Catalog → material link ─────────────────────────────────

    /**
     * Each line is an SD Product Catalog item. Its MM material comes from the
     * sold variant, else the product–material assignment (same order as POS).
     * Failures are returned per line so the entry form can flag the row.
     */
    private async linkCatalogLines(
        dtoLines: ExtPlatformTransactionLineDto[],
        companyId: string,
    ): Promise<LinkResult[]> {
        const products = await this.prisma.sdProduct.findMany({
            where: { id: { in: [...new Set(dtoLines.map((l) => l.productId))] } },
            select: {
                id: true,
                sku: true,
                name: true,
                divisionId: true,
                status: true,
                productConfig: true,
                defaultVariantId: true,
            },
        })
        const productById = new Map(products.map((p) => [p.id, p]))
        const variantIds = [
            ...new Set([
                ...dtoLines.flatMap((l) => (l.variantId ? [l.variantId] : [])),
                ...products.flatMap((p) => (p.defaultVariantId ? [p.defaultVariantId] : [])),
            ]),
        ]
        const variants = variantIds.length
            ? await this.prisma.sdProductVariant.findMany({
                  where: { id: { in: variantIds } },
                  select: { id: true, productId: true, variantName: true, sku: true, materialId: true },
              })
            : []
        const variantById = new Map(variants.map((v) => [v.id, v]))

        return Promise.all(
            dtoLines.map(async (line, idx): Promise<LinkResult> => {
                const lineNumber = idx + 1
                const fail = (error: string): LinkResult => ({ lineNumber, error })
                const product = productById.get(line.productId)
                if (!product) return fail(`Line ${lineNumber}: product not found in Product Catalog.`)
                if (product.status !== 'ACTIVE') {
                    return fail(`${product.name} is ${product.status.toLowerCase()} in Product Catalog.`)
                }
                const variant = line.variantId ? variantById.get(line.variantId) : undefined
                if (line.variantId && variant?.productId !== product.id) {
                    return fail(`${product.name}: the selected variant does not belong to this product.`)
                }
                if (!variant && product.productConfig === 'VARIABLE') {
                    return fail(`Select a variant for ${product.name}.`)
                }
                const defaultVariant =
                    !variant && product.defaultVariantId
                        ? variantById.get(product.defaultVariantId)
                        : undefined

                let materialId = variant?.materialId ?? defaultVariant?.materialId ?? null
                if (!materialId) {
                    try {
                        const resolved = await this.materialResolution.resolveMaterialForProduct({
                            productId: product.id,
                            companyId,
                            channel: 'EXT_PLATFORM',
                            divisionId: product.divisionId,
                        })
                        materialId = resolved.materialId
                    } catch (err) {
                        if (!(err instanceof SdMmIntegrationException)) throw err
                        if (err.code === SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_MISSING) {
                            return fail(`${product.name} has no MM material assigned. Link it in Product Catalog first.`)
                        }
                        if (err.code === SD_MM_ERROR.NON_INVENTORY_PRODUCT) {
                            return fail(`${product.name} is a service / non-stock product with no MM material, so its tax cannot be determined.`)
                        }
                        return fail(`${product.name}: ${err.message}`)
                    }
                }

                return {
                    lineNumber,
                    link: {
                        productId: product.id,
                        variantId: variant?.id ?? null,
                        productSku: variant?.sku ?? product.sku,
                        productName: product.name,
                        variantName: variant?.variantName ?? null,
                        materialId,
                    },
                }
            }),
        )
    }

    /** Strict path for saving: every line must link to a material. */
    private async resolveLines(
        dtoLines: ExtPlatformTransactionLineDto[],
        companyId: string,
        transactionDate: string,
        checkStock: boolean,
    ) {
        const links = await this.linkCatalogLines(dtoLines, companyId)
        const failed = links.find((l): l is LinkFailure => 'error' in l)
        if (failed) throw new BadRequestException(failed.error)
        const linked = dtoLines.map((line, i) => ({
            ...line,
            ...(links[i] as LinkSuccess).link,
            lineNumber: i + 1,
        }))
        if (checkStock) {
            const [stockError] = (await this.stockErrors(linked)).values()
            if (stockError) throw new BadRequestException(stockError)
        }
        return this.computeLines(linked, companyId, transactionDate)
    }

    // ─── Tax determination for lines ─────────────────────────────

    /**
     * Snapshot each line's tax config from its MM material, run FICO tax
     * calculation, and return the full line data ready for Prisma create.
     */
    private async computeLines(
        dtoLines: CatalogLine[],
        companyId: string,
        transactionDate: string,
    ) {
        const materialIds = dtoLines.map((l) => l.materialId)
        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: materialIds }, deletedAt: null },
            include: {
                taxCode: { include: { taxRates: true } },
                baseUom: { select: { id: true, code: true, name: true } },
                salesUom: { select: { id: true, code: true, name: true } },
            },
        })
        const materialMap = Object.fromEntries(materials.map((m) => [m.id, m]))

        // The FICO rate in force on the sale date applies, so backdated entries keep historical rates.
        const rateDate = taxDateOnly(transactionDate) ?? taxTodayUtc()

        return dtoLines.map((line) => {
            const mat = materialMap[line.materialId]
            if (!mat) {
                throw new BadRequestException(
                    `${line.productName}: its MM material is missing or deleted.`,
                )
            }

            const qty = new Decimal(line.quantity)
            const price = new Decimal(line.unitPrice)
            const discount = new Decimal(line.discount ?? 0)
            const lineSubtotal = qty.mul(price).minus(discount)
            if (lineSubtotal.lt(0)) {
                throw new BadRequestException(
                    `Line ${line.lineNumber} (${line.productName}): discount exceeds the line amount.`,
                )
            }

            // Tax determination from material's FICO tax code
            type FullTaxCode = TaxCodeLike & {
                taxCategory?: string | null
                calculationMethod?: string | null
                rateUnit?: string | null
                roundingMethod?: string | null
                roundingLevel?: string | null
                decimalPrecision?: number | null
                isRecoverable?: boolean | null
                taxRates?: Array<{
                    rate: unknown
                    rateUnit?: string | null
                    effectiveFrom: Date | string
                    effectiveTo?: Date | string | null
                    status?: string | null
                }>
            }
            const taxCode = mat.taxCode as FullTaxCode | null

            const taxClassification = mat.taxClassification || null
            const taxCodeStr = taxCode?.code ?? null
            const taxCodeId = mat.taxCodeId ?? null
            let taxRate = new Decimal(0)
            let calculationMethod = mat.priceTaxTreatment === 'VAT_INCLUSIVE' ? 'TAX_INCLUSIVE' : 'TAX_EXCLUSIVE'
            let taxableAmount = new Decimal(0)
            let taxAmount = new Decimal(0)
            let exemptAmount = new Decimal(0)
            let zeroRatedAmount = new Decimal(0)
            let netAmount = lineSubtotal
            let grossAmount = lineSubtotal

            if (taxCode && taxClassification) {
                const rate = resolveCurrentTaxRate(taxCode, rateDate)
                const rateValue = rate ? new Decimal(String(rate.rate)) : new Decimal(0)

                const calcInput: TaxCalculationInput = {
                    taxCodeId: taxCode.id,
                    taxCode: taxCode.code,
                    companyId,
                    taxType: taxCode.taxType,
                    calculationMethod:
                        taxCode.calculationMethod ?? calculationMethod,
                    roundingMethod: taxCode.roundingMethod ?? 'HALF_UP',
                    roundingLevel: taxCode.roundingLevel ?? 'PER_LINE_ITEM',
                    decimalPrecision: taxCode.decimalPrecision ?? 2,
                    isRecoverable: taxCode.isRecoverable ?? true,
                    rate: rate
                        ? {
                              rate: rateValue,
                              rateUnit: rate.rateUnit ?? 'PERCENTAGE',
                          }
                        : null,
                    amount: lineSubtotal,
                    transactionDate,
                    transactionType: 'EXT_PLATFORM_SALE',
                }

                const result = this.taxCalc.calculate(calcInput)
                taxRate = new Decimal(result.taxRate)
                calculationMethod = result.calculationMethod
                taxAmount = new Decimal(result.taxAmount)
                netAmount = new Decimal(result.netAmount)
                grossAmount = new Decimal(result.grossAmount)

                if (
                    taxClassification === 'VATABLE' ||
                    result.classification === 'STANDARD'
                ) {
                    taxableAmount = netAmount
                } else if (
                    taxClassification === 'VAT_EXEMPT' ||
                    result.classification === 'EXEMPT'
                ) {
                    exemptAmount = netAmount
                } else if (
                    taxClassification === 'ZERO_RATED' ||
                    result.classification === 'ZERO_RATED'
                ) {
                    zeroRatedAmount = netAmount
                }
            } else {
                // No tax configured — treat as non-taxable
                if (taxClassification === 'VAT_EXEMPT') {
                    exemptAmount = lineSubtotal
                } else if (taxClassification === 'ZERO_RATED') {
                    zeroRatedAmount = lineSubtotal
                }
            }

            const uomId = line.uomId || mat.salesUom?.id || mat.baseUomId

            return {
                lineNumber: line.lineNumber,
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                variantName: line.variantName,
                materialId: mat.id,
                materialCode: mat.materialCode,
                materialName: mat.materialName,
                sku: line.productSku,
                description:
                    line.description ||
                    (line.variantName ? `${line.productName} — ${line.variantName}` : line.productName),
                quantity: qty,
                uomId,
                unitPrice: price,
                discount,
                lineSubtotal,
                taxClassification,
                taxCodeId,
                taxCode: taxCodeStr,
                taxRate,
                calculationMethod,
                taxableAmount,
                taxAmount,
                exemptAmount,
                zeroRatedAmount,
                netAmount,
                grossAmount,
            }
        })
    }

    private async nextTransactionNumber(): Promise<string> {
        const result = await this.prisma.$queryRaw<
            [{ nextval: bigint }]
        >(Prisma.sql`SELECT nextval('sd_ext_platform_tx_number_seq')`)
        const seq = Number(result[0].nextval)
        return `EPT-${String(seq).padStart(6, '0')}`
    }
}
