import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { DocumentFlowResponse } from '../types/documentFlow'

const BASE = '/mm/document-flow'

export const documentFlowService = {
    getFlow: (documentType: string, documentId: string, companyId?: string) =>
        ErpAxiosBase.get<DocumentFlowResponse>(
            `${BASE}/${documentType}/${documentId}`,
            { params: companyId ? { companyId } : undefined },
        ).then((r) => r.data),
}
