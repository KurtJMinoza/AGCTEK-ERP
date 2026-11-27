import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type FicoJournalFlowNode = {
    key: string
    documentType: string
    label: string
    documentId: string
    documentNumber?: string | null
    status?: string | null
    href?: string | null
    occurredAt?: string | null
    highlight?: boolean
}

@Injectable()
export class FicoJournalDocumentFlowService {
    constructor(private readonly prisma: PrismaService) {}

    async buildForJournal(journalId: string): Promise<FicoJournalFlowNode[]> {
        const journal = await this.prisma.ficoJournalEntry.findUnique({
            where: { id: journalId },
            select: {
                id: true,
                documentNumber: true,
                documentType: true,
                status: true,
                postingDate: true,
                sourceModule: true,
                sourceDocumentType: true,
                sourceDocumentId: true,
                mmAccountingEventId: true,
                reversalOfId: true,
                reversedBy: { select: { id: true, documentNumber: true, status: true } },
                reversalOf: {
                    select: { id: true, documentNumber: true, status: true, documentType: true },
                },
                apDocument: {
                    select: {
                        id: true,
                        referenceNumber: true,
                        status: true,
                        openItem: { select: { id: true, status: true } },
                    },
                },
                apPayment: { select: { id: true, paymentNumber: true, status: true } },
                apClearing: { select: { id: true, clearingNumber: true, status: true } },
                arDocument: {
                    select: {
                        id: true,
                        referenceNumber: true,
                        status: true,
                        openItem: { select: { id: true, status: true } },
                    },
                },
                arPayment: { select: { id: true, paymentNumber: true, status: true } },
                arClearing: { select: { id: true, clearingNumber: true, status: true } },
                mmAccountingEvent: {
                    select: {
                        id: true,
                        eventType: true,
                        documentType: true,
                        documentId: true,
                        sourceDocumentNumber: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        })

        if (!journal) throw new NotFoundException('Journal entry not found.')

        const nodes: FicoJournalFlowNode[] = []

        const push = (node: FicoJournalFlowNode) => {
            if (!nodes.some((n) => n.key === node.key)) nodes.push(node)
        }

        if (journal.mmAccountingEvent) {
            const ev = journal.mmAccountingEvent
            push({
                key: `event:${ev.id}`,
                documentType: 'ACCOUNTING_EVENT',
                label: 'Accounting event',
                documentId: ev.id,
                documentNumber: ev.sourceDocumentNumber,
                status: ev.status,
                occurredAt: ev.createdAt.toISOString(),
                href: null,
            })
            push({
                key: `source:${ev.documentType}:${ev.documentId}`,
                documentType: ev.documentType,
                label: ev.documentType.replace(/_/g, ' '),
                documentId: ev.documentId,
                documentNumber: ev.sourceDocumentNumber,
                href: this.resolveHref(ev.documentType, ev.documentId, journal.sourceModule),
            })
        } else if (journal.sourceDocumentId && journal.sourceDocumentType) {
            push({
                key: `source:${journal.sourceDocumentType}:${journal.sourceDocumentId}`,
                documentType: journal.sourceDocumentType,
                label: journal.sourceDocumentType.replace(/_/g, ' '),
                documentId: journal.sourceDocumentId,
                href: this.resolveHref(
                    journal.sourceDocumentType,
                    journal.sourceDocumentId,
                    journal.sourceModule,
                ),
            })
        }

        if (journal.apDocument) {
            const doc = journal.apDocument
            push({
                key: `ap-doc:${doc.id}`,
                documentType: 'AP_DOCUMENT',
                label: 'Supplier invoice / AP document',
                documentId: doc.id,
                documentNumber: doc.referenceNumber,
                status: doc.status,
                href: `/modules/fico/accounts-payable/documents/${doc.id}`,
            })
            if (doc.openItem) {
                push({
                    key: `ap-oi:${doc.openItem.id}`,
                    documentType: 'AP_OPEN_ITEM',
                    label: 'AP open item',
                    documentId: doc.openItem.id,
                    status: doc.openItem.status,
                    href: `/modules/fico/accounts-payable?tab=open-items`,
                })
            }
        }

        if (journal.apPayment) {
            const p = journal.apPayment
            push({
                key: `ap-pay:${p.id}`,
                documentType: 'AP_PAYMENT',
                label: 'Supplier payment',
                documentId: p.id,
                documentNumber: p.paymentNumber,
                status: p.status,
                href: `/modules/fico/accounts-payable?tab=payments`,
            })
        }

        if (journal.apClearing) {
            const c = journal.apClearing
            push({
                key: `ap-clr:${c.id}`,
                documentType: 'AP_CLEARING',
                label: 'AP clearing',
                documentId: c.id,
                documentNumber: c.clearingNumber,
                status: c.status,
                href: `/modules/fico/accounts-payable?tab=clearings`,
            })
        }

        if (journal.arDocument) {
            const doc = journal.arDocument
            push({
                key: `ar-doc:${doc.id}`,
                documentType: 'AR_DOCUMENT',
                label: 'Customer billing / AR document',
                documentId: doc.id,
                documentNumber: doc.referenceNumber,
                status: doc.status,
                href: `/modules/fico/accounts-receivable`,
            })
            if (doc.openItem) {
                push({
                    key: `ar-oi:${doc.openItem.id}`,
                    documentType: 'AR_OPEN_ITEM',
                    label: 'AR open item',
                    documentId: doc.openItem.id,
                    status: doc.openItem.status,
                    href: `/modules/fico/accounts-receivable?tab=open-items`,
                })
            }
        }

        if (journal.arPayment) {
            const p = journal.arPayment
            push({
                key: `ar-pay:${p.id}`,
                documentType: 'AR_PAYMENT',
                label: 'Customer collection',
                documentId: p.id,
                documentNumber: p.paymentNumber,
                status: p.status,
                href: `/modules/fico/accounts-receivable?tab=payments`,
            })
        }

        if (journal.arClearing) {
            const c = journal.arClearing
            push({
                key: `ar-clr:${c.id}`,
                documentType: 'AR_CLEARING',
                label: 'AR clearing',
                documentId: c.id,
                documentNumber: c.clearingNumber,
                status: c.status,
                href: `/modules/fico/accounts-receivable?tab=clearings`,
            })
        }

        push({
            key: `journal:${journal.id}`,
            documentType: 'JOURNAL_ENTRY',
            label: 'Posted journal',
            documentId: journal.id,
            documentNumber: journal.documentNumber,
            status: journal.status,
            occurredAt: journal.postingDate.toISOString(),
            href: `/modules/fico/journal-entries/${journal.id}`,
            highlight: true,
        })

        if (journal.reversalOf) {
            push({
                key: `journal:${journal.reversalOf.id}`,
                documentType: 'JOURNAL_ENTRY',
                label: 'Original journal',
                documentId: journal.reversalOf.id,
                documentNumber: journal.reversalOf.documentNumber,
                status: journal.reversalOf.status,
                href: `/modules/fico/journal-entries/${journal.reversalOf.id}`,
            })
        }

        if (journal.reversedBy) {
            push({
                key: `journal:${journal.reversedBy.id}`,
                documentType: 'JOURNAL_ENTRY',
                label: 'Reversal journal',
                documentId: journal.reversedBy.id,
                documentNumber: journal.reversedBy.documentNumber,
                status: journal.reversedBy.status,
                href: `/modules/fico/journal-entries/${journal.reversedBy.id}`,
            })
        }

        return nodes
    }

    private resolveHref(
        documentType: string,
        documentId: string,
        sourceModule?: string | null,
    ): string | null {
        switch (documentType) {
            case 'PURCHASE_ORDER':
                return `/modules/mm/procurement/purchase-orders/${documentId}`
            case 'GOODS_RECEIPT':
                return `/modules/mm/inventory-management/goods-receipt`
            case 'GOODS_ISSUE':
                return `/modules/mm/inventory-management/goods-issue`
            case 'SALES_ORDER':
                return `/modules/sd/sales-orders/${documentId}`
            case 'SALES_INVOICE':
            case 'BILLING':
                return `/modules/sd/sales-invoices/${documentId}`
            case 'POS_CHECKOUT':
            case 'POS_TRANSACTION':
                return `/modules/sd/pos`
            default:
                if (sourceModule === 'SD') {
                    return `/modules/sd/sales-orders/${documentId}`
                }
                if (sourceModule === 'MM') {
                    return `/modules/mm/inventory-management/inventory-ledger`
                }
                return null
        }
    }
}