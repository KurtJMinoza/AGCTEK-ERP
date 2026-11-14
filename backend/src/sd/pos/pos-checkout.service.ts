import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsIssueService } from '../../mm/stock-ops/goods-issue.service'
import { buildMaterialTaxProjection } from '../../mm/materials/material-tax'
import { SalesOrderService } from '../sales-order.service'
import { MaterialResolutionService } from '../material-resolution.service'
import { SdEventEmitterService } from '../sd-event-emitter.service'
import { SD_EVENTS } from '../sd-event.types'
import { PosSessionService } from './pos-session.service'
import { PosCustomerService } from './pos-customer.service'
import { allocateTenders, type PosTender } from './pos-tender'
import type { PosCheckoutDto, PosQuoteDto } from './dto/pos.dto'

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

/** Barcode of the MM material behind an order line (receipt display). */
const MATERIAL_BARCODE_INCLUDE = {
    select: {
        barcodes: { select: { barcodeValue: true, isPrimary: true } },
    },
} as const

type ResolvedLine = {
    sku: string
    variantId?: string
    variantName?: string
    description?: string
    quantity: number
    unitPrice: number
    lineTotal: number
    materialId: string | null
    taxClassification: string | null
    taxCode: string | null
    taxRate: number
    taxTreatment: string | null
    taxIncluded: number
    taxAdded: number
    taxWarning: string | null
}

export type PosReceipt = {
    receiptNumber: string
    salesOrderId: string
    orderNumber: string
    status: string
    completedAt: string
    branchId: string
    posSessionId: string | null
    cashierUserId: string | null
    customerName: string | null
    /** Set when the sale was voided. */
    voidedAt?: string | null
    voidReason?: string | null
    voidedBy?: string | null
    /** SALE for a completed sale, VOID for the reversal transaction that follows it. */
    transactionType?: 'SALE' | 'VOID'
    /** Number of the void transaction that reversed this sale. */
    voidTransactionNumber?: string | null
    /** Receipt number of the sale that a void transaction reversed. */
    originalReceiptNumber?: string | null
    lines: Array<{
        sku: string
        description: string | null
        variantName: string | null
        /** Scannable barcode of the line (variant, else MM material). */
        barcode: string | null
        /** Product image snapshot of the sold line. */
        imageUrl: string | null
        quantity: number
        unitPrice: number
        lineTotal: number
        /** VATABLE | VAT_EXEMPT | ZERO_RATED; null when the material has no tax setup. */
        taxClassification: string | null
        taxCode: string | null
        taxRate: number
        taxIncluded: number
        taxAdded: number
    }>
    subtotal: number
    discountAmount: number
    /** VAT added on top of VAT-exclusive prices (part of the total). */
    taxAmount: number
    /** VAT already inside VAT-inclusive prices. */
    taxIncludedAmount: number
    /** BIR receipt breakdown, from the VAT frozen on the order lines. */
    vatableSales: number
    vatAmount: number
    vatExemptSales: number
    zeroRatedSales: number
    total: number
    tendered: number
    change: number
    tenders: Array<{
        method: string
        amount: number
        tenderAmount: number
        changeAmount: number
        referenceNumber: string | null
        status: string
        verificationStatus: string
    }>
    warnings: string[]
}

/**
 * Retail POS checkout completion.
 *
 * One sale moves through: server-side price/total verification and ATP
 * (SD), tender capture (SD), the MM goods issue (MM inventory engine) and
 * the cashier shift. Every step is idempotent, so a repeated checkout of the
 * same cart never posts inventory twice.
 */
@Injectable()
export class PosCheckoutService {
    private readonly logger = new Logger(PosCheckoutService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly salesOrders: SalesOrderService,
        private readonly sessions: PosSessionService,
        private readonly materials: MaterialResolutionService,
        private readonly goodsIssue: GoodsIssueService,
        private readonly sdEvents: SdEventEmitterService,
        private readonly customers: PosCustomerService,
    ) {}

    /**
     * Amount due of a running cart: the server prices the lines, applies the
     * transaction discount and the MM tax configuration. The terminal quotes
     * the cart before the tender screen so the cashier collects the amount the
     * checkout will ask for.
     */
    async quote(dto: PosQuoteDto) {
        const lines = await this.resolveLines(
            dto.divisionId,
            dto.lines,
            dto.companyId,
        )
        const subtotal = round2(
            lines.reduce((sum, line) => sum + line.lineTotal, 0),
        )
        const discountAmount = round2(dto.discountAmount ?? 0)
        if (discountAmount > subtotal) {
            throw new BadRequestException(
                'The discount cannot exceed the cart subtotal.',
            )
        }
        const taxIncludedAmount = round2(
            lines.reduce((sum, line) => sum + line.taxIncluded, 0),
        )
        const taxAmount = round2(
            lines.reduce((sum, line) => sum + line.taxAdded, 0),
        )
        const total = round2(subtotal - discountAmount + taxAmount)

        return {
            subtotal,
            discountAmount,
            taxAmount,
            taxIncludedAmount,
            total,
            lines: lines.map((line) => ({
                sku: line.sku,
                description: line.description ?? line.sku,
                variantName: line.variantName ?? null,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
                taxRate: line.taxRate,
                taxTreatment: line.taxTreatment,
                taxIncluded: line.taxIncluded,
                taxAdded: line.taxAdded,
            })),
            warnings: lines
                .map((line) => line.taxWarning)
                .filter((warning): warning is string => Boolean(warning)),
        }
    }

    /** The receipt of an existing POS sale (reprint, transaction history). */
    async receiptFor(orderId: string): Promise<PosReceipt> {
        const order = await this.prisma.sdSalesOrder.findFirst({
            where: { id: orderId, channel: 'POS' },
            include: {
                lines: { include: { material: MATERIAL_BARCODE_INCLUDE } },
                payments: true,
            },
        })
        if (!order) throw new NotFoundException('Sale not found')
        return this.receipt(order as never, order.payments)
    }

    /** The POS sales of a branch, newest first (transaction history). */
    async listReceipts(args: {
        companyId?: string | null
        branchId?: string | null
        limit?: number
    }): Promise<PosReceipt[]> {
        const orders = await this.prisma.sdSalesOrder.findMany({
            where: {
                channel: 'POS',
                ...(args.companyId ? { companyId: args.companyId } : {}),
                ...(args.branchId ? { branchId: args.branchId } : {}),
            },
            include: {
                lines: { include: { material: MATERIAL_BARCODE_INCLUDE } },
                payments: true,
                voidTransaction: true,
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(args.limit ?? 50, 200),
        })
        // The history is a ledger: a void is its own transaction, so it follows
        // the completed sale it reversed. The sale keeps its void stamp.
        return orders.flatMap((order) => {
            const sale = this.receipt(order as never, order.payments)
            if (!order.voidTransaction) return [sale]
            return [
                {
                    ...sale,
                    transactionType: 'SALE' as const,
                    voidTransactionNumber:
                        order.voidTransaction.voidNumber,
                },
                {
                    ...sale,
                    receiptNumber: order.voidTransaction.voidNumber,
                    originalReceiptNumber: sale.receiptNumber,
                    transactionType: 'VOID' as const,
                    voidTransactionNumber:
                        order.voidTransaction.voidNumber,
                    status: 'VOID',
                    completedAt:
                        order.voidTransaction.createdAt.toISOString(),
                    total: Number(order.voidTransaction.amount),
                    tendered: 0,
                    change: 0,
                    tenders: [],
                    lines: [],
                    warnings: [],
                },
            ]
        })
    }

    async complete(dto: PosCheckoutDto): Promise<PosReceipt> {
        const companyId = dto.companyId?.trim() || null
        if (!companyId) {
            throw new BadRequestException(
                'The terminal needs a company scope (the branch of the register).',
            )
        }
        // The terminal sells without a shift ceremony: the register shift is
        // opened on demand with a 0 float and can be closed at the end of the day.
        const session = dto.posSessionId
            ? await this.sessions.requireOpen(dto.posSessionId)
            : await this.sessions.ensureOpen({
                  companyId,
                  branchId: dto.branchId,
                  terminalCode: dto.terminalCode?.trim() || 'POS-01',
                  cashierUserId:
                      dto.cashierUserId?.trim() || dto.createdBy?.trim() || 'POS',
              })

        // A repeated checkout of the same cart returns the sale that exists.
        const existing = await this.prisma.sdSalesOrder.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
                lines: { include: { material: MATERIAL_BARCODE_INCLUDE } },
                payments: true,
            },
        })
        if (existing) {
            // A checkout that failed after the order existed is resumed, not
            // returned as a half-finished sale.
            if (existing.status === 'COMPLETED') {
                return this.receipt(existing, existing.payments ?? [])
            }
            if (existing.status === 'CONFIRMED') {
                return this.finalizeStagedOrder(
                    existing.id,
                    dto.cashierUserId ?? dto.createdBy ?? null,
                )
            }
            throw new ConflictException(
                `This sale is ${existing.status} and cannot be completed.`,
            )
        }

        const lines = await this.resolveLines(
            dto.divisionId,
            dto.lines,
            session.companyId,
        )
        const subtotal = round2(
            lines.reduce((sum, line) => sum + line.lineTotal, 0),
        )
        const discountAmount = round2(dto.discountAmount ?? 0)
        if (discountAmount > subtotal) {
            throw new BadRequestException(
                'The discount cannot exceed the cart subtotal.',
            )
        }
        const taxAmount = round2(
            lines.reduce((sum, line) => sum + line.taxAdded, 0),
        )
        const total = round2(subtotal - discountAmount + taxAmount)

        const { tenders, change } = allocateTenders(total, dto.tenders)
        const warnings = lines
            .map((line) => line.taxWarning)
            .filter((warning): warning is string => Boolean(warning))

        // A customer typed at the register: the master record is created for a
        // first-time buyer so the next sale finds them in the customer list.
        const walkIn = !dto.customerId || dto.customerId === 'WALK-IN'
        const customer =
            walkIn && dto.customerName?.trim()
                ? await this.customers.resolveByName(
                      dto.customerName,
                      dto.createdBy,
                  )
                : null
        const customerId = customer?.id ?? dto.customerId
        const customerName = customer?.companyName ?? dto.customerName

        const salaryLoan = tenders.find(
            (tender) => tender.method === 'SALARY_LOAN',
        )
        if (salaryLoan) {
            await this.assertEmployeeCredit(customerId, total)
        }

        const order = await this.salesOrders.createRetail({
            channel: 'POS',
            idempotencyKey: dto.idempotencyKey,
            divisionId: dto.divisionId,
            branchId: dto.branchId,
            customerId,
            customerName: customerName ?? 'Walk-in customer',
            lines: lines.map((line) => ({
                sku: line.sku,
                variantId: line.variantId,
                variantName: line.variantName,
                description: line.description ?? line.sku,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
            })),
            subtotal,
            discountAmount,
            shippingAmount: 0,
            taxAmount,
            totalAmount: total,
            paymentReceived: round2(total + change),
            deferCompletion: true,
            createdBy: dto.createdBy,
        })

        await this.saveLineTaxSnapshot(order.id, lines)

        const orderCompanyId = order.companyId ?? session.companyId
        await this.recordTenders({
            orderId: order.id,
            companyId: orderCompanyId,
            customerId,
            sessionId: session.id,
            cashierUserId: dto.cashierUserId ?? null,
            tenders,
            idempotencyKey: dto.idempotencyKey,
        })

        // The money is captured; now deduct the stock through the MM engine.
        await this.postGoodsIssue(order, session)

        const receiptNumber = await this.nextReceiptNumber(orderCompanyId)
        const completed = await this.prisma.sdSalesOrder.update({
            where: { id: order.id },
            data: {
                status: 'COMPLETED',
                paymentMethod:
                    tenders.length > 1 ? 'SPLIT' : tenders[0].method,
                paymentStatus: tenders.every((t) => t.status === 'Paid')
                    ? 'Paid'
                    : 'Pending Verification',
                paymentReference: tenders[0].referenceNumber ?? null,
                paymentProvider: tenders[0].provider ?? null,
                changeAmount: change,
                taxAmount,
                posSessionId: session.id,
                cashierUserId: dto.cashierUserId ?? null,
                receiptNumber,
            },
            include: {
                lines: { include: { material: MATERIAL_BARCODE_INCLUDE } },
                payments: true,
            },
        })

        if (salaryLoan) {
            await this.consumeEmployeeCredit(customerId, total)
        }

        await this.sdEvents.emit(SD_EVENTS.POS_SALE_COMPLETED, {
            salesOrderId: completed.id,
            orderNumber: completed.orderNumber,
            receiptNumber,
            companyId: orderCompanyId,
            branchId: dto.branchId,
            posSessionId: session.id,
            cashierUserId: dto.cashierUserId ?? null,
            customerId,
            currency: 'PHP',
            subtotal: subtotal.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            totalAmount: total.toFixed(2),
            tenders: tenders.map((tender) => ({
                method: tender.method,
                amount: tender.amount.toFixed(2),
                tenderAmount: tender.tenderAmount.toFixed(2),
                changeAmount: tender.changeAmount.toFixed(2),
                status: tender.status,
                verificationStatus: tender.verificationStatus,
                referenceNumber: tender.referenceNumber,
            })),
            idempotencyKey: dto.idempotencyKey,
        })

        return this.receipt(completed, completed.payments ?? [], warnings)
    }

    /**
     * Finishes a POS sale whose checkout stopped after the order and its
     * tenders were recorded (order left CONFIRMED, goods issue not posted).
     * Safe to repeat: the tender rows, the goods issue and the receipt number
     * are reused, never duplicated.
     */
    async finalizeStagedOrder(
        orderId: string,
        actor?: string | null,
    ): Promise<PosReceipt> {
        const order = await this.prisma.sdSalesOrder.findFirst({
            where: { id: orderId, channel: 'POS' },
            include: {
                lines: { include: { material: MATERIAL_BARCODE_INCLUDE } },
                payments: true,
            },
        })
        if (!order) throw new NotFoundException('Sale not found')
        if (order.status === 'COMPLETED') {
            return this.receipt(order as never, order.payments)
        }
        if (order.status !== 'CONFIRMED') {
            throw new ConflictException(
                `Only a pending sale can be completed (this sale is ${order.status}).`,
            )
        }
        if (!order.payments.length) {
            throw new ConflictException(
                'The pending sale has no tender; take the payment again at the register.',
            )
        }

        if (!order.posSessionId && !order.branchId) {
            throw new BadRequestException(
                'The sale has no branch; the stock cannot be deducted.',
            )
        }
        const session = order.posSessionId
            ? await this.sessions.requireOpen(order.posSessionId)
            : await this.sessions.ensureOpen({
                  companyId: order.companyId ?? '',
                  branchId: order.branchId as string,
                  terminalCode: 'POS-01',
                  cashierUserId:
                      actor ?? order.cashierUserId ?? 'POS',
              })

        // The stock still has to leave the shelf: reuse the draft goods issue.
        await this.postGoodsIssue(order, session)

        const payments = order.payments
        const salaryLoanTotal = payments
            .filter(
                (payment) =>
                    payment.paymentMethod === 'SALARY_LOAN' &&
                    !['Cancelled', 'Refunded'].includes(payment.status),
            )
            .reduce((sum, payment) => sum + Number(payment.amount), 0)
        const receiptNumber =
            order.receiptNumber ??
            (await this.nextReceiptNumber(
                order.companyId ?? session.companyId,
            ))
        const changeAmount = round2(
            Math.max(
                0,
                Number(order.paymentReceived ?? 0) -
                    Number(order.totalAmount ?? 0),
            ),
        )

        const completed = await this.prisma.sdSalesOrder.update({
            where: { id: order.id },
            data: {
                status: 'COMPLETED',
                paymentMethod:
                    payments.length > 1
                        ? 'SPLIT'
                        : payments[0].paymentMethod,
                paymentStatus: payments.every(
                    (payment) => payment.status === 'Paid',
                )
                    ? 'Paid'
                    : 'Pending Verification',
                paymentReference: payments[0].referenceNumber ?? null,
                paymentProvider: payments[0].paymentProvider ?? null,
                changeAmount: order.changeAmount ?? changeAmount,
                posSessionId: session.id,
                cashierUserId: actor ?? order.cashierUserId,
                receiptNumber,
            },
            include: {
                lines: { include: { material: MATERIAL_BARCODE_INCLUDE } },
                payments: true,
            },
        })

        // The salary deduction was booked when the tender was captured.
        if (salaryLoanTotal > 0 && order.customerId) {
            await this.consumeEmployeeCredit(
                order.customerId,
                salaryLoanTotal,
            )
        }

        await this.sdEvents.emit(SD_EVENTS.POS_SALE_COMPLETED, {
            salesOrderId: completed.id,
            orderNumber: completed.orderNumber,
            receiptNumber,
            companyId: order.companyId ?? session.companyId,
            branchId: order.branchId,
            posSessionId: session.id,
            cashierUserId: actor ?? order.cashierUserId,
            customerId: order.customerId,
            currency: order.currency ?? 'PHP',
            totalAmount: (order.totalAmount ?? 0).toString(),
            resumed: true,
            idempotencyKey: order.idempotencyKey ?? `pos:${order.id}`,
        })

        return this.receipt(completed as never, completed.payments)
    }

    /** Cart lines → material, MM tax classification and the line tax split. */
    private async resolveLines(
        divisionId: string,
        lines: ReadonlyArray<{
            sku: string
            variantId?: string
            variantName?: string
            description?: string
            quantity: number
            unitPrice: number
        }>,
        companyId: string,
    ): Promise<ResolvedLine[]> {
        const resolved: ResolvedLine[] = []

        for (const line of lines) {
            const product = await this.materials.findProductByDivisionSku(
                divisionId,
                line.sku,
            )
            if (!product) {
                throw new BadRequestException(
                    `Product ${line.sku} is not an active ${divisionId} product.`,
                )
            }

            let materialId: string | null = null
            if (line.variantId) {
                const variant = await this.prisma.sdProductVariant.findUnique({
                    where: { id: line.variantId },
                    select: { materialId: true },
                })
                materialId = variant?.materialId ?? null
            }
            if (!materialId) {
                const assignment =
                    await this.materials.resolveMaterialForProduct({
                        productId: product.id,
                        companyId,
                        channel: 'POS',
                        divisionId,
                    })
                materialId = assignment.materialId
            }

            const lineTotal = round2(line.unitPrice * line.quantity)
            resolved.push({
                sku: line.sku,
                variantId: line.variantId,
                variantName: line.variantName,
                description: line.description,
                quantity: line.quantity,
                unitPrice: round2(line.unitPrice),
                lineTotal,
                materialId,
                taxClassification: null,
                taxCode: null,
                taxRate: 0,
                taxTreatment: null,
                taxIncluded: 0,
                taxAdded: 0,
                taxWarning: null,
            })
        }

        const materialIds = [
            ...new Set(
                resolved
                    .map((line) => line.materialId)
                    .filter((id): id is string => Boolean(id)),
            ),
        ]
        if (!materialIds.length) return resolved

        const materials = await this.prisma.mmMaterial.findMany({
            where: { id: { in: materialIds } },
            include: { taxCode: { include: { taxRates: true } } },
        })
        const projections = new Map(
            materials.map((material) => [
                material.id,
                buildMaterialTaxProjection({
                    taxClassification: material.taxClassification,
                    taxCodeId: material.taxCodeId,
                    priceTaxTreatment: material.priceTaxTreatment,
                    taxStatus: material.taxStatus,
                    taxEffectiveFrom: material.taxEffectiveFrom,
                    taxEffectiveTo: material.taxEffectiveTo,
                    taxDescription: material.taxDescription,
                    taxCode: material.taxCode,
                }),
            ]),
        )

        for (const line of resolved) {
            if (!line.materialId) continue
            const projection = projections.get(line.materialId)
            if (!projection?.configured) {
                line.taxWarning = `Tax classification is not configured for ${line.sku}.`
                continue
            }
            if (!projection.readyForSale) {
                line.taxWarning = `Tax configuration for ${line.sku} is ${projection.effectiveStatus}.`
            }
            const rate = projection.taxRate ?? 0
            line.taxClassification = projection.classification
            line.taxCode = projection.taxCode
            line.taxRate = rate
            line.taxTreatment = projection.priceTaxTreatment
            if (!rate) continue
            if (projection.priceTaxTreatment === 'VAT_EXCLUSIVE') {
                line.taxAdded = round2((line.lineTotal * rate) / 100)
            } else {
                line.taxIncluded = round2(
                    line.lineTotal - line.lineTotal / (1 + rate / 100),
                )
            }
        }

        return resolved
    }

    /**
     * Freezes each line's VAT on the sales order so receipts, reprints and the
     * sales order keep the tax that applied at sale time. Order lines are
     * created in cart order (lineNumber = index + 1).
     */
    private async saveLineTaxSnapshot(orderId: string, lines: ResolvedLine[]) {
        await this.prisma.$transaction(
            lines.map((line, index) =>
                this.prisma.sdSalesOrderLine.updateMany({
                    where: { salesOrderId: orderId, lineNumber: index + 1 },
                    data: {
                        taxClassification: line.taxClassification,
                        taxCode: line.taxCode,
                        taxRate: line.taxClassification ? line.taxRate : null,
                        taxTreatment: line.taxTreatment,
                        taxAmount: round2(line.taxIncluded + line.taxAdded),
                        taxableAmount: line.taxClassification
                            ? round2(line.lineTotal - line.taxIncluded)
                            : null,
                    },
                }),
            ),
        )
    }

    /** One tender row per payment method (a sale may be split). */
    private async recordTenders(args: {
        orderId: string
        companyId: string
        customerId: string
        sessionId: string
        cashierUserId: string | null
        tenders: PosTender[]
        idempotencyKey: string
    }) {
        for (const [index, tender] of args.tenders.entries()) {
            const key = `${args.idempotencyKey}:${index}`
            await this.prisma.sdSalesOrderPayment.upsert({
                where: { idempotencyKey: key },
                create: {
                    companyId: args.companyId,
                    salesOrderId: args.orderId,
                    customerId: args.customerId,
                    paymentMethod: tender.method,
                    paymentProvider: tender.provider,
                    amount: new Decimal(tender.amount),
                    tenderAmount: new Decimal(tender.tenderAmount),
                    changeAmount: new Decimal(tender.changeAmount),
                    currency: 'PHP',
                    status: tender.status,
                    verificationStatus: tender.verificationStatus,
                    referenceNumber: tender.referenceNumber,
                    posSessionId: args.sessionId,
                    idempotencyKey: key,
                    bankName: tender.bankName,
                    transactionDate: tender.transactionDate,
                    employeeNumber: tender.employeeNumber,
                    payrollReference: tender.payrollReference,
                    collectedBy: args.cashierUserId,
                    isDemo: false,
                    paidAt: tender.paidAt,
                    createdBy: args.cashierUserId,
                },
                update: {},
            })
        }
    }

    /**
     * Post the sale through the MM goods issue engine. The stock comes out of
     * the bins that actually hold it, and the reservation taken at confirmation
     * is consumed.
     */
    private async postGoodsIssue(
        order: {
            id: string
            orderNumber: string
            companyId: string | null
            createdBy?: string | null
        },
        session: { companyId: string },
    ) {
        const existingIssue = await this.prisma.mmGoodsIssue.findFirst({
            where: {
                sourceDocumentType: 'SALES_ORDER',
                sourceDocumentId: order.id,
                status: { in: ['POSTED', 'DRAFT'] },
            },
            orderBy: { createdAt: 'desc' },
        })
        if (existingIssue?.status === 'POSTED') return existingIssue
        if (existingIssue) {
            // An unposted draft can point at bins that no longer hold the
            // quantity (a checkout that stopped mid-way). A draft has no
            // ledger effect, so drop it and rebuild a valid allocation.
            await this.prisma.$transaction([
                this.prisma.mmGoodsIssueLine.deleteMany({
                    where: { issueId: existingIssue.id },
                }),
                this.prisma.mmGoodsIssue.delete({
                    where: { id: existingIssue.id },
                }),
            ])
        }

        const lines = await this.prisma.sdSalesOrderLine.findMany({
            where: { salesOrderId: order.id },
            orderBy: { lineNumber: 'asc' },
        })
        const header = await this.prisma.mmInventoryReservationHeader.findFirst({
            where: {
                demandReferenceType: 'SALES_ORDER',
                demandReferenceId: order.id,
            },
            orderBy: { createdAt: 'desc' },
        })
        if (!header) {
            throw new BadRequestException(
                'No stock reservation was found for this sale; the stock was not deducted.',
            )
        }

        const companyId = order.companyId ?? session.companyId
        const giLines: Array<{
            materialId: string
            quantity: number
            uomId: string
            storageBinId: string
        }> = []

        for (const line of lines) {
            if (!line.materialId) {
                throw new BadRequestException(
                    `Line ${line.lineNumber} has no material; stock cannot be deducted.`,
                )
            }
            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: line.materialId },
                select: { baseUomId: true },
            })
            // The quantity may sit across several bins: take it bin by bin
            // until the line is covered, instead of failing on a bin that
            // holds only part of it.
            const balances = await this.prisma.mmInventoryBalance.findMany({
                where: {
                    companyId,
                    warehouseId: header.warehouseId,
                    materialId: line.materialId,
                    stockStatus: 'UNRESTRICTED',
                    batchId: null,
                    serialNumberId: null,
                    quantity: { gt: 0 },
                },
                orderBy: { updatedAt: 'asc' },
                select: { storageBinId: true, quantity: true },
            })
            let remaining = Number(line.quantity)
            for (const balance of balances) {
                if (!balance.storageBinId || remaining <= 0) continue
                const take = Math.min(remaining, Number(balance.quantity))
                if (take <= 0) continue
                giLines.push({
                    materialId: line.materialId,
                    quantity: take,
                    uomId: material?.baseUomId ?? '',
                    storageBinId: balance.storageBinId,
                })
                remaining = round2(remaining - take)
            }
            if (remaining > 0) {
                throw new BadRequestException(
                    `No stock bin holds ${line.sku}; the stock was not deducted.`,
                )
            }
        }

        const now = new Date().toISOString()
        const gi = await this.goodsIssue.create({
            companyId,
            warehouseId: header.warehouseId,
            postingDate: now,
            documentDate: now,
            issuePurpose: 'SALES',
            sourceDocumentType: 'SALES_ORDER',
            sourceDocumentId: order.id,
            reservationHeaderId: header.id,
            createdBy: header.createdBy ?? undefined,
            remarks: `POS sale ${order.orderNumber}`,
            lines: giLines,
        })

        // The cashier verified the sale at the register; the source reference
        // must match the sales order number.
        await this.goodsIssue.verifySupervisor(gi.id, {
            verifiedBy: order.createdBy ?? 'POS_CASHIER',            sourceDocumentReference: order.orderNumber,
            verificationNotes: 'POS counter sale verified at checkout',
        })

        return this.goodsIssue.post(gi.id)
    }

    /** A salary deduction needs a credit account with enough headroom. */
    private async assertEmployeeCredit(customerId: string, amount: number) {
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: {
                id: true,
                customerAccountType: true,
                creditLimit: true,
                availableCredit: true,
            },
        })
        if (!customer) {
            throw new BadRequestException(
                'The customer of a salary deduction must exist in the Customer Master.',
            )
        }
        if (customer.customerAccountType !== 'CREDIT') {
            throw new BadRequestException(
                'A salary deduction requires a CREDIT customer account with a credit limit.',
            )
        }
        const available = Number(customer.availableCredit ?? 0)
        if (available < amount) {
            throw new BadRequestException(
                `Employee credit limit exceeded: ${available.toFixed(2)} available, ${amount.toFixed(2)} required.`,
            )
        }
    }

    /** Book the receivable against the customer's credit limit. */
    private async consumeEmployeeCredit(customerId: string, amount: number) {
        const claimed = await this.prisma.sdCustomer.updateMany({
            where: {
                id: customerId,
                availableCredit: { gte: new Decimal(amount) },
            },
            data: { availableCredit: { decrement: new Decimal(amount) } },
        })
        if (claimed.count === 0) {
            this.logger.warn(
                `Employee credit could not be consumed for customer ${customerId}`,
            )
        }
    }

    private async nextReceiptNumber(companyId: string) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const count = await this.prisma.sdSalesOrder.count({
                where: { companyId, channel: 'POS' },
            })
            const candidate = `RCP-${String(count + 1 + attempt).padStart(6, '0')}`
            const taken = await this.prisma.sdSalesOrder.findFirst({
                where: { companyId, receiptNumber: candidate },
                select: { id: true },
            })
            if (!taken) return candidate
        }
        throw new ConflictException(
            'Could not allocate a receipt number; retry the checkout.',
        )
    }

    private receipt(
        order: {
            id: string
            orderNumber: string
            receiptNumber: string | null
            status: string
            branchId: string | null
            posSessionId: string | null
            cashierUserId: string | null
            customerName: string | null
            voidedAt?: Date | null
            voidedBy?: string | null
            voidReason?: string | null
            subtotal: Prisma.Decimal | null
            discountAmount: Prisma.Decimal | null
            taxAmount: Prisma.Decimal | null
            totalAmount: Prisma.Decimal | null
            paymentReceived: Prisma.Decimal | null
            changeAmount: Prisma.Decimal | null
            updatedAt: Date
            lines: Array<{
                sku: string | null
                description: string | null
                variantName: string | null
                productImageSnapshot?: string | null
                variantBarcode?: string | null
                material?: {
                    barcodes?: Array<{
                        barcodeValue: string
                        isPrimary: boolean
                    }>
                } | null
                quantity: Prisma.Decimal
                unitPrice: Prisma.Decimal | null
                lineTotal: Prisma.Decimal | null
                taxClassification?: string | null
                taxCode?: string | null
                taxRate?: Prisma.Decimal | null
                taxTreatment?: string | null
                taxAmount?: Prisma.Decimal | null
                taxableAmount?: Prisma.Decimal | null
            }>
        },
        payments: Array<{
            paymentMethod: string
            amount: Prisma.Decimal
            tenderAmount: Prisma.Decimal
            changeAmount: Prisma.Decimal
            referenceNumber: string | null
            status: string
            verificationStatus: string
        }>,
        warnings: string[] = [],
    ): PosReceipt {
        const lines = order.lines.map((line) => {
            const lineTotal = Number(line.lineTotal ?? 0)
            const tax = Number(line.taxAmount ?? 0)
            const inclusive = line.taxTreatment !== 'VAT_EXCLUSIVE'
            return {
                line,
                lineTotal,
                classification: line.taxClassification ?? null,
                taxIncluded: inclusive ? tax : 0,
                taxAdded: inclusive ? 0 : tax,
                taxable: Number(line.taxableAmount ?? lineTotal - (inclusive ? tax : 0)),
            }
        })
        const sumWhere = (classification: string, pick: (l: (typeof lines)[number]) => number) =>
            round2(lines.filter((l) => l.classification === classification).reduce((s, l) => s + pick(l), 0))
        return {
            receiptNumber: order.receiptNumber ?? order.orderNumber,
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            completedAt: order.updatedAt.toISOString(),
            branchId: order.branchId ?? '',
            posSessionId: order.posSessionId,
            cashierUserId: order.cashierUserId,
            customerName: order.customerName,
            voidedAt: order.voidedAt?.toISOString() ?? null,
            voidedBy: order.voidedBy ?? null,
            voidReason: order.voidReason ?? null,
            lines: lines.map(({ line, lineTotal, classification, taxIncluded, taxAdded }) => {
                return {
                    sku: line.sku ?? '',
                    description: line.description,
                    variantName: line.variantName,
                    barcode:
                        line.variantBarcode ??
                        line.material?.barcodes?.find(
                            (code) => code.isPrimary,
                        )?.barcodeValue ??
                        line.material?.barcodes?.[0]?.barcodeValue ??
                        null,
                    imageUrl: line.productImageSnapshot?.trim() || null,
                    quantity: Number(line.quantity),
                    unitPrice: Number(line.unitPrice ?? 0),
                    lineTotal,
                    taxClassification: classification,
                    taxCode: line.taxCode ?? null,
                    taxRate: Number(line.taxRate ?? 0),
                    taxIncluded,
                    taxAdded,
                }
            }),
            subtotal: Number(order.subtotal ?? 0),
            discountAmount: Number(order.discountAmount ?? 0),
            taxAmount: Number(order.taxAmount ?? 0),
            taxIncludedAmount: round2(lines.reduce((s, l) => s + l.taxIncluded, 0)),
            vatableSales: sumWhere('VATABLE', (l) => l.taxable),
            vatAmount: round2(lines.reduce((s, l) => s + l.taxIncluded + l.taxAdded, 0)),
            vatExemptSales: sumWhere('VAT_EXEMPT', (l) => l.lineTotal),
            zeroRatedSales: sumWhere('ZERO_RATED', (l) => l.lineTotal),
            total: Number(order.totalAmount ?? 0),
            tendered: Number(order.paymentReceived ?? 0),
            change: Number(order.changeAmount ?? 0),
            tenders: payments.map((payment) => ({
                method: payment.paymentMethod,
                amount: Number(payment.amount),
                tenderAmount: Number(payment.tenderAmount),
                changeAmount: Number(payment.changeAmount),
                referenceNumber: payment.referenceNumber,
                status: payment.status,
                verificationStatus: payment.verificationStatus,
            })),
            warnings,
        }
    }
}
