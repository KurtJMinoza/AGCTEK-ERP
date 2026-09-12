import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { mmCachedFetch, mmInvalidateCache } from '@/modules/mm/shared/mmReferenceCache'
import type {
    MmMaterialType,
    MmMaterialCategory,
    MmUom,
    MmUomConversion,
    MmValuationClass,
    MmCurrency,
    MmCompany,
    MmPlant,
    MmBranch,
    MmWarehouse,
    MmBarcode,
    MmBatch,
    MmSerialNumber,
} from '../types'

const API = '/mm'

export const materialTypeService = {
    list: () =>
        mmCachedFetch('material-types', () =>
            ErpAxiosBase.get<MmMaterialType[]>(`${API}/material-types`).then((r) => r.data),
        ),
    get: (id: string) => ErpAxiosBase.get<MmMaterialType>(`${API}/material-types/${id}`).then((r) => r.data),
    create: (data: { code: string; name: string; description?: string; sortOrder?: number }) =>
        ErpAxiosBase.post<MmMaterialType>(`${API}/material-types`, data).then((r) => {
            mmInvalidateCache('material-types')
            return r.data
        }),
    update: (id: string, data: Partial<{ code: string; name: string; description: string; isActive: boolean; sortOrder: number }>) =>
        ErpAxiosBase.put<MmMaterialType>(`${API}/material-types/${id}`, data).then((r) => {
            mmInvalidateCache('material-types')
            return r.data
        }),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/material-types/${id}`).then((r) => {
            mmInvalidateCache('material-types')
            return r.data
        }),
}

export const materialCategoryService = {
    list: () =>
        mmCachedFetch('material-categories', () =>
            ErpAxiosBase.get<MmMaterialCategory[]>(`${API}/material-categories`).then((r) => r.data),
        ),
    get: (id: string) => ErpAxiosBase.get<MmMaterialCategory>(`${API}/material-categories/${id}`).then((r) => r.data),
    create: (data: { code: string; name: string; description?: string; parentId?: string; sortOrder?: number }) =>
        ErpAxiosBase.post<MmMaterialCategory>(`${API}/material-categories`, data).then((r) => {
            mmInvalidateCache('material-categories')
            return r.data
        }),
    update: (id: string, data: Partial<{ code: string; name: string; description: string; parentId: string; isActive: boolean; sortOrder: number }>) =>
        ErpAxiosBase.put<MmMaterialCategory>(`${API}/material-categories/${id}`, data).then((r) => {
            mmInvalidateCache('material-categories')
            return r.data
        }),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/material-categories/${id}`).then((r) => {
            mmInvalidateCache('material-categories')
            return r.data
        }),
}

export const uomService = {
    list: () =>
        mmCachedFetch('uoms', () =>
            ErpAxiosBase.get<MmUom[]>(`${API}/uom`).then((r) => r.data),
        ),
    get: (id: string) => ErpAxiosBase.get<MmUom>(`${API}/uom/${id}`).then((r) => r.data),
    create: (data: { code: string; name: string; symbol?: string; sortOrder?: number }) =>
        ErpAxiosBase.post<MmUom>(`${API}/uom`, data).then((r) => {
            mmInvalidateCache('uoms')
            return r.data
        }),
    update: (id: string, data: Partial<{ code: string; name: string; symbol: string; isActive: boolean; sortOrder: number }>) =>
        ErpAxiosBase.put<MmUom>(`${API}/uom/${id}`, data).then((r) => {
            mmInvalidateCache('uoms')
            return r.data
        }),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/uom/${id}`).then((r) => {
            mmInvalidateCache('uoms')
            return r.data
        }),
}

export const uomConversionService = {
    list: (materialId?: string) =>
        mmCachedFetch(`uom-conversions:${materialId ?? 'all'}`, () =>
            ErpAxiosBase.get<MmUomConversion[]>(`${API}/uom-conversions`, {
                params: materialId ? { materialId } : {},
            }).then((r) => r.data),
        ),
    create: (data: { fromUomId: string; toUomId: string; factor: number; materialId?: string }) =>
        ErpAxiosBase.post<MmUomConversion>(`${API}/uom-conversions`, data).then((r) => {
            mmInvalidateCache('uom-conversions')
            return r.data
        }),
    update: (id: string, data: any) =>
        ErpAxiosBase.put<MmUomConversion>(`${API}/uom-conversions/${id}`, data).then((r) => {
            mmInvalidateCache('uom-conversions')
            return r.data
        }),
    remove: (id: string) =>
        ErpAxiosBase.delete(`${API}/uom-conversions/${id}`).then((r) => {
            mmInvalidateCache('uom-conversions')
            return r.data
        }),
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
    companies: () =>
        mmCachedFetch('org:companies', () =>
            ErpAxiosBase.get<MmCompany[]>(`${API}/org/companies`).then((r) => r.data),
        ),
    createCompany: (data: { code: string; name: string }) =>
        ErpAxiosBase.post<MmCompany>(`${API}/org/companies`, data).then((r) => {
            mmInvalidateCache('org:')
            return r.data
        }),
    updateCompany: (id: string, data: Partial<{ code: string; name: string }>) =>
        ErpAxiosBase.put<MmCompany>(`${API}/org/companies/${id}`, data).then((r) => {
            mmInvalidateCache('org:')
            return r.data
        }),
    deleteCompany: (id: string) =>
        ErpAxiosBase.delete(`${API}/org/companies/${id}`).then((r) => {
            mmInvalidateCache('org:')
            return r.data
        }),
    warehouses: (companyId?: string) =>
        mmCachedFetch(`org:warehouses:${companyId ?? 'all'}`, () =>
            ErpAxiosBase.get<MmWarehouse[]>(`${API}/org/warehouses`, {
                params: companyId ? { companyId } : {},
            }).then((r) => r.data),
        ),
    plants: (params?: { companyId?: string; activeOnly?: boolean }) =>
        mmCachedFetch(
            `org:plants:${params?.companyId ?? 'all'}:${params?.activeOnly ? '1' : '0'}`,
            () =>
                ErpAxiosBase.get<MmPlant[]>(`${API}/org/plants`, {
                    params: {
                        ...(params?.companyId ? { companyId: params.companyId } : {}),
                        ...(params?.activeOnly ? { activeOnly: 'true' } : {}),
                    },
                }).then((r) => r.data),
        ),
    createPlant: (data: { code: string; name: string; companyId: string; status?: string }) =>
        ErpAxiosBase.post<MmPlant>(`${API}/org/plants`, data).then((r) => {
            mmInvalidateCache('org:plants')
            return r.data
        }),
    updatePlant: (id: string, data: Partial<{ code: string; name: string; companyId: string; status: string }>) =>
        ErpAxiosBase.put<MmPlant>(`${API}/org/plants/${id}`, data).then((r) => {
            mmInvalidateCache('org:plants')
            return r.data
        }),
    deletePlant: (id: string) =>
        ErpAxiosBase.delete(`${API}/org/plants/${id}`).then((r) => {
            mmInvalidateCache('org:plants')
            return r.data
        }),
    branches: (params?: { companyId?: string; plantId?: string; activeOnly?: boolean }) =>
        mmCachedFetch(
            `org:branches:${params?.companyId ?? 'all'}:${params?.plantId ?? 'all'}:${params?.activeOnly ? '1' : '0'}`,
            () =>
                ErpAxiosBase.get<MmBranch[]>(`${API}/org/branches`, {
                    params: {
                        ...(params?.companyId ? { companyId: params.companyId } : {}),
                        ...(params?.plantId ? { plantId: params.plantId } : {}),
                        ...(params?.activeOnly ? { activeOnly: 'true' } : {}),
                    },
                }).then((r) => r.data),
        ),
    createBranch: (data: { code: string; name: string; companyId: string; plantId?: string; status?: string }) =>
        ErpAxiosBase.post<MmBranch>(`${API}/org/branches`, data).then((r) => {
            mmInvalidateCache('org:branches')
            return r.data
        }),
    updateBranch: (id: string, data: Partial<{ code: string; name: string; companyId: string; plantId: string | null; status: string }>) =>
        ErpAxiosBase.put<MmBranch>(`${API}/org/branches/${id}`, data).then((r) => {
            mmInvalidateCache('org:branches')
            return r.data
        }),
    deleteBranch: (id: string) =>
        ErpAxiosBase.delete(`${API}/org/branches/${id}`).then((r) => {
            mmInvalidateCache('org:branches')
            return r.data
        }),
    valuationClasses: () =>
        mmCachedFetch('org:valuation-classes', () =>
            ErpAxiosBase.get<MmValuationClass[]>(`${API}/org/valuation-classes`).then((r) => r.data),
        ),
    currencies: () =>
        mmCachedFetch('org:currencies', () =>
            ErpAxiosBase.get<MmCurrency[]>(`${API}/org/currencies`).then((r) => r.data),
        ),
}
