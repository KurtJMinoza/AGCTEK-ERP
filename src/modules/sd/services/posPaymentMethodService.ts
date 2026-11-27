import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type PaymentMethod = {
    id: string
    code: string
    name: string
    description: string | null
    icon: string | null
    origin: string
    isActive: boolean
    sortOrder: number
    allowChange: boolean
    requiresReference: boolean
    requiresBank: boolean
    requiresDate: boolean
    requiresEmployee: boolean
    settlementType: string
    glAccountCode: string | null
}

const BASE = '/sd/pos/payment-methods'

export async function listPaymentMethods(
    activeOnly = true,
): Promise<PaymentMethod[]> {
    const { data } = await ErpAxiosBase.get<PaymentMethod[]>(BASE, {
        params: { activeOnly: activeOnly ? 'true' : undefined },
    })
    return data
}

export async function createPaymentMethod(
    input: Partial<Omit<PaymentMethod, 'id' | 'origin' | 'createdAt' | 'updatedAt'>>,
): Promise<PaymentMethod> {
    const { data } = await ErpAxiosBase.post<PaymentMethod>(BASE, input)
    return data
}

export async function updatePaymentMethod(
    id: string,
    input: Partial<Omit<PaymentMethod, 'id' | 'code' | 'origin'>>,
): Promise<PaymentMethod> {
    const { data } = await ErpAxiosBase.patch<PaymentMethod>(`${BASE}/${id}`, input)
    return data
}

export async function deletePaymentMethod(id: string): Promise<void> {
    await ErpAxiosBase.delete(`${BASE}/${id}`)
}
