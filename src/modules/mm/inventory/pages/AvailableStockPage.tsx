'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineSearch, HiOutlineCalculator } from 'react-icons/hi'
import { reservationService, type AtpResult } from '../services/reservationService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import { orgService } from '../../material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-management/available-stock'

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const AvailableStockPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<AtpResult | null>(null)

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
            materialService.list({ limit: 200 }),
        ]).then(([cos, wh, mats]: any[]) => {
            setCompanies((Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({ value: c.id, label: c.name || c.code })))
            setWarehouses((wh?.data ?? []).map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` })))
            setMaterials((mats?.data ?? []).map((m: any) => ({
                value: m.id,
                label: `${m.materialCode} — ${m.materialName}`,
            })))
        }).catch(() => undefined)
    }, [])

    const run = useCallback(async () => {
        if (!companyId || !warehouseId || !materialId) {
            pushToast('danger', 'Required', 'Select company, warehouse, and material')
            return
        }
        setLoading(true)
        try {
            const atp = await reservationService.atp({ companyId, warehouseId, materialId })
            setResult(atp)
        } catch (e: any) {
            pushToast('danger', 'ATP failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, materialId])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Available to Promise"
                description="Unrestricted − Existing Reservations − Restricted = Available. Reservations do not deduct physical inventory."
            />

            <AdaptiveCard className="mb-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <FormItem label="Company">
                        <Select options={companies} value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => setCompanyId(o?.value ?? '')} />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select options={warehouses} value={warehouses.find((o) => o.value === warehouseId)}
                            onChange={(o: any) => setWarehouseId(o?.value ?? '')} />
                    </FormItem>
                    <FormItem label="Material">
                        <Select options={materials} value={materials.find((o) => o.value === materialId)}
                            onChange={(o: any) => setMaterialId(o?.value ?? '')} />
                    </FormItem>
                    <div className="flex items-end">
                        <Button variant="solid" loading={loading} icon={<HiOutlineCalculator />} onClick={run}>
                            Calculate ATP
                        </Button>
                    </div>
                </div>
            </AdaptiveCard>

            {result && (
                <div className="grid gap-4 md:grid-cols-4 mb-4">
                    {[
                        { label: 'Unrestricted Stock', value: result.unrestrictedStock },
                        { label: 'Existing Reservations', value: result.existingReservations },
                        { label: 'Restricted Stock', value: result.restrictedStock },
                        { label: 'Available', value: result.available },
                    ].map((card) => (
                        <AdaptiveCard key={card.label}>
                            <div className="text-sm text-gray-500">{card.label}</div>
                            <div className="text-2xl font-semibold mt-1">{card.value}</div>
                        </AdaptiveCard>
                    ))}
                </div>
            )}

            {result?.balances?.length ? (
                <AdaptiveCard>
                    <div className="flex items-center gap-2 mb-3 text-sm font-medium">
                        <HiOutlineSearch /> Balance detail
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left border-b">
                                    <th className="py-2 pr-4">Status</th>
                                    <th className="py-2 pr-4">On Hand</th>
                                    <th className="py-2 pr-4">Reserved</th>
                                    <th className="py-2 pr-4">Available</th>
                                    <th className="py-2">Bin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.balances.map((b) => (
                                    <tr key={b.id} className="border-b border-gray-100 dark:border-gray-700">
                                        <td className="py-2 pr-4">{b.stockStatus}</td>
                                        <td className="py-2 pr-4">{b.quantity}</td>
                                        <td className="py-2 pr-4">{b.reservedQuantity}</td>
                                        <td className="py-2 pr-4">{b.availableQuantity}</td>
                                        <td className="py-2">{b.storageBinId?.slice(0, 8) ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </AdaptiveCard>
            ) : null}
        </PageContainer>
    )
}

export default AvailableStockPage
