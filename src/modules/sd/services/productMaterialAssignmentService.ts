import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type ProductMaterialAssignment = {
    id: string
    productId: string
    materialId: string
    companyId: string
    divisionId?: string | null
    salesUomId?: string | null
    materialUomId?: string | null
    inventoryRelevant: boolean
    atpRelevant: boolean
    reservationRelevant: boolean
    status: string
    material?: {
        id: string
        materialCode: string
        materialName: string
        status: string
        baseUomId: string
    }
}

const BASE = '/sd/product-material-assignments'

export const productMaterialAssignmentService = {
    listForProduct: (productId: string) =>
        ErpAxiosBase.get<ProductMaterialAssignment[]>(
            `${BASE}/by-product/${productId}`,
        ).then((r) => r.data),

    listForMaterial: (materialId: string) =>
        ErpAxiosBase.get<ProductMaterialAssignment[]>(
            `${BASE}/by-material/${materialId}`,
        ).then((r) => r.data),

    create: (data: {
        productId: string
        materialId: string
        companyId: string
        divisionId?: string
        salesUomId?: string
        materialUomId?: string
    }) => ErpAxiosBase.post<ProductMaterialAssignment>(BASE, data).then((r) => r.data),

    deactivate: (id: string) =>
        ErpAxiosBase.delete(`${BASE}/${id}`).then((r) => r.data),

    availability: (
        productId: string,
        params: {
            companyId: string
            branchId?: string
            divisionId?: string
            channel?: string
            quantity?: number
        },
    ) =>
        ErpAxiosBase.get<{
            state: string
            availableBaseQty: number
            warehouseId: string | null
            materialId: string | null
        }>(`/sd/products/${productId}/availability`, { params }).then((r) => r.data),
}
