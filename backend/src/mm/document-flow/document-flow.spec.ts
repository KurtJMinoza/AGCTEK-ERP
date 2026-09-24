/**
 * Phase 4: Universal MM document flow / relationship engine
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { DocumentFlowService } from './document-flow.service'

describe('DocumentFlowService (Phase 4)', () => {
    const stores = {
        po: new Map<string, any>(),
        pr: new Map<string, any>(),
        rfq: new Map<string, any>(),
        quotation: new Map<string, any>(),
        asn: new Map<string, any>(),
        er: new Map<string, any>(),
        receiving: new Map<string, any>(),
        gr: new Map<string, any>(),
        lot: new Map<string, any>(),
        decision: new Map<string, any>(),
        putaway: new Map<string, any>(),
        reservation: new Map<string, any>(),
        allocation: new Map<string, any>(),
        pick: new Map<string, any>(),
        pack: new Map<string, any>(),
        gi: new Map<string, any>(),
        sto: new Map<string, any>(),
        shipment: new Map<string, any>(),
        treceipt: new Map<string, any>(),
        txn: new Map<string, any>(),
        accounting: new Map<string, any>(),
    }

    const mockPrisma: any = {
        mmPurchaseOrder: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.po.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) => {
                const rows = [...stores.po.values()].filter((po) => {
                    if (where.id) return where.id === po.id
                    if (where.companyId && po.companyId !== where.companyId) return false
                    if (where.purchaseOrderId && po.id !== where.purchaseOrderId) return false
                    if (where.rfqId && po.rfqId !== where.rfqId) return false
                    if (where.quotationId && po.quotationId !== where.quotationId) return false
                    return true
                })
                return Promise.resolve(rows)
            }),
        },
        mmPurchaseRequisition: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.pr.get(where.id) ?? null),
            ),
        },
        mmRfq: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.rfq.get(where.id) ?? null),
            ),
        },
        mmSupplierQuotation: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.quotation.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.quotation.values()].filter(
                        (q) =>
                            (!where.companyId || q.companyId === where.companyId) &&
                            (!where.rfqId || q.rfqId === where.rfqId),
                    ),
                ),
            ),
        },
        mmAsn: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.asn.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.asn.values()].filter(
                        (a) =>
                            a.companyId === where.companyId &&
                            a.purchaseOrderId === where.purchaseOrderId,
                    ),
                ),
            ),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.asn.values()].find(
                        (a) => a.id === where.id && a.companyId === where.companyId,
                    ) ?? null,
                ),
            ),
        },
        mmExpectedReceipt: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.er.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) => {
                const rows = [...stores.er.values()].filter((er) => {
                    if (where.companyId && er.companyId !== where.companyId) return false
                    if (where.purchaseOrderId && er.purchaseOrderId !== where.purchaseOrderId)
                        return false
                    if (where.asnId && er.asnId !== where.asnId) return false
                    return true
                })
                return Promise.resolve(rows)
            }),
        },
        mmReceivingDocument: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.receiving.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.receiving.values()].filter(
                        (r) =>
                            r.companyId === where.companyId &&
                            r.expectedReceiptId === where.expectedReceiptId,
                    ),
                ),
            ),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.receiving.values()].find(
                        (r) => r.id === where.id && r.companyId === where.companyId,
                    ) ?? null,
                ),
            ),
        },
        mmGoodsReceipt: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.gr.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) => {
                const rows = [...stores.gr.values()].filter((gr) => {
                    if (where.companyId && gr.companyId !== where.companyId) return false
                    if (where.purchaseOrderId && gr.purchaseOrderId !== where.purchaseOrderId)
                        return false
                    if (where.expectedReceiptId && gr.expectedReceiptId !== where.expectedReceiptId)
                        return false
                    if (where.asnId && gr.asnId !== where.asnId) return false
                    if (
                        where.receivingDocumentId &&
                        gr.receivingDocumentId !== where.receivingDocumentId
                    )
                        return false
                    return true
                })
                return Promise.resolve(rows)
            }),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.gr.values()].find(
                        (gr) =>
                            gr.receivingDocumentId === where.receivingDocumentId &&
                            gr.companyId === where.companyId,
                    ) ?? null,
                ),
            ),
        },
        mmInspectionLot: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.lot.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) => {
                const rows = [...stores.lot.values()].filter((lot) => {
                    if (where.companyId && lot.companyId !== where.companyId) return false
                    if (where.goodsReceiptId && lot.goodsReceiptId !== where.goodsReceiptId)
                        return false
                    if (
                        where.receivingDocumentId &&
                        lot.receivingDocumentId !== where.receivingDocumentId
                    )
                        return false
                    return true
                })
                return Promise.resolve(rows)
            }),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.lot.values()].find(
                        (lot) => lot.id === where.id && lot.companyId === where.companyId,
                    ) ?? null,
                ),
            ),
        },
        mmQualityDecision: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.decision.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.decision.values()].filter(
                        (d) => d.inspectionLotId === where.inspectionLotId,
                    ),
                ),
            ),
        },
        wmPutawayTask: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.putaway.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.putaway.values()].filter(
                        (p) => p.goodsReceiptId === where.goodsReceiptId,
                    ),
                ),
            ),
        },
        mmInventoryReservationHeader: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.reservation.get(where.id) ?? null),
            ),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.reservation.values()].find(
                        (r) => r.id === where.id && r.companyId === where.companyId,
                    ) ?? null,
                ),
            ),
        },
        mmInventoryAllocation: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.allocation.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.allocation.values()].filter(
                        (a) => a.headerId === where.headerId,
                    ),
                ),
            ),
        },
        wmPickingTask: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.pick.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.pick.values()].filter(
                        (p) =>
                            p.reservationHeaderId === where.reservationHeaderId &&
                            p.companyId === where.companyId,
                    ),
                ),
            ),
        },
        wmPackingSession: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.pack.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.pack.values()].filter(
                        (p) => p.pickingTaskId === where.pickingTaskId,
                    ),
                ),
            ),
            findFirst: jest.fn(({ where }: any) =>
                Promise.resolve(stores.pack.get(where.id) ?? null),
            ),
        },
        mmGoodsIssue: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.gi.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) => {
                const rows = [...stores.gi.values()].filter((gi) => {
                    if (where.companyId && gi.companyId !== where.companyId) return false
                    if (
                        where.reservationHeaderId &&
                        gi.reservationHeaderId !== where.reservationHeaderId
                    )
                        return false
                    if (where.packageId && gi.packageId !== where.packageId) return false
                    return true
                })
                return Promise.resolve(rows)
            }),
        },
        mmStockTransferOrder: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.sto.get(where.id) ?? null),
            ),
        },
        mmTransferShipment: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.shipment.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.shipment.values()].filter(
                        (s) => s.orderId === where.orderId,
                    ),
                ),
            ),
        },
        mmTransferReceipt: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.treceipt.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.treceipt.values()].filter(
                        (r) => r.orderId === where.orderId,
                    ),
                ),
            ),
        },
        mmInventoryTransaction: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.txn.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.txn.values()].filter(
                        (t) =>
                            t.companyId === where.companyId &&
                            t.sourceDocumentType === where.sourceDocumentType &&
                            t.sourceDocumentId === where.sourceDocumentId,
                    ),
                ),
            ),
        },
        mmAccountingEvent: {
            findUnique: jest.fn(({ where }: any) =>
                Promise.resolve(stores.accounting.get(where.id) ?? null),
            ),
            findMany: jest.fn(({ where }: any) =>
                Promise.resolve(
                    [...stores.accounting.values()].filter((e) => {
                        if (where.companyId && e.companyId !== where.companyId) return false
                        if (where.OR) {
                            return where.OR.some(
                                (clause: any) =>
                                    (clause.documentType === e.documentType &&
                                        clause.documentId === e.documentId) ||
                                    clause.sourceTransactionId === e.sourceTransactionId,
                            )
                        }
                        return true
                    }),
                ),
            ),
        },
    }

    let service: DocumentFlowService

    beforeEach(async () => {
        Object.values(stores).forEach((m) => m.clear())
        jest.clearAllMocks()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DocumentFlowService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(DocumentFlowService)
    })

    function seedP2PChain(opts?: { grStatus?: string }) {
        const created = new Date('2026-01-01')
        stores.pr.set('pr-1', {
            id: 'pr-1',
            requisitionNumber: 'PR-100',
            status: 'CONVERTED',
            createdAt: created,
            companyId: 'co-1',
            rfqs: [],
            purchaseOrders: [{ id: 'po-1', poNumber: 'PO-100', status: 'SENT', createdAt: created, companyId: 'co-1' }],
        })
        stores.rfq.set('rfq-1', {
            id: 'rfq-1',
            rfqNumber: 'RFQ-100',
            status: 'AWARDED',
            createdAt: created,
            companyId: 'co-1',
            purchaseRequisition: stores.pr.get('pr-1'),
        })
        stores.quotation.set('q-1', {
            id: 'q-1',
            quotationNumber: 'QUO-100',
            status: 'ACCEPTED',
            createdAt: created,
            companyId: 'co-1',
            rfq: stores.rfq.get('rfq-1'),
        })
        stores.po.set('po-1', {
            id: 'po-1',
            poNumber: 'PO-100',
            status: 'SENT',
            createdAt: created,
            companyId: 'co-1',
            purchaseRequisition: stores.pr.get('pr-1'),
            rfq: stores.rfq.get('rfq-1'),
            quotation: stores.quotation.get('q-1'),
        })
        stores.asn.set('asn-1', {
            id: 'asn-1',
            asnNumber: 'ASN-100',
            status: 'CONFIRMED',
            createdAt: created,
            companyId: 'co-1',
            purchaseOrderId: 'po-1',
            purchaseOrder: stores.po.get('po-1'),
        })
        stores.er.set('er-1', {
            id: 'er-1',
            documentNumber: 'ER-100',
            status: 'OPEN',
            createdAt: created,
            companyId: 'co-1',
            purchaseOrderId: 'po-1',
            asnId: 'asn-1',
            purchaseOrder: stores.po.get('po-1'),
            asn: stores.asn.get('asn-1'),
        })
        stores.receiving.set('rcv-1', {
            id: 'rcv-1',
            documentNumber: 'RCV-100',
            status: 'POSTED',
            createdAt: created,
            companyId: 'co-1',
            expectedReceiptId: 'er-1',
            expectedReceipt: stores.er.get('er-1'),
        })
        stores.gr.set('gr-1', {
            id: 'gr-1',
            documentNumber: 'GR-100',
            status: opts?.grStatus ?? 'POSTED',
            createdAt: created,
            companyId: 'co-1',
            purchaseOrderId: 'po-1',
            expectedReceiptId: 'er-1',
            asnId: 'asn-1',
            receivingDocumentId: 'rcv-1',
        })
        stores.lot.set('lot-1', {
            id: 'lot-1',
            lotNumber: 'LOT-100',
            status: 'DECIDED',
            createdAt: created,
            companyId: 'co-1',
            goodsReceiptId: 'gr-1',
        })
        stores.decision.set('qd-1', {
            id: 'qd-1',
            decisionCode: 'ACCEPT',
            decidedAt: created,
            inspectionLotId: 'lot-1',
            inspectionLot: stores.lot.get('lot-1'),
        })
        stores.putaway.set('put-1', {
            id: 'put-1',
            taskNumber: 'PUT-100',
            status: 'COMPLETED',
            createdAt: created,
            companyId: 'co-1',
            goodsReceiptId: 'gr-1',
            goodsReceipt: { companyId: 'co-1' },
        })
        stores.txn.set('txn-1', {
            id: 'txn-1',
            transactionNumber: 'TXN-100',
            movementType: 'RECEIPT',
            createdAt: created,
            companyId: 'co-1',
            sourceDocumentType: 'GOODS_RECEIPT',
            sourceDocumentId: 'gr-1',
        })
        stores.accounting.set('acct-1', {
            id: 'acct-1',
            eventType: 'GoodsReceiptPosted',
            status: 'CONSUMED',
            createdAt: created,
            companyId: 'co-1',
            documentType: 'GOODS_RECEIPT',
            documentId: 'gr-1',
            sourceTransactionId: 'txn-1',
        })
    }

    it('resolves full P2P document chain from purchase order', async () => {
        seedP2PChain()
        const flow = await service.getFlow('PURCHASE_ORDER', 'po-1')

        expect(flow.current.documentType).toBe('PURCHASE_ORDER')
        expect(flow.upstream.some((n) => n.documentType === 'PURCHASE_REQUISITION')).toBe(true)
        expect(flow.upstream.some((n) => n.documentType === 'RFQ')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'ASN')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'EXPECTED_RECEIPT')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'RECEIVING_DOCUMENT')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'GOODS_RECEIPT')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'INSPECTION_LOT')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'PUTAWAY_TASK')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'INVENTORY_TRANSACTION')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'ACCOUNTING_EVENT')).toBe(true)
    })

    it('resolves outbound reservation → GI chain', async () => {
        const created = new Date('2026-02-01')
        stores.reservation.set('res-1', {
            id: 'res-1',
            reservationNumber: 'RES-100',
            status: 'ISSUED',
            createdAt: created,
            companyId: 'co-1',
        })
        stores.allocation.set('alloc-1', {
            id: 'alloc-1',
            allocationNumber: 'ALC-100',
            status: 'COMPLETED',
            createdAt: created,
            headerId: 'res-1',
            header: stores.reservation.get('res-1'),
        })
        stores.pick.set('pick-1', {
            id: 'pick-1',
            taskNumber: 'PICK-100',
            status: 'COMPLETED',
            createdAt: created,
            companyId: 'co-1',
            reservationHeaderId: 'res-1',
        })
        stores.pack.set('pack-1', {
            id: 'pack-1',
            sessionNumber: 'PACK-100',
            status: 'COMPLETED',
            createdAt: created,
            pickingTaskId: 'pick-1',
            pickingTask: stores.pick.get('pick-1'),
        })
        stores.gi.set('gi-1', {
            id: 'gi-1',
            documentNumber: 'GI-100',
            status: 'POSTED',
            createdAt: created,
            companyId: 'co-1',
            reservationHeaderId: 'res-1',
            packageId: 'pack-1',
        })
        stores.txn.set('txn-gi-1', {
            id: 'txn-gi-1',
            transactionNumber: 'TXN-GI-100',
            movementType: 'ISSUE',
            createdAt: created,
            companyId: 'co-1',
            sourceDocumentType: 'GOODS_ISSUE',
            sourceDocumentId: 'gi-1',
        })

        const flow = await service.getFlow('RESERVATION', 'res-1')
        expect(flow.current.documentType).toBe('RESERVATION')
        expect(flow.downstream.some((n) => n.documentType === 'ALLOCATION')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'PICK_TASK')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'GOODS_ISSUE')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'INVENTORY_TRANSACTION')).toBe(true)
    })

    it('resolves STO transfer chain', async () => {
        const created = new Date('2026-03-01')
        stores.sto.set('sto-1', {
            id: 'sto-1',
            orderNumber: 'STO-100',
            status: 'IN_TRANSIT',
            createdAt: created,
            companyId: 'co-1',
            reservationHeaderId: 'res-sto-1',
        })
        stores.reservation.set('res-sto-1', {
            id: 'res-sto-1',
            reservationNumber: 'RES-STO-100',
            status: 'ALLOCATED',
            createdAt: created,
            companyId: 'co-1',
        })
        stores.shipment.set('ship-1', {
            id: 'ship-1',
            shipmentNumber: 'SHIP-100',
            status: 'DISPATCHED',
            createdAt: created,
            orderId: 'sto-1',
            order: stores.sto.get('sto-1'),
        })
        stores.treceipt.set('trcv-1', {
            id: 'trcv-1',
            receiptNumber: 'TRCV-100',
            status: 'POSTED',
            createdAt: created,
            orderId: 'sto-1',
            order: stores.sto.get('sto-1'),
            shipment: stores.shipment.get('ship-1'),
        })

        const flow = await service.getFlow('STO', 'sto-1')
        expect(flow.current.documentType).toBe('STO')
        expect(flow.downstream.some((n) => n.documentType === 'TRANSFER_SHIPMENT')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'TRANSFER_RECEIPT')).toBe(true)
        expect(
            flow.upstream.some((n) => n.documentType === 'RESERVATION') ||
                flow.downstream.some((n) => n.documentType === 'RESERVATION'),
        ).toBe(true)
    })

    it('handles missing/cancelled downstream documents gracefully', async () => {
        seedP2PChain({ grStatus: 'CANCELLED' })
        stores.gr.delete('gr-1')
        stores.lot.clear()
        stores.putaway.clear()

        const flow = await service.getFlow('PURCHASE_ORDER', 'po-1')
        expect(flow.current.documentType).toBe('PURCHASE_ORDER')
        expect(flow.downstream.some((n) => n.documentType === 'EXPECTED_RECEIPT')).toBe(true)
        expect(flow.downstream.some((n) => n.documentType === 'GOODS_RECEIPT')).toBe(false)
    })

    it('denies cross-company visibility when companyId query mismatches', async () => {
        seedP2PChain()
        await expect(
            service.getFlow('PURCHASE_ORDER', 'po-1', { companyId: 'co-other' }),
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws when document not found', async () => {
        await expect(service.getFlow('PURCHASE_ORDER', 'missing')).rejects.toBeInstanceOf(
            NotFoundException,
        )
    })
})
