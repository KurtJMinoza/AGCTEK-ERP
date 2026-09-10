import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { WorkflowInstance } from '../types'

const BASE = '/mm/workflows'

export const workflowService = {
    getInstance: (entityType: string, entityId: string) =>
        ErpAxiosBase.get<WorkflowInstance | null>(`${BASE}/instances/${entityType}/${entityId}`).then((r) => r.data),

    decideTask: (taskId: string, decision: 'APPROVE' | 'REJECT' | 'RETURN', comment?: string, userId?: string) =>
        ErpAxiosBase.post(`${BASE}/tasks/${taskId}/decide`, { decision, comment, userId }).then((r) => r.data),

    listDefinitions: () =>
        ErpAxiosBase.get(`${BASE}`).then((r) => r.data),
}
