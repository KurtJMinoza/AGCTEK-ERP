import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type {
    DocumentFlowResponse,
    FlowGraph,
    MmDocumentFlowType,
    ScopedFlowNode,
} from './document-flow.types'
import { MM_DOCUMENT_FLOW_TYPES } from './document-flow.types'
import {
    assertSameCompany,
    dedupeNodes,
    normalizeDocumentType,
    partitionGraph,
    toFlowNode,
} from './document-flow.util'

const P2P_PHASE: Record<string, number> = {
    PURCHASE_REQUISITION: 10,
    RFQ: 20,
    QUOTATION: 30,
    PURCHASE_ORDER: 40,
    ASN: 50,
    EXPECTED_RECEIPT: 55,
    RECEIVING_DOCUMENT: 60,
    GOODS_RECEIPT: 70,
    INSPECTION_LOT: 80,
    QUALITY_DECISION: 85,
    PUTAWAY_TASK: 90,
    INVENTORY_TRANSACTION: 100,
    ACCOUNTING_EVENT: 110,
}

const OUTBOUND_PHASE: Record<string, number> = {
    RESERVATION: 20,
    ALLOCATION: 30,
    PICK_TASK: 40,
    PACK_SESSION: 50,
    GOODS_ISSUE: 60,
    INVENTORY_TRANSACTION: 70,
    ACCOUNTING_EVENT: 80,
}

const TRANSFER_PHASE: Record<string, number> = {
    STO: 10,
    RESERVATION: 15,
    ALLOCATION: 20,
    TRANSFER_SHIPMENT: 30,
    INVENTORY_TRANSACTION: 40,
    TRANSFER_RECEIPT: 50,
}

@Injectable()
export class DocumentFlowService {
    constructor(private prisma: PrismaService) {}

    async getFlow(
        documentType: string,
        documentId: string,
        opts?: { companyId?: string },
    ): Promise<DocumentFlowResponse> {
        const type = normalizeDocumentType(documentType) as MmDocumentFlowType
        if (!MM_DOCUMENT_FLOW_TYPES.includes(type)) {
            throw new NotFoundException(`Unsupported document type: ${documentType}`)
        }

        const graph = await this.resolveGraph(type, documentId)
        if (!assertSameCompany(graph.companyId, opts?.companyId)) {
            throw new ForbiddenException('Cross-company document flow access denied')
        }

        const phaseMap = this.phaseMapFor(type, graph)
        const anchorPhase = phaseMap[graph.current.documentType] ?? 50

        return partitionGraph(graph, anchorPhase, (node) =>
            phaseMap[node.documentType] ?? anchorPhase,
        )
    }

    /** Legacy PO document-flow shape for backward compatibility. */
    async getPoLegacyFlow(poId: string) {
        const flow = await this.getFlow('PURCHASE_ORDER', poId)
        const find = (t: string) =>
            flow.upstream.find((n) => n.documentType === t) ??
            (flow.current.documentType === t ? flow.current : undefined)
        const pr = find('PURCHASE_REQUISITION')
        const rfq = find('RFQ')
        const quotation = find('QUOTATION')
        return {
            purchaseOrder: {
                id: flow.current.documentId,
                number: flow.current.displayNumber,
                status: flow.current.status,
            },
            purchaseRequisition: pr
                ? { id: pr.documentId, number: pr.displayNumber }
                : null,
            rfq: rfq ? { id: rfq.documentId, number: rfq.displayNumber } : null,
            quotation: quotation
                ? { id: quotation.documentId, number: quotation.displayNumber }
                : null,
            award: null,
            goodsReceipts: flow.downstream
                .filter((n) => n.documentType === 'GOODS_RECEIPT')
                .map((gr) => ({
                    id: gr.documentId,
                    number: gr.displayNumber,
                    status: gr.status,
                    postingDate: gr.createdAt,
                })),
        }
    }

    private phaseMapFor(type: MmDocumentFlowType, graph: FlowGraph) {
        const types = new Set([
            graph.current.documentType,
            ...graph.related.map((n) => n.documentType),
        ])
        if ([...types].some((t) => TRANSFER_PHASE[t] != null && t === 'STO')) {
            return TRANSFER_PHASE
        }
        if (
            [...types].some((t) =>
                ['RESERVATION', 'ALLOCATION', 'PICK_TASK', 'PACK_SESSION', 'GOODS_ISSUE'].includes(
                    t,
                ),
            ) &&
            ![...types].some((t) => P2P_PHASE[t] != null && t === 'PURCHASE_ORDER')
        ) {
            return OUTBOUND_PHASE
        }
        return P2P_PHASE
    }

    private async resolveGraph(
        type: MmDocumentFlowType,
        id: string,
    ): Promise<FlowGraph> {
        switch (type) {
            case 'PURCHASE_REQUISITION':
                return this.fromPurchaseRequisition(id)
            case 'RFQ':
                return this.fromRfq(id)
            case 'QUOTATION':
                return this.fromQuotation(id)
            case 'PURCHASE_ORDER':
                return this.fromPurchaseOrder(id)
            case 'ASN':
                return this.fromAsn(id)
            case 'EXPECTED_RECEIPT':
                return this.fromExpectedReceipt(id)
            case 'RECEIVING_DOCUMENT':
                return this.fromReceivingDocument(id)
            case 'GOODS_RECEIPT':
                return this.fromGoodsReceipt(id)
            case 'INSPECTION_LOT':
                return this.fromInspectionLot(id)
            case 'QUALITY_DECISION':
                return this.fromQualityDecision(id)
            case 'PUTAWAY_TASK':
                return this.fromPutawayTask(id)
            case 'RESERVATION':
                return this.fromReservation(id)
            case 'ALLOCATION':
                return this.fromAllocation(id)
            case 'PICK_TASK':
                return this.fromPickTask(id)
            case 'PACK_SESSION':
                return this.fromPackSession(id)
            case 'GOODS_ISSUE':
                return this.fromGoodsIssue(id)
            case 'STO':
                return this.fromSto(id)
            case 'TRANSFER_SHIPMENT':
                return this.fromTransferShipment(id)
            case 'TRANSFER_RECEIPT':
                return this.fromTransferReceipt(id)
            case 'INVENTORY_TRANSACTION':
                return this.fromInventoryTransaction(id)
            case 'ACCOUNTING_EVENT':
                return this.fromAccountingEvent(id)
            default:
                throw new NotFoundException(`Unsupported document type: ${type}`)
        }
    }

    private buildGraph(
        current: ScopedFlowNode,
        related: ScopedFlowNode[],
    ): FlowGraph {
        return {
            companyId: current.companyId,
            current,
            related: dedupeNodes(related),
        }
    }

    private async fromPurchaseRequisition(id: string): Promise<FlowGraph> {
        const pr = await this.prisma.mmPurchaseRequisition.findUnique({
            where: { id },
            include: {
                rfqs: { select: { id: true, rfqNumber: true, status: true, createdAt: true, companyId: true } },
                purchaseOrders: {
                    select: { id: true, poNumber: true, status: true, createdAt: true, companyId: true },
                },
            },
        })
        if (!pr) throw new NotFoundException('Purchase requisition not found')

        const current = toFlowNode({
            documentType: 'PURCHASE_REQUISITION',
            documentId: pr.id,
            status: pr.status,
            displayNumber: pr.requisitionNumber,
            createdAt: pr.createdAt,
            companyId: pr.companyId,
        })

        const related: ScopedFlowNode[] = []
        for (const rfq of pr.rfqs) {
            if (rfq.companyId !== pr.companyId) continue
            related.push(
                toFlowNode({
                    documentType: 'RFQ',
                    documentId: rfq.id,
                    status: rfq.status,
                    displayNumber: rfq.rfqNumber,
                    createdAt: rfq.createdAt,
                    companyId: rfq.companyId,
                }),
            )
            related.push(...(await this.collectRfqDownstream(rfq.id, rfq.companyId)))
        }
        for (const po of pr.purchaseOrders) {
            if (po.companyId !== pr.companyId) continue
            related.push(...(await this.collectPoChain(po.id, po.companyId)))
        }
        return this.buildGraph(current, related)
    }

    private async fromRfq(id: string): Promise<FlowGraph> {
        const rfq = await this.prisma.mmRfq.findUnique({
            where: { id },
            include: {
                purchaseRequisition: {
                    select: {
                        id: true,
                        requisitionNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                    },
                },
            },
        })
        if (!rfq) throw new NotFoundException('RFQ not found')

        const current = toFlowNode({
            documentType: 'RFQ',
            documentId: rfq.id,
            status: rfq.status,
            displayNumber: rfq.rfqNumber,
            createdAt: rfq.createdAt,
            companyId: rfq.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (rfq.purchaseRequisition && rfq.purchaseRequisition.companyId === rfq.companyId) {
            related.push(
                toFlowNode({
                    documentType: 'PURCHASE_REQUISITION',
                    documentId: rfq.purchaseRequisition.id,
                    status: rfq.purchaseRequisition.status,
                    displayNumber: rfq.purchaseRequisition.requisitionNumber,
                    createdAt: rfq.purchaseRequisition.createdAt,
                    companyId: rfq.purchaseRequisition.companyId,
                }),
            )
        }
        related.push(...(await this.collectRfqDownstream(rfq.id, rfq.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromQuotation(id: string): Promise<FlowGraph> {
        const quotation = await this.prisma.mmSupplierQuotation.findUnique({
            where: { id },
            include: {
                rfq: {
                    select: {
                        id: true,
                        rfqNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                        purchaseRequisitionId: true,
                        purchaseRequisition: {
                            select: {
                                id: true,
                                requisitionNumber: true,
                                status: true,
                                createdAt: true,
                                companyId: true,
                            },
                        },
                    },
                },
            },
        })
        if (!quotation) throw new NotFoundException('Quotation not found')
        const companyId = quotation.rfq.companyId

        const current = toFlowNode({
            documentType: 'QUOTATION',
            documentId: quotation.id,
            status: quotation.status,
            displayNumber: quotation.quotationNumber,
            createdAt: quotation.createdAt,
            companyId,
        })

        const related: ScopedFlowNode[] = []
        if (quotation.rfq) {
            related.push(
                toFlowNode({
                    documentType: 'RFQ',
                    documentId: quotation.rfq.id,
                    status: quotation.rfq.status,
                    displayNumber: quotation.rfq.rfqNumber,
                    createdAt: quotation.rfq.createdAt,
                    companyId: quotation.rfq.companyId,
                }),
            )
            if (
                quotation.rfq.purchaseRequisition &&
                quotation.rfq.purchaseRequisition.companyId === companyId
            ) {
                related.push(
                    toFlowNode({
                        documentType: 'PURCHASE_REQUISITION',
                        documentId: quotation.rfq.purchaseRequisition.id,
                        status: quotation.rfq.purchaseRequisition.status,
                        displayNumber: quotation.rfq.purchaseRequisition.requisitionNumber,
                        createdAt: quotation.rfq.purchaseRequisition.createdAt,
                        companyId: quotation.rfq.purchaseRequisition.companyId,
                    }),
                )
            }
            related.push(
                ...(await this.collectRfqDownstream(quotation.rfq.id, companyId)),
            )
        }

        const pos = await this.prisma.mmPurchaseOrder.findMany({
            where: { quotationId: id, companyId },
            select: { id: true, poNumber: true, status: true, createdAt: true, companyId: true },
        })
        for (const po of pos) {
            related.push(...(await this.collectPoChain(po.id, po.companyId)))
        }
        return this.buildGraph(current, related)
    }

    private async fromPurchaseOrder(id: string): Promise<FlowGraph> {
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id },
            select: { id: true, poNumber: true, status: true, createdAt: true, companyId: true },
        })
        if (!po) throw new NotFoundException('Purchase order not found')

        const current = toFlowNode({
            documentType: 'PURCHASE_ORDER',
            documentId: po.id,
            status: po.status,
            displayNumber: po.poNumber,
            createdAt: po.createdAt,
            companyId: po.companyId,
        })
        const related = await this.collectPoChain(po.id, po.companyId)
        return this.buildGraph(current, related)
    }

    private async fromAsn(id: string): Promise<FlowGraph> {
        const asn = await this.prisma.mmAsn.findUnique({
            where: { id },
            include: {
                purchaseOrder: {
                    select: { id: true, poNumber: true, status: true, createdAt: true, companyId: true },
                },
            },
        })
        if (!asn) throw new NotFoundException('ASN not found')

        const current = toFlowNode({
            documentType: 'ASN',
            documentId: asn.id,
            status: asn.status,
            displayNumber: asn.asnNumber,
            createdAt: asn.createdAt,
            companyId: asn.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (asn.purchaseOrder && asn.purchaseOrder.companyId === asn.companyId) {
            related.push(...(await this.collectPoChain(asn.purchaseOrder.id, asn.companyId)))
        }
        related.push(...(await this.collectAsnDownstream(asn.id, asn.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromExpectedReceipt(id: string): Promise<FlowGraph> {
        const er = await this.prisma.mmExpectedReceipt.findUnique({
            where: { id },
            include: {
                purchaseOrder: {
                    select: { id: true, poNumber: true, status: true, createdAt: true, companyId: true },
                },
                asn: {
                    select: { id: true, asnNumber: true, status: true, createdAt: true, companyId: true },
                },
            },
        })
        if (!er) throw new NotFoundException('Expected receipt not found')

        const current = toFlowNode({
            documentType: 'EXPECTED_RECEIPT',
            documentId: er.id,
            status: er.status,
            displayNumber: er.documentNumber,
            createdAt: er.createdAt,
            companyId: er.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (er.purchaseOrder && er.purchaseOrder.companyId === er.companyId) {
            related.push(...(await this.collectPoChain(er.purchaseOrder.id, er.companyId)))
        }
        if (er.asn && er.asn.companyId === er.companyId) {
            related.push(
                toFlowNode({
                    documentType: 'ASN',
                    documentId: er.asn.id,
                    status: er.asn.status,
                    displayNumber: er.asn.asnNumber,
                    createdAt: er.asn.createdAt,
                    companyId: er.asn.companyId,
                }),
            )
        }
        related.push(...(await this.collectErDownstream(er.id, er.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromReceivingDocument(id: string): Promise<FlowGraph> {
        const doc = await this.prisma.mmReceivingDocument.findUnique({
            where: { id },
            include: {
                expectedReceipt: {
                    select: { id: true, documentNumber: true, status: true, createdAt: true, companyId: true },
                },
            },
        })
        if (!doc) throw new NotFoundException('Receiving document not found')

        const current = toFlowNode({
            documentType: 'RECEIVING_DOCUMENT',
            documentId: doc.id,
            status: doc.status,
            displayNumber: doc.documentNumber,
            createdAt: doc.createdAt,
            companyId: doc.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (doc.expectedReceipt && doc.expectedReceipt.companyId === doc.companyId) {
            related.push(
                ...(await this.fromExpectedReceipt(doc.expectedReceipt.id)).related,
            )
            related.push(
                toFlowNode({
                    documentType: 'EXPECTED_RECEIPT',
                    documentId: doc.expectedReceipt.id,
                    status: doc.expectedReceipt.status,
                    displayNumber: doc.expectedReceipt.documentNumber,
                    createdAt: doc.expectedReceipt.createdAt,
                    companyId: doc.expectedReceipt.companyId,
                }),
            )
        }
        related.push(...(await this.collectReceivingDownstream(doc.id, doc.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromGoodsReceipt(id: string): Promise<FlowGraph> {
        const gr = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                createdAt: true,
                companyId: true,
                purchaseOrderId: true,
                expectedReceiptId: true,
                asnId: true,
                receivingDocumentId: true,
            },
        })
        if (!gr) throw new NotFoundException('Goods receipt not found')

        const current = toFlowNode({
            documentType: 'GOODS_RECEIPT',
            documentId: gr.id,
            status: gr.status,
            displayNumber: gr.documentNumber,
            createdAt: gr.createdAt,
            companyId: gr.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (gr.purchaseOrderId) {
            related.push(...(await this.collectPoChain(gr.purchaseOrderId, gr.companyId)))
        }
        if (gr.expectedReceiptId) {
            related.push(
                ...(await this.fromExpectedReceipt(gr.expectedReceiptId)).related,
            )
        }
        if (gr.asnId) {
            const asn = await this.prisma.mmAsn.findFirst({
                where: { id: gr.asnId, companyId: gr.companyId },
            })
            if (asn) {
                related.push(
                    toFlowNode({
                        documentType: 'ASN',
                        documentId: asn.id,
                        status: asn.status,
                        displayNumber: asn.asnNumber,
                        createdAt: asn.createdAt,
                        companyId: asn.companyId,
                    }),
                )
            }
        }
        if (gr.receivingDocumentId) {
            const rd = await this.prisma.mmReceivingDocument.findFirst({
                where: { id: gr.receivingDocumentId, companyId: gr.companyId },
            })
            if (rd) {
                related.push(
                    toFlowNode({
                        documentType: 'RECEIVING_DOCUMENT',
                        documentId: rd.id,
                        status: rd.status,
                        displayNumber: rd.documentNumber,
                        createdAt: rd.createdAt,
                        companyId: rd.companyId,
                    }),
                )
            }
        }
        related.push(...(await this.collectGrDownstream(gr.id, gr.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromInspectionLot(id: string): Promise<FlowGraph> {
        const lot = await this.prisma.mmInspectionLot.findUnique({
            where: { id },
            select: {
                id: true,
                lotNumber: true,
                status: true,
                createdAt: true,
                companyId: true,
                goodsReceiptId: true,
            },
        })
        if (!lot) throw new NotFoundException('Inspection lot not found')

        const current = toFlowNode({
            documentType: 'INSPECTION_LOT',
            documentId: lot.id,
            status: lot.status,
            displayNumber: lot.lotNumber,
            createdAt: lot.createdAt,
            companyId: lot.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (lot.goodsReceiptId) {
            related.push(...(await this.fromGoodsReceipt(lot.goodsReceiptId)).related)
            related.push(
                ...(await this.collectGrDownstream(lot.goodsReceiptId, lot.companyId)),
            )
        }
        related.push(...(await this.collectInspectionDownstream(lot.id, lot.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromQualityDecision(id: string): Promise<FlowGraph> {
        const decision = await this.prisma.mmQualityDecision.findUnique({
            where: { id },
            include: {
                inspectionLot: {
                    select: {
                        id: true,
                        lotNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                        goodsReceiptId: true,
                    },
                },
            },
        })
        if (!decision) throw new NotFoundException('Quality decision not found')

        const lot = decision.inspectionLot
        const current = toFlowNode({
            documentType: 'QUALITY_DECISION',
            documentId: decision.id,
            status: decision.decisionCode,
            displayNumber: `${decision.decisionCode} (${decision.id.slice(0, 8)})`,
            createdAt: decision.decidedAt,
            companyId: lot.companyId,
        })

        const related: ScopedFlowNode[] = []
        related.push(
            toFlowNode({
                documentType: 'INSPECTION_LOT',
                documentId: lot.id,
                status: lot.status,
                displayNumber: lot.lotNumber,
                createdAt: lot.createdAt,
                companyId: lot.companyId,
            }),
        )
        if (lot.goodsReceiptId) {
            related.push(...(await this.fromGoodsReceipt(lot.goodsReceiptId)).related)
        }
        return this.buildGraph(current, related)
    }

    private async fromPutawayTask(id: string): Promise<FlowGraph> {
        const task = await this.prisma.wmPutawayTask.findUnique({
            where: { id },
            select: {
                id: true,
                taskNumber: true,
                status: true,
                createdAt: true,
                companyId: true,
                goodsReceiptId: true,
                goodsReceipt: { select: { companyId: true } },
            },
        })
        if (!task) throw new NotFoundException('Putaway task not found')

        const companyId =
            task.companyId ?? task.goodsReceipt?.companyId ?? ''
        const current = toFlowNode({
            documentType: 'PUTAWAY_TASK',
            documentId: task.id,
            status: task.status,
            displayNumber: task.taskNumber,
            createdAt: task.createdAt,
            companyId,
        })

        const related: ScopedFlowNode[] = []
        if (task.goodsReceiptId && companyId) {
            related.push(...(await this.fromGoodsReceipt(task.goodsReceiptId)).related)
        }
        return this.buildGraph(current, related)
    }

    private async fromReservation(id: string): Promise<FlowGraph> {
        const header = await this.prisma.mmInventoryReservationHeader.findUnique({
            where: { id },
        })
        if (!header) throw new NotFoundException('Reservation not found')

        const current = toFlowNode({
            documentType: 'RESERVATION',
            documentId: header.id,
            status: header.status,
            displayNumber: header.reservationNumber,
            createdAt: header.createdAt,
            companyId: header.companyId,
        })
        const related = await this.collectReservationChain(header.id, header.companyId)
        return this.buildGraph(current, related)
    }

    private async fromAllocation(id: string): Promise<FlowGraph> {
        const allocation = await this.prisma.mmInventoryAllocation.findUnique({
            where: { id },
            include: {
                header: {
                    select: {
                        id: true,
                        reservationNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                    },
                },
            },
        })
        if (!allocation) throw new NotFoundException('Allocation not found')

        const companyId = allocation.header.companyId
        const current = toFlowNode({
            documentType: 'ALLOCATION',
            documentId: allocation.id,
            status: allocation.status,
            displayNumber: allocation.allocationNumber,
            createdAt: allocation.createdAt,
            companyId,
        })

        const related = await this.collectReservationChain(allocation.headerId, companyId)
        related.push(
            toFlowNode({
                documentType: 'RESERVATION',
                documentId: allocation.header.id,
                status: allocation.header.status,
                displayNumber: allocation.header.reservationNumber,
                createdAt: allocation.header.createdAt,
                companyId,
            }),
        )
        return this.buildGraph(current, related)
    }

    private async fromPickTask(id: string): Promise<FlowGraph> {
        const pick = await this.prisma.wmPickingTask.findUnique({
            where: { id },
            select: {
                id: true,
                taskNumber: true,
                status: true,
                createdAt: true,
                companyId: true,
                reservationHeaderId: true,
            },
        })
        if (!pick) throw new NotFoundException('Pick task not found')

        const companyId = pick.companyId ?? ''
        const current = toFlowNode({
            documentType: 'PICK_TASK',
            documentId: pick.id,
            status: pick.status,
            displayNumber: pick.taskNumber,
            createdAt: pick.createdAt,
            companyId,
        })

        const related: ScopedFlowNode[] = []
        if (pick.reservationHeaderId && companyId) {
            related.push(
                ...(await this.collectReservationChain(pick.reservationHeaderId, companyId)),
            )
        }
        related.push(...(await this.collectPickDownstream(pick.id, companyId)))
        return this.buildGraph(current, related)
    }

    private async fromPackSession(id: string): Promise<FlowGraph> {
        const pack = await this.prisma.wmPackingSession.findUnique({
            where: { id },
            include: {
                pickingTask: {
                    select: {
                        id: true,
                        taskNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                        reservationHeaderId: true,
                    },
                },
            },
        })
        if (!pack) throw new NotFoundException('Pack session not found')

        const companyId = pack.pickingTask?.companyId ?? ''
        const current = toFlowNode({
            documentType: 'PACK_SESSION',
            documentId: pack.id,
            status: pack.status,
            displayNumber: pack.sessionNumber,
            createdAt: pack.createdAt,
            companyId,
        })

        const related: ScopedFlowNode[] = []
        if (pack.pickingTask) {
            related.push(
                toFlowNode({
                    documentType: 'PICK_TASK',
                    documentId: pack.pickingTask.id,
                    status: pack.pickingTask.status,
                    displayNumber: pack.pickingTask.taskNumber,
                    createdAt: pack.pickingTask.createdAt,
                    companyId: pack.pickingTask.companyId ?? companyId,
                }),
            )
            if (pack.pickingTask.reservationHeaderId) {
                related.push(
                    ...(await this.collectReservationChain(
                        pack.pickingTask.reservationHeaderId,
                        companyId,
                    )),
                )
            }
        }
        related.push(...(await this.collectPackDownstream(pack.id, companyId)))
        return this.buildGraph(current, related)
    }

    private async fromGoodsIssue(id: string): Promise<FlowGraph> {
        const gi = await this.prisma.mmGoodsIssue.findUnique({
            where: { id },
            select: {
                id: true,
                documentNumber: true,
                status: true,
                createdAt: true,
                companyId: true,
                reservationHeaderId: true,
            },
        })
        if (!gi) throw new NotFoundException('Goods issue not found')

        const current = toFlowNode({
            documentType: 'GOODS_ISSUE',
            documentId: gi.id,
            status: gi.status,
            displayNumber: gi.documentNumber,
            createdAt: gi.createdAt,
            companyId: gi.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (gi.reservationHeaderId) {
            related.push(
                ...(await this.collectReservationChain(gi.reservationHeaderId, gi.companyId)),
            )
        }
        related.push(
            ...(await this.collectInventoryAndAccounting(
                gi.companyId,
                'GOODS_ISSUE',
                gi.id,
            )),
        )
        return this.buildGraph(current, related)
    }

    private async fromSto(id: string): Promise<FlowGraph> {
        const sto = await this.prisma.mmStockTransferOrder.findUnique({
            where: { id },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                createdAt: true,
                companyId: true,
                reservationHeaderId: true,
            },
        })
        if (!sto) throw new NotFoundException('Stock transfer order not found')

        const current = toFlowNode({
            documentType: 'STO',
            documentId: sto.id,
            status: sto.status,
            displayNumber: sto.orderNumber,
            createdAt: sto.createdAt,
            companyId: sto.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (sto.reservationHeaderId) {
            related.push(
                ...(await this.collectReservationChain(sto.reservationHeaderId, sto.companyId)),
            )
        }
        related.push(...(await this.collectStoDownstream(sto.id, sto.companyId)))
        return this.buildGraph(current, related)
    }

    private async fromTransferShipment(id: string): Promise<FlowGraph> {
        const ship = await this.prisma.mmTransferShipment.findUnique({
            where: { id },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                        reservationHeaderId: true,
                    },
                },
            },
        })
        if (!ship) throw new NotFoundException('Transfer shipment not found')

        const companyId = ship.order.companyId
        const current = toFlowNode({
            documentType: 'TRANSFER_SHIPMENT',
            documentId: ship.id,
            status: ship.status,
            displayNumber: ship.shipmentNumber,
            createdAt: ship.createdAt,
            companyId,
        })

        const related = await this.collectStoDownstream(ship.orderId, companyId)
        related.push(
            toFlowNode({
                documentType: 'STO',
                documentId: ship.order.id,
                status: ship.order.status,
                displayNumber: ship.order.orderNumber,
                createdAt: ship.order.createdAt,
                companyId,
            }),
        )
        if (ship.order.reservationHeaderId) {
            related.push(
                ...(await this.collectReservationChain(
                    ship.order.reservationHeaderId,
                    companyId,
                )),
            )
        }
        return this.buildGraph(current, related)
    }

    private async fromTransferReceipt(id: string): Promise<FlowGraph> {
        const receipt = await this.prisma.mmTransferReceipt.findUnique({
            where: { id },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                    },
                },
                shipment: {
                    select: {
                        id: true,
                        shipmentNumber: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        })
        if (!receipt) throw new NotFoundException('Transfer receipt not found')

        const companyId = receipt.order.companyId
        const current = toFlowNode({
            documentType: 'TRANSFER_RECEIPT',
            documentId: receipt.id,
            status: receipt.status,
            displayNumber: receipt.receiptNumber,
            createdAt: receipt.createdAt,
            companyId,
        })

        const related = await this.collectStoDownstream(receipt.orderId, companyId)
        related.push(
            toFlowNode({
                documentType: 'STO',
                documentId: receipt.order.id,
                status: receipt.order.status,
                displayNumber: receipt.order.orderNumber,
                createdAt: receipt.order.createdAt,
                companyId,
            }),
        )
        if (receipt.shipment) {
            related.push(
                toFlowNode({
                    documentType: 'TRANSFER_SHIPMENT',
                    documentId: receipt.shipment.id,
                    status: receipt.shipment.status,
                    displayNumber: receipt.shipment.shipmentNumber,
                    createdAt: receipt.shipment.createdAt,
                    companyId,
                }),
            )
        }
        return this.buildGraph(current, related)
    }

    private async fromInventoryTransaction(id: string): Promise<FlowGraph> {
        const txn = await this.prisma.mmInventoryTransaction.findUnique({
            where: { id },
        })
        if (!txn) throw new NotFoundException('Inventory transaction not found')

        const current = toFlowNode({
            documentType: 'INVENTORY_TRANSACTION',
            documentId: txn.id,
            status: txn.movementType,
            displayNumber: txn.transactionNumber,
            createdAt: txn.createdAt,
            companyId: txn.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (txn.sourceDocumentType && txn.sourceDocumentId) {
            const srcType = normalizeDocumentType(txn.sourceDocumentType)
            if (MM_DOCUMENT_FLOW_TYPES.includes(srcType as MmDocumentFlowType)) {
                try {
                    const srcGraph = await this.resolveGraph(
                        srcType as MmDocumentFlowType,
                        txn.sourceDocumentId,
                    )
                    if (srcGraph.companyId === txn.companyId) {
                        related.push(srcGraph.current, ...srcGraph.related)
                    }
                } catch {
                    // source doc may be deleted or unsupported
                }
            }
        }
        related.push(
            ...(await this.collectAccountingForDocument(
                txn.companyId,
                'INVENTORY_TRANSACTION',
                txn.id,
            )),
        )
        return this.buildGraph(current, related)
    }

    private async fromAccountingEvent(id: string): Promise<FlowGraph> {
        const event = await this.prisma.mmAccountingEvent.findUnique({
            where: { id },
        })
        if (!event) throw new NotFoundException('Accounting event not found')
        if (!event.companyId) throw new NotFoundException('Accounting event has no company')

        const current = toFlowNode({
            documentType: 'ACCOUNTING_EVENT',
            documentId: event.id,
            status: event.status,
            displayNumber: `${event.eventType} (${event.id.slice(0, 8)})`,
            createdAt: event.createdAt,
            companyId: event.companyId,
        })

        const related: ScopedFlowNode[] = []
        if (event.sourceTransactionId) {
            try {
                const txnGraph = await this.fromInventoryTransaction(
                    event.sourceTransactionId,
                )
                if (txnGraph.companyId === event.companyId) {
                    related.push(txnGraph.current, ...txnGraph.related)
                }
            } catch {
                // txn may not exist
            }
        } else if (event.documentType && event.documentId) {
            const docType = normalizeDocumentType(event.documentType)
            if (MM_DOCUMENT_FLOW_TYPES.includes(docType as MmDocumentFlowType)) {
                try {
                    const g = await this.resolveGraph(
                        docType as MmDocumentFlowType,
                        event.documentId,
                    )
                    if (g.companyId === event.companyId) {
                        related.push(g.current, ...g.related)
                    }
                } catch {
                    // ignore
                }
            }
        }
        return this.buildGraph(current, related)
    }

    // ── Collectors (reuse existing FKs — no duplicate link table) ──

    private async collectPoChain(
        poId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const po = await this.prisma.mmPurchaseOrder.findUnique({
            where: { id: poId },
            include: {
                purchaseRequisition: {
                    select: {
                        id: true,
                        requisitionNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                    },
                },
                rfq: {
                    select: {
                        id: true,
                        rfqNumber: true,
                        status: true,
                        createdAt: true,
                        companyId: true,
                    },
                },
                quotation: {
                    select: {
                        id: true,
                        quotationNumber: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        })
        if (!po || po.companyId !== companyId) return []

        const nodes: ScopedFlowNode[] = [
            toFlowNode({
                documentType: 'PURCHASE_ORDER',
                documentId: po.id,
                status: po.status,
                displayNumber: po.poNumber,
                createdAt: po.createdAt,
                companyId: po.companyId,
            }),
        ]

        if (po.purchaseRequisition?.companyId === companyId) {
            nodes.push(
                toFlowNode({
                    documentType: 'PURCHASE_REQUISITION',
                    documentId: po.purchaseRequisition.id,
                    status: po.purchaseRequisition.status,
                    displayNumber: po.purchaseRequisition.requisitionNumber,
                    createdAt: po.purchaseRequisition.createdAt,
                    companyId,
                }),
            )
        }
        if (po.rfq?.companyId === companyId) {
            nodes.push(
                toFlowNode({
                    documentType: 'RFQ',
                    documentId: po.rfq.id,
                    status: po.rfq.status,
                    displayNumber: po.rfq.rfqNumber,
                    createdAt: po.rfq.createdAt,
                    companyId,
                }),
            )
        }
        if (po.quotation) {
            nodes.push(
                toFlowNode({
                    documentType: 'QUOTATION',
                    documentId: po.quotation.id,
                    status: po.quotation.status,
                    displayNumber: po.quotation.quotationNumber,
                    createdAt: po.quotation.createdAt,
                    companyId,
                }),
            )
        }

        const asns = await this.prisma.mmAsn.findMany({
            where: { purchaseOrderId: poId, companyId },
        })
        for (const asn of asns) {
            nodes.push(
                toFlowNode({
                    documentType: 'ASN',
                    documentId: asn.id,
                    status: asn.status,
                    displayNumber: asn.asnNumber,
                    createdAt: asn.createdAt,
                    companyId,
                }),
            )
            nodes.push(...(await this.collectAsnDownstream(asn.id, companyId)))
        }

        const ers = await this.prisma.mmExpectedReceipt.findMany({
            where: { purchaseOrderId: poId, companyId },
        })
        for (const er of ers) {
            nodes.push(...(await this.collectErDownstream(er.id, companyId)))
            nodes.push(
                toFlowNode({
                    documentType: 'EXPECTED_RECEIPT',
                    documentId: er.id,
                    status: er.status,
                    displayNumber: er.documentNumber,
                    createdAt: er.createdAt,
                    companyId,
                }),
            )
        }

        const grs = await this.prisma.mmGoodsReceipt.findMany({
            where: { purchaseOrderId: poId, companyId },
        })
        for (const gr of grs) {
            nodes.push(...(await this.collectGrDownstream(gr.id, companyId)))
            nodes.push(
                toFlowNode({
                    documentType: 'GOODS_RECEIPT',
                    documentId: gr.id,
                    status: gr.status,
                    displayNumber: gr.documentNumber,
                    createdAt: gr.createdAt,
                    companyId,
                }),
            )
        }

        return dedupeNodes(nodes)
    }

    private async collectRfqDownstream(
        rfqId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const quotations = await this.prisma.mmSupplierQuotation.findMany({
            where: { rfqId, rfq: { companyId } },
        })
        for (const q of quotations) {
            nodes.push(
                toFlowNode({
                    documentType: 'QUOTATION',
                    documentId: q.id,
                    status: q.status,
                    displayNumber: q.quotationNumber,
                    createdAt: q.createdAt,
                    companyId,
                }),
            )
        }
        const pos = await this.prisma.mmPurchaseOrder.findMany({
            where: { rfqId, companyId },
        })
        for (const po of pos) {
            nodes.push(...(await this.collectPoChain(po.id, companyId)))
        }
        return dedupeNodes(nodes)
    }

    private async collectAsnDownstream(
        asnId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const ers = await this.prisma.mmExpectedReceipt.findMany({
            where: { asnId, companyId },
        })
        for (const er of ers) {
            nodes.push(...(await this.collectErDownstream(er.id, companyId)))
        }
        const grs = await this.prisma.mmGoodsReceipt.findMany({
            where: { asnId, companyId },
        })
        for (const gr of grs) {
            nodes.push(...(await this.collectGrDownstream(gr.id, companyId)))
        }
        return dedupeNodes(nodes)
    }

    private async collectErDownstream(
        erId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const receiving = await this.prisma.mmReceivingDocument.findMany({
            where: { expectedReceiptId: erId, companyId },
        })
        for (const rd of receiving) {
            nodes.push(...(await this.collectReceivingDownstream(rd.id, companyId)))
        }
        const grs = await this.prisma.mmGoodsReceipt.findMany({
            where: { expectedReceiptId: erId, companyId },
        })
        for (const gr of grs) {
            nodes.push(...(await this.collectGrDownstream(gr.id, companyId)))
        }
        return dedupeNodes(nodes)
    }

    private async collectReceivingDownstream(
        receivingId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const rd = await this.prisma.mmReceivingDocument.findFirst({
            where: { id: receivingId, companyId },
        })
        if (rd) {
            nodes.push(
                toFlowNode({
                    documentType: 'RECEIVING_DOCUMENT',
                    documentId: rd.id,
                    status: rd.status,
                    displayNumber: rd.documentNumber,
                    createdAt: rd.createdAt,
                    companyId,
                }),
            )
        }
        const gr = await this.prisma.mmGoodsReceipt.findFirst({
            where: { receivingDocumentId: receivingId, companyId },
        })
        if (gr) {
            nodes.push(...(await this.collectGrDownstream(gr.id, companyId)))
        }
        const lots = await this.prisma.mmInspectionLot.findMany({
            where: { receivingDocumentId: receivingId, companyId },
        })
        for (const lot of lots) {
            nodes.push(...(await this.collectInspectionDownstream(lot.id, companyId)))
        }
        return dedupeNodes(nodes)
    }

    private async collectGrDownstream(
        grId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const lots = await this.prisma.mmInspectionLot.findMany({
            where: { goodsReceiptId: grId, companyId },
        })
        for (const lot of lots) {
            nodes.push(...(await this.collectInspectionDownstream(lot.id, companyId)))
        }
        const putaways = await this.prisma.wmPutawayTask.findMany({
            where: { goodsReceiptId: grId },
            include: { goodsReceipt: { select: { companyId: true } } },
        })
        for (const pt of putaways) {
            if (pt.goodsReceipt?.companyId !== companyId) continue
            nodes.push(
                toFlowNode({
                    documentType: 'PUTAWAY_TASK',
                    documentId: pt.id,
                    status: pt.status,
                    displayNumber: pt.taskNumber,
                    createdAt: pt.createdAt,
                    companyId,
                }),
            )
        }
        nodes.push(
            ...(await this.collectInventoryAndAccounting(
                companyId,
                'GOODS_RECEIPT',
                grId,
            )),
        )
        return dedupeNodes(nodes)
    }

    private async collectInspectionDownstream(
        lotId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const lot = await this.prisma.mmInspectionLot.findFirst({
            where: { id: lotId, companyId },
        })
        if (lot) {
            nodes.push(
                toFlowNode({
                    documentType: 'INSPECTION_LOT',
                    documentId: lot.id,
                    status: lot.status,
                    displayNumber: lot.lotNumber,
                    createdAt: lot.createdAt,
                    companyId,
                }),
            )
        }
        const decisions = await this.prisma.mmQualityDecision.findMany({
            where: { inspectionLotId: lotId },
            include: { inspectionLot: { select: { companyId: true } } },
        })
        for (const d of decisions) {
            if (d.inspectionLot.companyId !== companyId) continue
            nodes.push(
                toFlowNode({
                    documentType: 'QUALITY_DECISION',
                    documentId: d.id,
                    status: d.decisionCode,
                    displayNumber: `${d.decisionCode} (${d.id.slice(0, 8)})`,
                    createdAt: d.decidedAt,
                    companyId,
                }),
            )
        }
        return dedupeNodes(nodes)
    }

    private async collectReservationChain(
        headerId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const header = await this.prisma.mmInventoryReservationHeader.findFirst({
            where: { id: headerId, companyId },
        })
        if (!header) return nodes

        nodes.push(
            toFlowNode({
                documentType: 'RESERVATION',
                documentId: header.id,
                status: header.status,
                displayNumber: header.reservationNumber,
                createdAt: header.createdAt,
                companyId,
            }),
        )

        const allocations = await this.prisma.mmInventoryAllocation.findMany({
            where: { headerId, header: { companyId } },
        })
        for (const a of allocations) {
            nodes.push(
                toFlowNode({
                    documentType: 'ALLOCATION',
                    documentId: a.id,
                    status: a.status,
                    displayNumber: a.allocationNumber,
                    createdAt: a.createdAt,
                    companyId,
                }),
            )
        }

        const picks = await this.prisma.wmPickingTask.findMany({
            where: { reservationHeaderId: headerId, companyId },
        })
        for (const p of picks) {
            nodes.push(...(await this.collectPickDownstream(p.id, companyId)))
            nodes.push(
                toFlowNode({
                    documentType: 'PICK_TASK',
                    documentId: p.id,
                    status: p.status,
                    displayNumber: p.taskNumber,
                    createdAt: p.createdAt,
                    companyId,
                }),
            )
        }

        const gis = await this.prisma.mmGoodsIssue.findMany({
            where: { reservationHeaderId: headerId, companyId },
        })
        for (const gi of gis) {
            nodes.push(
                toFlowNode({
                    documentType: 'GOODS_ISSUE',
                    documentId: gi.id,
                    status: gi.status,
                    displayNumber: gi.documentNumber,
                    createdAt: gi.createdAt,
                    companyId,
                }),
            )
            nodes.push(
                ...(await this.collectInventoryAndAccounting(
                    companyId,
                    'GOODS_ISSUE',
                    gi.id,
                )),
            )
        }

        return dedupeNodes(nodes)
    }

    private async collectPickDownstream(
        pickId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const packs = await this.prisma.wmPackingSession.findMany({
            where: { pickingTaskId: pickId },
            include: { pickingTask: { select: { companyId: true } } },
        })
        for (const pack of packs) {
            if (pack.pickingTask?.companyId !== companyId) continue
            nodes.push(...(await this.collectPackDownstream(pack.id, companyId)))
        }
        return dedupeNodes(nodes)
    }

    private async collectPackDownstream(
        packId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const pack = await this.prisma.wmPackingSession.findFirst({
            where: { id: packId },
            include: { pickingTask: { select: { companyId: true } } },
        })
        if (!pack || pack.pickingTask?.companyId !== companyId) return nodes

        nodes.push(
            toFlowNode({
                documentType: 'PACK_SESSION',
                documentId: pack.id,
                status: pack.status,
                displayNumber: pack.sessionNumber,
                createdAt: pack.createdAt,
                companyId,
            }),
        )

        const gis = await this.prisma.mmGoodsIssue.findMany({
            where: { packageId: pack.id, companyId },
        })
        for (const gi of gis) {
            nodes.push(
                toFlowNode({
                    documentType: 'GOODS_ISSUE',
                    documentId: gi.id,
                    status: gi.status,
                    displayNumber: gi.documentNumber,
                    createdAt: gi.createdAt,
                    companyId,
                }),
            )
            nodes.push(
                ...(await this.collectInventoryAndAccounting(
                    companyId,
                    'GOODS_ISSUE',
                    gi.id,
                )),
            )
        }
        return dedupeNodes(nodes)
    }

    private async collectStoDownstream(
        stoId: string,
        companyId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const shipments = await this.prisma.mmTransferShipment.findMany({
            where: { orderId: stoId, order: { companyId } },
        })
        for (const s of shipments) {
            nodes.push(
                toFlowNode({
                    documentType: 'TRANSFER_SHIPMENT',
                    documentId: s.id,
                    status: s.status,
                    displayNumber: s.shipmentNumber,
                    createdAt: s.createdAt,
                    companyId,
                }),
            )
        }
        const receipts = await this.prisma.mmTransferReceipt.findMany({
            where: { orderId: stoId, order: { companyId } },
        })
        for (const r of receipts) {
            nodes.push(
                toFlowNode({
                    documentType: 'TRANSFER_RECEIPT',
                    documentId: r.id,
                    status: r.status,
                    displayNumber: r.receiptNumber,
                    createdAt: r.createdAt,
                    companyId,
                }),
            )
        }
        nodes.push(
            ...(await this.collectInventoryAndAccounting(
                companyId,
                'STO',
                stoId,
            )),
        )
        return dedupeNodes(nodes)
    }

    private async collectInventoryAndAccounting(
        companyId: string,
        sourceDocumentType: string,
        sourceDocumentId: string,
    ): Promise<ScopedFlowNode[]> {
        const nodes: ScopedFlowNode[] = []
        const txns = await this.prisma.mmInventoryTransaction.findMany({
            where: {
                companyId,
                sourceDocumentType,
                sourceDocumentId,
            },
        })
        for (const t of txns) {
            nodes.push(
                toFlowNode({
                    documentType: 'INVENTORY_TRANSACTION',
                    documentId: t.id,
                    status: t.movementType,
                    displayNumber: t.transactionNumber,
                    createdAt: t.createdAt,
                    companyId,
                }),
            )
            nodes.push(
                ...(await this.collectAccountingForDocument(
                    companyId,
                    'INVENTORY_TRANSACTION',
                    t.id,
                )),
            )
        }
        return dedupeNodes(nodes)
    }

    private async collectAccountingForDocument(
        companyId: string,
        documentType: string,
        documentId: string,
    ): Promise<ScopedFlowNode[]> {
        const events = await this.prisma.mmAccountingEvent.findMany({
            where: {
                companyId,
                OR: [
                    { documentType, documentId },
                    { sourceTransactionId: documentId },
                ],
            },
        })
        return events.map((e) =>
            toFlowNode({
                documentType: 'ACCOUNTING_EVENT',
                documentId: e.id,
                status: e.status,
                displayNumber: `${e.eventType} (${e.id.slice(0, 8)})`,
                createdAt: e.createdAt,
                companyId: e.companyId ?? companyId,
            }),
        )
    }
}
