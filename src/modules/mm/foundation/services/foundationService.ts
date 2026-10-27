import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type FoundationReadinessStep = {
    step: number
    key: string
    title: string
    role: string
    metrics: Record<string, number>
    ready: boolean
}

export type FoundationReadinessResponse = {
    generatedAt: string
    steps: FoundationReadinessStep[]
}

export const foundationService = {
    getReadiness: () =>
        ErpAxiosBase.get<FoundationReadinessResponse>('/mm/foundation/readiness').then(
            (r) => r.data,
        ),
}
