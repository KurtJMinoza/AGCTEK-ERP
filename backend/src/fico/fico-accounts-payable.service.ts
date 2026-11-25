import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { AuthRequestUser } from '../auth/auth.decorator'
import type { MmAccountingDispatchPayload } from '../mm/common/mm-accounting-event.types'
import { PrismaService } from '../prisma/prisma.service'
import {
    CreateFicoApAdjustmentDto,
    CreateFicoApClearingDto,
    CreateFicoApHistoricalBalanceDto,
    CreateFicoApHistoricalMigrationRunDto,
    CreateFicoApPaymentDto,
    FicoApClearingQueryDto,
    FicoApDocumentQueryDto,
    FicoApOpenItemQueryDto,
    FicoApPaymentQueryDto,
    FicoApStatementQueryDto,
    ReverseFicoApDocumentDto,
    SetFicoApPaymentBlockDto,
    UpsertSupplierBankApprovalDto,
    UpsertSupplierCompanyAccountDto,
} from './dto/fico-accounts-payable.dto'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoJournalService } from './fico-journal.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'
import { FicoTaxCalculationService } from './fico-tax-calculation.service'

type Actor = AuthRequestUser | undefined

type ApPostingResult = {
    created: boolean
    duplicate: boolean
    journalEntryId?: string
}

const MONEY_TOLERANCE = new Decimal('0.01')

function day(value: Date | string) {
    const date = typeof value === 'string' ? new Date(value) : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('A valid posting date is required.')
    }
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
}

function money(value: Decimal | Prisma.Decimal | number | string | null | undefined) {
    return new Decimal(value?.toString?.() ?? value ?? 0)
}

function cleanOptional(value: string | null | undefined) {
    if (value === undefined) return undefined
    const text = value?.trim()
    return text ? text : null
}

function isNoRuleError(error: unknown) {
    return (
        error instanceof BadRequestException &&
        error.message.includes('No approved, active and effective')
    )
}

@Injectable()
export class FicoAccountsPayableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly accountResolution: FicoAccountResolutionService,
        private readonly postingValidation: FicoPostingValidationService,
        private readonly journal: FicoJournalService,
        private readonly taxCalculation: FicoTaxCalculationService,
    ) {}

    supportsAccountingPayload(payload: MmAccountingDispatchPayload) {
        return payload.eventType === 'SupplierInvoiceMatched'
    }

    /**
     * System-facing bridge used by the FICO accounting-event processor. It only
     * reads the approved MM invoice; all financial records are FICO-owned and
     * are persisted inside `FicoJournalService.postAutomaticJournal`.
     */
    async postMatchedSupplierInvoice(
        payload: MmAccountingDispatchPayload,
    ): Promise<ApPostingResult> {
        if (!this.supportsAccountingPayload(payload)) {
            throw new BadRequestException(
                `Unsupported AP accounting event ${payload.eventType}.`,
            )
        }

        const invoice = await this.prisma.mmSupplierInvoice.findUnique({
            where: { id: payload.documentId },
            include: {
                supplier: { include: { paymentTerms: true } },
                currency: true,
                taxCode: true,
                withholdingTaxCode: true,
                exceptions: true,
                lines: {
                    include: {
                        receipts: {
                            include: {
                                goodsReceiptLine: {
                                    select: {
                                        id: true,
                                        unitCost: true,
                                        quantity: true,
                                        totalCost: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { lineNumber: 'asc' },
                },
            },
        })
        if (!invoice) {
            throw new NotFoundException('Supplier invoice source document not found.')
        }
        if (invoice.companyId !== payload.companyId) {
            throw new BadRequestException(
                'Supplier invoice company does not match the accounting event.',
            )
        }
        if (!invoice.approvedAt || !invoice.approvedBy) {
            throw new BadRequestException(
                'Supplier invoice must be approved before Accounts Payable posting.',
            )
        }
        if (!invoice.paymentEligible) {
            throw new BadRequestException(
                'Supplier invoice is not payment-eligible and cannot be posted to Accounts Payable.',
            )
        }
        if (!['MATCHED', 'PARTIALLY_MATCHED'].includes(invoice.status)) {
            throw new BadRequestException(
                `Supplier invoice status ${invoice.status} cannot be posted to Accounts Payable.`,
            )
        }

        const existing = await this.prisma.ficoApDocument.findUnique({
            where: { sourceSupplierInvoiceId: invoice.id },
            select: { id: true, status: true, journalEntryId: true },
        })
        if (existing) {
            if (existing.status === 'REVERSED') {
                throw new BadRequestException(
                    'The AP document for this supplier invoice was reversed; create a new supplier invoice to repost.',
                )
            }
            return {
                created: false,
                duplicate: true,
                journalEntryId: existing.journalEntryId,
            }
        }

        const postingDate = day(invoice.postingDate ?? invoice.invoiceDate)
        const documentDate = day(invoice.invoiceDate)
        const baselineDate = day(invoice.baselineDate ?? invoice.invoiceDate)
        const companyAccount = await this.prisma.ficoSupplierCompanyAccount.findUnique({
            where: {
                supplierId_companyId: {
                    supplierId: invoice.supplierId,
                    companyId: invoice.companyId,
                },
            },
            include: { paymentTerms: true },
        })
        if (companyAccount?.status !== undefined && companyAccount.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Supplier accounting master is inactive for this company.',
            )
        }
        if (companyAccount?.postingBlocked) {
            throw new BadRequestException(
                'Supplier accounting master has a posting block for this company.',
            )
        }

        const currencyCode = await this.resolveInvoiceCurrency({
            invoice,
            payload,
        })
        this.assertSupplierTransactionCurrency(companyAccount, currencyCode)
        const supplierAccountGroup =
            companyAccount?.supplierAccountGroup?.trim() || 'STANDARD'
        const reconciliation = await this.resolveReconciliationAccount({
            companyId: invoice.companyId,
            currencyCode,
            postingDate,
            supplierAccountGroup,
            configuredAccountId: companyAccount?.reconciliationAccountId ?? null,
        })
        const grir = await this.resolveSingleRuleLine({
            companyId: invoice.companyId,
            postingDate,
            currencyCode,
            transactionKeyCode: 'SUPPLIER_INVOICE',
            transactionType: 'SUPPLIER_INVOICE',
            side: 'DEBIT',
            supplierAccountGroup,
            purpose: 'supplier invoice GR/IR clearing',
        })

        const grossAmount = money(invoice.totalAmount)
        if (!grossAmount.gt(0)) {
            throw new BadRequestException(
                'Supplier invoice total must be greater than zero before AP posting.',
            )
        }

        const taxCodeId = invoice.taxCodeId ?? companyAccount?.defaultPurchaseTaxCodeId ?? null
        const tax = await this.resolvePurchaseTax({
            taxCodeId,
            companyId: invoice.companyId,
            postingDate,
            currencyCode,
            grossAmount,
            sourceTaxAmount: money(invoice.taxAmount),
        })
        const withholdingTaxCodeId =
            invoice.withholdingTaxCodeId ?? companyAccount?.withholdingTaxCodeId ?? null
        const withholding = await this.resolveWithholdingTax({
            taxCodeId: withholdingTaxCodeId,
            companyId: invoice.companyId,
            postingDate,
            currencyCode,
            taxableAmount: grossAmount,
        })

        const netAmount = tax.netAmount
        const taxAmount = tax.taxAmount
        const withholdingAmount = withholding.taxAmount
        const liabilityAmount = grossAmount.minus(withholdingAmount)
        if (!liabilityAmount.gt(0)) {
            throw new BadRequestException(
                'Withholding tax cannot fully consume a supplier invoice liability.',
            )
        }

        const grirAllocations = this.buildGrIrAllocations(invoice.lines)
        const grirClearingAmount = grirAllocations.length
            ? grirAllocations
                  .reduce((sum, item) => sum.plus(item.allocatedAmount), new Decimal(0))
                  .toDecimalPlaces(4)
            : netAmount
        const varianceAmount = netAmount.minus(grirClearingAmount).toDecimalPlaces(4)

        const lines: Array<{
            glAccountId: string
            debit: Decimal
            credit: Decimal
            description: string
        }> = []
        if (grirClearingAmount.gt(0)) {
            lines.push({
                glAccountId: grir.glAccountId,
                debit: grirClearingAmount,
                credit: new Decimal(0),
                description: 'GR/IR clearing from approved supplier invoice',
            })
        }
        if (varianceAmount.abs().gt(new Decimal('0.0001'))) {
            const ppv = await this.resolveSingleRuleLine({
                companyId: invoice.companyId,
                postingDate,
                currencyCode,
                transactionKeyCode: 'PURCHASE_VARIANCE',
                transactionType: 'PURCHASE_VARIANCE',
                side: varianceAmount.gt(0) ? 'DEBIT' : 'CREDIT',
                supplierAccountGroup,
                purpose: 'supplier invoice price variance',
            })
            lines.push({
                glAccountId: ppv.glAccountId,
                debit: varianceAmount.gt(0) ? varianceAmount : new Decimal(0),
                credit: varianceAmount.gt(0) ? new Decimal(0) : varianceAmount.abs(),
                description: 'Purchase price variance vs goods receipt cost',
            })
        }
        if (taxAmount.gt(0)) {
            if (!tax.glAccountId) {
                throw new BadRequestException(
                    'The configured purchase tax code has no posting G/L account.',
                )
            }
            lines.push({
                glAccountId: tax.glAccountId,
                debit: taxAmount,
                credit: new Decimal(0),
                description: tax.isRecoverable
                    ? 'Recoverable input tax'
                    : 'Non-recoverable purchase tax',
            })
        }
        lines.push({
            glAccountId: reconciliation.glAccountId,
            debit: new Decimal(0),
            credit: liabilityAmount,
            description: 'Supplier reconciliation liability',
        })
        if (withholdingAmount.gt(0)) {
            if (!withholding.glAccountId) {
                throw new BadRequestException(
                    'The configured withholding tax code has no payable G/L account.',
                )
            }
            lines.push({
                glAccountId: withholding.glAccountId,
                debit: new Decimal(0),
                credit: withholdingAmount,
                description: 'Withholding tax payable',
            })
        }

        const dueDate = invoice.dueDate
            ? day(invoice.dueDate)
            : this.addDays(
                  baselineDate,
                  companyAccount?.paymentTerms?.dueDays ??
                      invoice.supplier.paymentTerms?.dueDays ??
                      0,
              )
        const paymentBlocked =
            invoice.paymentBlocked ||
            companyAccount?.paymentBlocked === true ||
            invoice.exceptions.some((exception) => exception.paymentBlocked)

        const result = await this.journal.postAutomaticJournal({
            companyId: invoice.companyId,
            documentType: 'SUPPLIER_INVOICE',
            documentDate,
            postingDate,
            currencyCode,
            sourceModule: 'AP',
            sourceDocumentType: 'MM_SUPPLIER_INVOICE',
            sourceDocumentId: invoice.id,
            sourceEventId: payload.sourceEventId ?? null,
            sourceTransactionId:
                typeof payload.sourceTransactionId === 'string'
                    ? payload.sourceTransactionId
                    : null,
            mmAccountingEventId: payload.mmAccountingEventId ?? null,
            supplierId: invoice.supplierId,
            idempotencyKey:
                payload.idempotencyKey ??
                `SupplierInvoiceMatched:SUPPLIER_INVOICE:${invoice.id}`,
            sourcePostingKey:
                payload.idempotencyKey ??
                `SupplierInvoiceMatched:SUPPLIER_INVOICE:${invoice.id}`,
            description: `Supplier invoice ${invoice.invoiceNumber}`,
            reference: invoice.invoiceNumber,
            lines,
            metadata: {
                apDocumentType: 'INVOICE',
                supplierInvoiceId: invoice.id,
                supplierInvoiceNumber: invoice.invoiceNumber,
                purchaseOrderId: invoice.purchaseOrderId,
                reconciliationAccountId: reconciliation.glAccountId,
                reconciliationAccountCode: reconciliation.accountCode,
                taxCodeId: tax.taxCodeId,
                withholdingTaxCodeId: withholding.taxCodeId,
                sourceAccountingEventId: payload.mmAccountingEventId ?? null,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            subledgerPosting: 'AP',
            afterPersist: async (tx, journal) => {
                const document = await tx.ficoApDocument.create({
                    data: {
                        companyId: invoice.companyId,
                        supplierId: invoice.supplierId,
                        supplierCompanyAccountId: companyAccount?.id ?? null,
                        sourceSupplierInvoiceId: invoice.id,
                        journalEntryId: journal.id,
                        documentType: 'INVOICE',
                        status: 'POSTED',
                        referenceNumber: invoice.invoiceNumber,
                        documentDate,
                        postingDate,
                        baselineDate,
                        dueDate,
                        currencyCode,
                        netAmount,
                        taxAmount,
                        withholdingAmount,
                        grossAmount,
                        liabilityAmount,
                        reconciliationAccountId: reconciliation.glAccountId,
                        reconciliationAccountCode: reconciliation.accountCode,
                        taxCodeId: tax.taxCodeId,
                        withholdingTaxCodeId: withholding.taxCodeId,
                        paymentBlocked,
                        createdBy: invoice.approvedBy ?? null,
                    },
                })
                await tx.ficoApOpenItem.create({
                    data: {
                        companyId: invoice.companyId,
                        supplierId: invoice.supplierId,
                        documentId: document.id,
                        reconciliationAccountId: reconciliation.glAccountId,
                        itemType: 'INVOICE',
                        direction: 'CREDIT',
                        originalAmount: liabilityAmount,
                        openAmount: liabilityAmount,
                        currencyCode,
                        baselineDate,
                        dueDate,
                        paymentBlocked,
                        status: 'OPEN',
                    },
                })
                if (grirAllocations.length) {
                    await tx.ficoApGrIrAllocation.createMany({
                        data: grirAllocations.map((allocation) => ({
                            documentId: document.id,
                            invoiceLineId: allocation.invoiceLineId,
                            goodsReceiptLineId: allocation.goodsReceiptLineId,
                            allocatedQuantity: allocation.allocatedQuantity,
                            allocatedAmount: allocation.allocatedAmount,
                        })),
                    })
                }
                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: invoice.companyId,
                        actorId: invoice.approvedBy ?? null,
                        action: 'AP_INVOICE_POST',
                        entityType: 'FicoApDocument',
                        entityId: document.id,
                        newValues: {
                            invoiceId: invoice.id,
                            invoiceNumber: invoice.invoiceNumber,
                            journalEntryId: journal.id,
                            liabilityAmount: liabilityAmount.toString(),
                            dueDate: dueDate.toISOString().slice(0, 10),
                        },
                        metadata: {
                            sourceAccountingEventId: payload.mmAccountingEventId ?? null,
                            grirAllocationCount: grirAllocations.length,
                        },
                    },
                })
            },
        })
        return {
            created: result.created,
            duplicate: result.duplicate,
            journalEntryId: result.journalEntryId,
        }
    }

    async upsertSupplierCompanyAccount(
        supplierId: string,
        dto: UpsertSupplierCompanyAccountDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const supplier = await this.prisma.mmSupplier.findFirst({
            where: { id: supplierId, deletedAt: null },
            select: { id: true },
        })
        if (!supplier) throw new NotFoundException('Supplier not found.')

        const reconciliationAccountId = cleanOptional(dto.reconciliationAccountId)
        if (reconciliationAccountId) {
            await this.assertSupplierReconciliationAccount({
                companyId: dto.companyId,
                glAccountId: reconciliationAccountId,
                postingDate: new Date(),
                currencyCode: dto.transactionCurrencyCode ?? undefined,
            })
        }
        await this.assertPaymentTerms(dto.paymentTermsId)
        await this.assertTaxCodeForCompany(
            dto.defaultPurchaseTaxCodeId,
            dto.companyId,
            'purchase',
        )
        await this.assertTaxCodeForCompany(
            dto.withholdingTaxCodeId,
            dto.companyId,
            'withholding',
        )
        const alternativePayeeSupplierId = cleanOptional(dto.alternativePayeeSupplierId)
        if (alternativePayeeSupplierId) {
            const alternative = await this.prisma.mmSupplier.findFirst({
                where: { id: alternativePayeeSupplierId, deletedAt: null },
                select: { id: true },
            })
            if (!alternative) throw new BadRequestException('Alternative payee supplier not found.')
        }
        if (dto.alternativePayeeAuthorized && !alternativePayeeSupplierId) {
            throw new BadRequestException(
                'An alternative payee cannot be authorized without a supplier.',
            )
        }

        const existing = await this.prisma.ficoSupplierCompanyAccount.findUnique({
            where: { supplierId_companyId: { supplierId, companyId: dto.companyId } },
            select: { id: true },
        })
        const now = new Date()
        const data = {
            supplierAccountGroup:
                dto.supplierAccountGroup?.trim().toUpperCase() || undefined,
            reconciliationAccountId,
            paymentTermsId: cleanOptional(dto.paymentTermsId),
            defaultPaymentMethodCode: cleanOptional(dto.defaultPaymentMethodCode),
            transactionCurrencyCode:
                dto.transactionCurrencyCode === undefined
                    ? undefined
                    : cleanOptional(dto.transactionCurrencyCode)?.toUpperCase() ?? null,
            defaultPurchaseTaxCodeId: cleanOptional(dto.defaultPurchaseTaxCodeId),
            withholdingTaxCodeId: cleanOptional(dto.withholdingTaxCodeId),
            taxIdentificationNumber: cleanOptional(dto.taxIdentificationNumber),
            taxClassification: cleanOptional(dto.taxClassification),
            invoiceToleranceAmount:
                dto.invoiceToleranceAmount === undefined
                    ? undefined
                    : dto.invoiceToleranceAmount === null
                      ? null
                      : new Decimal(dto.invoiceToleranceAmount),
            invoiceTolerancePercent:
                dto.invoiceTolerancePercent === undefined
                    ? undefined
                    : dto.invoiceTolerancePercent === null
                      ? null
                      : new Decimal(dto.invoiceTolerancePercent),
            postingBlocked: dto.postingBlocked,
            paymentBlocked: dto.paymentBlocked,
            alternativePayeeSupplierId,
            alternativePayeeAuthorized: dto.alternativePayeeAuthorized,
            alternativePayeeAuthorizedBy:
                dto.alternativePayeeAuthorized === true ? user?.id ?? null : undefined,
            alternativePayeeAuthorizedAt:
                dto.alternativePayeeAuthorized === true ? now : undefined,
            status: dto.status,
            updatedBy: user?.id ?? null,
        }

        const account = await this.prisma.$transaction(async (tx) => {
            const row = await tx.ficoSupplierCompanyAccount.upsert({
                where: { supplierId_companyId: { supplierId, companyId: dto.companyId } },
                create: {
                    supplierId,
                    companyId: dto.companyId,
                    supplierAccountGroup:
                        data.supplierAccountGroup ?? 'STANDARD',
                    reconciliationAccountId: data.reconciliationAccountId ?? null,
                    paymentTermsId: data.paymentTermsId ?? null,
                    defaultPaymentMethodCode: data.defaultPaymentMethodCode ?? null,
                    transactionCurrencyCode: data.transactionCurrencyCode ?? null,
                    defaultPurchaseTaxCodeId: data.defaultPurchaseTaxCodeId ?? null,
                    withholdingTaxCodeId: data.withholdingTaxCodeId ?? null,
                    taxIdentificationNumber: data.taxIdentificationNumber ?? null,
                    taxClassification: data.taxClassification ?? null,
                    invoiceToleranceAmount: data.invoiceToleranceAmount ?? null,
                    invoiceTolerancePercent: data.invoiceTolerancePercent ?? null,
                    postingBlocked: data.postingBlocked ?? false,
                    paymentBlocked: data.paymentBlocked ?? false,
                    alternativePayeeSupplierId: data.alternativePayeeSupplierId ?? null,
                    alternativePayeeAuthorized: data.alternativePayeeAuthorized ?? false,
                    alternativePayeeAuthorizedBy:
                        data.alternativePayeeAuthorizedBy ?? null,
                    alternativePayeeAuthorizedAt:
                        data.alternativePayeeAuthorizedAt ?? null,
                    status: data.status ?? 'ACTIVE',
                    createdBy: user?.id ?? null,
                    updatedBy: user?.id ?? null,
                },
                update: data,
                include: this.supplierCompanyAccountInclude(),
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: dto.companyId,
                    actorId: user?.id ?? null,
                    action: existing ? 'AP_SUPPLIER_ACCOUNT_UPDATE' : 'AP_SUPPLIER_ACCOUNT_CREATE',
                    entityType: 'FicoSupplierCompanyAccount',
                    entityId: row.id,
                    newValues: {
                        supplierId,
                        supplierAccountGroup: row.supplierAccountGroup,
                        reconciliationAccountId: row.reconciliationAccountId,
                        status: row.status,
                    },
                },
            })
            return row
        })
        return account
    }

    async getSupplierCompanyAccount(
        supplierId: string,
        companyId: string,
        user: Actor,
    ) {
        await this.access.assertAccess(user, companyId)
        return this.prisma.ficoSupplierCompanyAccount.findUnique({
            where: { supplierId_companyId: { supplierId, companyId } },
            include: this.supplierCompanyAccountInclude(),
        })
    }

    async upsertSupplierBankApproval(
        supplierId: string,
        bankAccountId: string,
        dto: UpsertSupplierBankApprovalDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const companyAccount = await this.prisma.ficoSupplierCompanyAccount.findUnique({
            where: {
                supplierId_companyId: { supplierId, companyId: dto.companyId },
            },
            select: { id: true },
        })
        if (!companyAccount) {
            throw new BadRequestException(
                'Create supplier company accounting data before approving a bank account.',
            )
        }
        const bank = await this.prisma.mmSupplierBankAccount.findFirst({
            where: { id: bankAccountId, supplierId, isActive: true },
            select: { id: true },
        })
        if (!bank) {
            throw new BadRequestException(
                'Active supplier bank account not found for this supplier.',
            )
        }

        return this.prisma.$transaction(async (tx) => {
            if (dto.isDefault) {
                await tx.ficoSupplierBankApproval.updateMany({
                    where: { supplierCompanyAccountId: companyAccount.id },
                    data: { isDefault: false },
                })
            }
            const approval = await tx.ficoSupplierBankApproval.upsert({
                where: {
                    supplierCompanyAccountId_supplierBankAccountId: {
                        supplierCompanyAccountId: companyAccount.id,
                        supplierBankAccountId: bankAccountId,
                    },
                },
                create: {
                    supplierCompanyAccountId: companyAccount.id,
                    supplierBankAccountId: bankAccountId,
                    companyId: dto.companyId,
                    status: dto.status ?? 'ACTIVE',
                    isDefault: dto.isDefault ?? false,
                    approvedBy: user?.id ?? null,
                    approvedAt: new Date(),
                    remarks: cleanOptional(dto.remarks) ?? null,
                },
                update: {
                    status: dto.status,
                    isDefault: dto.isDefault,
                    approvedBy: user?.id ?? null,
                    approvedAt: new Date(),
                    remarks: cleanOptional(dto.remarks),
                },
                include: { supplierBankAccount: true },
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: dto.companyId,
                    actorId: user?.id ?? null,
                    action: 'AP_SUPPLIER_BANK_APPROVAL_UPSERT',
                    entityType: 'FicoSupplierBankApproval',
                    entityId: approval.id,
                    newValues: {
                        supplierId,
                        supplierBankAccountId: bankAccountId,
                        status: approval.status,
                        isDefault: approval.isDefault,
                    },
                },
            })
            return approval
        })
    }

    async postPayment(dto: CreateFicoApPaymentDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        const postingDate = day(dto.paymentDate)
        const currencyCode = dto.currencyCode.trim().toUpperCase()
        const allocations = dto.allocations.map((allocation) => ({
            openItemId: allocation.openItemId,
            amount: money(allocation.amount),
        }))
        if (new Set(allocations.map((allocation) => allocation.openItemId)).size !== allocations.length) {
            throw new BadRequestException('A payment may allocate to each open item only once.')
        }
        const totalAmount = allocations.reduce(
            (total, allocation) => total.plus(allocation.amount),
            new Decimal(0),
        )
        if (!totalAmount.gt(0)) {
            throw new BadRequestException('Payment allocation total must be greater than zero.')
        }
        const idempotencyKey = this.paymentIdempotencyKey(dto, allocations)
        const existing = await this.prisma.ficoApPayment.findUnique({
            where: { idempotencyKey },
            select: { id: true, journalEntryId: true, paymentNumber: true },
        })
        if (existing) {
            return { ...existing, duplicate: true, created: false }
        }

        const companyAccount = await this.prisma.ficoSupplierCompanyAccount.findUnique({
            where: {
                supplierId_companyId: { supplierId: dto.supplierId, companyId: dto.companyId },
            },
            include: { bankApprovals: true },
        })
        // Inactive suppliers may still settle valid historical obligations.
        // Only a payment block stops payment processing.
        this.assertSupplierTransactionCurrency(companyAccount, currencyCode)
        if (companyAccount?.paymentBlocked) {
            throw new BadRequestException('Supplier accounting master has a payment block.')
        }

        let bankApprovalId = dto.supplierBankApprovalId ?? null
        if (bankApprovalId) {
            const bankApproval = companyAccount?.bankApprovals.find(
                (approval) => approval.id === bankApprovalId && approval.status === 'ACTIVE',
            )
            if (!bankApproval) {
                throw new BadRequestException(
                    'Selected supplier bank account is not approved for this company.',
                )
            }
        } else {
            bankApprovalId =
                companyAccount?.bankApprovals.find(
                    (approval) => approval.status === 'ACTIVE' && approval.isDefault,
                )?.id ?? null
        }

        const openItems = await this.prisma.ficoApOpenItem.findMany({
            where: { id: { in: allocations.map((allocation) => allocation.openItemId) } },
            include: { document: true },
        })
        this.assertPaymentOpenItems({
            openItems,
            allocations,
            companyId: dto.companyId,
            supplierId: dto.supplierId,
            currencyCode,
        })

        const paymentMethodCode =
            dto.paymentMethodCode?.trim().toUpperCase() ??
            companyAccount?.defaultPaymentMethodCode?.trim().toUpperCase() ??
            null
        const bank = await this.resolveSingleRuleLine({
            companyId: dto.companyId,
            postingDate,
            currencyCode,
            transactionKeyCode: 'BANK_ACCOUNT',
            transactionType: 'SUPPLIER_PAYMENT',
            side: 'CREDIT',
            supplierAccountGroup:
                companyAccount?.supplierAccountGroup?.trim() || 'STANDARD',
            paymentMethodCode,
            bankAccountId: dto.bankAccountId ?? null,
            purpose: 'supplier payment bank account',
        })

        const debitByReconciliationAccount = new Map<string, Decimal>()
        for (const allocation of allocations) {
            const item = openItems.find((row) => row.id === allocation.openItemId)!
            if (!item.reconciliationAccountId) {
                throw new BadRequestException(
                    'Supplier payment can only clear items with a reconciliation account snapshot.',
                )
            }
            debitByReconciliationAccount.set(
                item.reconciliationAccountId,
                (debitByReconciliationAccount.get(item.reconciliationAccountId) ?? new Decimal(0)).plus(
                    allocation.amount,
                ),
            )
        }

        let paymentId: string | null = null
        const journalResult = await this.journal.postAutomaticJournal({
            companyId: dto.companyId,
            documentType: 'AP_PAYMENT',
            documentDate: postingDate,
            postingDate,
            currencyCode,
            sourceModule: 'AP',
            sourceDocumentType: 'AP_PAYMENT',
            sourceDocumentId: idempotencyKey,
            supplierId: dto.supplierId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Supplier payment${dto.paymentReference ? ` ${dto.paymentReference}` : ''}`,
            reference: dto.paymentReference ?? null,
            lines: [
                ...[...debitByReconciliationAccount.entries()].map(
                    ([glAccountId, amount]) => ({
                        glAccountId,
                        debit: amount,
                        credit: new Decimal(0),
                        description: 'Supplier open-item clearing',
                    }),
                ),
                {
                    glAccountId: bank.glAccountId,
                    debit: new Decimal(0),
                    credit: totalAmount,
                    description: 'Bank / cash payment',
                },
            ],
            metadata: {
                apPayment: true,
                paymentMethodCode,
                bankAccountId: dto.bankAccountId ?? null,
                allocationCount: allocations.length,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: user?.id ?? null,
            subledgerPosting: 'AP',
            afterPersist: async (tx, journal) => {
                const currentItems = await this.lockAndLoadOpenItems(tx, allocations)
                this.assertPaymentOpenItems({
                    openItems: currentItems,
                    allocations,
                    companyId: dto.companyId,
                    supplierId: dto.supplierId,
                    currencyCode,
                })
                const payment = await tx.ficoApPayment.create({
                    data: {
                        companyId: dto.companyId,
                        supplierId: dto.supplierId,
                        supplierCompanyAccountId: companyAccount?.id ?? null,
                        journalEntryId: journal.id,
                        supplierBankApprovalId: bankApprovalId,
                        paymentNumber: `PAY-${journal.documentNumber ?? journal.id}`,
                        idempotencyKey,
                        paymentDate: postingDate,
                        currencyCode,
                        totalAmount,
                        paymentMethodCode,
                        bankAccountId: dto.bankAccountId ?? null,
                        paymentReference: dto.paymentReference?.trim() || null,
                        status: 'POSTED',
                        createdBy: user?.id ?? null,
                    },
                })
                paymentId = payment.id
                for (const allocation of allocations) {
                    const openItem = currentItems.find(
                        (item) => item.id === allocation.openItemId,
                    )!
                    const nextAmount = money(openItem.openAmount).minus(allocation.amount)
                    await tx.ficoApPaymentAllocation.create({
                        data: {
                            paymentId: payment.id,
                            openItemId: openItem.id,
                            amount: allocation.amount,
                            status: 'CLEARED',
                        },
                    })
                    await tx.ficoApOpenItem.update({
                        where: { id: openItem.id },
                        data: {
                            openAmount: nextAmount,
                            status: nextAmount.eq(0) ? 'CLEARED' : 'PARTIALLY_CLEARED',
                            clearedAt: nextAmount.eq(0) ? postingDate : null,
                        },
                    })
                }
                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: dto.companyId,
                        actorId: user?.id ?? null,
                        action: 'AP_PAYMENT_POST',
                        entityType: 'FicoApPayment',
                        entityId: payment.id,
                        newValues: {
                            journalEntryId: journal.id,
                            paymentNumber: payment.paymentNumber,
                            totalAmount: totalAmount.toString(),
                            allocationCount: allocations.length,
                        },
                    },
                })
            },
        })

        if (journalResult.duplicate) {
            const duplicate = await this.prisma.ficoApPayment.findUnique({
                where: { idempotencyKey },
                select: { id: true, journalEntryId: true, paymentNumber: true },
            })
            if (duplicate) return { ...duplicate, duplicate: true, created: false }
        }
        return {
            id: paymentId,
            journalEntryId: journalResult.journalEntryId,
            documentNumber: journalResult.documentNumber,
            duplicate: journalResult.duplicate,
            created: journalResult.created,
        }
    }

    /**
     * Posts a supplier credit memo, debit adjustment, or advance through the
     * central engine and immediately creates its FICO-owned open item.
     */
    async postAdjustment(dto: CreateFicoApAdjustmentDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        return this.postStandaloneApDocument({
            companyId: dto.companyId,
            supplierId: dto.supplierId,
            documentType: dto.documentType,
            documentDate: day(dto.documentDate),
            postingDate: day(dto.postingDate),
            baselineDate: day(dto.baselineDate ?? dto.documentDate),
            dueDate: dto.dueDate ? day(dto.dueDate) : null,
            currencyCode: dto.currencyCode.trim().toUpperCase(),
            amount: money(dto.amount),
            referenceNumber: cleanOptional(dto.referenceNumber) ?? null,
            reason: cleanOptional(dto.reason) ?? null,
            paymentBlocked: dto.paymentBlocked === true,
            idempotencyKey: this.adjustmentIdempotencyKey(dto),
            paymentMethodCode: cleanOptional(dto.paymentMethodCode),
            bankAccountId: cleanOptional(dto.bankAccountId),
            user,
        })
    }

    /** Creates a controlled run; it must be separately approved before AP balances can migrate. */
    async createHistoricalMigrationRun(
        dto: CreateFicoApHistoricalMigrationRunDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const fromDate = dto.fromDate ? day(dto.fromDate) : null
        const toDate = dto.toDate ? day(dto.toDate) : null
        if (fromDate && toDate && fromDate > toDate) {
            throw new BadRequestException('Historical migration from date must be on or before the to date.')
        }
        const run = await this.prisma.ficoHistoricalBackpostingRun.create({
            data: {
                companyId: dto.companyId,
                status: 'PREVIEW',
                dryRun: true,
                fromDate,
                toDate,
                requestedBy: user?.id ?? null,
                summary: { apDocumentCount: 0 },
            },
        })
        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId: dto.companyId,
                actorId: user?.id ?? null,
                action: 'AP_HISTORICAL_MIGRATION_CREATE',
                entityType: 'FicoHistoricalBackpostingRun',
                entityId: run.id,
                newValues: { fromDate, toDate, dryRun: true },
            },
        })
        return run
    }

    /** Enforces two-person approval when an identifiable requester is available. */
    async approveHistoricalMigrationRun(
        runId: string,
        companyId: string,
        user: Actor,
    ) {
        await this.access.assertAccess(user, companyId)
        const run = await this.prisma.ficoHistoricalBackpostingRun.findFirst({
            where: { id: runId, companyId },
        })
        if (!run) throw new NotFoundException('Historical AP migration run not found.')
        if (run.status !== 'PREVIEW') {
            throw new BadRequestException('Only a preview AP migration run can be approved.')
        }
        if (run.requestedBy && user?.id && run.requestedBy === user.id) {
            throw new BadRequestException(
                'The requester cannot approve the same historical AP migration run.',
            )
        }
        const approved = await this.prisma.ficoHistoricalBackpostingRun.update({
            where: { id: run.id },
            data: {
                status: 'APPROVED',
                dryRun: false,
                approvedBy: user?.id ?? null,
                approvedAt: new Date(),
            },
        })
        await this.prisma.ficoAccountingAuditLog.create({
            data: {
                companyId,
                actorId: user?.id ?? null,
                action: 'AP_HISTORICAL_MIGRATION_APPROVE',
                entityType: 'FicoHistoricalBackpostingRun',
                entityId: run.id,
                previousValues: { status: run.status, dryRun: run.dryRun },
                newValues: { status: approved.status, dryRun: approved.dryRun },
            },
        })
        return approved
    }

    /**
     * Imports one approved supplier payable opening balance. The AP control
     * account and migration offset both come from approved determination rules.
     */
    async migrateHistoricalBalance(
        runId: string,
        dto: CreateFicoApHistoricalBalanceDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const run = await this.prisma.ficoHistoricalBackpostingRun.findFirst({
            where: { id: runId, companyId: dto.companyId },
        })
        if (!run) throw new NotFoundException('Historical AP migration run not found.')
        if (!['APPROVED', 'EXECUTING', 'EXECUTED'].includes(run.status) || run.dryRun) {
            throw new BadRequestException(
                'Historical AP balances require an approved non-dry-run migration run.',
            )
        }
        const result = await this.postStandaloneApDocument({
            companyId: dto.companyId,
            supplierId: dto.supplierId,
            documentType: 'OPENING_BALANCE',
            documentDate: day(dto.documentDate),
            postingDate: day(dto.postingDate),
            baselineDate: day(dto.documentDate),
            dueDate: dto.dueDate ? day(dto.dueDate) : null,
            currencyCode: dto.currencyCode.trim().toUpperCase(),
            amount: money(dto.amount),
            referenceNumber: dto.referenceNumber.trim(),
            reason: 'Approved historical AP balance migration',
            paymentBlocked: dto.paymentBlocked === true,
            idempotencyKey:
                dto.idempotencyKey?.trim()
                    ? `AP_OPENING_BALANCE:${run.id}:${dto.idempotencyKey.trim()}`
                    : `AP_OPENING_BALANCE:${run.id}:${dto.supplierId}:${dto.referenceNumber.trim()}`,
            historicalBackpostingRunId: run.id,
            allowBlockedSupplier: true,
            user,
        })
        if (result.created) {
            const count = await this.prisma.ficoApDocument.count({
                where: { historicalBackpostingRunId: run.id },
            })
            await this.prisma.ficoHistoricalBackpostingRun.update({
                where: { id: run.id },
                data: {
                    status: 'EXECUTING',
                    executedBy: user?.id ?? null,
                    executedAt: new Date(),
                    summary: { apDocumentCount: count },
                },
            })
        }
        return result
    }

    /** Clears debit supplier items (credits/advances) against supplier liabilities. */
    async postClearing(dto: CreateFicoApClearingDto, user: Actor) {
        await this.access.assertAccess(user, dto.companyId)
        const clearingDate = day(dto.clearingDate)
        const currencyCode = dto.currencyCode.trim().toUpperCase()
        const allocations = dto.allocations.map((allocation) => ({
            debitOpenItemId: allocation.debitOpenItemId,
            creditOpenItemId: allocation.creditOpenItemId,
            amount: money(allocation.amount),
        }))
        const duplicatePair = new Set<string>()
        for (const allocation of allocations) {
            if (allocation.debitOpenItemId === allocation.creditOpenItemId) {
                throw new BadRequestException('A clearing allocation requires two different open items.')
            }
            const signature = `${allocation.debitOpenItemId}:${allocation.creditOpenItemId}`
            if (duplicatePair.has(signature)) {
                throw new BadRequestException('A clearing may allocate each debit/credit item pair only once.')
            }
            duplicatePair.add(signature)
        }
        const totalAmount = allocations.reduce(
            (total, allocation) => total.plus(allocation.amount),
            new Decimal(0),
        )
        if (!totalAmount.gt(0)) {
            throw new BadRequestException('AP clearing total must be greater than zero.')
        }
        const idempotencyKey = this.clearingIdempotencyKey(dto, allocations)
        const existing = await this.prisma.ficoApClearing.findUnique({
            where: { idempotencyKey },
            select: { id: true, journalEntryId: true, clearingNumber: true },
        })
        if (existing) return { ...existing, duplicate: true, created: false }

        const openItemIds = [
            ...new Set(
                allocations.flatMap((allocation) => [
                    allocation.debitOpenItemId,
                    allocation.creditOpenItemId,
                ]),
            ),
        ]
        const openItems = await this.prisma.ficoApOpenItem.findMany({
            where: { id: { in: openItemIds } },
            include: { document: true },
        })
        this.assertClearingOpenItems({
            openItems,
            allocations,
            companyId: dto.companyId,
            supplierId: dto.supplierId,
            currencyCode,
        })

        const debitByAccount = new Map<string, Decimal>()
        const creditByAccount = new Map<string, Decimal>()
        for (const allocation of allocations) {
            const debitItem = openItems.find(
                (item) => item.id === allocation.debitOpenItemId,
            )!
            const creditItem = openItems.find(
                (item) => item.id === allocation.creditOpenItemId,
            )!
            // Reverse each source balance: debit the liability; credit the supplier credit/advance.
            debitByAccount.set(
                creditItem.reconciliationAccountId!,
                (debitByAccount.get(creditItem.reconciliationAccountId!) ?? new Decimal(0)).plus(
                    allocation.amount,
                ),
            )
            creditByAccount.set(
                debitItem.reconciliationAccountId!,
                (creditByAccount.get(debitItem.reconciliationAccountId!) ?? new Decimal(0)).plus(
                    allocation.amount,
                ),
            )
        }

        let clearingId: string | null = null
        const journalResult = await this.journal.postAutomaticJournal({
            companyId: dto.companyId,
            documentType: 'AP_CLEARING',
            documentDate: clearingDate,
            postingDate: clearingDate,
            currencyCode,
            sourceModule: 'AP',
            sourceDocumentType: 'AP_CLEARING',
            sourceDocumentId: idempotencyKey,
            supplierId: dto.supplierId,
            idempotencyKey,
            sourcePostingKey: idempotencyKey,
            description: `Supplier AP clearing${dto.reference?.trim() ? ` ${dto.reference.trim()}` : ''}`,
            reference: cleanOptional(dto.reference),
            lines: [
                ...[...debitByAccount.entries()].map(([glAccountId, amount]) => ({
                    glAccountId,
                    debit: amount,
                    credit: new Decimal(0),
                    description: 'Supplier liability clearing',
                })),
                ...[...creditByAccount.entries()].map(([glAccountId, amount]) => ({
                    glAccountId,
                    debit: new Decimal(0),
                    credit: amount,
                    description: 'Supplier credit / advance clearing',
                })),
            ],
            metadata: {
                apClearing: true,
                allocationCount: allocations.length,
                sourceAccountSnapshots: true,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: user?.id ?? null,
            subledgerPosting: 'AP',
            afterPersist: async (tx, journal) => {
                const currentItems = await this.lockAndLoadOpenItemIds(tx, openItemIds)
                this.assertClearingOpenItems({
                    openItems: currentItems,
                    allocations,
                    companyId: dto.companyId,
                    supplierId: dto.supplierId,
                    currencyCode,
                })
                const clearing = await tx.ficoApClearing.create({
                    data: {
                        companyId: dto.companyId,
                        supplierId: dto.supplierId,
                        journalEntryId: journal.id,
                        clearingNumber: `CLR-${journal.documentNumber ?? journal.id}`,
                        idempotencyKey,
                        clearingDate,
                        currencyCode,
                        totalAmount,
                        reference: cleanOptional(dto.reference),
                        status: 'POSTED',
                        createdBy: user?.id ?? null,
                    },
                })
                clearingId = clearing.id
                await tx.ficoApClearingAllocation.createMany({
                    data: allocations.map((allocation) => ({
                        clearingId: clearing.id,
                        debitOpenItemId: allocation.debitOpenItemId,
                        creditOpenItemId: allocation.creditOpenItemId,
                        amount: allocation.amount,
                        status: 'CLEARED',
                    })),
                })
                const clearedAmounts = this.clearingAmountsByItem(allocations)
                for (const item of currentItems) {
                    const clearedAmount = clearedAmounts.get(item.id)
                    if (!clearedAmount) continue
                    const nextAmount = money(item.openAmount).minus(clearedAmount)
                    await tx.ficoApOpenItem.update({
                        where: { id: item.id },
                        data: {
                            openAmount: nextAmount,
                            status: nextAmount.eq(0) ? 'CLEARED' : 'PARTIALLY_CLEARED',
                            clearedAt: nextAmount.eq(0) ? clearingDate : null,
                        },
                    })
                }
                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: dto.companyId,
                        actorId: user?.id ?? null,
                        action: 'AP_CLEARING_POST',
                        entityType: 'FicoApClearing',
                        entityId: clearing.id,
                        newValues: {
                            journalEntryId: journal.id,
                            totalAmount: totalAmount.toString(),
                            allocationCount: allocations.length,
                        },
                    },
                })
            },
        })

        if (journalResult.duplicate) {
            const duplicate = await this.prisma.ficoApClearing.findUnique({
                where: { idempotencyKey },
                select: { id: true, journalEntryId: true, clearingNumber: true },
            })
            if (duplicate) return { ...duplicate, duplicate: true, created: false }
        }
        return {
            id: clearingId,
            journalEntryId: journalResult.journalEntryId,
            documentNumber: journalResult.documentNumber,
            duplicate: journalResult.duplicate,
            created: journalResult.created,
        }
    }

    async reverseClearing(
        clearingId: string,
        dto: ReverseFicoApDocumentDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const clearing = await this.prisma.ficoApClearing.findUnique({
            where: { id: clearingId },
        })
        if (!clearing || clearing.companyId !== dto.companyId) {
            throw new NotFoundException('AP clearing not found.')
        }
        if (clearing.status === 'REVERSED') {
            return {
                clearingId,
                reversalJournalEntryId: clearing.reversalJournalEntryId,
                duplicate: true,
            }
        }
        const reversal = await this.journal.reverseEntry(
            clearing.journalEntryId,
            {
                companyId: dto.companyId,
                reason: dto.reason,
                postingDate: dto.postingDate,
            },
            { id: user?.id },
            {
                apSubledgerReversal: true,
                afterReverse: async (tx, result) => {
                    const allocations = await tx.ficoApClearingAllocation.findMany({
                        where: { clearingId: clearing.id, status: 'CLEARED' },
                    })
                    const itemIds = [
                        ...new Set(
                            allocations.flatMap((allocation) => [
                                allocation.debitOpenItemId,
                                allocation.creditOpenItemId,
                            ]),
                        ),
                    ]
                    const items = await this.lockAndLoadOpenItemIds(tx, itemIds)
                    const restoredAmounts = this.clearingAmountsByItem(allocations)
                    for (const item of items) {
                        const restoredAmount = restoredAmounts.get(item.id)
                        if (!restoredAmount) continue
                        const nextAmount = money(item.openAmount).plus(restoredAmount)
                        if (nextAmount.gt(item.originalAmount)) {
                            throw new ConflictException(
                                'AP clearing reversal would exceed the original open-item amount.',
                            )
                        }
                        await tx.ficoApOpenItem.update({
                            where: { id: item.id },
                            data: {
                                openAmount: nextAmount,
                                status: nextAmount.eq(item.originalAmount)
                                    ? 'OPEN'
                                    : 'PARTIALLY_CLEARED',
                                clearedAt: null,
                            },
                        })
                    }
                    await tx.ficoApClearingAllocation.updateMany({
                        where: { clearingId: clearing.id, status: 'CLEARED' },
                        data: { status: 'REVERSED', reversedAt: new Date() },
                    })
                    await tx.ficoApClearing.update({
                        where: { id: clearing.id },
                        data: {
                            status: 'REVERSED',
                            reversalJournalEntryId: result.reversal.id,
                            reversalReason: dto.reason.trim(),
                            reversedAt: result.reversal.postedAt ?? new Date(),
                            reversedBy: user?.id ?? null,
                        },
                    })
                    await tx.ficoAccountingAuditLog.create({
                        data: {
                            companyId: dto.companyId,
                            actorId: user?.id ?? null,
                            action: 'AP_CLEARING_REVERSE',
                            entityType: 'FicoApClearing',
                            entityId: clearing.id,
                            newValues: {
                                reversalJournalEntryId: result.reversal.id,
                                allocationCount: allocations.length,
                            },
                            reason: dto.reason.trim(),
                        },
                    })
                },
            },
        )
        return { clearingId, ...reversal }
    }

    async reversePayment(
        paymentId: string,
        dto: ReverseFicoApDocumentDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const payment = await this.prisma.ficoApPayment.findUnique({
            where: { id: paymentId },
            include: { journalEntry: true },
        })
        if (!payment || payment.companyId !== dto.companyId) {
            throw new NotFoundException('AP payment not found.')
        }
        if (payment.status === 'REVERSED') {
            return {
                paymentId: payment.id,
                reversalJournalEntryId: payment.reversalJournalEntryId,
                duplicate: true,
            }
        }

        const reversal = await this.journal.reverseEntry(
            payment.journalEntryId,
            {
                companyId: dto.companyId,
                reason: dto.reason,
                postingDate: dto.postingDate,
            },
            { id: user?.id },
            {
                apSubledgerReversal: true,
                afterReverse: async (tx, result) => {
                    const allocations = await tx.ficoApPaymentAllocation.findMany({
                        where: { paymentId: payment.id, status: 'CLEARED' },
                    })
                    for (const allocation of allocations) {
                        await tx.$queryRaw`
                            SELECT id FROM fico_ap_open_items
                            WHERE id = ${allocation.openItemId}
                            FOR UPDATE
                        `
                        const openItem = await tx.ficoApOpenItem.findUnique({
                            where: { id: allocation.openItemId },
                        })
                        if (!openItem) {
                            throw new ConflictException('AP open item disappeared during payment reversal.')
                        }
                        const restored = money(openItem.openAmount).plus(allocation.amount)
                        await tx.ficoApOpenItem.update({
                            where: { id: openItem.id },
                            data: {
                                openAmount: restored,
                                status: restored.gte(openItem.originalAmount)
                                    ? 'OPEN'
                                    : 'PARTIALLY_CLEARED',
                                clearedAt: null,
                            },
                        })
                        await tx.ficoApPaymentAllocation.update({
                            where: { id: allocation.id },
                            data: { status: 'REVERSED', reversedAt: new Date() },
                        })
                    }
                    await tx.ficoApPayment.update({
                        where: { id: payment.id },
                        data: {
                            status: 'REVERSED',
                            reversalJournalEntryId: result.reversal.id,
                            reversalReason: dto.reason.trim(),
                            reversedAt: result.reversal.postedAt ?? new Date(),
                            reversedBy: user?.id ?? null,
                        },
                    })
                    await tx.ficoAccountingAuditLog.create({
                        data: {
                            companyId: dto.companyId,
                            actorId: user?.id ?? null,
                            action: 'AP_PAYMENT_REVERSE',
                            entityType: 'FicoApPayment',
                            entityId: payment.id,
                            newValues: {
                                reversalJournalEntryId: result.reversal.id,
                                allocationCount: allocations.length,
                            },
                            reason: dto.reason.trim(),
                        },
                    })
                },
            },
        )
        return { paymentId, ...reversal }
    }

    async reverseDocument(
        documentId: string,
        dto: ReverseFicoApDocumentDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const document = await this.prisma.ficoApDocument.findUnique({
            where: { id: documentId },
            include: { openItem: true },
        })
        if (!document || document.companyId !== dto.companyId) {
            throw new NotFoundException('AP document not found.')
        }
        if (document.status === 'REVERSED') {
            return {
                documentId,
                reversalJournalEntryId: document.reversalJournalEntryId,
                duplicate: true,
            }
        }
        if (document.openItem) {
            const [paymentClearings, internalClearings] = await Promise.all([
                this.prisma.ficoApPaymentAllocation.count({
                    where: { openItemId: document.openItem.id, status: 'CLEARED' },
                }),
                this.prisma.ficoApClearingAllocation.count({
                    where: {
                        status: 'CLEARED',
                        OR: [
                            { debitOpenItemId: document.openItem.id },
                            { creditOpenItemId: document.openItem.id },
                        ],
                    },
                }),
            ])
            if (paymentClearings || internalClearings) {
                throw new BadRequestException(
                    'Reverse payment or AP net clearing before reversing a supplier AP document.',
                )
            }
        }

        const reversal = await this.journal.reverseEntry(
            document.journalEntryId,
            {
                companyId: dto.companyId,
                reason: dto.reason,
                postingDate: dto.postingDate,
            },
            { id: user?.id },
            {
                apSubledgerReversal: true,
                afterReverse: async (tx, result) => {
                    await tx.ficoApDocument.update({
                        where: { id: document.id },
                        data: {
                            status: 'REVERSED',
                            reversalJournalEntryId: result.reversal.id,
                            reversalReason: dto.reason.trim(),
                            reversedAt: result.reversal.postedAt ?? new Date(),
                            reversedBy: user?.id ?? null,
                        },
                    })
                    if (document.openItem) {
                        await tx.ficoApOpenItem.update({
                            where: { id: document.openItem.id },
                            data: {
                                openAmount: new Decimal(0),
                                status: 'REVERSED',
                                clearedAt: null,
                            },
                        })
                    }
                    await tx.ficoAccountingAuditLog.create({
                        data: {
                            companyId: dto.companyId,
                            actorId: user?.id ?? null,
                            action: 'AP_DOCUMENT_REVERSE',
                            entityType: 'FicoApDocument',
                            entityId: document.id,
                            newValues: { reversalJournalEntryId: result.reversal.id },
                            reason: dto.reason.trim(),
                        },
                    })
                },
            },
        )
        return { documentId, ...reversal }
    }

    async listOpenItems(query: FicoApOpenItemQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const asOfDate = query.asOfDate ? day(query.asOfDate) : new Date()
        const where: Prisma.FicoApOpenItemWhereInput = {
            companyId: query.companyId,
            ...(query.supplierId ? { supplierId: query.supplierId } : {}),
            status: query.status
                ? query.status
                : { in: ['OPEN', 'PARTIALLY_CLEARED'] },
        }
        if (query.overdueOnly) {
            where.dueDate = { lt: asOfDate }
        }
        return this.prisma.ficoApOpenItem.findMany({
            where,
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                document: {
                    select: {
                        id: true,
                        documentType: true,
                        status: true,
                        referenceNumber: true,
                        postingDate: true,
                        journalEntryId: true,
                    },
                },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        })
    }

    async getAging(companyId: string, asOf: string | undefined, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const asOfDate = day(asOf ?? new Date())
        const items = await this.prisma.ficoApOpenItem.findMany({
            where: {
                companyId,
                status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
            },
            orderBy: { dueDate: 'asc' },
        })
        const buckets = {
            current: new Decimal(0),
            days1To30: new Decimal(0),
            days31To60: new Decimal(0),
            days61To90: new Decimal(0),
            over90: new Decimal(0),
            supplierCredits: new Decimal(0),
        }
        const rows = items.map((item) => {
            const amount = money(item.openAmount)
            const signed = item.direction === 'DEBIT' ? amount.negated() : amount
            const anchor = item.dueDate ?? item.baselineDate
            const overdueDays = Math.max(
                0,
                Math.floor((asOfDate.getTime() - anchor.getTime()) / 86_400_000),
            )
            if (item.direction === 'DEBIT') buckets.supplierCredits = buckets.supplierCredits.plus(amount)
            else if (overdueDays === 0) buckets.current = buckets.current.plus(amount)
            else if (overdueDays <= 30) buckets.days1To30 = buckets.days1To30.plus(amount)
            else if (overdueDays <= 60) buckets.days31To60 = buckets.days31To60.plus(amount)
            else if (overdueDays <= 90) buckets.days61To90 = buckets.days61To90.plus(amount)
            else buckets.over90 = buckets.over90.plus(amount)
            return { ...item, overdueDays, signedOpenAmount: signed }
        })
        const totalPayable = rows.reduce(
            (total, item) => total.plus(item.signedOpenAmount),
            new Decimal(0),
        )
        return { asOfDate, buckets, totalPayable, items: rows }
    }

    async getSupplierStatement(query: FicoApStatementQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const from = query.fromDate ? day(query.fromDate) : undefined
        const to = query.toDate ? day(query.toDate) : undefined
        const dateRange =
            from || to
                ? {
                      gte: from,
                      lte: to,
                  }
                : undefined
        const [supplier, documents, payments, clearings, openItems] = await Promise.all([
            this.prisma.mmSupplier.findFirst({
                where: { id: query.supplierId, deletedAt: null },
                select: { id: true, supplierCode: true, supplierName: true },
            }),
            this.prisma.ficoApDocument.findMany({
                where: {
                    companyId: query.companyId,
                    supplierId: query.supplierId,
                    ...(dateRange ? { postingDate: dateRange } : {}),
                },
                include: {
                    journalEntry: { select: { id: true, documentNumber: true, status: true } },
                    reversalJournalEntry: { select: { id: true, documentNumber: true } },
                    openItem: { select: { id: true, openAmount: true, status: true, direction: true } },
                },
                orderBy: [{ postingDate: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.ficoApPayment.findMany({
                where: {
                    companyId: query.companyId,
                    supplierId: query.supplierId,
                    ...(dateRange ? { paymentDate: dateRange } : {}),
                },
                include: {
                    journalEntry: { select: { id: true, documentNumber: true, status: true } },
                    reversalJournalEntry: { select: { id: true, documentNumber: true } },
                },
                orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.ficoApClearing.findMany({
                where: {
                    companyId: query.companyId,
                    supplierId: query.supplierId,
                    ...(dateRange ? { clearingDate: dateRange } : {}),
                },
                include: {
                    journalEntry: { select: { id: true, documentNumber: true, status: true } },
                },
                orderBy: [{ clearingDate: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.ficoApOpenItem.findMany({
                where: { companyId: query.companyId, supplierId: query.supplierId },
                include: {
                    document: {
                        select: {
                            id: true,
                            referenceNumber: true,
                            documentType: true,
                            postingDate: true,
                        },
                    },
                },
                orderBy: { dueDate: 'asc' },
            }),
        ])
        if (!supplier) throw new NotFoundException('Supplier not found.')

        let priorBalance = new Decimal(0)
        if (from) {
            const [priorDocs, priorPayments] = await Promise.all([
                this.prisma.ficoApDocument.findMany({
                    where: {
                        companyId: query.companyId,
                        supplierId: query.supplierId,
                        status: 'POSTED',
                        postingDate: { lt: from },
                    },
                    select: { documentType: true, liabilityAmount: true },
                }),
                this.prisma.ficoApPayment.findMany({
                    where: {
                        companyId: query.companyId,
                        supplierId: query.supplierId,
                        status: 'POSTED',
                        paymentDate: { lt: from },
                    },
                    select: { totalAmount: true },
                }),
            ])
            for (const doc of priorDocs) {
                if (doc.documentType === 'CREDIT_MEMO' || doc.documentType === 'ADVANCE') {
                    priorBalance = priorBalance.minus(money(doc.liabilityAmount))
                } else {
                    priorBalance = priorBalance.plus(money(doc.liabilityAmount))
                }
            }
            for (const pay of priorPayments) {
                priorBalance = priorBalance.minus(money(pay.totalAmount))
            }
        }

        const rawEntries: Array<{
            id: string
            kind: 'DOCUMENT' | 'PAYMENT' | 'CLEARING'
            date: Date
            createdAt: Date
            documentType: string
            reference: string | null
            journalEntryId: string
            journalNumber: string | null
            status: string
            currencyCode: string
            debit: Decimal
            credit: Decimal
        }> = []

        for (const doc of documents) {
            const amt = money(doc.liabilityAmount)
            const isCreditIncrease =
                doc.documentType === 'INVOICE' ||
                doc.documentType === 'DEBIT_ADJUSTMENT' ||
                doc.documentType === 'OPENING_BALANCE'
            rawEntries.push({
                id: doc.id,
                kind: 'DOCUMENT',
                date: doc.postingDate,
                createdAt: doc.createdAt,
                documentType: doc.documentType,
                reference: doc.referenceNumber,
                journalEntryId: doc.journalEntryId,
                journalNumber: doc.journalEntry?.documentNumber ?? null,
                status: doc.status,
                currencyCode: doc.currencyCode,
                debit: doc.status === 'POSTED' && !isCreditIncrease ? amt : new Decimal(0),
                credit: doc.status === 'POSTED' && isCreditIncrease ? amt : new Decimal(0),
            })
        }
        for (const payment of payments) {
            const amt = money(payment.totalAmount)
            rawEntries.push({
                id: payment.id,
                kind: 'PAYMENT',
                date: payment.paymentDate,
                createdAt: payment.createdAt,
                documentType: 'PAYMENT',
                reference: payment.paymentReference ?? payment.paymentNumber,
                journalEntryId: payment.journalEntryId,
                journalNumber: payment.journalEntry?.documentNumber ?? null,
                status: payment.status,
                currencyCode: payment.currencyCode,
                debit: payment.status === 'POSTED' ? amt : new Decimal(0),
                credit: new Decimal(0),
            })
        }
        for (const clearing of clearings) {
            rawEntries.push({
                id: clearing.id,
                kind: 'CLEARING',
                date: clearing.clearingDate,
                createdAt: clearing.createdAt,
                documentType: 'AP_CLEARING',
                reference: clearing.reference ?? clearing.clearingNumber,
                journalEntryId: clearing.journalEntryId,
                journalNumber: clearing.journalEntry?.documentNumber ?? null,
                status: clearing.status,
                currencyCode: clearing.currencyCode,
                debit: new Decimal(0),
                credit: new Decimal(0),
            })
        }

        rawEntries.sort(
            (a, b) =>
                a.date.getTime() - b.date.getTime() ||
                a.createdAt.getTime() - b.createdAt.getTime(),
        )
        let running = priorBalance
        let totalDebits = new Decimal(0)
        let totalCredits = new Decimal(0)
        const entries = rawEntries.map((row) => {
            running = running.plus(row.credit).minus(row.debit)
            totalDebits = totalDebits.plus(row.debit)
            totalCredits = totalCredits.plus(row.credit)
            return {
                ...row,
                runningBalance: running,
            }
        })

        let openPayableBalance = new Decimal(0)
        let openCreditBalance = new Decimal(0)
        for (const item of openItems) {
            if (!['OPEN', 'PARTIALLY_CLEARED'].includes(item.status)) continue
            if (item.direction === 'DEBIT') {
                openCreditBalance = openCreditBalance.plus(money(item.openAmount))
            } else {
                openPayableBalance = openPayableBalance.plus(money(item.openAmount))
            }
        }

        return {
            supplier,
            companyId: query.companyId,
            documents,
            payments,
            clearings,
            openItems,
            entries,
            summary: {
                openingBalance: priorBalance,
                totalDebits,
                totalCredits,
                closingBalance: running,
                openPayableBalance,
                openCreditBalance,
                netOpenBalance: openPayableBalance.minus(openCreditBalance),
            },
        }
    }

    async reconcileToGeneralLedger(companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const accounts = await this.prisma.ficoGlAccount.findMany({
            where: { isReconciliationAccount: true, reconciliationType: 'AP' },
            select: { id: true, accountCode: true, accountName: true },
        })
        const accountIds = accounts.map((account) => account.id)
        if (!accountIds.length) return { companyId, accounts: [], difference: new Decimal(0) }

        const [ledgerRows, items] = await Promise.all([
            this.prisma.ficoJournalEntryLine.groupBy({
                by: ['glAccountId'],
                where: {
                    companyId,
                    glAccountId: { in: accountIds },
                    journalEntry: { status: 'POSTED' },
                },
                _sum: { debitAmount: true, creditAmount: true },
            }),
            this.prisma.ficoApOpenItem.findMany({
                where: {
                    companyId,
                    reconciliationAccountId: { in: accountIds },
                    status: { in: ['OPEN', 'PARTIALLY_CLEARED'] },
                },
                select: {
                    reconciliationAccountId: true,
                    direction: true,
                    openAmount: true,
                },
            }),
        ])
        const ledgerMap = new Map(
            ledgerRows.map((row) => [
                row.glAccountId,
                money(row._sum.creditAmount).minus(money(row._sum.debitAmount)),
            ]),
        )
        const subledgerMap = new Map<string, Decimal>()
        for (const item of items) {
            if (!item.reconciliationAccountId) continue
            const signed = item.direction === 'DEBIT'
                ? money(item.openAmount).negated()
                : money(item.openAmount)
            subledgerMap.set(
                item.reconciliationAccountId,
                (subledgerMap.get(item.reconciliationAccountId) ?? new Decimal(0)).plus(signed),
            )
        }
        const rows = accounts.map((account) => {
            const generalLedgerBalance = ledgerMap.get(account.id) ?? new Decimal(0)
            const subledgerBalance = subledgerMap.get(account.id) ?? new Decimal(0)
            return {
                ...account,
                generalLedgerBalance,
                subledgerBalance,
                difference: generalLedgerBalance.minus(subledgerBalance),
            }
        })
        return {
            companyId,
            accounts: rows,
            difference: rows.reduce((total, row) => total.plus(row.difference), new Decimal(0)),
            reconciled: rows.every((row) => row.difference.abs().lte(MONEY_TOLERANCE)),
        }
    }

    /** Shared posting path for AP-originated subledger documents. */
    private async postStandaloneApDocument(input: {
        companyId: string
        supplierId: string
        documentType: 'CREDIT_MEMO' | 'DEBIT_ADJUSTMENT' | 'ADVANCE' | 'OPENING_BALANCE'
        documentDate: Date
        postingDate: Date
        baselineDate: Date
        dueDate: Date | null
        currencyCode: string
        amount: Decimal
        referenceNumber: string | null
        reason: string | null
        paymentBlocked: boolean
        idempotencyKey: string
        paymentMethodCode?: string | null
        bankAccountId?: string | null
        historicalBackpostingRunId?: string
        allowBlockedSupplier?: boolean
        user: Actor
    }) {
        if (!input.amount.gt(0)) {
            throw new BadRequestException('AP document amount must be greater than zero.')
        }
        const supplier = await this.prisma.mmSupplier.findFirst({
            where: { id: input.supplierId, deletedAt: null },
            include: { paymentTerms: true },
        })
        if (!supplier) throw new NotFoundException('Supplier not found.')

        const companyAccount = await this.prisma.ficoSupplierCompanyAccount.findUnique({
            where: {
                supplierId_companyId: {
                    supplierId: input.supplierId,
                    companyId: input.companyId,
                },
            },
            include: { paymentTerms: true },
        })
        if (!input.allowBlockedSupplier) {
            if (companyAccount?.status !== undefined && companyAccount.status !== 'ACTIVE') {
                throw new BadRequestException(
                    'Supplier accounting master is inactive for this company.',
                )
            }
            if (companyAccount?.postingBlocked) {
                throw new BadRequestException(
                    'Supplier accounting master has a posting block for this company.',
                )
            }
        }
        this.assertSupplierTransactionCurrency(companyAccount, input.currencyCode)
        const supplierAccountGroup =
            companyAccount?.supplierAccountGroup?.trim() || 'STANDARD'
        const reconciliation = await this.resolveReconciliationAccount({
            companyId: input.companyId,
            currencyCode: input.currencyCode,
            postingDate: input.postingDate,
            supplierAccountGroup,
            configuredAccountId: companyAccount?.reconciliationAccountId ?? null,
        })

        let counterAccount: { glAccountId: string; accountCode: string }
        let openItemAccount = reconciliation
        let journalLines: Array<{
            glAccountId: string
            debit: Decimal
            credit: Decimal
            description: string
        }>

        if (input.documentType === 'ADVANCE') {
            counterAccount = await this.resolveSingleRuleLine({
                companyId: input.companyId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
                transactionKeyCode: 'SUPPLIER_ADVANCE',
                transactionType: 'SUPPLIER_ADVANCE',
                side: 'DEBIT',
                supplierAccountGroup,
                purpose: 'supplier advance asset',
            })
            const bank = await this.resolveSingleRuleLine({
                companyId: input.companyId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
                transactionKeyCode: 'BANK_ACCOUNT',
                transactionType: 'SUPPLIER_PAYMENT',
                side: 'CREDIT',
                supplierAccountGroup,
                paymentMethodCode: input.paymentMethodCode ?? null,
                bankAccountId: input.bankAccountId ?? null,
                purpose: 'supplier advance bank account',
            })
            openItemAccount = {
                glAccountId: counterAccount.glAccountId,
                accountCode: counterAccount.accountCode,
            }
            journalLines = [
                {
                    glAccountId: counterAccount.glAccountId,
                    debit: input.amount,
                    credit: new Decimal(0),
                    description: 'Supplier advance / down payment',
                },
                {
                    glAccountId: bank.glAccountId,
                    debit: new Decimal(0),
                    credit: input.amount,
                    description: 'Bank / cash payment for supplier advance',
                },
            ]
        } else {
            const determination =
                input.documentType === 'OPENING_BALANCE'
                    ? {
                          transactionKeyCode: 'AP_OPENING_BALANCE',
                          transactionType: 'SUPPLIER_OPENING_BALANCE',
                          purpose: 'historical AP opening balance offset',
                      }
                    : {
                          transactionKeyCode: 'SUPPLIER_INVOICE',
                          transactionType: 'SUPPLIER_INVOICE',
                          purpose: 'supplier invoice adjustment offset',
                      }
            counterAccount = await this.resolveSingleRuleLine({
                companyId: input.companyId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
                transactionKeyCode: determination.transactionKeyCode,
                transactionType: determination.transactionType,
                side: 'DEBIT',
                supplierAccountGroup,
                purpose: determination.purpose,
            })
            journalLines =
                input.documentType === 'CREDIT_MEMO'
                    ? [
                          {
                              glAccountId: reconciliation.glAccountId,
                              debit: input.amount,
                              credit: new Decimal(0),
                              description: 'Supplier credit memo reconciliation reversal',
                          },
                          {
                              glAccountId: counterAccount.glAccountId,
                              debit: new Decimal(0),
                              credit: input.amount,
                              description: 'Supplier credit memo offset',
                          },
                      ]
                    : [
                          {
                              glAccountId: counterAccount.glAccountId,
                              debit: input.amount,
                              credit: new Decimal(0),
                              description:
                                  input.documentType === 'OPENING_BALANCE'
                                      ? 'Historical AP opening balance offset'
                                      : 'Supplier debit adjustment offset',
                          },
                          {
                              glAccountId: reconciliation.glAccountId,
                              debit: new Decimal(0),
                              credit: input.amount,
                              description:
                                  input.documentType === 'OPENING_BALANCE'
                                      ? 'Historical supplier opening liability'
                                      : 'Supplier debit adjustment reconciliation liability',
                          },
                      ]
        }

        const journalDocumentType = {
            CREDIT_MEMO: 'AP_CREDIT_MEMO',
            DEBIT_ADJUSTMENT: 'AP_DEBIT_ADJUSTMENT',
            ADVANCE: 'AP_ADVANCE',
            OPENING_BALANCE: 'AP_OPENING_BALANCE',
        }[input.documentType]
        const openItemDirection =
            input.documentType === 'CREDIT_MEMO' || input.documentType === 'ADVANCE'
                ? 'DEBIT'
                : 'CREDIT'
        const resolvedDueDate =
            input.dueDate ??
            (input.documentType === 'ADVANCE'
                ? null
                : this.addDays(
                      input.baselineDate,
                      companyAccount?.paymentTerms?.dueDays ??
                          supplier.paymentTerms?.dueDays ??
                          0,
                  ))
        let documentId: string | null = null
        const journal = await this.journal.postAutomaticJournal({
            companyId: input.companyId,
            documentType: journalDocumentType,
            documentDate: input.documentDate,
            postingDate: input.postingDate,
            currencyCode: input.currencyCode,
            sourceModule: 'AP',
            sourceDocumentType:
                input.documentType === 'OPENING_BALANCE'
                    ? 'AP_HISTORICAL_MIGRATION'
                    : `AP_${input.documentType}`,
            sourceDocumentId: input.historicalBackpostingRunId ?? input.idempotencyKey,
            supplierId: input.supplierId,
            idempotencyKey: input.idempotencyKey,
            sourcePostingKey: input.idempotencyKey,
            description: `Supplier ${input.documentType.replaceAll('_', ' ').toLowerCase()}${input.referenceNumber ? ` ${input.referenceNumber}` : ''}`,
            reference: input.referenceNumber,
            lines: journalLines,
            metadata: {
                apDocumentType: input.documentType,
                historicalBackpostingRunId: input.historicalBackpostingRunId ?? null,
                reconciliationAccountId: openItemAccount.glAccountId,
                reconciliationAccountCode: openItemAccount.accountCode,
                counterAccountId: counterAccount.glAccountId,
                reason: input.reason,
            },
            postImmediately: true,
            postingSource: 'AUTOMATIC',
            actorUserId: input.user?.id ?? null,
            subledgerPosting: 'AP',
            afterPersist: async (tx, journalEntry) => {
                const document = await tx.ficoApDocument.create({
                    data: {
                        companyId: input.companyId,
                        supplierId: input.supplierId,
                        supplierCompanyAccountId: companyAccount?.id ?? null,
                        journalEntryId: journalEntry.id,
                        historicalBackpostingRunId:
                            input.historicalBackpostingRunId ?? null,
                        documentType: input.documentType,
                        status: 'POSTED',
                        referenceNumber: input.referenceNumber,
                        documentDate: input.documentDate,
                        postingDate: input.postingDate,
                        baselineDate: input.baselineDate,
                        dueDate: resolvedDueDate,
                        currencyCode: input.currencyCode,
                        netAmount: input.amount,
                        taxAmount: new Decimal(0),
                        withholdingAmount: new Decimal(0),
                        grossAmount: input.amount,
                        liabilityAmount: input.amount,
                        reconciliationAccountId: openItemAccount.glAccountId,
                        reconciliationAccountCode: openItemAccount.accountCode,
                        paymentBlocked: input.paymentBlocked,
                        createdBy: input.user?.id ?? null,
                    },
                })
                documentId = document.id
                await tx.ficoApOpenItem.create({
                    data: {
                        companyId: input.companyId,
                        supplierId: input.supplierId,
                        documentId: document.id,
                        reconciliationAccountId: openItemAccount.glAccountId,
                        itemType: input.documentType,
                        direction: openItemDirection,
                        originalAmount: input.amount,
                        openAmount: input.amount,
                        currencyCode: input.currencyCode,
                        baselineDate: input.baselineDate,
                        dueDate: resolvedDueDate,
                        paymentBlocked: input.paymentBlocked,
                        status: 'OPEN',
                    },
                })
                await tx.ficoAccountingAuditLog.create({
                    data: {
                        companyId: input.companyId,
                        actorId: input.user?.id ?? null,
                        action: `AP_${input.documentType}_POST`,
                        entityType: 'FicoApDocument',
                        entityId: document.id,
                        newValues: {
                            journalEntryId: journalEntry.id,
                            supplierId: input.supplierId,
                            amount: input.amount.toString(),
                            clearingAccountId: openItemAccount.glAccountId,
                        },
                        reason: input.reason,
                    },
                })
            },
        })
        if (journal.duplicate) {
            const duplicate = await this.prisma.ficoApDocument.findUnique({
                where: { journalEntryId: journal.journalEntryId },
                select: { id: true, journalEntryId: true, documentType: true },
            })
            if (duplicate) return { ...duplicate, duplicate: true, created: false }
        }
        return {
            id: documentId,
            journalEntryId: journal.journalEntryId,
            documentNumber: journal.documentNumber,
            duplicate: journal.duplicate,
            created: journal.created,
        }
    }

    private adjustmentIdempotencyKey(dto: CreateFicoApAdjustmentDto) {
        if (dto.idempotencyKey?.trim()) {
            return `AP_${dto.documentType}:${dto.companyId}:${dto.idempotencyKey.trim()}`
        }
        return [
            `AP_${dto.documentType}`,
            dto.companyId,
            dto.supplierId,
            dto.postingDate,
            dto.referenceNumber?.trim() || '-',
            money(dto.amount).toString(),
        ].join(':')
    }

    private clearingIdempotencyKey(
        dto: CreateFicoApClearingDto,
        allocations: Array<{
            debitOpenItemId: string
            creditOpenItemId: string
            amount: Decimal
        }>,
    ) {
        if (dto.idempotencyKey?.trim()) {
            return `AP_CLEARING:${dto.companyId}:${dto.idempotencyKey.trim()}`
        }
        const signature = allocations
            .map(
                (allocation) =>
                    `${allocation.debitOpenItemId}:${allocation.creditOpenItemId}:${allocation.amount.toString()}`,
            )
            .sort()
            .join('|')
        return [
            'AP_CLEARING',
            dto.companyId,
            dto.supplierId,
            dto.clearingDate,
            dto.reference?.trim() || '-',
            signature,
        ].join(':')
    }

    private assertSupplierTransactionCurrency(
        companyAccount: { transactionCurrencyCode: string | null } | null,
        currencyCode: string,
    ) {
        const configured = companyAccount?.transactionCurrencyCode?.trim().toUpperCase()
        if (configured && configured !== currencyCode.trim().toUpperCase()) {
            throw new BadRequestException(
                `Supplier accounting is restricted to transaction currency ${configured}.`,
            )
        }
    }

    private supplierCompanyAccountInclude() {
        return {
            reconciliationAccount: {
                select: { id: true, accountCode: true, accountName: true },
            },
            paymentTerms: true,
            defaultPurchaseTaxCode: { select: { id: true, code: true, name: true } },
            withholdingTaxCode: { select: { id: true, code: true, name: true } },
            alternativePayeeSupplier: {
                select: { id: true, supplierCode: true, supplierName: true },
            },
            bankApprovals: {
                include: { supplierBankAccount: true },
                orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            },
        } satisfies Prisma.FicoSupplierCompanyAccountInclude
    }

    private async resolveInvoiceCurrency(input: {
        invoice: { currency: { code: string } | null }
        payload: MmAccountingDispatchPayload
    }) {
        const raw = input.invoice.currency?.code ?? input.payload.currencyCode
        if (raw?.trim()) return raw.trim().toUpperCase()
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: input.payload.companyId },
            select: { baseCurrency: true },
        })
        if (!settings?.baseCurrency) {
            throw new BadRequestException('Supplier invoice currency is missing.')
        }
        return settings.baseCurrency.toUpperCase()
    }

    private async resolveReconciliationAccount(input: {
        companyId: string
        currencyCode: string
        postingDate: Date
        supplierAccountGroup: string
        configuredAccountId: string | null
    }) {
        if (input.configuredAccountId) {
            return this.assertSupplierReconciliationAccount({
                companyId: input.companyId,
                glAccountId: input.configuredAccountId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
            })
        }
        try {
            const line = await this.resolveSingleRuleLine({
                companyId: input.companyId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
                transactionKeyCode: 'SUPPLIER_RECON',
                transactionType: 'SUPPLIER_INVOICE',
                side: 'CREDIT',
                supplierAccountGroup: input.supplierAccountGroup,
                purpose: 'supplier reconciliation account',
            })
            return this.assertSupplierReconciliationAccount({
                companyId: input.companyId,
                glAccountId: line.glAccountId,
                postingDate: input.postingDate,
                currencyCode: input.currencyCode,
            })
        } catch (error) {
            if (!isNoRuleError(error)) throw error
        }
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId: input.companyId },
            select: { defaultPayableAccountId: true },
        })
        if (!settings?.defaultPayableAccountId) {
            throw new BadRequestException(
                'No supplier reconciliation account is configured. Maintain supplier accounting, an AP determination rule, or an approved company default.',
            )
        }
        return this.assertSupplierReconciliationAccount({
            companyId: input.companyId,
            glAccountId: settings.defaultPayableAccountId,
            postingDate: input.postingDate,
            currencyCode: input.currencyCode,
        })
    }

    private async assertSupplierReconciliationAccount(input: {
        companyId: string
        glAccountId: string
        postingDate: Date
        currencyCode?: string
    }) {
        await this.postingValidation.assertAccountPostable(
            input.companyId,
            input.glAccountId,
            'AUTOMATIC',
            input.currencyCode?.toUpperCase() ?? 'PHP',
            undefined,
            input.postingDate,
        )
        const account = await this.prisma.ficoGlAccount.findUnique({
            where: { id: input.glAccountId },
            select: {
                id: true,
                accountCode: true,
                accountName: true,
                accountType: true,
                isReconciliationAccount: true,
                reconciliationType: true,
            },
        })
        if (!account) throw new NotFoundException('Supplier reconciliation G/L account not found.')
        if (
            account.accountType !== 'LIABILITY' ||
            !account.isReconciliationAccount ||
            account.reconciliationType !== 'AP'
        ) {
            throw new BadRequestException(
                `G/L account ${account.accountCode} must be an active AP reconciliation liability account.`,
            )
        }
        return { glAccountId: account.id, accountCode: account.accountCode }
    }

    private async resolveSingleRuleLine(input: {
        companyId: string
        postingDate: Date
        currencyCode: string
        transactionKeyCode: string
        transactionType: string
        side: 'DEBIT' | 'CREDIT'
        supplierAccountGroup: string
        paymentMethodCode?: string | null
        bankAccountId?: string | null
        purpose: string
    }) {
        const result = await this.accountResolution.resolve({
            companyId: input.companyId,
            sourceModule: 'AP',
            transactionType: input.transactionType,
            transactionKeyCode: input.transactionKeyCode,
            postingDate: input.postingDate,
            currencyCode: input.currencyCode,
            supplierAccountGroup: input.supplierAccountGroup,
            paymentMethodCode: input.paymentMethodCode ?? null,
            bankAccountId: input.bankAccountId ?? null,
        })
        const candidates =
            input.side === 'DEBIT' ? result.debitLines : result.creditLines
        if (candidates.length !== 1) {
            throw new BadRequestException(
                `Account determination for ${input.purpose} must resolve exactly one ${input.side.toLowerCase()} G/L line.`,
            )
        }
        return candidates[0]
    }

    private async resolvePurchaseTax(input: {
        taxCodeId: string | null
        companyId: string
        postingDate: Date
        currencyCode: string
        grossAmount: Decimal
        sourceTaxAmount: Decimal
    }) {
        if (!input.taxCodeId) {
            if (input.sourceTaxAmount.gt(0)) {
                throw new BadRequestException(
                    'Supplier invoice tax requires an active FICO purchase tax code; tax rates are never hardcoded.',
                )
            }
            return {
                taxCodeId: null as string | null,
                taxAmount: new Decimal(0),
                netAmount: input.grossAmount,
                glAccountId: null as string | null,
                isRecoverable: true,
            }
        }
        const taxCode = await this.loadEffectiveTaxCode({
            taxCodeId: input.taxCodeId,
            companyId: input.companyId,
            postingDate: input.postingDate,
            type: 'purchase',
        })
        const sourceNet = input.grossAmount.minus(input.sourceTaxAmount)
        if (sourceNet.lt(0)) {
            throw new BadRequestException('Supplier invoice tax amount exceeds the document total.')
        }
        const calculation = this.taxCalculation.calculate({
            taxCodeId: taxCode.id,
            taxCode: taxCode.code,
            companyId: input.companyId,
            taxType: taxCode.taxType,
            calculationMethod: taxCode.calculationMethod,
            roundingMethod: taxCode.roundingMethod,
            roundingLevel: taxCode.roundingLevel,
            decimalPrecision: taxCode.decimalPrecision,
            isRecoverable: taxCode.isRecoverable,
            rate: taxCode.taxRates[0]
                ? {
                      rate: taxCode.taxRates[0].rate,
                      rateUnit: taxCode.taxRates[0].rateUnit,
                  }
                : null,
            amount:
                taxCode.calculationMethod === 'TAX_INCLUSIVE'
                    ? input.grossAmount
                    : sourceNet,
            transactionDate: input.postingDate.toISOString().slice(0, 10),
            transactionType: 'SUPPLIER_INVOICE',
        })
        const taxAmount = money(calculation.taxAmount)
        if (taxAmount.minus(input.sourceTaxAmount).abs().gt(MONEY_TOLERANCE)) {
            throw new BadRequestException(
                `Supplier invoice tax does not match active tax code ${taxCode.code}. Correct the invoice or the effective FICO tax configuration.`,
            )
        }
        const glAccountId = taxCode.isRecoverable
            ? taxCode.inputTaxGlAccountId
            : taxCode.nonRecoverableTaxGlAccountId
        if (taxAmount.gt(0) && !glAccountId) {
            throw new BadRequestException(
                `Active tax code ${taxCode.code} is missing its ${taxCode.isRecoverable ? 'input tax' : 'non-recoverable tax'} G/L account.`,
            )
        }
        if (glAccountId) {
            await this.postingValidation.assertAccountPostable(
                input.companyId,
                glAccountId,
                'AUTOMATIC',
                input.currencyCode,
                undefined,
                input.postingDate,
            )
        }
        return {
            taxCodeId: taxCode.id,
            taxAmount,
            netAmount: money(calculation.netAmount),
            glAccountId,
            isRecoverable: taxCode.isRecoverable,
        }
    }

    private async resolveWithholdingTax(input: {
        taxCodeId: string | null
        companyId: string
        postingDate: Date
        currencyCode: string
        taxableAmount: Decimal
    }) {
        if (!input.taxCodeId) {
            return { taxCodeId: null as string | null, taxAmount: new Decimal(0), glAccountId: null as string | null }
        }
        const taxCode = await this.loadEffectiveTaxCode({
            taxCodeId: input.taxCodeId,
            companyId: input.companyId,
            postingDate: input.postingDate,
            type: 'withholding',
        })
        const calculation = this.taxCalculation.calculate({
            taxCodeId: taxCode.id,
            taxCode: taxCode.code,
            companyId: input.companyId,
            taxType: taxCode.taxType,
            calculationMethod: taxCode.calculationMethod,
            roundingMethod: taxCode.roundingMethod,
            roundingLevel: taxCode.roundingLevel,
            decimalPrecision: taxCode.decimalPrecision,
            isRecoverable: false,
            rate: taxCode.taxRates[0]
                ? { rate: taxCode.taxRates[0].rate, rateUnit: taxCode.taxRates[0].rateUnit }
                : null,
            amount: input.taxableAmount,
            transactionDate: input.postingDate.toISOString().slice(0, 10),
            transactionType: 'SUPPLIER_INVOICE',
        })
        const taxAmount = money(calculation.taxAmount)
        if (taxAmount.gt(0) && !taxCode.withholdingPayableGlAccountId) {
            throw new BadRequestException(
                `Active withholding tax code ${taxCode.code} is missing a withholding payable G/L account.`,
            )
        }
        if (taxCode.withholdingPayableGlAccountId) {
            await this.postingValidation.assertAccountPostable(
                input.companyId,
                taxCode.withholdingPayableGlAccountId,
                'AUTOMATIC',
                input.currencyCode,
                undefined,
                input.postingDate,
            )
        }
        return {
            taxCodeId: taxCode.id,
            taxAmount,
            glAccountId: taxCode.withholdingPayableGlAccountId,
        }
    }

    private async loadEffectiveTaxCode(input: {
        taxCodeId: string
        companyId: string
        postingDate: Date
        type: 'purchase' | 'withholding'
    }) {
        const taxCode = await this.prisma.ficoTaxCode.findFirst({
            where: {
                id: input.taxCodeId,
                status: 'ACTIVE',
                OR: [{ companyId: input.companyId }, { companyId: null }],
                ...(input.type === 'purchase'
                    ? { isPurchaseApplicable: true }
                    : { taxType: 'WITHHOLDING_TAX' }),
            },
            include: {
                taxRates: {
                    where: {
                        companyId: input.companyId,
                        status: 'ACTIVE',
                        effectiveFrom: { lte: input.postingDate },
                        OR: [
                            { effectiveTo: null },
                            { effectiveTo: { gte: input.postingDate } },
                        ],
                    },
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1,
                },
            },
        })
        if (!taxCode) {
            throw new BadRequestException(
                `No active ${input.type} tax code is effective for this company and posting date.`,
            )
        }
        if (!taxCode.taxRates.length && taxCode.calculationMethod !== 'NOT_APPLICABLE') {
            throw new BadRequestException(
                `Tax code ${taxCode.code} has no active effective tax rate.`,
            )
        }
        return taxCode
    }

    private buildGrIrAllocations(lines: Array<any>) {
        const allocations: Array<{
            invoiceLineId: string
            goodsReceiptLineId: string
            allocatedQuantity: Decimal
            allocatedAmount: Decimal
        }> = []
        for (const line of lines) {
            const quantity = money(line.invoicedQuantity)
            const lineNet = money(line.lineTotal).minus(money(line.taxAmount))
            for (const receipt of line.receipts ?? []) {
                const receiptQuantity = money(receipt.allocatedQuantity)
                const hasGrUnitCost =
                    receipt.goodsReceiptLine &&
                    receipt.goodsReceiptLine.unitCost !== null &&
                    receipt.goodsReceiptLine.unitCost !== undefined
                const amount = hasGrUnitCost
                    ? money(receipt.goodsReceiptLine.unitCost).mul(receiptQuantity)
                    : quantity.gt(0)
                      ? lineNet.mul(receiptQuantity).div(quantity)
                      : new Decimal(0)
                allocations.push({
                    invoiceLineId: line.id,
                    goodsReceiptLineId: receipt.goodsReceiptLineId,
                    allocatedQuantity: receiptQuantity,
                    allocatedAmount: amount.toDecimalPlaces(4),
                })
            }
        }
        return allocations
    }

    private assertPaymentOpenItems(input: {
        openItems: Array<any>
        allocations: Array<{ openItemId: string; amount: Decimal }>
        companyId: string
        supplierId: string
        currencyCode: string
    }) {
        if (input.openItems.length !== input.allocations.length) {
            throw new BadRequestException('One or more AP open items were not found.')
        }
        for (const allocation of input.allocations) {
            const item = input.openItems.find((row) => row.id === allocation.openItemId)
            if (!item) throw new BadRequestException('AP open item not found.')
            if (item.companyId !== input.companyId || item.supplierId !== input.supplierId) {
                throw new BadRequestException('AP open item does not belong to this supplier and company.')
            }
            if (!['OPEN', 'PARTIALLY_CLEARED'].includes(item.status)) {
                throw new BadRequestException('AP open item is not available for clearing.')
            }
            if (item.direction !== 'CREDIT') {
                throw new BadRequestException('Supplier credits and advances require an AP netting process, not an outgoing payment.')
            }
            if (item.paymentBlocked || item.document?.paymentBlocked) {
                throw new BadRequestException('An AP open item is payment-blocked.')
            }
            if (item.currencyCode !== input.currencyCode) {
                throw new BadRequestException('All payment allocations must use the open-item currency.')
            }
            if (!allocation.amount.gt(0) || allocation.amount.gt(money(item.openAmount))) {
                throw new BadRequestException('Payment allocation exceeds the remaining open-item amount.')
            }
        }
    }

    private assertClearingOpenItems(input: {
        openItems: Array<any>
        allocations: Array<{
            debitOpenItemId: string
            creditOpenItemId: string
            amount: Decimal
        }>
        companyId: string
        supplierId: string
        currencyCode: string
    }) {
        const itemIds = new Set(
            input.allocations.flatMap((allocation) => [
                allocation.debitOpenItemId,
                allocation.creditOpenItemId,
            ]),
        )
        if (input.openItems.length !== itemIds.size) {
            throw new BadRequestException('One or more AP clearing open items were not found.')
        }
        const applied = this.clearingAmountsByItem(input.allocations)
        for (const allocation of input.allocations) {
            const debitItem = input.openItems.find(
                (item) => item.id === allocation.debitOpenItemId,
            )
            const creditItem = input.openItems.find(
                (item) => item.id === allocation.creditOpenItemId,
            )
            if (!debitItem || !creditItem) {
                throw new BadRequestException('AP clearing open item not found.')
            }
            if (
                debitItem.companyId !== input.companyId ||
                creditItem.companyId !== input.companyId ||
                debitItem.supplierId !== input.supplierId ||
                creditItem.supplierId !== input.supplierId
            ) {
                throw new BadRequestException(
                    'AP clearing items must belong to the requested supplier and company.',
                )
            }
            if (debitItem.direction !== 'DEBIT' || creditItem.direction !== 'CREDIT') {
                throw new BadRequestException(
                    'AP clearing must pair a supplier credit/advance with a supplier liability.',
                )
            }
            if (
                !['OPEN', 'PARTIALLY_CLEARED'].includes(debitItem.status) ||
                !['OPEN', 'PARTIALLY_CLEARED'].includes(creditItem.status)
            ) {
                throw new BadRequestException('AP clearing item is not available for settlement.')
            }
            if (
                debitItem.currencyCode !== input.currencyCode ||
                creditItem.currencyCode !== input.currencyCode
            ) {
                throw new BadRequestException('AP clearing items must use the requested currency.')
            }
            if (
                debitItem.paymentBlocked ||
                creditItem.paymentBlocked ||
                debitItem.document?.paymentBlocked ||
                creditItem.document?.paymentBlocked
            ) {
                throw new BadRequestException('A payment-blocked AP item cannot be cleared.')
            }
            if (!debitItem.reconciliationAccountId || !creditItem.reconciliationAccountId) {
                throw new BadRequestException(
                    'AP clearing requires original supplier subledger account snapshots.',
                )
            }
        }
        for (const item of input.openItems) {
            const clearingAmount = applied.get(item.id) ?? new Decimal(0)
            if (!clearingAmount.gt(0) || clearingAmount.gt(money(item.openAmount))) {
                throw new BadRequestException(
                    'AP clearing allocation exceeds an open-item remaining amount.',
                )
            }
        }
    }

    private clearingAmountsByItem(
        allocations: Array<{
            debitOpenItemId: string
            creditOpenItemId: string
            amount: Decimal
        }>,
    ) {
        const result = new Map<string, Decimal>()
        for (const allocation of allocations) {
            for (const id of [
                allocation.debitOpenItemId,
                allocation.creditOpenItemId,
            ]) {
                result.set(
                    id,
                    (result.get(id) ?? new Decimal(0)).plus(allocation.amount),
                )
            }
        }
        return result
    }

    private async lockAndLoadOpenItems(
        tx: Prisma.TransactionClient,
        allocations: Array<{ openItemId: string; amount: Decimal }>,
    ) {
        for (const allocation of allocations) {
            await tx.$queryRaw`
                SELECT id FROM fico_ap_open_items
                WHERE id = ${allocation.openItemId}
                FOR UPDATE
            `
        }
        return tx.ficoApOpenItem.findMany({
            where: { id: { in: allocations.map((allocation) => allocation.openItemId) } },
            include: { document: true },
        })
    }

    private async lockAndLoadOpenItemIds(
        tx: Prisma.TransactionClient,
        openItemIds: string[],
    ) {
        for (const openItemId of [...new Set(openItemIds)]) {
            await tx.$queryRaw`
                SELECT id FROM fico_ap_open_items
                WHERE id = ${openItemId}
                FOR UPDATE
            `
        }
        return tx.ficoApOpenItem.findMany({
            where: { id: { in: openItemIds } },
            include: { document: true },
        })
    }

    private paymentIdempotencyKey(
        dto: CreateFicoApPaymentDto,
        allocations: Array<{ openItemId: string; amount: Decimal }>,
    ) {
        if (dto.idempotencyKey?.trim()) {
            return `AP_PAYMENT:${dto.companyId}:${dto.idempotencyKey.trim()}`
        }
        const signature = allocations
            .map((allocation) => `${allocation.openItemId}:${allocation.amount.toString()}`)
            .sort()
            .join('|')
        return [
            'AP_PAYMENT',
            dto.companyId,
            dto.supplierId,
            dto.paymentDate,
            dto.paymentReference?.trim() || '-',
            signature,
        ].join(':')
    }

    private addDays(date: Date, dueDays: number) {
        const result = new Date(date)
        result.setUTCDate(result.getUTCDate() + Math.max(0, Number(dueDays) || 0))
        return result
    }

    private async assertPaymentTerms(paymentTermsId: string | null | undefined) {
        if (!paymentTermsId) return
        const terms = await this.prisma.mmPaymentTerms.findFirst({
            where: { id: paymentTermsId, isActive: true, deletedAt: null },
            select: { id: true },
        })
        if (!terms) throw new BadRequestException('Active payment terms not found.')
    }

    private async assertTaxCodeForCompany(
        taxCodeId: string | null | undefined,
        companyId: string,
        type: 'purchase' | 'withholding',
    ) {
        if (!taxCodeId) return
        const code = await this.prisma.ficoTaxCode.findFirst({
            where: {
                id: taxCodeId,
                status: 'ACTIVE',
                OR: [{ companyId }, { companyId: null }],
                ...(type === 'purchase'
                    ? { isPurchaseApplicable: true }
                    : { taxType: 'WITHHOLDING_TAX' }),
            },
            select: { id: true },
        })
        if (!code) {
            throw new BadRequestException(`Active ${type} tax code not found for this company.`)
        }
    }

    async getReferenceData(
        companyId: string,
        supplierId: string | undefined,
        user: Actor,
    ) {
        await this.access.assertAccess(user, companyId)
        const settings = await this.prisma.ficoCompanyAccountingSettings.findUnique({
            where: { companyId },
            select: {
                companyId: true,
                chartOfAccountsId: true,
                baseCurrency: true,
                status: true,
            },
        })
        const coaFilter = settings?.chartOfAccountsId
            ? { chartOfAccountsId: settings.chartOfAccountsId }
            : {}

        const [
            reconciliationAccounts,
            bankGlAccounts,
            bankRules,
            paymentTerms,
            purchaseTaxCodes,
            withholdingTaxCodes,
            supplierBankAccounts,
            bankApprovals,
        ] = await Promise.all([
            this.prisma.ficoGlAccount.findMany({
                where: {
                    ...coaFilter,
                    isReconciliationAccount: true,
                    reconciliationType: 'AP',
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                    accountCode: true,
                    accountName: true,
                    isPostingAccount: true,
                    status: true,
                },
                orderBy: { accountCode: 'asc' },
            }),
            this.prisma.ficoGlAccount.findMany({
                where: {
                    ...coaFilter,
                    status: 'ACTIVE',
                    isPostingAccount: true,
                    accountType: 'ASSET',
                    isReconciliationAccount: false,
                    OR: [
                        { accountCode: { startsWith: '10' } },
                        { accountName: { contains: 'Bank', mode: 'insensitive' } },
                        { accountName: { contains: 'Cash', mode: 'insensitive' } },
                    ],
                },
                select: { id: true, accountCode: true, accountName: true },
                orderBy: { accountCode: 'asc' },
            }),
            this.prisma.ficoAccountDeterminationRule.findMany({
                where: {
                    companyId,
                    status: 'ACTIVE',
                    transactionKeyCode: 'BANK_ACCOUNT',
                },
                select: {
                    id: true,
                    determinationCode: true,
                    name: true,
                    paymentMethodCode: true,
                    bankAccountId: true,
                },
                orderBy: { priority: 'asc' },
            }),
            this.prisma.mmPaymentTerms.findMany({
                where: { isActive: true, deletedAt: null },
                select: { id: true, code: true, name: true, dueDays: true },
                orderBy: { dueDays: 'asc' },
            }),
            this.prisma.ficoTaxCode.findMany({
                where: {
                    status: 'ACTIVE',
                    isPurchaseApplicable: true,
                    OR: [{ companyId }, { companyId: null }],
                },
                include: {
                    taxRates: {
                        where: { status: 'ACTIVE' },
                        orderBy: { effectiveFrom: 'desc' },
                        take: 1,
                    },
                },
                orderBy: { code: 'asc' },
            }),
            this.prisma.ficoTaxCode.findMany({
                where: {
                    status: 'ACTIVE',
                    taxType: 'WITHHOLDING_TAX',
                    OR: [{ companyId }, { companyId: null }],
                },
                include: {
                    taxRates: {
                        where: { status: 'ACTIVE' },
                        orderBy: { effectiveFrom: 'desc' },
                        take: 1,
                    },
                },
                orderBy: { code: 'asc' },
            }),
            supplierId
                ? this.prisma.mmSupplierBankAccount.findMany({
                      where: { supplierId, isActive: true },
                      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                  })
                : Promise.resolve([]),
            supplierId
                ? this.prisma.ficoSupplierBankApproval.findMany({
                      where: {
                          companyId,
                          supplierCompanyAccount: { supplierId },
                      },
                      include: { supplierBankAccount: true },
                  })
                : Promise.resolve([]),
        ])

        return {
            companyId,
            baseCurrency: settings?.baseCurrency ?? 'PHP',
            reconciliationAccounts,
            bankGlAccounts,
            bankRules,
            paymentTerms,
            purchaseTaxCodes,
            withholdingTaxCodes,
            supplierBankAccounts,
            bankApprovals,
        }
    }

    async listDocuments(query: FicoApDocumentQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        const where: Prisma.FicoApDocumentWhereInput = {
            companyId: query.companyId,
            ...(query.supplierId ? { supplierId: query.supplierId } : {}),
            ...(query.documentType ? { documentType: query.documentType } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.search?.trim()
                ? {
                      OR: [
                          {
                              referenceNumber: {
                                  contains: query.search.trim(),
                                  mode: 'insensitive',
                              },
                          },
                          {
                              supplier: {
                                  supplierName: {
                                      contains: query.search.trim(),
                                      mode: 'insensitive',
                                  },
                              },
                          },
                      ],
                  }
                : {}),
        }
        return this.prisma.ficoApDocument.findMany({
            where,
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                taxCode: { select: { id: true, code: true, name: true } },
                withholdingTaxCode: { select: { id: true, code: true, name: true } },
                sourceSupplierInvoice: { select: { id: true, invoiceNumber: true } },
                journalEntry: { select: { id: true, documentNumber: true, status: true } },
                reversalJournalEntry: { select: { id: true, documentNumber: true } },
                openItem: {
                    select: {
                        id: true,
                        direction: true,
                        originalAmount: true,
                        openAmount: true,
                        status: true,
                        paymentBlocked: true,
                        dueDate: true,
                    },
                },
                _count: { select: { grirAllocations: true } },
            },
            orderBy: [{ postingDate: 'desc' }, { createdAt: 'desc' }],
        })
    }

    async getDocument(documentId: string, companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const document = await this.prisma.ficoApDocument.findFirst({
            where: { id: documentId, companyId },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                reconciliationAccount: {
                    select: { id: true, accountCode: true, accountName: true },
                },
                taxCode: { select: { id: true, code: true, name: true } },
                withholdingTaxCode: { select: { id: true, code: true, name: true } },
                sourceSupplierInvoice: {
                    select: { id: true, invoiceNumber: true, purchaseOrderId: true },
                },
                journalEntry: {
                    include: {
                        lines: {
                            include: {
                                glAccount: {
                                    select: { id: true, accountCode: true, accountName: true },
                                },
                            },
                            orderBy: { lineNumber: 'asc' },
                        },
                    },
                },
                reversalJournalEntry: { select: { id: true, documentNumber: true } },
                openItem: {
                    include: {
                        paymentAllocations: {
                            include: {
                                payment: {
                                    select: {
                                        id: true,
                                        paymentNumber: true,
                                        paymentDate: true,
                                        status: true,
                                    },
                                },
                            },
                        },
                    },
                },
                grirAllocations: true,
            },
        })
        if (!document) throw new NotFoundException('AP document not found.')
        return document
    }

    async listPayments(query: FicoApPaymentQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        return this.prisma.ficoApPayment.findMany({
            where: {
                companyId: query.companyId,
                ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                ...(query.status ? { status: query.status } : {}),
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                journalEntry: { select: { id: true, documentNumber: true, status: true } },
                reversalJournalEntry: { select: { id: true, documentNumber: true } },
                supplierBankApproval: {
                    include: {
                        supplierBankAccount: {
                            select: {
                                id: true,
                                bankName: true,
                                accountNumber: true,
                            },
                        },
                    },
                },
                allocations: {
                    include: {
                        openItem: {
                            select: {
                                id: true,
                                itemType: true,
                                document: { select: { id: true, referenceNumber: true } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        })
    }

    async listClearings(query: FicoApClearingQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)
        return this.prisma.ficoApClearing.findMany({
            where: {
                companyId: query.companyId,
                ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                ...(query.status ? { status: query.status } : {}),
            },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                journalEntry: { select: { id: true, documentNumber: true, status: true } },
                reversalJournalEntry: { select: { id: true, documentNumber: true } },
                allocations: {
                    include: {
                        debitOpenItem: {
                            select: {
                                id: true,
                                itemType: true,
                                document: { select: { id: true, referenceNumber: true } },
                            },
                        },
                        creditOpenItem: {
                            select: {
                                id: true,
                                itemType: true,
                                document: { select: { id: true, referenceNumber: true } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ clearingDate: 'desc' }, { createdAt: 'desc' }],
        })
    }

    async listHistoricalMigrationRuns(companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        return this.prisma.ficoHistoricalBackpostingRun.findMany({
            where: { companyId },
            include: {
                _count: { select: { apDocuments: true } },
                apDocuments: {
                    select: {
                        id: true,
                        supplierId: true,
                        referenceNumber: true,
                        liabilityAmount: true,
                        currencyCode: true,
                        status: true,
                    },
                    take: 50,
                },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async setOpenItemPaymentBlock(
        openItemId: string,
        dto: SetFicoApPaymentBlockDto,
        user: Actor,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        const item = await this.prisma.ficoApOpenItem.findUnique({
            where: { id: openItemId },
            include: { document: true },
        })
        if (!item || item.companyId !== dto.companyId) {
            throw new NotFoundException('AP open item not found.')
        }
        if (!['OPEN', 'PARTIALLY_CLEARED'].includes(item.status)) {
            throw new BadRequestException(
                'Only open or partially cleared AP items can change payment block status.',
            )
        }
        const reason = dto.reason?.trim() || null
        await this.prisma.$transaction(async (tx) => {
            await tx.ficoApOpenItem.update({
                where: { id: openItemId },
                data: { paymentBlocked: dto.blocked },
            })
            await tx.ficoApDocument.update({
                where: { id: item.documentId },
                data: { paymentBlocked: dto.blocked },
            })
            await tx.ficoAccountingAuditLog.create({
                data: {
                    companyId: dto.companyId,
                    actorId: user?.id ?? null,
                    action: dto.blocked
                        ? 'AP_OPEN_ITEM_PAYMENT_BLOCK'
                        : 'AP_OPEN_ITEM_PAYMENT_UNBLOCK',
                    entityType: 'FicoApOpenItem',
                    entityId: openItemId,
                    previousValues: { paymentBlocked: item.paymentBlocked },
                    newValues: { paymentBlocked: dto.blocked },
                    reason,
                },
            })
        })
        return this.prisma.ficoApOpenItem.findUnique({
            where: { id: openItemId },
            include: {
                supplier: { select: { id: true, supplierCode: true, supplierName: true } },
                document: { select: { id: true, referenceNumber: true, paymentBlocked: true } },
            },
        })
    }

    async getGrIrReconciliation(companyId: string, user: Actor) {
        await this.access.assertAccess(user, companyId)
        const [grirRules, grLines, postedAllocations, supplierReturns] = await Promise.all([
            this.prisma.ficoAccountDeterminationRule.findMany({
                where: {
                    companyId,
                    status: 'ACTIVE',
                    transactionKeyCode: { in: ['GR_IR', 'SUPPLIER_INVOICE'] },
                },
                include: {
                    lines: {
                        include: {
                            glAccount: {
                                select: { id: true, accountCode: true, accountName: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.mmGoodsReceiptLine.findMany({
                where: {
                    receipt: {
                        companyId,
                        status: 'POSTED',
                        receiptPurpose: 'PROCUREMENT',
                    },
                },
                include: {
                    receipt: {
                        select: {
                            id: true,
                            documentNumber: true,
                            postingDate: true,
                            supplierId: true,
                            supplier: {
                                select: { id: true, supplierCode: true, supplierName: true },
                            },
                            purchaseOrder: { select: { id: true, poNumber: true } },
                        },
                    },
                    material: { select: { id: true, materialCode: true, materialName: true } },
                },
                orderBy: { receipt: { postingDate: 'desc' } },
            }),
            this.prisma.ficoApGrIrAllocation.findMany({
                where: {
                    document: { companyId, status: 'POSTED' },
                },
                select: {
                    goodsReceiptLineId: true,
                    allocatedQuantity: true,
                    allocatedAmount: true,
                },
            }),
            this.prisma.mmSupplierReturnLine.findMany({
                where: {
                    goodsReceiptLineId: { not: null },
                    supplierReturn: {
                        companyId,
                        status: { in: ['POSTED', 'SHIPPED', 'CLOSED', 'COMPLETED'] },
                    },
                },
                select: {
                    goodsReceiptLineId: true,
                    quantity: true,
                    unitCost: true,
                },
            }),
        ])

        const grirAccountMap = new Map<
            string,
            { id: string; accountCode: string; accountName: string }
        >()
        for (const rule of grirRules) {
            for (const line of rule.lines) {
                if (
                    (rule.transactionKeyCode === 'GR_IR' && line.side === 'CREDIT') ||
                    (rule.transactionKeyCode === 'SUPPLIER_INVOICE' && line.side === 'DEBIT')
                ) {
                    grirAccountMap.set(line.glAccount.id, line.glAccount)
                }
            }
        }

        const grirAccountIds = [...grirAccountMap.keys()]
        const glRows = grirAccountIds.length
            ? await this.prisma.ficoJournalEntryLine.groupBy({
                  by: ['glAccountId'],
                  where: {
                      companyId,
                      glAccountId: { in: grirAccountIds },
                      journalEntry: { status: 'POSTED' },
                  },
                  _sum: { debitAmount: true, creditAmount: true },
              })
            : []
        const glByAccount = new Map(
            glRows.map((row) => [
                row.glAccountId,
                money(row._sum.creditAmount).minus(money(row._sum.debitAmount)),
            ]),
        )
        const grirAccounts = [...grirAccountMap.values()].map((acc) => ({
            ...acc,
            balance: glByAccount.get(acc.id) ?? new Decimal(0),
        }))
        const grirGlBalance = grirAccounts.reduce(
            (sum, acc) => sum.plus(acc.balance),
            new Decimal(0),
        )

        const invoicedMap = new Map<string, { qty: Decimal; amount: Decimal }>()
        for (const alloc of postedAllocations) {
            const cur = invoicedMap.get(alloc.goodsReceiptLineId) ?? {
                qty: new Decimal(0),
                amount: new Decimal(0),
            }
            cur.qty = cur.qty.plus(money(alloc.allocatedQuantity))
            cur.amount = cur.amount.plus(money(alloc.allocatedAmount))
            invoicedMap.set(alloc.goodsReceiptLineId, cur)
        }

        const returnedMap = new Map<string, { qty: Decimal; amount: Decimal }>()
        for (const ret of supplierReturns) {
            if (!ret.goodsReceiptLineId) continue
            const cur = returnedMap.get(ret.goodsReceiptLineId) ?? {
                qty: new Decimal(0),
                amount: new Decimal(0),
            }
            const qty = money(ret.quantity)
            cur.qty = cur.qty.plus(qty)
            cur.amount = cur.amount.plus(qty.mul(money(ret.unitCost)))
            returnedMap.set(ret.goodsReceiptLineId, cur)
        }

        const items = grLines.map((line) => {
            const receivedQty = money(line.quantity)
            const receivedAmount = money(line.totalCost)
            const invoiced = invoicedMap.get(line.id) ?? {
                qty: new Decimal(0),
                amount: new Decimal(0),
            }
            const returned = returnedMap.get(line.id) ?? {
                qty: new Decimal(0),
                amount: new Decimal(0),
            }
            const openQty = receivedQty.minus(invoiced.qty).minus(returned.qty)
            const openAmount = receivedAmount
                .minus(invoiced.amount)
                .minus(returned.amount)
                .toDecimalPlaces(4)
            return {
                goodsReceiptLineId: line.id,
                goodsReceiptId: line.receipt.id,
                goodsReceiptNumber: line.receipt.documentNumber,
                postingDate: line.receipt.postingDate,
                poNumber: line.receipt.purchaseOrder?.poNumber ?? null,
                supplierId: line.receipt.supplierId,
                supplier: line.receipt.supplier,
                material: line.material,
                receivedQuantity: receivedQty,
                invoicedQuantity: invoiced.qty,
                returnedQuantity: returned.qty,
                openQuantity: openQty,
                receivedAmount,
                invoicedAmount: invoiced.amount,
                returnedAmount: returned.amount,
                openAmount,
            }
        })

        const expectedGrIrBalance = items
            .reduce((sum, item) => sum.plus(item.openAmount), new Decimal(0))
            .toDecimalPlaces(4)
        const variance = grirGlBalance.minus(expectedGrIrBalance).toDecimalPlaces(4)

        return {
            companyId,
            grirAccounts,
            grirGlBalance,
            expectedGrIrBalance,
            variance,
            reconciled: variance.abs().lte(MONEY_TOLERANCE),
            openItems: items.filter((item) => item.openAmount.abs().gt(MONEY_TOLERANCE)),
            items,
        }
    }
}
