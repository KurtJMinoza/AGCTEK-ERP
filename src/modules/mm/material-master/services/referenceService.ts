import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    MmMaterialType,
    MmMaterialCategory,
    MmUom,
    MmUomConversion,
    MmValuationClass,
    MmCurrency,
    MmCompany,
    MmWarehouse,
    MmBarcode,
    MmBatch,
    MmSerialNumber,
} from '../types'

const API = '/mm'

export const materialTypeService = {
    list: () => ErpAxiosBase.get<MmMaterialType[]>(`${API}/material-types`).then((r) => r.data),
    get: (id: string) => ErpAxiosBase.get<MmMaterialType>(`${API}/material-types/${id}`).then((r) => r.data),
    create: (data: { code: string; name: string; description?: string; sortOrder?: number }) =>
        ErpAxiosBase.post<MmMaterialType>(`${API}/material-types`, data).then((r) => r.data),
    update: (id: string, data: Partial<{ code: string; name: string; description: string; isActive: boolean; sortOrder: number }>) =>
        ErpAxiosBase.put<MmMaterialType>(`${API}/material-types/${id}`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/material-types/${id}`).then((r) => r.data),
}

export const materialCategoryService = {
    list: () => ErpAxiosBase.get<MmMaterialCategory[]>(`${API}/material-categories`).then((r) => r.data),
    get: (id: string) => ErpAxiosBase.get<MmMaterialCategory>(`${API}/material-categories/${id}`).then((r) => r.data),
    create: (data: { code: string; name: string; description?: string; parentId?: string; sortOrder?: number }) =>
        ErpAxiosBase.post<MmMaterialCategory>(`${API}/material-categories`, data).then((r) => r.data),
    update: (id: string, data: Partial<{ code: string; name: string; description: string; parentId: string; isActive: boolean; sortOrder: number }>) =>
        ErpAxiosBase.put<MmMaterialCategory>(`${API}/material-categories/${id}`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/material-categories/${id}`).then((r) => r.data),
}

export const uomService = {
    list: () => ErpAxiosBase.get<MmUom[]>(`${API}/uom`).then((r) => r.data),
    get: (id: string) => ErpAxiosBase.get<MmUom>(`${API}/uom/${id}`).then((r) => r.data),
    create: (data: { code: string; name: string; symbol?: string; sortOrder?: number }) =>
        ErpAxiosBase.post<MmUom>(`${API}/uom`, data).then((r) => r.data),
    update: (id: string, data: Partial<{ code: string; name: string; symbol: string; isActive: boolean; sortOrder: number }>) =>
        ErpAxiosBase.put<MmUom>(`${API}/uom/${id}`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/uom/${id}`).then((r) => r.data),
}

export const uomConversionService = {
    list: (materialId?: string) =>
        ErpAxiosBase.get<MmUomConversion[]>(`${API}/uom-conversions`, { params: materialId ? { materialId } : {} }).then((r) => r.data),
    create: (data: { fromUomId: string; toUomId: string; factor: number; materialId?: string }) =>
        ErpAxiosBase.post<MmUomConversion>(`${API}/uom-conversions`, data).then((r) => r.data),
    update: (id: string, data: any) =>
        ErpAxiosBase.put<MmUomConversion>(`${API}/uom-conversions/${id}`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/uom-conversions/${id}`).then((r) => r.data),
}

export const barcodeService = {
    list: (materialId?: string) =>
        ErpAxiosBase.get<MmBarcode[]>(`${API}/barcodes`, { params: materialId ? { materialId } : {} }).then((r) => r.data),
    create: (data: { materialId: string; barcodeType: string; barcodeValue: string; isPrimary?: boolean }) =>
        ErpAxiosBase.post<MmBarcode>(`${API}/barcodes`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/barcodes/${id}`).then((r) => r.data),
}

export const batchService = {
    list: (materialId?: string) =>
        ErpAxiosBase.get<MmBatch[]>(`${API}/batches`, { params: materialId ? { materialId } : {} }).then((r) => r.data),
    create: (data: {
        materialId: string
        batchNumber: string
        manufacturingDate?: string
        expiryDate?: string
        supplierId?: string
        status?: string
    }) => ErpAxiosBase.post<MmBatch>(`${API}/batches`, data).then((r) => r.data),
    update: (id: string, data: any) =>
        ErpAxiosBase.put<MmBatch>(`${API}/batches/${id}`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/batches/${id}`).then((r) => r.data),
}

export const serialNumberService = {
    list: (materialId?: string) =>
        ErpAxiosBase.get<MmSerialNumber[]>(`${API}/serial-numbers`, { params: materialId ? { materialId } : {} }).then((r) => r.data),
    create: (data: {
        materialId: string
        serialNumber: string
        batchId?: string
        currentWarehouseId?: string
        currentBinId?: string
        status?: string
    }) => ErpAxiosBase.post<MmSerialNumber>(`${API}/serial-numbers`, data).then((r) => r.data),
    update: (id: string, data: any) =>
        ErpAxiosBase.put<MmSerialNumber>(`${API}/serial-numbers/${id}`, data).then((r) => r.data),
    remove: (id: string) => ErpAxiosBase.delete(`${API}/serial-numbers/${id}`).then((r) => r.data),
}

export const orgService = {
    companies: () => ErpAxiosBase.get<MmCompany[]>(`${API}/org/companies`).then((r) => r.data),
    warehouses: (companyId?: string) =>
        ErpAxiosBase.get<MmWarehouse[]>(`${API}/org/warehouses`, { params: companyId ? { companyId } : {} }).then((r) => r.data),
    plants: (companyId?: string) =>
        ErpAxiosBase.get<{ id: string; code: string; name: string; companyId: string }[]>(
            `${API}/org/plants`,
            { params: companyId ? { companyId } : {} },
        ).then((r) => r.data),
    branches: (params?: { companyId?: string; plantId?: string }) =>
        ErpAxiosBase.get<{ id: string; code: string; name: string; companyId: string; plantId?: string }[]>(
            `${API}/org/branches`,
            { params },
        ).then((r) => r.data),
    valuationClasses: () => ErpAxiosBase.get<MmValuationClass[]>(`${API}/org/valuation-classes`).then((r) => r.data),
    currencies: () => ErpAxiosBase.get<MmCurrency[]>(`${API}/org/currencies`).then((r) => r.data),
}
