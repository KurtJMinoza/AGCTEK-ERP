import type {
    DocumentFlowNode,
    DocumentFlowResponse,
    FlowGraph,
    ScopedFlowNode,
} from './document-flow.types'

export function normalizeDocumentType(raw: string): string {
    return raw.trim().replace(/-/g, '_').toUpperCase()
}

export function toFlowNode(
    input: {
        documentType: string
        documentId: string
        status?: string | null
        displayNumber: string
        createdAt: Date | string
        companyId: string
    },
): ScopedFlowNode {
    return {
        documentType: input.documentType,
        documentId: input.documentId,
        status: input.status ?? 'UNKNOWN',
        displayNumber: input.displayNumber,
        createdAt:
            input.createdAt instanceof Date
                ? input.createdAt.toISOString()
                : String(input.createdAt),
        companyId: input.companyId,
    }
}

export function nodeKey(node: Pick<DocumentFlowNode, 'documentType' | 'documentId'>) {
    return `${node.documentType}:${node.documentId}`
}

export function dedupeNodes(nodes: ScopedFlowNode[]): ScopedFlowNode[] {
    const seen = new Set<string>()
    const out: ScopedFlowNode[] = []
    for (const n of nodes) {
        const key = nodeKey(n)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(n)
    }
    return out
}

export function stripScope(node: ScopedFlowNode): DocumentFlowNode {
    const { companyId: _c, ...rest } = node
    return rest
}

export function sortNodes(nodes: ScopedFlowNode[]): ScopedFlowNode[] {
    return [...nodes].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime()
        const tb = new Date(b.createdAt).getTime()
        if (ta !== tb) return ta - tb
        return a.displayNumber.localeCompare(b.displayNumber)
    })
}

export function partitionGraph(
    graph: FlowGraph,
    anchorPhase: number,
    phaseOf: (node: ScopedFlowNode) => number,
): DocumentFlowResponse {
    const sameCompany = graph.related.filter(
        (n) => n.companyId === graph.companyId,
    )
    const upstream: ScopedFlowNode[] = []
    const downstream: ScopedFlowNode[] = []

    for (const node of sameCompany) {
        if (nodeKey(node) === nodeKey(graph.current)) continue
        const phase = phaseOf(node)
        if (phase < anchorPhase) upstream.push(node)
        else if (phase > anchorPhase) downstream.push(node)
        else {
            const nodeTime = new Date(node.createdAt).getTime()
            const anchorTime = new Date(graph.current.createdAt).getTime()
            if (nodeTime <= anchorTime) upstream.push(node)
            else downstream.push(node)
        }
    }

    return {
        companyId: graph.companyId,
        upstream: sortNodes(dedupeNodes(upstream)).map(stripScope),
        current: stripScope(graph.current),
        downstream: sortNodes(dedupeNodes(downstream)).map(stripScope),
    }
}

export function assertSameCompany(
    anchorCompanyId: string,
    requestedCompanyId: string | undefined,
) {
    if (requestedCompanyId && requestedCompanyId !== anchorCompanyId) {
        return false
    }
    return true
}
