'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineClipboardCheck } from 'react-icons/hi'
import { inspectionService } from '../services/inspectionService'
import type { MmInspectionLot, MmInspectionResult } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/inspection-queue'

const DECISION_OPTIONS = [
    { value: 'ACCEPT', label: 'Accept → Unrestricted' },
    { value: 'ACCEPT_WITH_DEVIATION', label: 'Accept with deviation' },
    { value: 'REJECT', label: 'Reject → Quarantine' },
    { value: 'REWORK', label: 'Rework → Blocked' },
    { value: 'RETURN', label: 'Return → Supplier return draft' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const InspectionDetailPage = () => {
    const params = useParams()
    const lotId = String(params?.id ?? '')
    const breadcrumbItems = buildErpBreadcrumbs(`${ROUTE}/${lotId}`)

    const [lot, setLot] = useState<MmInspectionLot | null>(null)
    const [loading, setLoading] = useState(true)
    const [sampleSize, setSampleSize] = useState('5')
    const [numericValue, setNumericValue] = useState('')
    const [defectCode, setDefectCode] = useState('')
    const [defectQty, setDefectQty] = useState('0')
    const [decisionCode, setDecisionCode] = useState('ACCEPT')
    const [decisionQty, setDecisionQty] = useState('')
    const [decidedBy, setDecidedBy] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
        if (!lotId) return
        setLoading(true)
        try {
            const data = await inspectionService.get(lotId)
            setLot(data)
            setDecisionQty(String(Number(data.quantity)))
        } catch {
            setLot(null)
            pushToast('danger', 'Error', 'Failed to load inspection lot')
        } finally {
            setLoading(false)
        }
    }, [lotId])

    useEffect(() => { load() }, [load])

    const resultColumns: ColumnDef<MmInspectionResult>[] = useMemo(() => [
        { header: 'Characteristic', accessorKey: 'characteristic.name', cell: ({ row }) => row.original.characteristic?.name ?? '—' },
        { header: 'Value', accessorKey: 'measuredValue', cell: ({ row }) => row.original.measuredValue ?? row.original.numericValue ?? '—' },
        {
            header: 'Passed',
            accessorKey: 'passed',
            cell: ({ row }) =>
                row.original.passed == null ? '—' : row.original.passed ? 'Yes' : 'No',
        },
    ], [])

    const recordResults = async () => {
        if (!lot) return
        setSubmitting(true)
        try {
            const charId = lot.plan?.characteristics?.[0]?.id
            await inspectionService.recordResults(lot.id, {
                samples: [{ sampleSize: Number(sampleSize) || 1 }],
                results: charId
                    ? [{
                        characteristicId: charId,
                        numericValue: numericValue !== '' ? Number(numericValue) : undefined,
                    }]
                    : undefined,
                defects:
                    defectCode && Number(defectQty) > 0
                        ? [{ defectCode, quantity: Number(defectQty) }]
                        : undefined,
            })
            pushToast('success', 'Saved', 'Inspection results recorded.')
            await load()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Save failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setSubmitting(false)
        }
    }

    const applyDecision = async () => {
        if (!lot) return
        setSubmitting(true)
        try {
            await inspectionService.usageDecision(lot.id, {
                decisionCode,
                quantity: Number(decisionQty) || Number(lot.quantity),
                decidedBy: decidedBy.trim() || undefined,
                notes: notes.trim() || undefined,
            })
            pushToast('success', 'Decision', `Usage decision ${decisionCode} recorded.`)
            await load()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Decision failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <PageContainer>
                <p className="p-6 text-sm text-gray-500">Loading inspection lot…</p>
            </PageContainer>
        )
    }

    if (!lot) {
        return (
            <PageContainer>
                <p className="p-6 text-sm text-gray-500">Inspection lot not found.</p>
            </PageContainer>
        )
    }

    const canDecide = !['COMPLETED', 'CANCELLED'].includes(lot.status) && !(lot.qualityHolds?.length)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={lot.lotNumber}
                description={`Material ${lot.material?.materialCode ?? lot.materialId} · Qty ${Number(lot.quantity)} · GR ${lot.goodsReceipt?.documentNumber ?? lot.goodsReceiptId}`}
                icon={<HiOutlineClipboardCheck />}
            />

            <div className="mb-4 flex flex-wrap gap-2">
                <StatusBadge tone={lot.status === 'PENDING' ? 'warning' : 'info'}>{lot.status}</StatusBadge>
                {lot.result ? <StatusBadge tone="success">{lot.result}</StatusBadge> : null}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AdaptiveCard title="Record results">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormItem label="Sample size">
                            <Input type="number" min={1} value={sampleSize} onChange={(e) => setSampleSize(e.target.value)} />
                        </FormItem>
                        {lot.plan?.characteristics?.[0] ? (
                            <FormItem label={lot.plan.characteristics[0].name}>
                                <Input
                                    type="number"
                                    value={numericValue}
                                    placeholder={`${lot.plan.characteristics[0].toleranceMin ?? ''} – ${lot.plan.characteristics[0].toleranceMax ?? ''}`}
                                    onChange={(e) => setNumericValue(e.target.value)}
                                />
                            </FormItem>
                        ) : null}
                        <FormItem label="Defect code">
                            <Input value={defectCode} onChange={(e) => setDefectCode(e.target.value)} />
                        </FormItem>
                        <FormItem label="Defect qty">
                            <Input type="number" min={0} value={defectQty} onChange={(e) => setDefectQty(e.target.value)} />
                        </FormItem>
                    </div>
                    <Button className="mt-4" variant="solid" loading={submitting} onClick={recordResults}>
                        Save results
                    </Button>
                </AdaptiveCard>

                <AdaptiveCard title="Usage decision">
                    <div className="grid grid-cols-1 gap-3">
                        <FormItem label="Decision">
                            <Select
                                options={DECISION_OPTIONS}
                                value={DECISION_OPTIONS.find((o) => o.value === decisionCode)}
                                onChange={(opt: { value?: string } | null) => setDecisionCode(opt?.value ?? 'ACCEPT')}
                            />
                        </FormItem>
                        <FormItem label="Quantity">
                            <Input type="number" min={0} value={decisionQty} onChange={(e) => setDecisionQty(e.target.value)} />
                        </FormItem>
                        <FormItem label="Decided by">
                            <Input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} />
                        </FormItem>
                        <FormItem label="Notes">
                            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                        </FormItem>
                    </div>
                    <Button
                        className="mt-4"
                        variant="solid"
                        loading={submitting}
                        disabled={!canDecide}
                        onClick={applyDecision}
                    >
                        Post usage decision
                    </Button>
                    {lot.qualityHolds?.length ? (
                        <p className="mt-2 text-sm text-amber-600">Active quality hold blocks usage decision.</p>
                    ) : null}
                </AdaptiveCard>
            </div>

            <AdaptiveCard className="mt-4" title="Results">
                <DataTable columns={resultColumns} data={lot.results ?? []} loading={false} />
            </AdaptiveCard>

            {lot.defects?.length ? (
                <AdaptiveCard className="mt-4" title="Defects">
                    <ul className="text-sm space-y-1">
                        {lot.defects.map((d) => (
                            <li key={d.id}>
                                {d.defectCode}: {Number(d.quantity)} {d.severity ? `(${d.severity})` : ''}
                            </li>
                        ))}
                    </ul>
                </AdaptiveCard>
            ) : null}
        </PageContainer>
    )
}

export default InspectionDetailPage
